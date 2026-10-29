import type { RefObject } from "react";
import { sourceReason, type MemoryAction, type MemoryManagementError, type MemorySourceRead } from "@/application/memory-management";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function MemoryConfirmDialog({ action, pending, error, source, onSubmit, onClose, onCheckSource, finalFocus }: {
  readonly action: MemoryAction; readonly pending: boolean; readonly error: MemoryManagementError | null;
  readonly source?: MemorySourceRead; readonly onSubmit: () => void; readonly onClose: () => void;
  readonly onCheckSource: () => void; readonly finalFocus: RefObject<HTMLElement | null>;
}) {
  const requeue = action.kind === "requeue";
  const resummarize = action.kind === "resummarize";
  const allowed = !requeue || source?.status === "ready" && source.value.supported;
  const title = requeue ? "删除并重新总结来源" : resummarize ? "重新总结记忆" : "删除记忆";
  return <AlertDialog open onOpenChange={(open, details) => { if (!open) { if (pending) details.cancel(); else onClose(); } }}>
    <AlertDialogContent finalFocus={finalFocus}>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>
          {resummarize ? "保留记忆 ID，根据来源重新总结；没有原文时使用现有正文。将覆盖正文、关键词、重要度和待继续状态。" : requeue ? "删除这条记忆记录，并将精确来源加入待总结队列。原始聊天消息不会删除。入队后仍需执行批量总结，不会立即生成新记忆。" : "只删除这条记忆记录，不删除原始聊天消息，不自动重新总结。此操作没有内置恢复。"}
        </AlertDialogDescription>
        <p className="mt-3 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-6 text-muted-strong">{action.memory.content}</p>
        {requeue && <div className="mt-3 text-xs leading-5" role="status">
          {source?.status === "ready" ? source.value.supported ? `来源检查通过，共 ${source.value.sourceCount} 条消息。执行时会再次校验。` : sourceReason(source.value.reason) : source?.status === "error" ? "来源检查失败，尚不能执行。" : "正在检查来源…"}
          {!allowed && source?.status !== "loading" && <Button variant="ghost" size="compact" onClick={onCheckSource}>重新检查来源</Button>}
        </div>}
        {error && <p role="alert" className="mt-3 text-xs leading-5 text-destructive-foreground">{error.message}</p>}
        {pending && <p role="status" className="mt-2 text-xs text-muted-foreground">{resummarize ? "正在重新总结，请稍候…" : "正在处理，请稍候…"}</p>}
      </AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={pending} onClick={onClose}>取消</AlertDialogCancel>
        <AlertDialogAction variant={resummarize ? "default" : "destructive"} loading={pending} disabled={!allowed} onClick={onSubmit}>{resummarize ? "确认重新总结" : requeue ? "确认删除并入队" : "确认删除"}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
