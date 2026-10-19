import { Bell, Check, Circle, Heart, X } from "lucide-react";
import { canScheduleAction } from "@/application/schedule/schedule-controller";
import { scheduleTime, validMinute, type ManagedScheduleKind, type Schedule } from "@/domain/schedule";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ScheduleRows({ items, kind, busy, blocked, onToggle, onCancel }: {
  readonly items: readonly Schedule[]; readonly kind: ManagedScheduleKind; readonly busy: string | null; readonly blocked: boolean;
  readonly onToggle: (item: Schedule) => void; readonly onCancel: (item: Schedule) => void;
}) {
  return <ul className="divide-y divide-border/60">{items.map((item) => {
    const done = item.status === "done";
    const timeValid = validMinute(item.triggerAt);
    return <li key={item.id} className="flex items-start gap-3 py-4">
      {kind === "todo" ? <Tooltip><TooltipTrigger render={<Button type="button" variant="ghost" size="icon" className="-ml-1 size-11 shrink-0 rounded-xl" aria-label={`${done ? "恢复" : "完成"}待办：${item.content}`} aria-pressed={done}
        disabled={blocked || Boolean(busy)} loading={busy === item.id} onClick={() => onToggle(item)} />}>
        {done ? <Check className="size-5 text-muted-strong" /> : <Circle className="size-5 text-muted-strong" />}
      </TooltipTrigger><TooltipContent>{done ? "恢复待办" : "标记完成"}</TooltipContent></Tooltip>
        : <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-primary/8 text-primary-ink" aria-hidden="true">{kind === "alarm" ? <Bell className="size-4" /> : <Heart className="size-4" />}</span>}
      <div className="min-w-0 flex-1">
        {kind === "alarm" && <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="text-xl font-medium leading-7 text-foreground">{timeValid ? item.triggerAt.slice(11) : "时间待核对"}</p>
          <span className="text-xs text-muted-strong">{item.status === "triggered" ? "已触发" : "等待触发"}</span>
        </div>}
        <p className={`whitespace-pre-wrap break-words text-sm leading-6 ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>{item.content || "（内容为空）"}</p>
        {(item.triggerAt || kind !== "reminder") && <p className="mt-1 break-words text-xs leading-5 text-muted-strong">
          {kind === "todo" ? "记录时间：" : ""}{scheduleTime(item.triggerAt)}
        </p>}
      </div>
      {canScheduleAction(item, "cancel") && <Tooltip><TooltipTrigger render={<Button type="button" variant="ghost" size="icon" className="size-9 shrink-0 rounded-xl text-muted-foreground hover:text-destructive"
        disabled={blocked || Boolean(busy)} aria-label={`取消${kind === "reminder" ? "记挂" : kind === "todo" ? "待办" : "闹钟"}：${item.content}`} onClick={() => onCancel(item)} />}><X className="size-4" /></TooltipTrigger><TooltipContent>取消此项</TooltipContent></Tooltip>}
    </li>;
  })}</ul>;
}
