import { useRef, useState } from "react";
import type { Message } from "@/domain/message";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function MessageDeleteDialog({ message, unavailableReason, onDelete, onClose }: {
  readonly message: Message;
  readonly unavailableReason: string | null;
  readonly onDelete: (message: Message) => Promise<void>;
  readonly onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (busyRef.current || unavailableReason) return;
    busyRef.current = true; setBusy(true); setError(null);
    try { await onDelete(message); onClose(); }
    catch (error) {
      setError(`删除未确认：${error instanceof Error ? error.message : "请求失败"}。请刷新核对后重试。`);
    } finally { busyRef.current = false; setBusy(false); }
  };
  const title = message.rawRole === "system" ? "删除系统通知" : "删除消息";
  return <Dialog open onOpenChange={open => { if (!open && !busyRef.current) onClose(); }}>
    <DialogContent closeButtonProps={{ disabled: busy }}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>确定删除这条{message.rawRole === "system" ? "系统通知" : "消息"}吗？此操作无法撤销。</DialogDescription>
      </DialogHeader>
      <DialogBody>
        {unavailableReason && <p role="status" className="text-xs text-muted-foreground">{unavailableReason}</p>}
        {error && <p role="alert" className="text-sm text-destructive break-words [overflow-wrap:anywhere]">{error}</p>}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>取消</Button>
        <Button type="button" variant="destructive" disabled={busy || !!unavailableReason} onClick={() => void submit()}>{busy ? "正在删除…" : "确认删除"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
