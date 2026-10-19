import { useRef, useState } from "react";
import { Bell, MoreHorizontal, Square, SquareCheck } from "lucide-react";
import { canScheduleAction } from "@/application/schedule/schedule-controller";
import { scheduleTime, validMinute, type ManagedScheduleKind, type Schedule } from "@/domain/schedule";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type CancelAction = (item: Schedule, trigger: HTMLButtonElement | null) => void;
export function ScheduleRows({ items, kind, busy, blocked, onToggle, onCancel }: {
  readonly items: readonly Schedule[]; readonly kind: ManagedScheduleKind; readonly busy: string | null; readonly blocked: boolean;
  readonly onToggle: (item: Schedule) => void; readonly onCancel: CancelAction;
}) {
  return <ul className="divide-y divide-primary/10">{items.map((item) => {
    const done = item.status === "done", cancellable = canScheduleAction(item, "cancel");
    const timeValid = validMinute(item.triggerAt);
    return <li key={item.id} className="flex items-start gap-2 py-3" data-schedule-row={item.id}>
      {kind === "todo" && <Tooltip><TooltipTrigger render={<Button type="button" variant="ghost" size="icon" className="-ml-2 -mt-2 size-11 shrink-0 rounded-xl" aria-label={`${done ? "恢复" : "完成"}待办：${item.content}`} aria-pressed={done}
        disabled={blocked || Boolean(busy)} loading={busy === item.id} onClick={() => onToggle(item)} />}>
        {done ? <SquareCheck className="size-4 text-primary-ink" strokeWidth={1.6} aria-hidden="true" /> : <Square className="size-4 text-muted-foreground" strokeWidth={1.4} aria-hidden="true" />}
      </TooltipTrigger><TooltipContent>{done ? "恢复待办" : "标记完成"}</TooltipContent></Tooltip>}
      <div className="min-w-0 flex-1">
        {kind === "alarm" && <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <Bell className="size-3.5 self-center text-primary-ink" strokeWidth={1.6} aria-hidden="true" />
          <p className="text-xl font-medium leading-7 text-foreground">{timeValid ? item.triggerAt.slice(11) : "时间待核对"}</p>
          <span className="text-xs text-muted-strong">{item.status === "triggered" ? "已触发" : "等待触发"}</span>
        </div>}
        <p className={`whitespace-pre-wrap text-sm leading-[1.6] [overflow-wrap:anywhere] ${done ? "text-muted-strong line-through" : "text-foreground"}`} data-schedule-body="true">{item.content || "（内容为空）"}</p>
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
