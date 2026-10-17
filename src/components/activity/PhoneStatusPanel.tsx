import { Battery, BatteryCharging, RefreshCw, Smartphone, Wifi } from "lucide-react";
import { deviceGroupCurrent, deviceUnavailable, sampleTime, wifiSceneLabel } from "@/application/activity/activity-presentation";
import type { ActivityController } from "@/application/activity/activity-controller";
import type { ActivityState } from "@/application/activity/activity-state";
import { Button } from "@/components/ui/button";
import { WifiSceneSettings } from "./WifiSceneSettings";

export function PhoneStatusPanel({ state, controller }: { readonly state: ActivityState; readonly controller: ActivityController | null }) {
  const snapshot = state.phone.data;
  const b = snapshot?.status.battery, w = snapshot?.status.wifi;
  const batteryCurrent = Boolean(snapshot && b && deviceGroupCurrent(b, snapshot, state.clockNow));
  const wifiCurrent = Boolean(snapshot && w && deviceGroupCurrent(w, snapshot, state.clockNow));
  const BatteryIcon = batteryCurrent && b?.charging ? BatteryCharging : Battery;
  const charging = b?.charging === true ? "正在充电" : b?.charging === false ? "未充电" : "充电状态未知";
  const power = b?.powerConnected === true ? "已接电源" : b?.powerConnected === false ? "未连接电源" : "电源状态未知";
  const busy = Boolean(state.pending);
  return <section className="mist-glass rounded-[24px] px-4 py-2 sm:px-5" aria-labelledby="activity-phone-title" aria-busy={state.phone.loading}>
    <div className="flex items-center justify-between gap-3">
      <h2 id="activity-phone-title" className="flex items-center gap-2 text-sm font-semibold"><Smartphone className="size-4 text-muted-strong" aria-hidden="true" />手机状态</h2>
      <Button variant="ghost" className="h-11 gap-1.5 px-2 text-xs text-muted-strong" disabled={state.phone.loading || busy} onClick={() => void controller?.refreshPhone()}><RefreshCw aria-hidden="true" className="size-3.5" />刷新</Button>
    </div>
    {state.phone.error && <p role="alert" className="pb-2 text-xs leading-5 text-destructive">手机状态读取失败。{state.phone.error}</p>}
    <div className="grid divide-y divide-primary/10 sm:grid-cols-2 sm:divide-x sm:divide-y-0" data-phone-metrics="true">
      <div className="flex min-w-0 items-center gap-3 py-3 sm:pr-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary-ink"><BatteryIcon className="size-5" aria-hidden="true" /></span>
        <div className="min-w-0">
          <p className={batteryCurrent ? "text-lg font-semibold tabular-nums" : "text-sm font-medium"}>{batteryCurrent ? b?.level === null ? "电量未知" : `${b?.level}%` : b ? deviceUnavailable(b, b.fresh) : state.phone.loading ? "正在读取电量…" : "电量未知"}</p>
          {batteryCurrent && <p className="mt-0.5 text-xs leading-5 text-muted-strong">{power} · {charging}</p>}
          <p className="mt-0.5 break-words text-[11px] leading-4 text-muted-foreground">{b?.observedAt != null ? `${batteryCurrent ? "有效采样" : "最近采样"}：${sampleTime(b.observedAt)}` : "尚无采样时间"}</p>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-3 py-3 sm:pl-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-secondary/10 text-muted-strong"><Wifi className="size-5" aria-hidden="true" /></span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{wifiCurrent && w ? wifiSceneLabel(w) : w ? deviceUnavailable(w, w.fresh) : state.phone.loading ? "正在读取 Wi-Fi…" : "Wi-Fi 未知"}</p>
          {wifiCurrent && w?.connected === true && <p className="mt-0.5 text-xs leading-5 text-muted-strong">已连接 Wi-Fi</p>}
          <p className="mt-0.5 break-words text-[11px] leading-4 text-muted-foreground">{w?.observedAt != null ? `${wifiCurrent ? "有效采样" : "最近采样"}：${sampleTime(w.observedAt)}` : "尚无采样时间"}</p>
        </div>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-x-3 border-t border-primary/10 py-1">
      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-xs text-muted-strong">
        <input type="checkbox" className="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" checked={state.visibility.data === true} disabled={state.visibility.data === null || state.visibility.loading || Boolean(state.visibility.error) || busy} onChange={(event) => void controller?.setVisibility(event.target.checked)} />允许 AI 查看手机状态
      </label>
      <span className="pb-1 text-[11px] text-muted-foreground">刷新读取已保存的手机快照</span>
    </div>
    {state.visibility.error && <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-destructive"><span>手机状态权限读取失败。</span><Button variant="ghost" className="h-11 text-xs" onClick={() => void controller?.loadVisibility()}>重新读取权限</Button></div>}
    <WifiSceneSettings state={state} controller={controller} />
  </section>;
}
