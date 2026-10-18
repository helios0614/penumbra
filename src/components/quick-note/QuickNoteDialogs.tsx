import { useState, type ComponentProps } from "react";
import { formatPeriod } from "@/application/quick-note/quick-note-date";
import type { QuickNoteController } from "@/application/quick-note/quick-note-controller";
import type { QuickNoteState } from "@/application/quick-note/quick-note-state";
import type { BackfillInput, QuickNote, TriggerConfig } from "@/domain/quick-note";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/app-select";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { QuickNoteDatePicker } from "./QuickNoteControls";
import { QuickNoteDialogHeader } from "./QuickNoteDialogHeader";
import { useQuickNoteDialogViewport } from "./quick-note-dialog-viewport";

export type QuickNoteConfirmation =
  | { readonly kind: "step1" | "step2" | "delete"; readonly note: QuickNote }
  | { readonly kind: "backfill"; readonly input: BackfillInput };

export function confirmationCopy(value: QuickNoteConfirmation) {
  if (value.kind === "backfill") return { title: "重建已有完整记录？", description: `将显式覆盖 ${value.input.date}「${value.input.periodLabel}」的完整记录。请求接受后仍需查看日志与已保存正文确认结果。`, action: "确认重建" };
  if (value.kind === "delete") return { title: "删除这条速记？", description: `「${value.note.periodLabel}」的摘要与正文将被删除，此操作不可撤销。`, action: "确认删除" };
  if (value.kind === "step1") return { title: "重新整理摘要？", description: `重新整理「${value.note.periodLabel}」的辅助摘要，成功后会清空现有正文。之后需要另行重跑 Step 2。`, action: "确认重跑 Step 1" };
  return { title: "重新生成正文？", description: `使用已有辅助材料重新生成「${value.note.periodLabel}」正文，成功后替换已保存正文。`, action: "确认重跑 Step 2" };
}

