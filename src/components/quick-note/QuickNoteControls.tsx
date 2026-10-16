import { useEffect, useState } from "react";
import { zhCN } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { businessDate, parseDateKey, shiftDate } from "@/application/quick-note/quick-note-date";
import type { TriggerConfig } from "@/domain/quick-note";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Calendar uses local Date objects only as date-only UI values, never as query bounds.
function calendarDate(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function QuickNoteDatePicker({ date, onChange, disabled = false, label = "选择日期" }: {
  readonly date: string; readonly onChange: (date: string) => void; readonly disabled?: boolean; readonly label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => calendarDate(date));
  const selected = calendarDate(date);
  const moveMonth = (delta: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1, 12));
  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setMonth(selected); }}>
      <PopoverTrigger render={<Button variant="outline" className="h-11 px-3" disabled={disabled} aria-label={label} />}>
        <CalendarDays aria-hidden="true" />{date}
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] p-2" align="start" aria-label={label}>
        <div className="flex items-center justify-between gap-2">
          <Tooltip><TooltipTrigger render={<Button variant="ghost" className="size-11" aria-label="上个月" title="上个月" onClick={() => moveMonth(-1)} />}><ChevronLeft aria-hidden="true" /></TooltipTrigger><TooltipContent>上个月</TooltipContent></Tooltip>
          <span className="text-sm text-foreground">{month.getFullYear()} 年 {month.getMonth() + 1} 月</span>
          <Tooltip><TooltipTrigger render={<Button variant="ghost" className="size-11" aria-label="下个月" title="下个月" onClick={() => moveMonth(1)} />}><ChevronRight aria-hidden="true" /></TooltipTrigger><TooltipContent>下个月</TooltipContent></Tooltip>
        </div>
        <Calendar mode="single" locale={zhCN} month={month} onMonthChange={setMonth} selected={selected}
          className="[--cell-size:--spacing(11)] px-0" onSelect={(value) => {
            if (!value) return;
            const key = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
            parseDateKey(key); onChange(key); setOpen(false);
          }} />
      </PopoverContent>
    </Popover>
  );
}

export function QuickNoteDateNavigation({ config, date, onChange }: {
  readonly config: TriggerConfig; readonly date: string; readonly onChange: (date: string) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  let today: string;
  try { today = businessDate(config, now); }
  catch { return <p role="alert" className="mist-glass rounded-[24px] p-4 text-sm">当前业务日界不可用，请重新读取时段配置。</p>; }
  return (
    <nav className="mist-glass flex flex-wrap items-center gap-2 rounded-[24px] p-3 sm:px-5" aria-label="速记日期">
      {["今天", "昨天", "前天"].map((label, index) => {
        const key = shiftDate(today, -index);
        return <Button key={label} variant={date === key ? "default" : "ghost"} className="h-11 min-w-16 px-4" aria-pressed={date === key} onClick={() => onChange(shiftDate(businessDate(config), -index))}>{label}</Button>;
      })}
      <QuickNoteDatePicker date={date} onChange={onChange} />
      <span className="w-full px-1 text-xs text-muted-foreground sm:ml-auto sm:w-auto">{config.timeZone} · {String(config.dayBoundaryHour).padStart(2, "0")}:00 日界</span>
    </nav>
  );
}
