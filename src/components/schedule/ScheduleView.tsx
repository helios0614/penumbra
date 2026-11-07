import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useDisplayNames } from "@/components/identity/useDisplayNames";
import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown, Plus, RefreshCw, X } from "lucide-react";
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
  const { aiName } = useDisplayNames(kind !== "todo");
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
    <PageHeader eyebrow={meta.eyebrow} title={onClockKindChange && (kind === "alarm" || kind === "monitor")
      ? <ScheduleKindMenu kind={kind} disabled={busy || Boolean(state.issue)} triggerRef={clockKindRef} onChange={(value) => { controller?.changeScope(); onClockKindChange(value); }} />
      : meta.title} titleId={`${kind}-page-title`} description={meta.description(aiName)} actions={<>
      <Tooltip><TooltipTrigger render={<PageHeaderAction aria-label={meta.create} disabled={busy || !controller || Boolean(state.issue)} onClick={() => { controller?.changeScope(); setCreating(true); }} />}><Plus aria-hidden="true" /></TooltipTrigger><TooltipContent>{meta.create}</TooltipContent></Tooltip>
      <Tooltip><TooltipTrigger render={<PageHeaderAction aria-label={`刷新${meta.title}`} disabled={busy || state.loading} onClick={() => void controller?.refresh()} />}><RefreshCw aria-hidden="true" /></TooltipTrigger><TooltipContent>重新读取</TooltipContent></Tooltip>
      {onBack && <Tooltip><TooltipTrigger render={<PageHeaderAction aria-label="返回桌面" disabled={busy} onClick={onBack} />}><X aria-hidden="true" /></TooltipTrigger><TooltipContent>返回桌面</TooltipContent></Tooltip>}
    </>} />
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
    <ScheduleCreateDialog open={creating} kind={kind} aiName={aiName} state={state} controller={controller} onClose={() => setCreating(false)} />
    <ScheduleCancelDialog item={cancel} state={state} controller={controller} onClose={() => setCancel(null)} finalFocus={() => {
      const trigger = cancelTrigger.current;
      return trigger?.isConnected && !trigger.disabled ? trigger : listScrollRef.current;
    }} />
  </main></TooltipProvider>;
}

export function ScheduleKindMenu({ kind, disabled, triggerRef, onChange }: {
  readonly kind: "alarm" | "monitor"; readonly disabled: boolean;
  readonly triggerRef: RefObject<HTMLButtonElement | null>; readonly onChange: (kind: "alarm" | "monitor") => void;
}) {
  const [open, setOpen] = useState(false), switching = useRef(false);
  return <Menu.Root open={open && !disabled} onOpenChange={setOpen} disabled={disabled} modal={false}>
    <Menu.Trigger render={<Button ref={triggerRef} type="button" variant="ghost" disabled={disabled}
      aria-label={`${scheduleMeta[kind].title}，切换任务类型`} data-schedule-kind-menu="true"
      // Keep the h1's 28px line box; extend only the transparent touch target to 44px.
      className="h-auto min-h-0 max-w-full justify-start gap-1 rounded-sm border-0 p-0 align-top text-xl font-semibold leading-7 shadow-none before:absolute before:inset-x-0 before:-inset-y-2 before:content-[''] hover:bg-transparent active:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent" />}>
      {scheduleMeta[kind].title}<ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
    </Menu.Trigger>
    <Menu.Portal><Menu.Positioner align="start" sideOffset={4} collisionPadding={16} className="isolate z-50">
      <Menu.Popup aria-label="任务类型" className="mist-glass-strong scrollbar-none max-h-(--available-height) w-40 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg p-1 outline-none"
        // A type change unmounts this page; its replacement owns the new trigger focus.
        finalFocus={() => !switching.current}>
        <Menu.RadioGroup value={kind} onValueChange={(value: unknown) => {
          if (disabled || value !== "alarm" && value !== "monitor") return;
          setOpen(false);
          if (value !== kind) { switching.current = true; onChange(value); }
        }}>
          {(["alarm", "monitor"] as const).map((value) => <Menu.RadioItem key={value} value={value} closeOnClick
            className="flex min-h-9 cursor-default items-center justify-between gap-3 rounded-md px-2.5 py-2 text-xs leading-5 text-muted-strong outline-none data-highlighted:bg-background/45 data-checked:bg-primary/8 data-checked:text-primary-ink">
            {scheduleMeta[value].title}<Menu.RadioItemIndicator><Check className="size-3.5" aria-hidden="true" /></Menu.RadioItemIndicator>
          </Menu.RadioItem>)}
        </Menu.RadioGroup>
      </Menu.Popup>
    </Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}