export function QuickNoteConfirmDialog({ value, onCancel, onConfirm, finalFocus }: {
  readonly value: QuickNoteConfirmation | null; readonly onCancel: () => void; readonly onConfirm: (value: QuickNoteConfirmation) => void;
  readonly finalFocus?: ComponentProps<typeof DialogContent>["finalFocus"];
}) {
  const copy = value ? confirmationCopy(value) : null;
  const viewportRef = useQuickNoteDialogViewport();
  return (
    <AlertDialog open={Boolean(value)} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <AlertDialogContent ref={viewportRef} className="quick-note-dialog" finalFocus={finalFocus} data-quick-note-dialog="confirm">
        <AlertDialogHeader><AlertDialogTitle>{copy?.title}</AlertDialogTitle><AlertDialogDescription>{copy?.description}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost" className="text-muted-strong">取消</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => { if (value) onConfirm(value); }}>{copy?.action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function QuickNoteDiscardDialog({ open, onCancel, onConfirm }: {
  readonly open: boolean; readonly onCancel: () => void; readonly onConfirm: () => void;
}) {
  const viewportRef = useQuickNoteDialogViewport();
  return <AlertDialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
    <AlertDialogContent ref={viewportRef} className="quick-note-dialog" data-quick-note-dialog="discard">
      <AlertDialogHeader>
        <AlertDialogTitle>放弃当前草稿？</AlertDialogTitle>
        <AlertDialogDescription>尚未保存的正文修改会被放弃。</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel variant="ghost" className="text-muted-strong">返回编辑</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onClick={onConfirm}>放弃草稿并返回</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

export function QuickNoteBackfillDialog({ open, config, initialDate, disabled, onClose, onSubmit, finalFocus }: {
  readonly open: boolean; readonly config: TriggerConfig; readonly initialDate: string; readonly disabled: boolean;
  readonly onClose: () => void; readonly onSubmit: (input: BackfillInput) => void;
  readonly finalFocus?: ComponentProps<typeof DialogContent>["finalFocus"];
}) {
  const [date, setDate] = useState(initialDate);
  const [endHour, setEndHour] = useState(String(config.hours[0]));
  const [overwrite, setOverwrite] = useState(false);
  const viewportRef = useQuickNoteDialogViewport();
  const valid = config.hours.includes(Number(endHour));
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent ref={viewportRef} showCloseButton={false} className="quick-note-dialog" finalFocus={finalFocus} data-quick-note-dialog="backfill">
        <QuickNoteDialogHeader title="补写速记" description="选择时段起始日期及截止时段。请求接受后会安排补写，请稍后核对生成结果。" />
        <DialogBody className="space-y-5">
          <div className="quick-note-dialog-date"><p className="mb-2 text-sm font-medium text-foreground">时段起始日期</p><QuickNoteDatePicker date={date} onChange={setDate} label="补写日期" /></div>
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">截止时段</p>
            <AppSelect controlSize="comfortable" value={endHour} onValueChange={setEndHour} ariaLabel="补写时段" surface="translucent" align="start" className="text-sm font-normal" contentClassName="text-sm" options={config.hours.map((h) => ({ value: String(h), label: `${config.labels[String(h)]}（截止 ${String(h).padStart(2, "0")}:00）` }))} />
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm leading-6 text-muted-strong">
            <input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} className="size-5 shrink-0 rounded border-border-strong accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />重建已有完整记录（需要确认覆盖）
          </label>
          <p className="text-xs leading-5 text-muted-foreground">默认保留已有完整记录。勾选重建会覆盖对应时段的完整记录，提交前需再次确认。业务时区：{config.timeZone}</p>
        </DialogBody>
        <DialogFooter>
          <Button size="comfortable" variant="ghost" className="text-muted-strong" onClick={onClose}>取消</Button>
          <Button size="comfortable" disabled={disabled || !valid} onClick={() => onSubmit({ date, endHour: Number(endHour), periodLabel: config.labels[endHour], overwrite })}>{overwrite ? "继续确认重建" : "提交补写"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function QuickNoteRetryDialog({ open, state, controller, onClose }: {
  readonly open: boolean; readonly state: QuickNoteState; readonly controller: QuickNoteController | null; readonly onClose: () => void;
}) {
  const viewportRef = useQuickNoteDialogViewport();
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent ref={viewportRef} showCloseButton={false} className="quick-note-dialog" data-quick-note-dialog="retry">
        <QuickNoteDialogHeader title="重试未完成速记" description="查找近期尚未完成的时段，不会自动覆盖已有完整记录。" />
        <DialogBody>
          <QuickNoteCandidateList state={state} onRetry={(input) => { void (async () => { if (await controller?.mutate("backfill", `${input.date}:${input.endHour}`, input)) onClose(); })(); }} />
          {state.notice && !state.notice.toast && <p role={state.notice.tone === "error" ? "alert" : "status"} className="mt-3 text-sm leading-6 text-muted-strong">{state.notice.text}</p>}
        </DialogBody>
        <DialogFooter>
          <Button size="comfortable" type="button" variant="ghost" className="text-muted-strong" onClick={onClose}>关闭</Button>
          <Button size="comfortable" type="button" variant="default" disabled={state.candidatesLoading} onClick={() => void controller?.loadCandidates()}>重新读取</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function QuickNoteCandidateList({ state, onRetry }: {
  readonly state: QuickNoteState; readonly onRetry: (input: BackfillInput) => void;
}) {
  return (
    <div aria-busy={state.candidatesLoading}>
      {state.candidatesLoading && <p role="status" className="py-4 text-sm text-muted-foreground">正在读取近期未完成时段…</p>}
      {state.candidatesError && <p role="alert" className="py-3 text-sm text-destructive-foreground">{state.candidatesError}</p>}
      {!state.candidatesLoading && state.candidates?.length === 0 && <p className="py-4 text-sm text-muted-foreground">最近没有需要重试的速记。</p>}
      {state.candidates && state.config && <ul className="divide-y divide-border">
        {state.candidates.map((item) => <li key={item.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0 text-sm"><p>{item.date} · {item.periodLabel} · {item.status === "missing" ? "缺少记录" : "正文未完成"}</p><p className="mt-1 text-xs text-muted-foreground">{formatPeriod(item.periodStart, item.periodEnd, state.config!.timeZone)}</p></div>
          <Button size="comfortable" variant="outline" disabled={Boolean(state.pending)} onClick={() => onRetry({ date: item.date, endHour: item.endHour, periodLabel: item.periodLabel, overwrite: false })}>重试该时段</Button>
        </li>)}
      </ul>}
    </div>
  );
}
