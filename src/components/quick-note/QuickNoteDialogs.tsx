import { useState } from "react";
import { formatPeriod } from "@/application/quick-note/quick-note-date";
import type { QuickNoteController } from "@/application/quick-note/quick-note-controller";
import type { QuickNoteState } from "@/application/quick-note/quick-note-state";
import type { BackfillInput, QuickNote, TriggerConfig } from "@/domain/quick-note";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/app-select";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { QuickNoteDatePicker } from "./QuickNoteControls";

export type QuickNoteConfirmation =
  | { readonly kind: "step1" | "step2" | "delete"; readonly note: QuickNote }
  | { readonly kind: "backfill"; readonly input: BackfillInput };

export function confirmationCopy(value: QuickNoteConfirmation) {
  if (value.kind === "backfill") return { title: "重建已有完整记录？", description: `将显式覆盖 ${value.input.date}「${value.input.periodLabel}」的完整记录。请求接受后仍需查看日志与已保存正文确认结果。`, action: "确认重建" };
  if (value.kind === "delete") return { title: "删除这条速记？", description: `「${value.note.periodLabel}」的摘要与正文将被删除，此操作不可撤销。`, action: "确认删除" };
  if (value.kind === "step1") return { title: "重跑 Step 1？", description: `重新整理「${value.note.periodLabel}」的辅助摘要，成功后会清空现有正文。之后需要另行重跑 Step 2。`, action: "确认重跑 Step 1" };
  return { title: "重跑 Step 2？", description: `使用已有辅助材料重新生成「${value.note.periodLabel}」正文，成功后替换已保存正文。`, action: "确认重跑 Step 2" };
}

export function QuickNoteConfirmDialog({ value, onCancel, onConfirm }: {
  readonly value: QuickNoteConfirmation | null; readonly onCancel: () => void; readonly onConfirm: (value: QuickNoteConfirmation) => void;
}) {
  const copy = value ? confirmationCopy(value) : null;
  return (
    <AlertDialog open={Boolean(value)} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{copy?.title}</AlertDialogTitle><AlertDialogDescription>{copy?.description}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11">取消</AlertDialogCancel>
          <AlertDialogAction variant="destructive" className="h-11" onClick={() => { if (value) onConfirm(value); }}>{copy?.action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function QuickNoteBackfillDialog({ open, config, initialDate, disabled, onClose, onSubmit }: {
  readonly open: boolean; readonly config: TriggerConfig; readonly initialDate: string; readonly disabled: boolean;
  readonly onClose: () => void; readonly onSubmit: (input: BackfillInput) => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [endHour, setEndHour] = useState(String(config.hours[0]));
  const [overwrite, setOverwrite] = useState(false);
  const valid = config.hours.includes(Number(endHour));
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[24px] p-5 sm:max-w-md">
        <DialogTitle>补写速记</DialogTitle>
        <DialogDescription>选择时段起始所在日期及截止时段。补写请求接受后由服务端执行，不代表已经生成完成。</DialogDescription>
        <div className="space-y-4">
          <div><p className="mb-2 text-sm">时段起始日期</p><QuickNoteDatePicker date={date} onChange={setDate} label="补写日期" /></div>
          <AppSelect value={endHour} onValueChange={setEndHour} ariaLabel="补写时段" options={config.hours.map((h) => ({ value: String(h), label: `${config.labels[String(h)]}（截止 ${String(h).padStart(2, "0")}:00）` }))} />
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-muted-strong">
            <input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} className="size-5 accent-primary" />重建已有完整记录（需要确认覆盖）
          </label>
          <p className="text-xs leading-5 text-muted-foreground">普通补写保留已有完整正文；时段名称和截止小时来自当前服务端配置。{config.timeZone}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" className="h-11" onClick={onClose}>取消</Button>
          <Button className="h-11" disabled={disabled || !valid} onClick={() => onSubmit({ date, endHour: Number(endHour), periodLabel: config.labels[endHour], overwrite })}>{overwrite ? "继续确认重建" : "提交补写"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function QuickNoteRetryDialog({ open, state, controller, onClose }: {
  readonly open: boolean; readonly state: QuickNoteState; readonly controller: QuickNoteController | null; readonly onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[24px] p-5 sm:max-w-xl">
        <DialogTitle>重试近期未完成时段</DialogTitle>
        <DialogDescription>读取服务端 incomplete 候选。普通重试不会主动覆盖已有完整正文；这与单条 Step 1 / Step 2 重跑不同。</DialogDescription>
        <QuickNoteCandidateList state={state} onRefresh={() => void controller?.loadCandidates()} onRetry={(input) => void controller?.mutate("backfill", `${input.date}:${input.endHour}`, input)} />
        {state.notice && <p role={state.notice.tone === "error" ? "alert" : "status"} className="text-sm leading-6 text-muted-strong">{state.notice.text}</p>}
        <Button variant="outline" className="h-11 justify-self-end" onClick={onClose}>关闭</Button>
      </DialogContent>
    </Dialog>
  );
}

export function QuickNoteCandidateList({ state, onRefresh, onRetry }: {
  readonly state: QuickNoteState; readonly onRefresh: () => void; readonly onRetry: (input: BackfillInput) => void;
}) {
  return (
    <div aria-busy={state.candidatesLoading}>
      {state.candidatesLoading && <p role="status" className="py-4 text-sm text-muted-foreground">正在读取近期未完成时段…</p>}
      {state.candidatesError && <p role="alert" className="py-3 text-sm text-destructive">{state.candidatesError}</p>}
      {!state.candidatesLoading && state.candidates?.length === 0 && <p className="py-4 text-sm text-muted-foreground">近期没有可重试的未完成时段。</p>}
      {state.candidates && state.config && <ul className="divide-y divide-border">
        {state.candidates.map((item) => <li key={item.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0 text-sm"><p>{item.date} · {item.periodLabel} · {item.status === "missing" ? "缺少记录" : "正文未完成"}</p><p className="mt-1 text-xs text-muted-foreground">{formatPeriod(item.periodStart, item.periodEnd, state.config!.timeZone)}</p></div>
          <Button variant="outline" className="h-11" disabled={Boolean(state.pending)} onClick={() => onRetry({ date: item.date, endHour: item.endHour, periodLabel: item.periodLabel, overwrite: false })}>重试该时段</Button>
        </li>)}
      </ul>}
      <Button variant="ghost" className="h-11" disabled={state.candidatesLoading} onClick={onRefresh}>重新读取候选</Button>
    </div>
  );
}
