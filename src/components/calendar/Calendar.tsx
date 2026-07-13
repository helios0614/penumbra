import { useState, useMemo, useCallback } from "react";
import { format, addMonths, subMonths, startOfMonth } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import { Calendar as ShadcnCalendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DayButton } from "react-day-picker";
import CalendarHeader from "./CalendarHeader";
import EventDot from "./EventDot";
import EventList from "./EventList";
import EventCreator from "./EventCreator";

/* ── 事件类型 ── */
export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  time?: string; // HH:mm
  color?: string;
}

/* ── 组件 Props ── */
export interface CalendarProps {
  events?: CalendarEvent[];
  selectedDate?: Date;
  onDateSelect?: (date: Date) => void;
  onEventCreate?: (event: Omit<CalendarEvent, "id">) => void;
  onEventDelete?: (eventId: string) => void;
  highlightToday?: boolean;
  weekStart?: 0 | 1;
  layout?: "compact" | "side";
  embedded?: boolean;
  className?: string;
}

export default function Calendar({
  events = [],
  selectedDate: controlledSelected,
  onDateSelect,
  onEventCreate,
  onEventDelete,
  highlightToday = true,
  weekStart = 1,
  layout = "compact",
  embedded = false,
  className,
}: CalendarProps) {
  const [internalSelected, setInternalSelected] = useState<Date | undefined>();
  const selected = controlledSelected ?? internalSelected;
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(selected ?? new Date()));

  const eventMap = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of events) {
      (map[ev.date] ??= []).push(ev);
    }
    return map;
  }, [events]);

  const selectedKey = selected ? format(selected, "yyyy-MM-dd") : "";
  const selectedEvents = selectedKey ? eventMap[selectedKey] ?? [] : [];

  const handleSelect = useCallback(
    (d: Date | undefined) => {
      setInternalSelected(d);
      if (d) onDateSelect?.(d);
    },
    [onDateSelect]
  );

  const monthLabel = format(currentMonth, "yyyy 年 M 月", { locale: zhCN });
  const dateLabel = selected
    ? format(selected, "M 月 d 日 EEEE", { locale: zhCN })
    : "";

  const calendarContent = (
    <div className="flex flex-col shrink-0">
      <CalendarHeader
        monthLabel={monthLabel}
        onPrev={() => setCurrentMonth((m) => subMonths(m, 1))}
        onNext={() => setCurrentMonth((m) => addMonths(m, 1))}
        onToday={() => {
          const today = new Date();
          setCurrentMonth(startOfMonth(today));
          handleSelect(today);
        }}
      />
      <ShadcnCalendar
        mode="single"
        month={currentMonth}
        onMonthChange={setCurrentMonth}
        selected={selected}
        onSelect={handleSelect}
        locale={zhCN}
        weekStartsOn={weekStart === 0 ? 0 : 1}
        showOutsideDays
        captionLayout="label"
        className="w-full max-w-[380px] mx-auto"
        classNames={{
          today: highlightToday
            ? "bg-primary-subtle text-primary font-semibold data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground"
            : undefined,
          outside: "text-muted-foreground opacity-40",
          button_previous: "hidden",
          button_next: "hidden",
          caption_label: "hidden",
        }}
        components={{
          DayButton: (props) => (
            <DayButtonWithEvents {...props} eventMap={eventMap} />
          ),
        }}
      />
    </div>
  );

  const eventPanel = (
    <div className="flex flex-col flex-1 min-h-0">
      {selected ? (
        <>
          <EventList
            events={selectedEvents}
            dateLabel={dateLabel}
            onDelete={onEventDelete}
          />
          {onEventCreate && (
            <div className="mt-2 pt-2 border-t border-border shrink-0">
              <EventCreator date={selectedKey} onSubmit={onEventCreate} />
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm text-muted-strong">选择日期查看日程</p>
        </div>
      )}
    </div>
  );

  if (layout === "side") {
    return (
      <div className={cn("flex gap-4 min-h-0", className)}>
        <div className="mist-glass rounded-lg p-4 select-none shrink-0">
          {calendarContent}
        </div>
        <div className="mist-glass rounded-lg p-4 min-w-[240px] flex-1 flex flex-col min-h-0">
          {eventPanel}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "select-none flex flex-col min-h-0",
        embedded ? "mist-solid rounded-[24px] p-4" : "mist-glass rounded-lg p-4",
        className,
      )}
    >
      {calendarContent}
      <div className="mt-3 pt-3 border-t border-border flex flex-col flex-1 min-h-0">
        {eventPanel}
      </div>
    </div>
  );
}

/* ── 带事件点的日期按钮 ── */
function DayButtonWithEvents({
  day,
  modifiers,
  eventMap,
  className,
  ...props
}: React.ComponentProps<typeof DayButton> & {
  eventMap: Record<string, CalendarEvent[]>;
}) {
  const dateKey = format(day.date, "yyyy-MM-dd");
  const dayEvents = eventMap[dateKey];

  return (
    <Button
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString("zh-CN")}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      className={cn(
        "relative isolate z-10 flex aspect-square size-auto w-full",
        "min-w-(--cell-size) flex-col gap-0.5 border-0 rounded-(--cell-radius) leading-none font-normal",
        "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground",
        className
      )}
      {...props}
    >
      <span>{day.date.getDate()}</span>
      {dayEvents && <EventDot events={dayEvents} selected={modifiers.selected} />}
    </Button>
  );
}
