import { useRef, useState } from "react";
import { MoreHorizontal, Square, SquareCheck } from "lucide-react";
import { canScheduleAction } from "@/application/schedule/schedule-controller";
import { scheduleTime, validMinute, type ManagedScheduleKind, type Schedule } from "@/domain/schedule";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type CancelAction = (item: Schedule, trigger: HTMLButtonElement | null) => void;
// MemoryItem's body typography and foreground, keeping full text instead of its optional clamp.
const bodyClass = "whitespace-pre-wrap text-[13px] font-normal leading-7 text-[color-mix(in_srgb,var(--color-foreground)_70%,var(--color-muted-strong))] sm:text-sm [overflow-wrap:anywhere]";
export function ScheduleRows({ items, kind, busy, blocked, onToggle, onCancel }: {
  readonly items: readonly Schedule[]; readonly kind: ManagedScheduleKind; readonly busy: string | null; readonly blocked: boolean;
  readonly onToggle: (item: Schedule) => void; readonly onCancel: CancelAction;
}) {
  return <ul className={cn("divide-y divide-primary/10", kind === "alarm" && "grid grid-cols-[auto_minmax(0,1fr)] gap-x-3")}>{items.map((item) => {
    const done = item.status === "done", cancellable = canScheduleAction(item, "cancel");
    const timeValid = validMinute(item.triggerAt);
    if (kind === "alarm") return <li key={item.id} className="col-span-2 grid min-w-0 grid-cols-subgrid items-start gap-x-3 py-3" data-schedule-row={item.id} aria-label={item.status === "triggered" ? "已触发闹钟" : "等待触发闹钟"}>
      <p className="whitespace-nowrap text-xl font-medium leading-5 text-foreground tabular-nums" aria-label={timeValid ? "提醒时间" : "时间待核对"} data-schedule-alarm-time="true">{timeValid ? item.triggerAt.slice(11) : "—"}</p>
      <div className="min-w-0">
        <p className={cn(bodyClass, "leading-5")} data-schedule-body="true">{item.content || "（内容为空）"}</p>
        <footer className="flex min-w-0 items-center gap-2" data-schedule-row-metadata="true">
          <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]" data-schedule-alarm-date="true">{timeValid ? item.triggerAt.slice(0, 10) : scheduleTime(item.triggerAt)}</p>
          {cancellable && <ScheduleRowActions item={item} disabled={blocked || Boolean(busy)} onCancel={onCancel} />}
        </footer>
      </div>
    </li>;
    return <li key={item.id} className="flex items-start gap-2 py-3.5" data-schedule-row={item.id}>
      {kind === "todo" && <Tooltip><TooltipTrigger render={<Button type="button" variant="ghost" size="icon" className="-ml-2 -mt-2 size-11 shrink-0 rounded-xl" aria-label={`${done ? "恢复" : "完成"}待办：${item.content}`} aria-pressed={done}
        disabled={blocked || Boolean(busy)} loading={busy === item.id} onClick={() => onToggle(item)} />}>
        {done ? <SquareCheck className="size-4 text-primary-ink" strokeWidth={1.6} aria-hidden="true" /> : <Square className="size-4 text-muted-foreground" strokeWidth={1.4} aria-hidden="true" />}
      </TooltipTrigger><TooltipContent>{done ? "恢复待办" : "标记完成"}</TooltipContent></Tooltip>}
      <div className="min-w-0 flex-1">
        <p className={`${bodyClass}${done ? " line-through" : ""}`} data-schedule-body="true">{item.content || "（内容为空）"}</p>
        {(item.triggerAt || kind !== "reminder" || cancellable) && <footer className="mt-1 flex min-w-0 items-center gap-2" data-schedule-row-metadata="true">
          <div className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
            {(item.triggerAt || kind !== "reminder") && <p>{kind === "todo" ? "记录时间：" : ""}{scheduleTime(item.triggerAt)}</p>}
          </div>
          {cancellable && <ScheduleRowActions item={item} disabled={blocked || Boolean(busy)} onCancel={onCancel} />}
        </footer>}
      </div>
    </li>;
  })}</ul>;
}

export function ScheduleRowActions({ item, disabled, onCancel }: {
  readonly item: Schedule; readonly disabled: boolean; readonly onCancel: CancelAction;
}) {
  const [open, setOpen] = useState(false), trigger = useRef<HTMLButtonElement>(null);
  const name = item.kind === "reminder" ? "记挂" : item.kind === "todo" ? "待办" : "闹钟";
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger render={<Button ref={trigger} type="button" variant="ghost" size="icon" className="-mr-2 size-11 rounded-xl text-muted-foreground" disabled={disabled} aria-label={`更多${name}操作：${item.content}`} title="更多操作" />}>
      <MoreHorizontal className="size-4" strokeWidth={1.6} aria-hidden="true" />
    </PopoverTrigger>
    <PopoverContent align="end" className="w-40 max-w-[calc(100vw-2rem)] gap-0 p-1" aria-label={`${name}操作`}>
      <Button type="button" variant="ghost" className="min-h-11 justify-start text-xs text-destructive" disabled={disabled} onClick={() => { setOpen(false); onCancel(item, trigger.current); }}>取消{name}</Button>
    </PopoverContent>
  </Popover>;
}
