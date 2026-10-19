import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Plus, RefreshCw, X } from "lucide-react";
import type { ScheduleController, ScheduleState } from "@/application/schedule/schedule-controller";
import type { ScheduleRealtimeState } from "@/application/schedule/schedule-realtime";
import type { ManagedScheduleKind, Schedule } from "@/domain/schedule";
import { PageHeader, PageHeaderAction } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { SegmentedControlItem } from "@/components/ui/selection-control";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFeedbackToast } from "@/components/ui/toast";
import { ScheduleCreateDialog } from "./ScheduleCreateDialog";
import { ScheduleCancelDialog } from "./ScheduleCancelDialog";
import { ScheduleRows } from "./ScheduleRows";
import { ScheduleIssue } from "./ScheduleFeedback";
import { scheduleMeta, selectSchedules } from "./schedule-presentation";
import { useSchedules } from "./useSchedules";

export default function ScheduleView({ kind, onBack }: { readonly kind: ManagedScheduleKind; readonly onBack?: () => void }) {
  return <SchedulePage kind={kind} onBack={onBack} {...useSchedules(kind)} />;
}
export function SchedulePage({ kind, state, controller, realtime, onBack }: {
  readonly kind: ManagedScheduleKind; readonly state: ScheduleState; readonly controller: ScheduleController | null;
  readonly realtime: Pick<ScheduleRealtimeState, "connection"> & { reconnect: () => void }; readonly onBack?: () => void;
}) {
  const [creating, setCreating] = useState(false), [cancel, setCancel] = useState<Schedule | null>(null), [view, setView] = useState<"active" | "done">("active");
  const listScrollRef = useRef<HTMLDivElement>(null), cancelTrigger = useRef<HTMLButtonElement | null>(null);
  const meta = scheduleMeta[kind], busy = Boolean(state.pending);
  const active = selectSchedules(state.items, kind, "active"), done = selectSchedules(state.items, kind, "done");
  const primary = kind === "todo" && view === "done" ? done : active;
  const history = selectSchedules(state.items, kind, kind === "alarm" ? "triggered" : "cancelled");
  useLayoutEffect(() => {
    if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
  }, [kind, view]);
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
    {kind === "todo" && <div className="mist-glass mt-3 grid shrink-0 grid-cols-2 rounded-2xl px-2 sm:mt-4" aria-label="待办视图" data-schedule-filters="true">{(["active", "done"] as const).map((value) => <SegmentedControlItem key={value} selected={view === value} disabled={busy} onClick={() => { controller?.changeScope(); setView(value); }}>{value === "active" ? `未完成 ${active.length}` : `已完成 ${done.length}`}</SegmentedControlItem>)}</div>}
    <div ref={listScrollRef} role="region" tabIndex={0} aria-label={`${meta.title}页面内容`} data-schedule-list-scroll="true"
      className="scrollbar-none mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-[max(0.5rem,env(safe-area-inset-bottom))] focus-visible:outline-2 focus-visible:outline-ring sm:mt-4">
      {realtime.connection !== "connected" && <div role="status" className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs leading-5 text-muted-strong">
        <span>{realtime.connection === "blocked" ? "实时连接需要重新登录后恢复。" : realtime.connection === "connecting" ? "正在连接实时更新…" : "实时连接正在恢复，可手动刷新。"}</span>
        <Button variant="ghost" size="compact" onClick={realtime.reconnect}>恢复连接</Button>
      </div>}
      {!creating && !cancel && <ScheduleIssue state={state} controller={controller} />}
      {state.feedback?.error && !creating && !cancel && <p role="alert" className="px-1 text-xs leading-5 text-destructive">{state.feedback.text}</p>}
      {state.error && <div role="alert" className="mist-glass rounded-2xl px-4 py-3 text-xs leading-5 text-muted-strong"><p>{state.error}{state.loaded ? " 以下仍是上次读取的数据。" : ""}</p><Button variant="soft-primary" size="compact" className="mt-2" disabled={busy || state.loading} onClick={() => void controller?.refresh()}>重新读取</Button></div>}
      {/* Reuse Memory's accepted material; the viewport grows, the paper stays content-sized. */}
      <section className="memory-reading-panel mist-glass-strong rounded-[24px] px-4 py-1 sm:px-5" aria-label={`${meta.title}列表`} aria-busy={state.loading} data-schedule-reading-panel="true">
        <div className="flex items-baseline justify-between gap-2 border-b border-border/60 py-3"><h2 className="text-sm font-semibold text-foreground">{kind === "todo" && view === "done" ? "已完成" : meta.active}</h2><span className="text-xs text-muted-strong">{primary.length}</span></div>
        {!state.loaded ? <p role="status" className="py-8 text-center text-sm text-muted-strong">{state.error ? "尚未读取到列表" : "正在读取…"}</p>
          : primary.length ? rows(primary) : <div className="py-8 text-center"><p className="text-sm text-muted-strong">{kind === "todo" && view === "done" ? "还没有已完成的待办" : meta.empty}</p>
            {view === "active" && <Button variant="ghost" className="mt-2 text-xs" disabled={busy || !controller || Boolean(state.issue)} onClick={() => { controller?.changeScope(); setCreating(true); }}>{meta.create}</Button>}</div>}
        {kind !== "todo" && history.length > 0 && <details className="border-t border-primary/10 py-3"><summary className="cursor-pointer rounded-lg text-sm font-medium leading-6 text-foreground focus-visible:outline-2 focus-visible:outline-ring">{kind === "alarm" ? "已触发" : "已取消记挂"} <span className="ml-2 text-xs font-normal text-muted-strong">{history.length}</span></summary>{rows(history)}</details>}
      </section>
      {state.unsupported > 0 && <p className="px-1 text-xs leading-5 text-muted-strong">有 {state.unsupported} 条记录的类型、状态或字段无法识别，已保留服务端数据，未提供操作。</p>}
    </div>
    <ScheduleCreateDialog open={creating} kind={kind} state={state} controller={controller} onClose={() => setCreating(false)} />
    <ScheduleCancelDialog item={cancel} state={state} controller={controller} onClose={() => setCancel(null)} finalFocus={() => {
      const trigger = cancelTrigger.current;
      return trigger?.isConnected && !trigger.disabled ? trigger : listScrollRef.current;
    }} />
  </main></TooltipProvider>;
}
