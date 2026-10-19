import type { ComponentProps } from "react";
import type { Schedule } from "@/domain/schedule";
import type { ScheduleController, ScheduleState } from "@/application/schedule/schedule-controller";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScheduleIssue } from "./ScheduleFeedback";

export function ScheduleCancelDialog({ item, state, controller, onClose, finalFocus }: {
  readonly item: Schedule | null; readonly state: ScheduleState; readonly controller: ScheduleController | null; readonly onClose: () => void;
  readonly finalFocus?: ComponentProps<typeof AlertDialogContent>["finalFocus"];
}) {
  const busy = Boolean(state.pending);
  return <AlertDialog open={Boolean(item)} onOpenChange={(open, details) => { if (!open) { if (busy) details.cancel(); else onClose(); } }}>
    <AlertDialogContent finalFocus={finalFocus}><AlertDialogHeader><AlertDialogTitle>取消这条{item?.kind === "reminder" ? "记挂" : item?.kind === "todo" ? "待办" : "闹钟"}？</AlertDialogTitle>
      <AlertDialogDescription>记录会标记为已取消，保留在后端。{item?.kind === "alarm" ? "若已进入触发流程，无法撤回正在执行的提醒。" : ""}</AlertDialogDescription>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{item?.content}</p>
      {state.feedback?.error && state.feedback.source === "action" && <p role="alert" className="mt-2 text-xs leading-5 text-destructive">{state.feedback.text}</p>}
      <ScheduleIssue state={state} controller={controller} />
    </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>保留</AlertDialogCancel><AlertDialogAction variant="destructive" loading={busy} disabled={busy || !controller || Boolean(state.issue)} onClick={async () => { if (item && await controller?.act(item.id, "cancel")) onClose(); }}>确认取消</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
  </AlertDialog>;
}
