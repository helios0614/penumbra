import { ChevronDown } from "lucide-react";
import type { ActivityState } from "@/application/activity/activity-state";
import type { ActivityController } from "@/application/activity/activity-controller";
import { Button } from "@/components/ui/button";
import { WifiNetworkDialog } from "./WifiNetworkDialog";

export function WifiSceneSettings({ state, controller }: { readonly state: ActivityState; readonly controller: ActivityController | null }) {
  const config = state.wifi.data;
  const disabled = !config || state.wifi.loading || Boolean(state.wifi.error) || Boolean(state.pending);
  return <details className="group/wifi border-t border-primary/10" onToggle={(event) => { if (event.currentTarget.open) void controller?.loadWifi(); }}>
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-muted-strong [&::-webkit-details-marker]:hidden">Wi-Fi 场景配置<ChevronDown aria-hidden="true" className="size-3.5 transition-transform group-open/wifi:rotate-180 motion-reduce:transition-none" /></summary>
    <div className="space-y-2 pb-1">
      <p className="text-[11px] leading-5 text-muted-foreground">当前页面无法读取手机网络名称，可手动添加标记。</p>
      {state.phone.data?.status.wifi.availability === "permission_denied" && <p className="text-xs leading-5 text-warning">手机未授予 Wi-Fi 读取权限，请在 Android 端检查 Wi-Fi、精确位置权限及系统位置开关。</p>}
      {state.phone.data?.status.wifi.fresh && state.phone.data.status.wifi.scene === "unknown" && <p className="text-xs leading-5 text-muted-foreground">手机最近一次采样未能识别网络，请检查手机权限或核对已保存标记。</p>}
      {state.wifi.loading && <p role="status" className="text-xs text-muted-foreground">正在读取 Wi-Fi 标记…</p>}
      {state.wifi.error && <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-destructive"><span>{state.wifi.error}</span><Button variant="ghost" className="h-11 text-xs" onClick={() => void controller?.loadWifi()}>重新读取标记</Button></div>}
      <div className="grid gap-x-6 sm:grid-cols-2">
        {(["home", "work"] as const).map((kind) => <div key={kind} className="min-w-0">
          <h3 className="mb-1 text-xs font-medium text-foreground">{kind === "home" ? "家里的 Wi-Fi" : "公司的 Wi-Fi"}</h3>
          {!config?.mappings.some((entry) => entry.scene === kind) && <p className="py-2 text-xs text-muted-foreground">{config ? "暂无标记" : "尚未读取"}</p>}
          <ul className="divide-y divide-primary/10">{config?.mappings.filter((entry) => entry.scene === kind).map((entry) => <li key={entry.ssid} className="flex min-w-0 flex-wrap items-center justify-between gap-x-1 py-0.5">
            <bdi className="min-w-0 flex-1 whitespace-pre-wrap break-all text-xs leading-5">{entry.ssid}</bdi>
            <div className="flex shrink-0 items-center"><Button variant="ghost" className="h-11 px-2 text-[11px] text-muted-strong" disabled={disabled} onClick={() => void controller?.saveMapping(entry.ssid, kind === "home" ? "work" : "home")}>{kind === "home" ? "改为公司" : "改为家里"}</Button><Button variant="ghost" className="h-11 px-2 text-[11px] text-destructive" disabled={disabled} aria-label={`移除 ${entry.ssid} 的标记`} onClick={() => void controller?.saveMapping(entry.ssid, null)}>移除</Button></div>
          </li>)}</ul>
        </div>)}
      </div>
      <WifiNetworkDialog state={state} controller={controller} />
    </div>
  </details>;
}
