import { Button } from "@/components/ui/button";
import type { AttachmentSubmissionRecovery } from "@/application/chat-media/attachment-drafts";

/** Frozen submissions are recovery material, never part of the editable next draft. */
export function SubmissionRecovery({ items, locked, onRestore, onDiscard }: {
  items: readonly AttachmentSubmissionRecovery[]; locked: boolean;
  onRestore: (item: AttachmentSubmissionRecovery) => void; onDiscard: (id: string) => void;
}) {
  if (!items.length) return null;
  return <details className="chat-composer-recovery mx-auto mb-2 max-w-[720px] text-xs text-muted-strong">
    <summary className="cursor-pointer">未完成或未确认的提交已暂存（{items.length}）</summary>
    <p className="mt-2">请先核对历史，已接受的消息不要再次发送。恢复只追加原文与附件到当前草稿，不会发送。</p>
    {locked && <p className="mt-1 text-muted-foreground">当前执行结束或完成历史核对后可恢复。</p>}
    {items.map(item => <div key={item.id} className="mt-2 space-y-2">
      {item.content && <p className="scrollbar-none max-h-24 overflow-y-auto whitespace-pre-wrap break-words" tabIndex={0}>{item.content}</p>}
      {item.items.length > 0 && <p className="break-words">附件：{item.items.map(attachment => attachment.file.name).join("、")}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="compact" disabled={locked} onClick={() => onRestore(item)}>恢复本次提交到草稿</Button>
        <Button type="button" variant="ghost" size="compact" disabled={locked} onClick={() => onDiscard(item.id)}>丢弃本地暂存</Button>
      </div>
    </div>)}
  </details>;
}
