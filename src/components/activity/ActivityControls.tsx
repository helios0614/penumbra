import { useState } from "react";
import { zhCN } from "date-fns/locale";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Monitor, Smartphone } from "lucide-react";
import { formatDate } from "@/lib/calendar-utils";
import type { ActivityState } from "@/application/activity/activity-state";
import type { ActivityController } from "@/application/activity/activity-controller";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/selection-control";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { ActivityReadIssue } from "./ActivityFeedback";

function uiDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}
export function ActivityControls({ state, controller }: { readonly state: ActivityState; readonly controller: ActivityController | null }) {
  const [open, setOpen] = useState(false);
  const [calendar, setCalendar] = useState(false);
  const [month, setMonth] = useState<Date | null>(null);
  const selected = state.query.kind === "date" ? state.query.date : undefined;
  const dates = new Set(state.dates.data ?? []);
  const dateAvailable = !state.dates.loading && !state.dates.error;
  const missing = selected && state.dates.data !== null && dateAvailable && !dates.has(selected);
  const selectRecent = () => { void controller?.selectQuery({ kind: "recent", hours: 3 }); setOpen(false); };
  const selectDate = (date: string) => {
    if (!dateAvailable || !dates.has(date)) return;
    void controller?.selectQuery({ kind: "date", date }); setOpen(false);
  };
  const openArchive = () => {
    if (!dateAvailable || !dates.size) return;
    if (dates.size === 1) { selectDate([...dates][0]); return; }
    setMonth(uiDate(selected && dates.has(selected) ? selected : [...dates][0]));
    setCalendar(true);
  };
  return <div className="mist-glass rounded-[24px] px-3 py-1 sm:px-4">
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0">
      <div className="w-32 min-w-28 flex-1 sm:flex-none">
        <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) { setCalendar(false); void controller?.loadDates(); } }}>
          <PopoverTrigger render={<Button variant="ghost" className="h-11 w-full justify-between gap-1 rounded-xl border-border-strong/50 bg-background/25 px-2 text-xs text-muted-strong shadow-none hover:bg-background/45 aria-expanded:bg-background/45" aria-label="活动时间范围" />}>
            {selected ?? "最近 3 小时"}<ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent align="start" aria-label="选择活动时间范围" className="w-auto min-w-40 max-w-[calc(100vw-1rem)] gap-0 overflow-x-auto p-1">
            {calendar && month ? <>
              <div className="flex items-center justify-between gap-2 px-1">
                <Button variant="ghost" className="h-11 gap-1 px-2 text-xs" onClick={() => setCalendar(false)}><ArrowLeft aria-hidden="true" className="size-3.5" />时间范围</Button>
                <span className="text-xs text-muted-strong">归档日期</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Tooltip><TooltipTrigger render={<Button variant="ghost" className="size-11" aria-label="上个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()-1, 1, 12))} />}><ChevronLeft aria-hidden="true" /></TooltipTrigger><TooltipContent>上个月</TooltipContent></Tooltip>
                <p className="text-sm">{month.getFullYear()} 年 {month.getMonth()+1} 月</p>
                <Tooltip><TooltipTrigger render={<Button variant="ghost" className="size-11" aria-label="下个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()+1, 1, 12))} />}><ChevronRight aria-hidden="true" /></TooltipTrigger><TooltipContent>下个月</TooltipContent></Tooltip>
              </div>
              <Calendar mode="single" locale={zhCN} selected={selected && dates.has(selected) ? uiDate(selected) : undefined} month={month} onMonthChange={setMonth} className="[--cell-size:--spacing(11)] px-1" disabled={(date) => !dateAvailable || !dates.has(formatDate(date))} onSelect={(date) => { if (date) selectDate(formatDate(date)); }} />
            </> : <>
              <Button variant="ghost" className="h-11 w-full justify-start rounded-lg px-3 text-xs" aria-pressed={state.query.kind === "recent"} onClick={selectRecent}>最近 3 小时</Button>
              <Button variant="ghost" className="h-11 w-full justify-start rounded-lg px-3 text-xs" aria-pressed={state.query.kind === "date"} disabled={!dateAvailable || !dates.size} onClick={openArchive}>归档日期</Button>
            </>}
            {state.dates.loading && <p role="status" className="px-3 py-2 text-xs text-muted-foreground">正在读取可用日期…</p>}
            <ActivityReadIssue state={state} name="dates" text="归档日期读取失败" onRetry={() => void controller?.loadDates()} />
            {!state.dates.loading && !state.dates.error && !dates.size && <p className="px-3 py-2 text-xs text-muted-foreground">暂无可用的日志归档日期</p>}
          </PopoverContent>
        </Popover>
      </div>
      <div role="group" aria-label="活动设备筛选" className="flex min-w-0 shrink-0 justify-end gap-0.5">
        {([{ value: "all", label: "全部", icon: null }, { value: "pc", label: "电脑", icon: Monitor }, { value: "phone", label: "手机", icon: Smartphone }] as const).map(({ value, label, icon: Icon }) => <FilterChip key={value} selected={state.device === value} onClick={() => controller?.selectDevice(value)}>{Icon && <Icon className="hidden size-3.5 sm:block" aria-hidden="true" />}{label}</FilterChip>)}
      </div>
    </div>
    {!open && <ActivityReadIssue state={state} name="dates" text="归档日期读取失败" onRetry={() => void controller?.loadDates()} />}
    {missing && <div role="status" className="flex flex-wrap items-center gap-2 text-xs text-muted-strong"><span>所选归档已不在可用日期中，可能已被清理。</span><Button variant="ghost" className="h-11 px-2 text-xs" onClick={selectRecent}>回到最近活动</Button></div>}
  </div>;
}
