import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Plus, RefreshCw, X } from "lucide-react";
import type { ScheduleController, ScheduleState } from "@/application/schedule/schedule-controller";
import type { ScheduleRealtimeState } from "@/application/schedule/schedule-realtime";
import type { ManagedScheduleKind, Schedule } from "@/domain/schedule";
import { PageHeader, PageHeaderAction } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { FilterChip, SegmentedControlItem } from "@/components/ui/selection-control";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFeedbackToast } from "@/components/ui/toast";
import { ScheduleCreateDialog } from "./ScheduleCreateDialog";
import { ScheduleCancelDialog } from "./ScheduleCancelDialog";
import { ScheduleRows } from "./ScheduleRows";
import { ScheduleIssue } from "./ScheduleFeedback";
import { scheduleMeta, selectSchedules } from "./schedule-presentation";
import { useSchedules } from "./useSchedules";

const countClass = "memory-total-decoration font-decorative pointer-events-none absolute right-3 top-2.5 z-10 text-xl sm:right-5";

export default function ScheduleView({ kind, onBack }: { readonly kind: ManagedScheduleKind; readonly onBack?: () => void }) {
  return kind === "alarm" ? <ClockScheduleView onBack={onBack} /> : <ConnectedSchedulePage kind={kind} onBack={onBack} />;
}
export function ClockScheduleView({ onBack }: { readonly onBack?: () => void }) {
  const [kind, setKind] = useState<"alarm" | "monitor">("alarm");
  const switched = useRef(false);
  // A keyed page disposes old reads/feedback and starts each feature at scroll offset zero.
  return <ConnectedSchedulePage key={kind} kind={kind} onBack={onBack} focusClockKind={switched.current} onClockKindChange={(next) => { switched.current = true; setKind(next); }} />;
}
function ConnectedSchedulePage({ kind, ...props }: { readonly kind: ManagedScheduleKind; readonly onBack?: () => void; readonly onClockKindChange?: (kind: "alarm" | "monitor") => void; readonly focusClockKind?: boolean }) {
  return <SchedulePage kind={kind} {...props} {...useSchedules(kind)} />;
}
export function SchedulePage({ kind, state, controller, realtime, onBack, onClockKindChange, focusClockKind = false }: {
  readonly kind: ManagedScheduleKind; readonly state: ScheduleState; readonly controller: ScheduleController | null;
  readonly realtime: Pick<ScheduleRealtimeState, "connection"> & { reconnect: () => void }; readonly onBack?: () => void;
  readonly onClockKindChange?: (kind: "alarm" | "monitor") => void;
  readonly focusClockKind?: boolean;
}) {
  const [creating, setCreating] = useState(false), [cancel, setCancel] = useState<Schedule | null>(null), [view, setView] = useState<"active" | "history">("active");
  const listScrollRef = useRef<HTMLDivElement>(null), cancelTrigger = useRef<HTMLButtonElement | null>(null);
  const clockKindRef = useRef<HTMLButtonElement>(null);
  const meta = scheduleMeta[kind], busy = Boolean(state.pending);
  const active = selectSchedules(state.items, kind, "active");
  const secondary = selectSchedules(state.items, kind, kind === "todo" ? "done" : "triggered");
  const history = kind === "reminder" ? selectSchedules(state.items, kind, "cancelled") : [];
  const secondaryView = kind !== "reminder" && view === "history";
  const primary = secondaryView ? secondary : active;
  const secondaryLabel = kind === "todo" ? "已完成" : "已触发";
  const listTitle = secondaryView ? secondaryLabel : meta.active;
  useLayoutEffect(() => {
    if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
  }, [kind, view]);
  useLayoutEffect(() => { if (focusClockKind) clockKindRef.current?.focus(); }, [kind, focusClockKind]);
  useEffect(() => {
    if (cancel && !busy && !state.issue && state.items.some((item) => item.id === cancel.id && item.status === "cancelled")) setCancel(null);
  }, [cancel, busy, state.issue, state.items]);
  useFeedbackToast(state.feedback, state.feedback && !state.feedback.error ? { type: "success", text: state.feedback.text } : null, `${kind}:${view}`);
  const rows = (items: readonly Schedule[]) => <ScheduleRows items={items} kind={kind} busy={state.pending} blocked={Boolean(state.issue)} onCancel={(item, trigger) => { cancelTrigger.current = trigger; controller?.changeScope(); setCancel(item); }} onToggle={(item) => void controller?.act(item.id, item.status === "done" ? "restore" : "done")} />;
  return <TooltipProvider><main className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden px-4 pb-4 pt-5 sm:px-0 sm:pb-8 sm:pt-8" aria-labelledby={`${kind}-page-title`}>
    <PageHeader eyebrow={meta.eyebrow} title={meta.title} titleId={`${kind}-page-title`} description={meta.description} actions={<>
      <Tooltip><TooltipTrigger render={<PageHeaderAction aria-label={meta.create} disabled={busy || !controller || Boolean(state.issue)} onClick={() => { controller?.changeScope(); setCreating(true); }} />}><Plus aria-hidden="true" /></TooltipTrigger><TooltipContent>{meta.create}</TooltipContent></Tooltip>
      <Tooltip><TooltipTrigger render={<PageHeaderAction aria-label={`刷新${meta.title}`} disabled={busy || state.loading} onClick={() => void controller?.refresh()} />}><RefreshCw aria-hidden="true" /></TooltipTrigger><TooltipContent>重新读取</TooltipContent></Tooltip>
      {onBack && <Tooltip><TooltipTrigger render={<PageHeaderAction aria-label="返回桌面" disabled={busy} onClick={onBack} />}><X aria-hidden="true" /></TooltipTrigger><TooltipContent>返回桌面</TooltipContent></Tooltip>}
    </>} />
    {onClockKindChange && <div className="mt-1 flex shrink-0 gap-2" role="group" aria-label="定时功能" data-schedule-kind-filters="true">
      {(["alarm", "monitor"] as const).map((value) => <FilterChip key={value} ref={kind === value ? clockKindRef : undefined} selected={kind === value} disabled={busy || Boolean(state.issue)} onClick={() => { if (kind !== value) { controller?.changeScope(); onClockKindChange(value); } }}>{value === "alarm" ? "闹钟" : "定时查岗"}</FilterChip>)}
    </div>}
    {kind !== "reminder" && <div className="mist-glass mt-3 grid shrink-0 grid-cols-2 rounded-2xl px-2 sm:mt-4" aria-label={`${meta.title}视图`} data-schedule-filters="true">{(["active", "history"] as const).map((value) => <SegmentedControlItem key={value} selected={view === value} disabled={busy} aria-label={`${value === "active" ? meta.active : secondaryLabel}${state.loaded ? ` ${value === "active" ? active.length : secondary.length} 项` : ""}`} onClick={() => { controller?.changeScope(); setView(value); }}>{value === "active" ? meta.active : secondaryLabel}</SegmentedControlItem>)}</div>}
    <section className="memory-reading-panel mist-glass-strong relative mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] sm:mt-4" aria-label={`${meta.title}列表`} aria-busy={state.loading} data-schedule-reading-panel="true">
      <span className="sr-only" aria-live="polite">{listTitle} {state.loaded ? primary.length : "数量尚未读取"}</span>
      {state.loaded && <span className={countClass} aria-hidden="true" data-schedule-total="true">{primary.length}</span>}
      <div ref={listScrollRef} role="region" tabIndex={0} aria-label={`${meta.title}页面内容`} data-schedule-list-scroll="true"
        className="scrollbar-none min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-5 focus-visible:outline-2 focus-visible:outline-ring sm:px-6">
        {realtime.connection !== "connected" && <div role="status" className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs leading-5 text-muted-strong">
          <span>{realtime.connection === "blocked" ? "实时连接需要重新登录后恢复。" : realtime.connection === "connecting" ? "正在连接实时更新…" : "实时连接正在恢复，可手动刷新。"}</span>
          <Button variant="ghost" size="compact" onClick={realtime.reconnect}>恢复连接</Button>
        </div>}
        {!creating && !cancel && <ScheduleIssue state={state} controller={controller} />}
        {state.feedback?.error && !creating && !cancel && <p role="alert" className="px-1 text-xs leading-5 text-destructive">{state.feedback.text}</p>}
        {state.error && <div role="alert" className="mist-glass rounded-2xl px-4 py-3 text-xs leading-5 text-muted-strong"><p>{state.error}{state.loaded ? " 以下仍是上次读取的数据。" : ""}</p><Button variant="soft-primary" size="compact" className="mt-2" disabled={busy || state.loading} onClick={() => void controller?.refresh()}>重新读取</Button></div>}
        {!state.loaded ? <p role="status" className="py-8 text-center text-sm text-muted-strong">{state.error ? "尚未读取到列表" : "正在读取…"}</p>
          : primary.length ? rows(primary) : <div className="py-8 text-center"><p className="text-sm text-muted-strong">{secondaryView ? kind === "todo" ? "还没有已完成的待办" : kind === "monitor" ? "还没有已触发的查岗" : "还没有已触发的闹钟" : meta.empty}</p>
            {!secondaryView && <Button variant="ghost" className="mt-2 text-xs" disabled={busy || !controller || Boolean(state.issue)} onClick={() => { controller?.changeScope(); setCreating(true); }}>{meta.create}</Button>}</div>}
        {history.length > 0 && <details className="border-t border-primary/10 py-3"><summary className="cursor-pointer rounded-lg text-sm font-medium leading-6 text-foreground focus-visible:outline-2 focus-visible:outline-ring">已取消记挂 <span className="ml-2 text-xs font-normal text-muted-strong">{history.length}</span></summary>{rows(history)}</details>}
        {state.unsupported > 0 && <p className="px-1 text-xs leading-5 text-muted-strong">有 {state.unsupported} 条记录的类型、状态或字段无法识别，已保留服务端数据，未提供操作。</p>}
      </div>
    </section>
    <ScheduleCreateDialog open={creating} kind={kind} state={state} controller={controller} onClose={() => setCreating(false)} />
    <ScheduleCancelDialog item={cancel} state={state} controller={controller} onClose={() => setCancel(null)} finalFocus={() => {
      const trigger = cancelTrigger.current;
      return trigger?.isConnected && !trigger.disabled ? trigger : listScrollRef.current;
    }} />
  </main></TooltipProvider>;
}
