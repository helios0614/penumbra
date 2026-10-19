import { useState } from "react";
import { Check, Circle, Pause, Play, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const INITIAL_TASKS = [
  { id: 1, label: "整理本周最重要的三件事", done: true },
  { id: 2, label: "留出 30 分钟不被打扰的时间", done: false },
  { id: 3, label: "睡前记下一段今天的心情", done: false },
];

export function TodayPanel({ onOpen }: { onOpen: () => void }) {
  const [tasks, setTasks] = useState(INITIAL_TASKS);

  const toggleTask = (taskId: number) => {
    setTasks((current) => current.map((task) => (
      task.id === taskId ? { ...task, done: !task.done } : task
    )));
  };

  return (
    <section className="rounded-[24px] border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Daily list</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Today</h2>
          <p className="mt-1 text-xs text-muted-foreground">示例清单 · 未同步，打开待办查看真实记录</p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="grid size-11 place-items-center rounded-full border border-border text-foreground hover:bg-surface-secondary"
          aria-label="打开待办"
          title="打开待办"
        >
          <Plus className="size-5" />
        </button>
      </div>

      <div className="mt-4 space-y-1">
        {tasks.map((task) => (
          <button
            key={task.id}
            type="button"
            onClick={() => toggleTask(task.id)}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-surface-secondary"
            aria-pressed={task.done}
          >
            <span className={cn(
              "grid size-5 shrink-0 place-items-center rounded-full border",
              task.done ? "border-foreground bg-foreground text-background" : "border-border-strong text-muted-foreground",
            )}>
              {task.done ? <Check className="size-3" /> : <Circle className="size-2 fill-current" />}
            </span>
            <span className={cn("text-sm text-foreground", task.done && "text-muted-foreground line-through")}>{task.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
        <span>完成进度</span>
        <span className="font-mono">{tasks.filter((task) => task.done).length} / {tasks.length}</span>
      </div>
    </section>
  );
}

export function NowPlaying({ onOpen }: { onOpen: () => void }) {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <section className="rounded-[24px] bg-foreground p-4 text-background shadow-md">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="editorial-botanical grid size-14 shrink-0 place-items-center rounded-full border border-background/30"
          aria-label="打开音乐"
          title="打开音乐"
        >
          <MusicMark />
        </button>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="truncate text-base font-semibold">Quiet Hours</p>
          <p className="mt-0.5 truncate text-xs text-background/65">Penumbra Radio · soft focus</p>
        </button>
        <button
          type="button"
          onClick={() => setIsPlaying((playing) => !playing)}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-background text-foreground"
          aria-label={isPlaying ? "暂停音乐" : "播放音乐"}
          title={isPlaying ? "暂停" : "播放"}
        >
          {isPlaying ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
        </button>
      </div>
      <div className="mt-4 h-0.5 overflow-hidden rounded-full bg-background/20">
        <span className={cn("block h-full rounded-full bg-background transition-[width]", isPlaying ? "w-[58%]" : "w-[34%]")} />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[9px] text-background/55">
        <span>03:42</span>
        <span>09:18</span>
      </div>
    </section>
  );
}

function MusicMark() {
  return (
    <span className="editorial-serif text-lg font-semibold italic text-foreground" aria-hidden="true">P.</span>
  );
}
