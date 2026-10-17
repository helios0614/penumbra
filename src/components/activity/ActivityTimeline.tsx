import { useMemo, useState } from "react";
import { Activity, ChevronDown, Monitor, Smartphone } from "lucide-react";
import type { ActivityState } from "@/application/activity/activity-state";
import type { ActivityController } from "@/application/activity/activity-controller";
import { activityEventLabel, eventDate, eventTime, filterActivity } from "@/application/activity/activity-presentation";
import type { ActivityRecord } from "@/domain/activity";
import { Button } from "@/components/ui/button";

export const ACTIVITY_RENDER_BATCH = 200;
export function ActivityTimeline({ state, controller }: { readonly state: ActivityState; readonly controller: ActivityController | null }) {
  const scope = `${JSON.stringify(state.query)}:${state.device}`;
  const [batch, setBatch] = useState({ scope, limit: ACTIVITY_RENDER_BATCH });
  const limit = batch.scope === scope ? batch.limit : ACTIVITY_RENDER_BATCH;
  const rows = useMemo(() => filterActivity(state.logs.data ?? [], state.device), [state.logs.data, state.device]);
  const visible = rows.slice(0, limit);
  return <section className="activity-reading mist-glass-strong overflow-hidden rounded-[24px]" aria-label="活动时间线" aria-busy={state.logs.loading}>
    <div className="flex items-center justify-between gap-2 border-b border-primary/10 px-4 py-3 sm:px-5">
      <h2 className="text-xs font-medium text-muted-strong">{state.query.kind === "recent" ? "最近 3 小时的轨迹" : `${state.query.date} 的归档记录`}</h2>
      <span className="text-[11px] text-muted-foreground">{state.logs.loading ? "正在同步…" : "按事件时间倒序"}</span>
    </div>
    {state.logs.error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-destructive"><span>{state.logs.error}{state.logs.data ? " 当前保留上次读取结果。" : ""}</span><Button variant="ghost" className="h-11 text-xs" onClick={() => void controller?.loadLogs()}>重新读取活动</Button></div>}
    {!state.logs.data && state.logs.loading && <p role="status" className="px-5 py-12 text-center text-sm text-muted-foreground">正在读取活动记录…</p>}
    {state.logs.data && !rows.length && <p className="px-5 py-12 text-center text-sm text-muted-foreground">当前范围内暂无{state.device === "pc" ? "电脑" : state.device === "phone" ? "手机" : ""}活动记录。</p>}
    {visible.length > 0 && <ol className="px-4 sm:px-5">{visible.map((event, index) => <ActivityTimelineRow key={event.key} event={event} showDate={index === 0 || eventDate(visible[index-1].timestamp) !== eventDate(event.timestamp)} />)}</ol>}
    {visible.length < rows.length && <div className="flex flex-wrap items-center justify-center gap-x-3 border-t border-primary/10 px-4 py-2">
      <span className="text-[11px] text-muted-foreground">已呈现 {visible.length} / {rows.length} 条事件</span>
      <Button variant="ghost" className="h-11 text-xs text-primary-ink" onClick={() => setBatch({ scope, limit: limit + ACTIVITY_RENDER_BATCH })}>继续显示 {Math.min(ACTIVITY_RENDER_BATCH, rows.length-visible.length)} 条<ChevronDown className="size-3.5" aria-hidden="true" /></Button>
    </div>}
  </section>;
}
export function ActivityTimelineRow({ event, showDate = false }: { readonly event: ActivityRecord; readonly showDate?: boolean }) {
  const Icon = event.device === "pc" ? Monitor : event.device === "phone" ? Smartphone : Activity;
  const source = event.device === "pc" ? "电脑" : event.device === "phone" ? "手机" : event.device || "未知来源";
  const expandable = Boolean(event.title && event.title !== event.app);
  const rowClass = "grid min-h-11 min-w-0 grid-cols-[4.5rem_1.25rem_minmax(0,1fr)] items-start gap-2 border-b border-primary/10 py-2.5 text-[13px] sm:grid-cols-[5rem_1.25rem_minmax(0,1fr)] sm:gap-3";
  const content = <>
    <time className="pt-0.5 text-xs tabular-nums text-muted-foreground" dateTime={new Date(event.timestamp*1000).toISOString()} title={sampleDateTitle(event.timestamp)}>{eventTime(event.timestamp)}</time>
    <span className="pt-0.5 text-muted-strong" title={source}><Icon className="size-4" aria-hidden="true" /><span className="sr-only">{source}</span></span>
    <span className="min-w-0">
      <span className="block break-words leading-5 text-foreground">{activityEventLabel(event)}</span>
      {expandable && <span className="mt-0.5 flex min-w-0 items-start gap-1 text-xs leading-5 text-muted-foreground"><span className="min-w-0 flex-1 truncate">{event.title}</span><ChevronDown aria-hidden="true" className="mt-1 size-3 shrink-0 group-open/title:rotate-180" /></span>}
    </span>
  </>;
  return <li data-activity-event-key={event.key} className="min-w-0">
    {showDate && <h3 className="pb-1 pt-3 text-[11px] font-medium text-muted-foreground">{eventDate(event.timestamp)}</h3>}
    {expandable ? <details className="group/title"><summary className={`${rowClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>{content}</summary><p className="whitespace-pre-wrap break-words py-2 text-xs leading-5 text-muted-strong">{event.title}</p></details> : <div className={rowClass}>{content}</div>}
  </li>;
}
function sampleDateTitle(timestamp: number) { return `${eventDate(timestamp)} ${eventTime(timestamp)}`; }
