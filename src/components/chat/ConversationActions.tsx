import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ConversationAction = { readonly kind: "rename" | "delete"; readonly id: string; readonly title: string };

export function ConversationMenu({ id, title, disabled, deleteDisabled, onAction }: {
  readonly id: string; readonly title: string; readonly disabled?: boolean;
  readonly onAction: (action: ConversationAction) => void;
  readonly deleteDisabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger aria-haspopup="menu" render={<Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={`会话操作：${title}`} title="会话操作" className="shrink-0 text-muted-foreground" />}>
      <MoreHorizontal className="size-4" aria-hidden="true" />
    </PopoverTrigger>
    <PopoverContent align="end" className="scrollbar-none max-h-(--available-height) w-40 gap-1 overflow-y-auto" role="menu" aria-label={`会话操作：${title}`}
      onKeyDown={(event) => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
        if (!items.length) return;
        event.preventDefault();
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next].focus();
      }}>
      <Button variant="ghost" role="menuitem" disabled={disabled} className="justify-start" onClick={() => { setOpen(false); onAction({ kind: "rename", id, title }); }}>
        <Pencil className="size-4" aria-hidden="true" />重命名
      </Button>
      <Button variant="ghost" role="menuitem" disabled={disabled || deleteDisabled} title={deleteDisabled ? "该会话的请求尚未结束，暂不能删除。" : undefined} className="justify-start text-destructive" onClick={() => { setOpen(false); onAction({ kind: "delete", id, title }); }}>
        <Trash2 className="size-4" aria-hidden="true" />删除会话
      </Button>
    </PopoverContent>
  </Popover>;
}

export function ConversationDialog({ action, locked, onRename, onDelete, onClose }: {
  readonly action: ConversationAction; readonly locked: boolean;
  readonly onRename: (id: string, title: string) => Promise<void>;
  readonly onDelete: (id: string) => Promise<void>;
  readonly onClose: () => void;
}) {
  // The opening snapshot is intentional: list refreshes must not replace an edit.
  const [title, setTitle] = useState(action.title);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const visual = window.visualViewport;
    if (!visual) return;
    const update = () => {
      contentRef.current?.style.setProperty("--dialog-viewport-height", `${visual.height}px`);
      contentRef.current?.style.setProperty("--dialog-viewport-top", `${visual.offsetTop}px`);
    };
    update(); visual.addEventListener("resize", update); visual.addEventListener("scroll", update);
    return () => { visual.removeEventListener("resize", update); visual.removeEventListener("scroll", update); };
  }, []);
  const rename = action.kind === "rename";
  const submit = async () => {
    if (busyRef.current || locked) return;
    if (rename && !title.trim()) { setError("请输入会话名称。"); return; }
    busyRef.current = true; setBusy(true); setError(null);
    try {
      if (rename) await onRename(action.id, title.trim());
      else await onDelete(action.id);
      onClose();
    } catch {
      setError(rename ? "重命名失败，编辑内容已保留，请重试。" : "删除未确认，请刷新列表核对后重试。会话可能仍存在。");
    } finally { busyRef.current = false; setBusy(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busyRef.current) onClose(); }}>
    <DialogContent ref={contentRef} closeButtonProps={{ disabled: busy }}>
      <DialogHeader>
        <DialogTitle>{rename ? "重命名会话" : "删除会话"}</DialogTitle>
        <DialogDescription>{rename ? "修改会话名称。" : `确定删除「${action.title.trim() ? action.title : "未命名会话"}」及其消息吗？此操作无法撤销。`}</DialogDescription>
      </DialogHeader>
      <DialogBody render={<form id="conversation-action-form" onSubmit={(event) => { event.preventDefault(); void submit(); }} />}>
        {rename && <label className="flex flex-col gap-2 text-sm">会话名称
          <Input autoFocus value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} aria-invalid={!!error} />
        </label>}
        {locked && !busy && <p className="mt-2 text-xs text-muted-foreground" role="status">请先处理当前请求或等待操作完成。</p>}
        {error && <p className="mt-2 text-xs text-destructive" role="alert">{error}</p>}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>取消</Button>
        <Button type="submit" form="conversation-action-form" variant={rename ? "default" : "destructive"} disabled={busy || locked}>
          {busy ? "正在处理…" : rename ? "保存" : "确认删除"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
