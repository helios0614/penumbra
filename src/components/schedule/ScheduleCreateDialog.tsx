import { useEffect, useState } from "react";
import type { ScheduleController, ScheduleState } from "@/application/schedule/schedule-controller";
import { composeScheduleTime, type ManagedScheduleKind } from "@/domain/schedule";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LocationTimeField } from "@/components/location/LocationTimeField";
import "@/components/location/location.css";
import { ScheduleDateField } from "./ScheduleDateField";
import { ScheduleIssue } from "./ScheduleFeedback";
import { scheduleMeta } from "./schedule-presentation";

export function ScheduleCreateDialog({ open, kind, state, controller, onClose }: {
  readonly open: boolean; readonly kind: ManagedScheduleKind; readonly state: ScheduleState; readonly controller: ScheduleController | null; readonly onClose: () => void;
}) {
  const [content, setContent] = useState(""), [date, setDate] = useState(""), [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null), [discard, setDiscard] = useState(false);
  const busy = Boolean(state.pending), meta = scheduleMeta[kind];
  useEffect(() => {
    if (open) {
      setError(null); setDiscard(false);
      if (kind === "alarm") void controller?.loadZone();
    }
  }, [open, kind, controller]);
  const clear = () => { setContent(""); setDate(""); setTime(""); setError(null); setDiscard(false); onClose(); };
  const edit = () => { setError(null); controller?.changeScope(); };
  const submit = async () => {
    if (busy || state.issue || !controller) return;
    if (!content.trim()) { setError("请填写内容。"); return; }
    try {
      const trigger = kind === "todo" ? undefined : composeScheduleTime(date, time, kind === "alarm");
      if (kind === "alarm" && (!state.zone || state.zoneLoading)) { setError("确认服务器时区后才能创建闹钟。"); return; }
      if (await controller.create(content, trigger)) clear();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "请检查日期时间。"); }
  };
  return <Dialog open={open} disablePointerDismissal={busy} onOpenChange={(next, details) => {
    if (next) return;
    if (busy) { details.cancel(); return; }
    if (content || date || time) { details.cancel(); setDiscard(true); } else clear();
  }}>
    <DialogContent closeButtonProps={{ disabled: busy, "aria-label": `关闭${meta.create}` }}>
      <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <DialogHeader><DialogTitle>{meta.create}</DialogTitle><DialogDescription>
          {kind === "reminder" ? "留下一件想持续关注的事情。" : kind === "todo" ? "每条记录一件要做的事情。" : "填写需要知远在指定时间提醒的内容。"}
        </DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <div><label htmlFor={`${kind}-content`} className="mb-2 block text-xs font-medium text-muted-strong">内容</label>
            <Textarea id={`${kind}-content`} rows={4} value={content} disabled={busy} placeholder={kind === "todo" ? "需要处理的事情…" : kind === "reminder" ? "想持续放在心上的事情…" : "需要提醒的内容…"}
              aria-invalid={Boolean(error)} aria-describedby={error ? `${kind}-form-error` : undefined} onChange={(event) => { setContent(event.target.value); edit(); }} className="text-sm" />
          </div>
          {kind !== "todo" && <fieldset disabled={busy} aria-describedby={kind === "alarm" ? "alarm-time-zone" : undefined}>
            <legend className="mb-2 text-xs font-medium text-muted-strong">{kind === "alarm" ? "提醒时间" : "日期与时间（可选）"}</legend>
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
              <div className="min-w-0"><ScheduleDateField id={`${kind}-date`} label={kind === "alarm" ? "提醒日期" : "日期"} value={date} timeZone={state.zone} disabled={busy || kind === "alarm" && (!state.zone || state.zoneLoading)} onChange={(value) => { setDate(value); edit(); }} /></div>
              <LocationTimeField id={`${kind}-time`} label={kind === "alarm" ? "提醒时间" : "时间"} value={time} disabled={busy} onChange={(value) => { setTime(value); edit(); }} />
            </div>
            {time && <div className="mt-1 flex justify-end"><Button type="button" variant="ghost" size="compact" disabled={busy} onClick={() => { setTime(""); edit(); }}>清除时间</Button></div>}
            {kind === "reminder" && <p className="mt-2 text-xs leading-5 text-muted-foreground">可只填日期，也可留空。记挂不会按时间触发或自动完成。</p>}
            {kind === "alarm" && <div className="mt-2 text-xs leading-5" data-alarm-time-zone="true">
              <p id="alarm-time-zone" role="status" className="text-muted-foreground [overflow-wrap:anywhere]">{state.zoneLoading ? "正在确认服务器时区…" : state.zone ? `服务器时间 · ${state.zone}` : "服务器时区未确认"}</p>
              {!state.zoneLoading && (!state.zone || state.zoneError) && <div className="mt-1">
                <p role="alert" className="text-destructive">{state.zoneError || "确认服务器时区后才能创建闹钟。"}</p>
                <Button variant="ghost" size="compact" type="button" disabled={busy} onClick={() => void controller?.loadZone()}>重新确认时区</Button>
              </div>}
            </div>}
          </fieldset>}
          {kind === "todo" && <p className="text-xs leading-5 text-muted-foreground">不会自动提醒。不确定的事项可在正文保留 [?] 标记。</p>}
          {error && <p role="alert" id={`${kind}-form-error`} className="text-xs leading-5 text-destructive">{error}</p>}
          {state.feedback?.error && state.feedback.source === "create" && <p role="alert" className="text-xs leading-5 text-destructive">{state.feedback.text}</p>}
          <ScheduleIssue state={state} controller={controller} />
        </DialogBody>
        <DialogFooter><Button type="button" variant="ghost" disabled={busy} onClick={() => { if (content || date || time) setDiscard(true); else clear(); }}>取消</Button>
          <Button type="submit" loading={state.pending === "create"} disabled={!controller || busy || Boolean(state.issue) || kind === "alarm" && (!state.zone || state.zoneLoading) || !content.trim()}>创建</Button></DialogFooter>
      </form>
    </DialogContent>
    <AlertDialog open={discard} onOpenChange={setDiscard}><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>放弃本次填写？</AlertDialogTitle><AlertDialogDescription>尚未提交的内容将被清空；未知的创建结果仍需在列表中核对。</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>继续填写</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={clear}>放弃填写</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </Dialog>;
}
