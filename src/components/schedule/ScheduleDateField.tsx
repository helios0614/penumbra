import { useState } from "react";
import { zhCN } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { validDate } from "@/domain/schedule";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Local Date objects are calendar UI values only; submitted values stay date-only text.
function calendarDay(key: string) {
  if (!validDate(key)) return undefined;
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(0); date.setFullYear(year, month - 1, day); date.setHours(12, 0, 0, 0);
  return date;
}
function calendarToday(timeZone?: string | null) {
  const now = new Date();
  // Reminders have no time execution; this only chooses the initial visible month.
  if (!timeZone) return now;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
    return calendarDay(`${part("year")}-${part("month")}-${part("day")}`);
  } catch { return undefined; }
}
export function ScheduleDateField({ id, label, value, disabled, timeZone, onChange }: {
  readonly id: string; readonly label: string; readonly value: string; readonly disabled: boolean;
  readonly timeZone?: string | null; readonly onChange: (value: string) => void;
}) {
  const today = calendarToday(timeZone), selected = calendarDay(value);
  const [open, setOpen] = useState(false), [month, setMonth] = useState(() => selected ?? today);
  const unavailable = disabled || !today;
  const moveMonth = (delta: number) => {
    if (unavailable || !month) return;
    const next = new Date(month); next.setDate(1); next.setMonth(next.getMonth() + delta);
    if (next.getFullYear() >= 1 && next.getFullYear() <= 9999) setMonth(next);
  };
  return <Popover open={open} onOpenChange={(next) => {
    if (next && unavailable) return;
    if (next) setMonth(selected ?? today);
    setOpen(next);
  }}>
    <PopoverTrigger id={id} disabled={unavailable} aria-label={`${label}，${value || "未设置"}`} render={<Button type="button" variant="ghost" className="h-11 w-full min-w-0 justify-between rounded-xl border-border-strong/50 bg-background/25 px-2.5 text-sm font-normal shadow-sm hover:bg-background/35" />}>
      <span className="min-w-0 [overflow-wrap:anywhere]">{value || "选择日期"}</span><CalendarDays className="size-4 text-muted-strong" aria-hidden="true" />
    </PopoverTrigger>
    <PopoverContent align="start" className="scrollbar-none max-h-(--available-height) w-auto max-w-[calc(100vw-2rem)] gap-1 overflow-auto p-2" aria-label={label}>
      {month && <>
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" className="size-11" aria-label="上个月" title="上个月" disabled={unavailable} onClick={() => moveMonth(-1)}><ChevronLeft aria-hidden="true" /></Button>
          <span className="text-sm text-foreground">{month.getFullYear()} 年 {month.getMonth() + 1} 月</span>
          <Button type="button" variant="ghost" className="size-11" aria-label="下个月" title="下个月" disabled={unavailable} onClick={() => moveMonth(1)}><ChevronRight aria-hidden="true" /></Button>
        </div>
        <Calendar mode="single" locale={zhCN} month={month} onMonthChange={setMonth} selected={selected} today={today} disabled={unavailable}
          className="[--cell-size:min(2.75rem,calc((100vw-5rem)/7))] px-0" onSelect={(date) => {
            if (unavailable || !date) return;
            const key = `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
            if (validDate(key)) { onChange(key); setOpen(false); }
          }} />
      </>}
      {value && <Button type="button" variant="ghost" size="compact" disabled={unavailable} onClick={() => { if (!unavailable) { onChange(""); setOpen(false); } }}>清除日期</Button>}
    </PopoverContent>
  </Popover>;
}
