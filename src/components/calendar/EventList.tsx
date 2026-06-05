import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "./Calendar";

interface EventListProps {
  events: CalendarEvent[];
  dateLabel: string;
  onDelete?: (eventId: string) => void;
  className?: string;
}

/** 选中日期的事件列表，内部滚动，撑满父容器剩余高度 */
export default function EventList({ events, dateLabel, onDelete, className }: EventListProps) {
  return (
    <div className={cn("flex flex-col flex-1 min-h-0", className)}>
      <div className="flex items-center justify-between mb-2 shrink-0">
        <h3 className="text-sm font-semibold text-foreground">{dateLabel}</h3>
        <span className="text-xs text-muted-strong">
          {events.length > 0 ? `${events.length} 项日程` : ""}
        </span>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-sm text-muted-strong">暂无日程</p>
          <p className="text-xs text-muted-foreground mt-1">点击下方添加新日程</p>
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <div className="flex flex-col gap-1.5">
            {events.map((ev) => (
              <div
                key={ev.id}
                className={cn(
                  "group flex items-center gap-2.5 px-3 py-2 rounded-sm",
                  "hover:bg-surface-secondary/60 transition-colors"
                )}
              >
                <span
                  className="w-0.5 h-4 rounded-full shrink-0"
                  style={{ backgroundColor: ev.color ?? "var(--color-primary)" }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{ev.title}</p>
                  {ev.time && (
                    <p className="text-xs text-muted-strong">{ev.time}</p>
                  )}
                </div>
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 opacity-0 group-hover:opacity-100 text-muted-strong hover:text-destructive transition-opacity rounded-sm"
                    onClick={() => onDelete(ev.id)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
