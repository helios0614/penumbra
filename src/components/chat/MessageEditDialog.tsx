import { useEffect, useRef, useState } from "react";
import type { Message } from "@/domain/message";
import { MessageEditError } from "@/domain/message/message-edit";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function MessageEditDialog({ message, unavailableReason, onSave, onClose }: {
  readonly message: Message;
  readonly unavailableReason: string | null;
  readonly onSave: (message: Message, content: string) => Promise<void>;
  readonly onClose: () => void;
}) {
  // Keep the opening source, including whitespace, independent of history/WS refreshes.
  const [content, setContent] = useState(message.content);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      contentRef.current?.style.setProperty("--dialog-viewport-height", `${viewport.height}px`);
      contentRef.current?.style.setProperty("--dialog-viewport-top", `${viewport.offsetTop}px`);
    };
    update(); viewport.addEventListener("resize", update); viewport.addEventListener("scroll", update);
    return () => { viewport.removeEventListener("resize", update); viewport.removeEventListener("scroll", update); };
  }, []);
  const save = async () => {
    if (busyRef.current || unavailableReason) return;
    if (content === message.content) { onClose(); return; }
    busyRef.current = true; setBusy(true); setError(null);
    try { await onSave(message, content); onClose(); }
    catch (error) {
      setError(error instanceof MessageEditError ? error.message
        : error instanceof ApiError && (error.status === 401 || error.status === 403) ? "没有编辑权限或登录已过期。编辑内容已保留。"
        : error instanceof ApiError && error.status === 404 ? "消息已不存在，编辑内容已保留。请关闭并刷新核对。"
        : "尚未确认保存，编辑内容已保留，请重试或刷新核对。");
    } finally { busyRef.current = false; setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busyRef.current) onClose(); }}>
    <DialogContent ref={contentRef} closeButtonProps={{ disabled: busy }}>
      <DialogHeader>
        <DialogTitle>编辑消息</DialogTitle>
        <DialogDescription>修改整条消息的正文，保存后不会自动生成回复。</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <label className="flex flex-col gap-2 text-sm">消息正文
          <Textarea autoFocus value={content} disabled={busy} aria-label="编辑消息正文" aria-invalid={!!error}
            className="min-h-32 resize-none [field-sizing:fixed]" rows={8} onChange={event => setContent(event.target.value)} />
        </label>
        {unavailableReason && <p className="mt-2 text-xs text-muted-foreground" role="status">{unavailableReason}</p>}
        {error && <p className="mt-2 text-xs text-destructive" role="alert">{error}</p>}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>取消</Button>
        <Button type="button" disabled={busy || !!unavailableReason} onClick={() => void save()}>{busy ? "正在保存…" : "保存"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
