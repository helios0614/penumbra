import { useMemo, useState } from "react";
import { Activity, ChevronDown, Monitor, Smartphone } from "lucide-react";
import type { ActivityState } from "@/application/activity/activity-state";
import type { ActivityController } from "@/application/activity/activity-controller";
import { activityCounts, activityEventLabel, eventDate, eventTime, filterActivity, sampleMinute } from "@/application/activity/activity-presentation";
import { activityEventDetails, filterActivityTimeline, projectActivityTimeline, timelineEvents, type ActivityTimelineEntry } from "@/application/activity/activity-timeline";
import type { ActivityRecord } from "@/domain/activity";
import { Button } from "@/components/ui/button";

import { ActivityReadIssue } from "./ActivityFeedback";

export const ACTIVITY_RENDER_BATCH = 200;
const TIMELINE_ROW_CLASS = "grid min-h-11 min-w-0 grid-cols-[5rem_1.25rem_minmax(0,1fr)_0.875rem] items-start gap-2 border-b border-primary/10 py-2 text-[13px] sm:gap-3";
export function ActivityTimeline({ state, controller }: { readonly state: ActivityState; readonly controller: ActivityController | null }) {
  const scope = `${JSON.stringify(state.query)}:${state.device}`;
  const [batch, setBatch] = useState({ scope, limit: ACTIVITY_RENDER_BATCH });
  const limit = batch.scope === scope ? batch.limit : ACTIVITY_RENDER_BATCH;
  const rows = useMemo(() => filterActivity(state.logs.data ?? [], state.device), [state.logs.data, state.device]);
  // Group the complete collection first: filtering must not bridge an intervening event.
  const projection = useMemo(() => projectActivityTimeline(state.logs.data ?? []), [state.logs.data]);
  const entries = useMemo(() => filterActivityTimeline(projection, state.device), [projection, state.device]);
  const visible = entries.slice(0, limit);
  const represented = visible.reduce((count, entry) => count + timelineEvents(entry).length, 0);
  const counts = activityCounts(state.logs.data ?? []);
  return <section className="activity-reading mist-glass-strong overflow-hidden rounded-[24px]" aria-label="活动时间线" aria-busy={state.logs.loading}>
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-primary/10 px-4 py-2 sm:px-5">
      <h2 className="text-xs font-medium text-muted-strong">{state.query.kind === "recent" ? "最近 3 小时的轨迹" : "归档记录"}</h2>
      <span className="text-[11px] text-muted-foreground">{state.logs.data ? `共 ${counts.all} 条事件 · 电脑 ${counts.pc} · 手机 ${counts.phone}` : state.logs.error ? "暂无可用记录" : ""}{state.logs.loading ? " · 同步中…" : ""}</span>
    </div>
    <div className="px-4"><ActivityReadIssue state={state} name="logs" text="活动记录读取失败" onRetry={() => void controller?.loadLogs()} /></div>
    {!state.logs.data && state.logs.loading && <p role="status" className="px-5 py-12 text-center text-sm text-muted-foreground">正在读取活动记录…</p>}
    {!state.logs.error && state.logs.data && !rows.length && <p className="px-5 py-12 text-center text-sm text-muted-foreground">当前范围内暂无{state.device === "pc" ? "电脑" : state.device === "phone" ? "手机" : ""}活动记录。</p>}
    {visible.length > 0 && <ol className="px-4 sm:px-5">{visible.map((entry, index) => {
      const event = timelineEvents(entry)[0];
      const showDate = state.query.kind === "recent" && (index === 0 || eventDate(timelineEvents(visible[index-1])[0].timestamp) !== eventDate(event.timestamp));
      return entry.kind === "event" ? <ActivityTimelineRow key={entry.key} event={entry.event} showDate={showDate} /> : <ActivityRepeatGroup key={entry.key} entry={entry} showDate={showDate} />;
    })}</ol>}
    {visible.length < entries.length && <div className="flex flex-wrap items-center justify-center gap-x-3 border-t border-primary/10 px-4 py-1">
      <span className="text-[11px] text-muted-foreground">已呈现 {represented} / {rows.length} 条事件</span>
      <Button variant="ghost" className="h-11 text-xs text-primary-ink" onClick={() => setBatch({ scope, limit: limit + ACTIVITY_RENDER_BATCH })}>继续显示<ChevronDown className="size-3.5" aria-hidden="true" /></Button>
    </div>}
  </section>;
}
export function ActivityTimelineRow({ event, showDate = false }: { readonly event: ActivityRecord; readonly showDate?: boolean }) {
  const Icon = event.device === "pc" ? Monitor : event.device === "phone" ? Smartphone : Activity;
  const source = event.device === "pc" ? "电脑" : event.device === "phone" ? "手机" : event.device || "未知来源";
  const details = activityEventDetails(event);
  const content = <>
    <time className="pt-0.5 text-xs tabular-nums text-muted-foreground" dateTime={new Date(event.timestamp*1000).toISOString()} title={sampleDateTitle(event.timestamp)}>{eventTime(event.timestamp)}</time>
    <span className="pt-0.5 text-muted-strong" title={source}><Icon className="size-4" aria-hidden="true" /><span className="sr-only">{source}</span></span>
    <span className="min-w-0">
      <span className="block break-words leading-5 text-foreground">{activityEventLabel(event)}</span>
      {details.secondary && <span className="block break-words text-[11px] leading-4 text-muted-foreground">{details.secondary}</span>}
      {details.detail && <span className="block break-words text-[11px] leading-4 text-muted-foreground group-open/title:hidden">{details.preview}</span>}
    </span>
    {details.detail && <ChevronDown aria-hidden="true" className="mt-1 size-3.5 text-muted-foreground group-open/title:rotate-180" />}
  </>;
  return <li data-activity-event-key={event.key} className="min-w-0">
    {showDate && <h3 className="pb-1 pt-3 text-[11px] font-medium text-muted-foreground">{eventDate(event.timestamp)}</h3>}
    {details.detail ? <details className="group/title"><summary className={`${TIMELINE_ROW_CLASS} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>{content}</summary><p className="whitespace-pre-wrap break-words py-2 text-xs leading-5 text-muted-strong">{details.detail}</p></details> : <div className={TIMELINE_ROW_CLASS}>{content}</div>}
  </li>;
}
function sampleDateTitle(timestamp: number) { return `${eventDate(timestamp)} ${eventTime(timestamp)}`; }

export function ActivityRepeatGroup({ entry, showDate = false }: { readonly entry: Extract<ActivityTimelineEntry, { kind: "repeat" }>; readonly showDate?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const newest = entry.events[0], oldest = entry.events[entry.events.length-1];
  const Icon = newest.device === "pc" ? Monitor : Smartphone;
  const source = newest.device === "pc" ? "电脑" : "手机";
  const { secondary } = activityEventDetails(newest);
  return <li data-activity-group-key={entry.key}>
    {showDate && <h3 className="pb-1 pt-3 text-[11px] font-medium text-muted-foreground">{eventDate(newest.timestamp)}</h3>}
    <details className="group/repeat" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary className={`${TIMELINE_ROW_CLASS} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        <span className="whitespace-nowrap pt-0.5 text-xs tabular-nums text-muted-foreground" title={`${sampleDateTitle(oldest.timestamp)}–${sampleDateTitle(newest.timestamp)}`}>{sampleMinute(oldest.timestamp)}–{sampleMinute(newest.timestamp)}</span>
        <span className="pt-0.5 text-muted-strong" title={source}><Icon className="size-4" aria-hidden="true" /><span className="sr-only">{source}</span></span>
        <span className="min-w-0">
          <span className="block break-words leading-5 text-foreground">{activityEventLabel(newest)}</span>
          {secondary && <span className="block break-words text-[11px] leading-4 text-muted-foreground">{secondary}</span>}
          <span className="block text-[11px] leading-4 text-muted-foreground">连续 {entry.events.length} 条上报</span>
        </span>
        <ChevronDown className="mt-1 size-3.5 text-muted-foreground group-open/repeat:rotate-180" aria-hidden="true" />
      </summary>
      {expanded && <ActivityRepeatContents events={entry.events} />}
    </details>
  </li>;
}

export function ActivityRepeatContents({ events }: { readonly events: readonly ActivityRecord[] }) {
  return <ol className="ml-2 border-l border-primary/10 pl-3" aria-label="分组内原始事件">{events.map((event) => <ActivityTimelineRow key={event.key} event={event} />)}</ol>;
}
