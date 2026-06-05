import { useState, useRef, useEffect } from "react";
import { Plus, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "./Calendar";

interface EventCreatorProps {
  date: string; // YYYY-MM-DD
  onSubmit: (event: Omit<CalendarEvent, "id">) => void;
  className?: string;
}

/** 快速创建事件的 inline 表单 */
export default function EventCreator({ date, onSubmit, className }: EventCreatorProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const reset = () => {
    setTitle("");
    setTime("");
    setOpen(false);
  };

  const handleSubmit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onSubmit({ date, title: trimmed, time: time || undefined });
    reset();
  };

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "w-full justify-start gap-1.5 text-xs text-muted-strong",
          "hover:text-foreground hover:bg-surface-secondary rounded-sm",
          className
        )}
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3.5" />
        添加日程
      </Button>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2 p-3 rounded-md bg-surface-secondary/50", className)}>
      <Input
        ref={inputRef}
        placeholder="日程标题"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") reset();
        }}
        className="h-8 text-sm bg-background"
      />
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Clock className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-strong" />
          <Input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-8 text-xs pl-7 bg-background"
          />
        </div>
        <Button
          size="sm"
          className="h-8 px-3 text-xs rounded-sm"
          onClick={handleSubmit}
          disabled={!title.trim()}
        >
          添加
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs rounded-sm text-muted-strong"
          onClick={reset}
        >
          取消
        </Button>
      </div>
    </div>
  );
}
