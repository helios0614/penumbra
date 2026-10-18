import { useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import type { LocationController } from "@/application/location/location-controller";
import type { LocationState } from "@/application/location/location-state";
import type { LocationConnectionState } from "@/application/location/location-realtime";
import type { LocationPoi } from "@/domain/location";
import { PageHeader, PageHeaderAction } from "@/components/ui/page-header";
import { PageScrollArea } from "@/components/ui/page-scroll-area";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LocationOverview } from "./LocationOverview";
import { LocationQuietHours } from "./LocationQuietHours";
import { LocationAdvanced } from "./LocationAdvanced";
import { LocationPois } from "./LocationPois";
import { LocationConfirm, LocationPoiDialog } from "./LocationDialogs";
import { createLocationNavigation } from "./location-navigation";
import { locationTime } from "./location-presentation";
import { useLocation } from "./useLocation";
import { useFeedbackToast } from "@/components/ui/toast";
import "./location.css";

export function LocationView({ onBack }: { readonly onBack?: () => void }) {
  return <LocationPage {...useLocation()} onBack={onBack} />;
}
export function LocationPage({ state, controller, connection, reconnect, onBack }: {
  readonly state: LocationState; readonly controller: LocationController | null;
  readonly connection: LocationConnectionState; readonly reconnect: () => void; readonly onBack?: () => void;
}) {
  const [confirmation, setConfirmation] = useState<"home" | "clear" | null>(null);
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);
  const [poi, setPoi] = useState<LocationPoi | null>(null);
  const latest = useRef({ state, controller }); latest.current = { state, controller };
  const navigation = useRef<ReturnType<typeof createLocationNavigation> | null>(null);
  useEffect(() => {
    const current = () => latest.current.controller?.getState() ?? latest.current.state;
    const active = createLocationNavigation(window, {
      dirty: () => current().dirty, busy: () => Boolean(current().pending),
      confirm: (action) => { setConfirmation(null); setPoi(null); setDiscardAction(() => action); }, discard: () => latest.current.controller?.discard(),
    });
    navigation.current = active;
    return () => { active.dispose(); navigation.current = null; };
  }, []);
  useFeedbackToast(state.feedback, state.feedback && !state.feedback.error && !state.feedback.persistent ? { type: state.feedback.info ? "info" : "success", text: state.feedback.text } : null);
  const busy = Boolean(state.pending);
  return <TooltipProvider><main className="location-page mx-auto flex h-full max-h-dvh min-h-0 w-full max-w-5xl flex-col overflow-hidden px-4 pb-4 pt-5 sm:px-0 sm:pb-8 sm:pt-8" aria-labelledby="location-page-title">
    <PageHeader eyebrow="LOCATION" title="定位" titleId="location-page-title" description="最近的位置与天气，还有身边的小发现。" actions={<>
      <Tooltip><TooltipTrigger render={<PageHeaderAction aria-label="刷新显示" disabled={busy || state.configLoading || state.statusLoading} onClick={() => void controller?.refreshDisplay()} />}><RefreshCw aria-hidden="true" /></TooltipTrigger><TooltipContent>更新显示，保留未保存的修改</TooltipContent></Tooltip>
      {onBack && <Tooltip><TooltipTrigger render={<PageHeaderAction aria-label="返回桌面" disabled={busy} onClick={() => navigation.current?.exit(onBack)} />}><X aria-hidden="true" /></TooltipTrigger><TooltipContent>返回桌面</TooltipContent></Tooltip>}
    </>} />
    <PageScrollArea label="定位页面内容" topLabel="回到定位顶部" className="mt-3 sm:mt-4" contentClassName="space-y-3 pb-1 sm:space-y-4">
      {connection !== "connected" && <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-strong" role="status">
        <span>{connection === "blocked" ? "实时连接需要重新登录后恢复。" : connection === "reconnecting" ? "实时连接正在恢复，可手动刷新显示。" : "正在连接位置更新…"}</span>
        {connection === "blocked" && <Button type="button" variant="ghost" className="h-11 text-xs" onClick={reconnect}>恢复连接</Button>}
      </div>}
      {state.configLoading && !state.config && <p role="status" className="px-1 text-sm text-muted-foreground">正在读取定位配置…</p>}
      {state.configError && <div role="alert" className="mist-glass rounded-[24px] px-4 py-3 text-sm"><p>配置读取失败，保存暂不可用。{state.configError}</p><Button type="button" variant="ghost" className="mt-1 h-11 text-xs" disabled={busy || state.configLoading} onClick={() => void controller?.refresh()}>重新读取配置</Button></div>}
      <LocationOverview state={state} controller={controller} />
      <form noValidate aria-label="定位与静默配置" onSubmit={(event) => { event.preventDefault(); void controller?.save(); }} aria-busy={state.pending === "save"}>
        <LocationQuietHours state={state} controller={controller} />
      </form>
      {state.feedback && (state.feedback.error || state.feedback.persistent) && !state.feedback.section && <p role={state.feedback.error ? "alert" : "status"} className="mist-glass-strong rounded-[24px] px-4 py-3 text-xs leading-5 text-muted-strong">{state.feedback.text}</p>}
      <LocationAdvanced state={state} controller={controller} onHome={() => setConfirmation("home")} onClear={() => setConfirmation("clear")} />
      <LocationPois state={state} controller={controller} onDetail={setPoi} />
    </PageScrollArea>
    <LocationConfirm open={Boolean(discardAction)} title="放弃未保存的配置？" description="尚未保存的定位配置与新 Key 输入将被放弃。" action="放弃并离开" destructive busy={busy}
      onCancel={() => setDiscardAction(null)} onConfirm={() => { const proceed = discardAction; setDiscardAction(null); proceed?.(); }} />
    <LocationConfirm open={confirmation === "clear"} title="清除已保存的高德 Key？" description="清除后地址、天气和附近地点的查询将受影响。其他配置及新 Key 草稿会保留。" action="清除 Key" destructive busy={busy}
      onCancel={() => setConfirmation(null)} onConfirm={() => { setConfirmation(null); void controller?.clearKey(); }} />
    <LocationConfirm open={confirmation === "home"} title="将最近上报的位置设为家？" action="确认设为家" busy={busy}
      description={<><p className="break-words">{state.status?.address || "最近上报坐标"}</p><p>{state.status?.coordinate ? `${state.status.coordinate.lng}, ${state.status.coordinate.lat} · ${locationTime(state.status.updatedAt)}` : "尚无有效位置"}</p><p className="mt-2">执行时使用服务端最新记录，会替换家庭坐标及对应草稿，其余修改保留。状态与距离在后续上报时重新计算。</p></>}
      onCancel={() => setConfirmation(null)} onConfirm={() => { setConfirmation(null); void controller?.setHome(); }} />
    <LocationPoiDialog poi={poi} onClose={() => setPoi(null)} />
  </main></TooltipProvider>;
}
