import { Battery, BatteryCharging, RefreshCw, Smartphone, Wifi } from "lucide-react";
import { deviceGroupCurrent, deviceUnavailable, sampleMinute, sampleTime, wifiSceneLabel } from "@/application/activity/activity-presentation";
import type { ActivityController } from "@/application/activity/activity-controller";
import type { ActivityState } from "@/application/activity/activity-state";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WifiSceneSettings } from "./WifiSceneSettings";

export function PhoneStatusPanel({ state, controller }: { readonly state: ActivityState; readonly controller: ActivityController | null }) {
  const snapshot = state.phone.data;
  const b = snapshot?.status.battery, w = snapshot?.status.wifi;
  const batteryCurrent = Boolean(snapshot && b && deviceGroupCurrent(b, snapshot, state.clockNow));
  const wifiCurrent = Boolean(snapshot && w && deviceGroupCurrent(w, snapshot, state.clockNow));
  const BatteryIcon = batteryCurrent && b?.charging ? BatteryCharging : Battery;
  const charging = b?.charging === true ? "正在充电" : b?.charging === false ? "未充电" : "充电状态未知";
  const busy = Boolean(state.pending);
  return <section className="activity-phone mist-glass-strong rounded-[24px] px-4 py-1 sm:px-5" aria-labelledby="activity-phone-title" aria-busy={state.phone.loading}>
    <div className="flex items-center justify-between gap-3">
      <h2 id="activity-phone-title" className="flex items-center gap-2 text-sm font-semibold"><Smartphone className="size-4 text-muted-strong" aria-hidden="true" />手机状态</h2>
      <Button variant="ghost" className="h-11 gap-1.5 px-2 text-xs text-muted-strong" disabled={state.phone.loading || busy} onClick={() => void controller?.refreshPhone()}><RefreshCw aria-hidden="true" className="size-3.5" />刷新</Button>
    </div>
    {state.phone.error && <p role="alert" className="pb-2 text-xs leading-5 text-destructive">手机状态读取失败。{state.phone.error}</p>}
    <div className="activity-phone-metrics pb-2" data-phone-metrics="true">
      <div className="min-w-0 py-1">
        <div className="flex min-w-0 items-center gap-2">
          <BatteryIcon className="size-4 shrink-0 text-primary-ink" aria-hidden="true" />
          <p className={batteryCurrent ? "text-lg font-semibold tabular-nums" : "text-sm font-medium"}>{batteryCurrent ? b?.level === null ? "电量未知" : `${b?.level}%` : b ? deviceUnavailable(b, b.fresh) : state.phone.loading ? "正在读取电量…" : "电量未知"}</p>
        </div>
        {batteryCurrent && <p className="text-xs leading-5 text-muted-strong">{charging}</p>}
        <PhoneSampleTime timestamp={b?.observedAt ?? null} current={batteryCurrent} label="电量" />
      </div>
      <div className="min-w-0 py-1">
        <div className="flex min-w-0 items-center gap-2">
          <Wifi className="size-4 shrink-0 text-muted-strong" aria-hidden="true" />
          <p className="text-sm font-medium leading-7">{wifiCurrent && w ? wifiSceneLabel(w) : w ? deviceUnavailable(w, w.fresh) : state.phone.loading ? "正在读取 Wi-Fi…" : "Wi-Fi 未知"}</p>
        </div>
        {wifiCurrent && w?.connected === true && <p className="text-xs leading-5 text-muted-strong">已连接 Wi-Fi</p>}
        <PhoneSampleTime timestamp={w?.observedAt ?? null} current={wifiCurrent} label="Wi-Fi" />
      </div>
    </div>
    <div className="flex items-center border-t border-primary/10">
      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-xs text-muted-strong">
        <input type="checkbox" className="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" checked={state.visibility.data === true} disabled={state.visibility.data === null || state.visibility.loading || Boolean(state.visibility.error) || busy} onChange={(event) => void controller?.setVisibility(event.target.checked)} />允许 AI 查看手机状态
      </label>
    </div>
    {state.visibility.error && <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-destructive"><span>手机状态权限读取失败。</span><Button variant="ghost" className="h-11 text-xs" onClick={() => void controller?.loadVisibility()}>重新读取权限</Button></div>}
    <WifiSceneSettings state={state} controller={controller} />
  </section>;
}

function PhoneSampleTime({ timestamp, current, label }: { readonly timestamp: number | null; readonly current: boolean; readonly label: string }) {
  if (timestamp === null) return <p className="text-[11px] leading-4 text-muted-foreground">尚无采样</p>;
  const full = `${label}${current ? "有效采样" : "最近采样"}：${sampleTime(timestamp)}`;
  return <Tooltip><TooltipTrigger render={<time dateTime={new Date(timestamp * 1000).toISOString()} title={full} aria-label={full} tabIndex={0} className="block w-fit text-[11px] leading-4 text-muted-foreground" />}>{current ? "更新" : "采样"} {sampleMinute(timestamp)}</TooltipTrigger><TooltipContent>{full}</TooltipContent></Tooltip>;
}
