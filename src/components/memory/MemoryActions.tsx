import { useState } from "react";
import { MoreHorizontal, Pencil, RotateCcw, Trash2, ListRestart } from "lucide-react";
import type { Memory } from "@/domain/memory";
import { sourceReason, type MemoryAction, type MemorySourceRead } from "@/application/memory-management";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function MemoryActions({ memory, pending, source, onCheckSource, onAction }: {
  readonly memory: Memory; readonly pending: boolean; readonly source?: MemorySourceRead;
  readonly onCheckSource: (id: string) => void; readonly onAction: (action: MemoryAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const ready = source?.status === "ready" && source.value.supported;
  const choose = (kind: MemoryAction["kind"]) => { setOpen(false); onAction({ kind, memory }); };
  return <Popover open={open} onOpenChange={value => { setOpen(value); if (value) onCheckSource(memory.id); }}>
    <PopoverTrigger aria-haspopup="menu" render={<Button type="button" size="icon-lg" variant="ghost" disabled={pending} aria-label="记忆操作" title="记忆操作" data-memory-menu-trigger={memory.id} className="size-11 rounded-xl text-muted-foreground" />}>
      <MoreHorizontal className="size-4" aria-hidden="true" />
    </PopoverTrigger>
    <PopoverContent align="end" className="w-64 max-w-[calc(100vw-2rem)] gap-1" role="menu" aria-label="记忆操作菜单"
      onKeyDown={event => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
        if (!items.length) return;
        event.preventDefault();
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next].focus();
      }}>
      <Button variant="ghost" role="menuitem" disabled={pending} className="min-h-11 justify-start" onClick={() => choose("edit")}><Pencil aria-hidden="true" />编辑</Button>
      <Button variant="ghost" role="menuitem" disabled={pending} className="min-h-11 justify-start" onClick={() => choose("resummarize")}><RotateCcw aria-hidden="true" />重新总结</Button>
      <Button variant="ghost" role="menuitem" disabled={pending} className="min-h-11 justify-start text-destructive-foreground" onClick={() => choose("delete")}><Trash2 aria-hidden="true" />删除</Button>
      <Button variant="ghost" role="menuitem" disabled={pending || !ready} className="min-h-11 justify-start" onClick={() => choose("requeue")}><ListRestart aria-hidden="true" />删除并重新总结来源</Button>
      {!ready && <p className="px-3 py-1 text-xs leading-5 text-muted-foreground" role="status">
        {source?.status === "ready" && !source.value.supported ? sourceReason(source.value.reason) : source?.status === "error" ? "来源检查失败，请重新检查。" : "正在检查来源是否可用…"}
      </p>}
      {source?.status === "error" && <Button variant="ghost" size="compact" onClick={() => onCheckSource(memory.id)}>重新检查来源</Button>}
    </PopoverContent>
  </Popover>;
}
