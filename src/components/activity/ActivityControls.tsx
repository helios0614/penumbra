import { useState } from "react";
import { zhCN } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Monitor, Smartphone } from "lucide-react";
import { formatDate } from "@/lib/calendar-utils";
import type { ActivityState } from "@/application/activity/activity-state";
import type { ActivityController } from "@/application/activity/activity-controller";
import { activityCounts } from "@/application/activity/activity-presentation";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/app-select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function uiDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}
export function ActivityControls({ state, controller }: { readonly state: ActivityState; readonly controller: ActivityController | null }) {
  const [open, setOpen] = useState(false);
  const selected = state.query.kind === "date" ? state.query.date : state.dates.data?.[0] ?? formatDate(new Date());
  const [month, setMonth] = useState(() => uiDate(selected));
  const counts = activityCounts(state.logs.data ?? []);
  const dates = new Set(state.dates.data ?? []);
  return <div className="mist-glass rounded-[24px] px-3 py-2 sm:px-4">
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-36 flex-1 sm:flex-none"><AppSelect value={state.query.kind} onValueChange={(value) => void controller?.selectQuery(value === "recent" ? { kind: "recent", hours: 3 } : { kind: "date", date: selected })} ariaLabel="活动时间范围" surface="translucent" options={[{ value: "recent", label: "最近 3 小时" }, { value: "date", label: "按归档日期查看" }]} /></div>
      {state.query.kind === "date" && <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) { setMonth(uiDate(selected)); void controller?.loadDates(); } }}>
        <PopoverTrigger render={<Button variant="ghost" className="h-11 gap-2 px-2 text-xs" aria-label="选择日志归档日期" />}><CalendarDays aria-hidden="true" className="size-4" />{selected}</PopoverTrigger>
        <PopoverContent align="start" className="w-auto max-w-[calc(100vw-1rem)] overflow-x-auto p-2">
          <div className="flex items-center justify-between gap-2">
            <Tooltip><TooltipTrigger render={<Button variant="ghost" className="size-11" aria-label="上个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()-1, 1, 12))} />}><ChevronLeft aria-hidden="true" /></TooltipTrigger><TooltipContent>上个月</TooltipContent></Tooltip>
            <p className="text-sm">{month.getFullYear()} 年 {month.getMonth()+1} 月</p>
            <Tooltip><TooltipTrigger render={<Button variant="ghost" className="size-11" aria-label="下个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()+1, 1, 12))} />}><ChevronRight aria-hidden="true" /></TooltipTrigger><TooltipContent>下个月</TooltipContent></Tooltip>
          </div>
          <Calendar mode="single" locale={zhCN} selected={uiDate(selected)} month={month} onMonthChange={setMonth} className="[--cell-size:--spacing(11)] px-0" disabled={(date) => !dates.has(formatDate(date))} onSelect={(date) => { if (date) { void controller?.selectQuery({ kind: "date", date: formatDate(date) }); setOpen(false); } }} />
          <p className="px-2 py-1 text-xs text-muted-foreground">{state.dates.loading ? "正在读取可用日期…" : dates.size ? "可选择服务端保存的归档日期" : "暂无可用的日志归档日期"}</p>
        </PopoverContent>
      </Popover>}
      <div role="group" aria-label="活动设备筛选" className="flex w-full min-w-0 justify-end gap-1 sm:w-auto sm:flex-1">
        {([{ value: "all", label: "全部", icon: null }, { value: "pc", label: "电脑", icon: Monitor }, { value: "phone", label: "手机", icon: Smartphone }] as const).map(({ value, label, icon: Icon }) => <Button key={value} variant="ghost" aria-pressed={state.device === value} onClick={() => controller?.selectDevice(value)} className={`h-11 gap-1.5 rounded-xl px-2.5 text-xs ${state.device === value ? "bg-primary/12 text-primary-ink" : "text-muted-strong"}`}>{Icon && <Icon className="size-3.5" aria-hidden="true" />}{label}</Button>)}
      </div>
    </div>
    <p className="px-1 pb-1 pt-2 text-[11px] leading-5 text-muted-foreground">当前范围 {counts.all} 条事件 · 电脑 {counts.pc} · 手机 {counts.phone}</p>
    {state.dates.error && <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-destructive"><span>归档日期读取失败。</span><Button variant="ghost" className="h-11 text-xs" onClick={() => void controller?.loadDates()}>重新读取日期</Button></div>}
  </div>;
}
