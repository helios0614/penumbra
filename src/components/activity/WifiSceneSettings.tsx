import { ChevronDown } from "lucide-react";
import type { ActivityState } from "@/application/activity/activity-state";
import type { ActivityController } from "@/application/activity/activity-controller";
import { Button } from "@/components/ui/button";
import { ActivityReadIssue } from "./ActivityFeedback";
import { WifiNetworkDialog } from "./WifiNetworkDialog";

export function WifiSceneSettings({ state, controller }: { readonly state: ActivityState; readonly controller: ActivityController | null }) {
  const config = state.wifi.data;
  const disabled = !config || state.wifi.loading || Boolean(state.wifi.error) || Boolean(state.pending);
  return <details className="group/wifi border-t border-primary/10" onToggle={(event) => { if (event.currentTarget.open) void controller?.loadWifi(); }}>
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-muted-strong [&::-webkit-details-marker]:hidden">Wi-Fi 场景配置<ChevronDown aria-hidden="true" className="size-3.5 transition-transform group-open/wifi:rotate-180 motion-reduce:transition-none" /></summary>
    <div className="space-y-2">
      {state.phone.data?.status.wifi.availability === "permission_denied" && <p className="text-xs leading-5 text-warning">手机未授予 Wi-Fi 读取权限，请在 Android 端检查 Wi-Fi、精确位置权限及系统位置开关。</p>}
      {state.phone.data?.status.wifi.fresh && state.phone.data.status.wifi.scene === "unknown" && <p className="text-xs leading-5 text-muted-foreground">手机最近一次采样未能识别网络，请检查手机权限或核对已保存标记。</p>}
      {state.wifi.loading && <p role="status" className="text-xs text-muted-foreground">正在读取 Wi-Fi 标记…</p>}
      <ActivityReadIssue state={state} name="wifi" text="网络标记暂不可用" onRetry={() => void controller?.loadWifi()} />
      {state.notice?.error && state.notice.source === "wifi" && <p role="alert" className="text-xs leading-5 text-muted-strong">{state.notice.text}</p>}
      <div className="divide-y divide-primary/10">
        {(["home", "work"] as const).map((kind) => <section key={kind} aria-labelledby={`activity-wifi-${kind}`} className="min-w-0 pt-3 first:pt-0">
          <h3 id={`activity-wifi-${kind}`} className="mb-1 text-xs font-medium text-muted-strong">{kind === "home" ? "家庭网络" : "公司网络"}</h3>
          {!config?.mappings.some((entry) => entry.scene === kind) && <p className="flex min-h-9 items-center text-xs leading-5 text-muted-foreground">{config ? "暂无标记" : "尚未读取"}</p>}
          <ul className="divide-y divide-primary/10">{config?.mappings.filter((entry) => entry.scene === kind).map((entry) => <li key={entry.ssid} className="grid min-h-9 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <bdi className="min-w-0 whitespace-pre-wrap break-all py-2 text-xs leading-5 text-primary-ink">{entry.ssid}</bdi>
            <div className="flex shrink-0 items-center gap-1"><Button variant="ghost" className="h-9 px-2 text-[11px] text-muted-strong" disabled={disabled} aria-label={`${kind === "home" ? "改为公司" : "改为家里"}：${entry.ssid}`} onClick={() => void controller?.saveMapping(entry.ssid, kind === "home" ? "work" : "home")}>{kind === "home" ? "改为公司" : "改为家里"}</Button><Button variant="ghost" className="h-9 min-w-11 px-2 text-[11px] text-destructive hover:text-destructive" disabled={disabled} aria-label={`移除 ${entry.ssid} 的标记`} onClick={() => void controller?.saveMapping(entry.ssid, null)}>移除</Button></div>
          </li>)}</ul>
        </section>)}
      </div>
    </div>
    <div className="border-t border-primary/10"><WifiNetworkDialog state={state} controller={controller} /></div>
  </details>;
}
