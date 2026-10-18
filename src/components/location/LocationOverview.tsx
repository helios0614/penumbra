import { Clock3, CloudSun, Home, MapPin, Navigation } from "lucide-react";
import type { LocationController } from "@/application/location/location-controller";
import type { LocationState } from "@/application/location/location-state";
import { Switch } from "@/components/ui/switch";
import { locationDistance, locationSummary, locationTime } from "./location-presentation";

export function LocationOverview({ state, controller }: { readonly state: LocationState; readonly controller: LocationController | null }) {
  const summary = locationSummary(state), status = state.status;
  const disabled = !state.draft || state.configLoading || Boolean(state.configError || state.pending);
  const notices = [
    summary.enabled === false && "定位已关闭。",
    state.config && !summary.hasHome && "尚未设置家庭位置。",
    status && !summary.hasPosition && "暂无有效位置，等待设备上报。",
    summary.older && "较早的定位记录",
    state.homeAwaitingReport !== null && "家庭配置已更新，状态与距离待更新。",
  ].filter(Boolean);
  return <section className="mist-glass-strong rounded-[24px] px-4 py-4 sm:px-6" aria-labelledby="location-overview-title" aria-busy={state.statusLoading}>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 id="location-overview-title" className="flex items-center gap-2 text-base font-semibold"><MapPin className="size-4 text-primary" aria-hidden="true" />最近位置</h2>
      <div className="flex min-h-11 shrink-0 items-center gap-2.5">
        <label id="location-enabled-label" htmlFor="location-enabled" className="text-xs font-medium text-muted-strong">启用定位</label>
        <Switch id="location-enabled" aria-labelledby="location-enabled-label" checked={state.draft?.enabled ?? false} busy={state.pending === "save"}
          disabled={disabled} onCheckedChange={(value) => controller?.edit("enabled", value)} />
      </div>
    </div>
    <div className="mt-2 flex items-start gap-3">
      <Home className="mt-1 size-5 shrink-0 text-muted-strong" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xl font-semibold">{summary.label}</p>
        <p className="mt-1 break-words text-sm leading-6">{status?.address || (state.statusLoading && !status ? "正在读取最近位置…" : "尚无可显示的地址")}</p>
      </div>
    </div>
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-primary/10 pt-3 text-xs text-muted-strong">
      {summary.distance !== null && <span className="inline-flex items-center gap-1.5"><Navigation className="size-3.5" aria-hidden="true" />距家 {locationDistance(summary.distance)}</span>}
      {status?.weather && <span className="inline-flex items-center gap-1.5"><CloudSun className="size-3.5" aria-hidden="true" />{status.weather}</span>}
      <span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5" aria-hidden="true" />{locationTime(status?.updatedAt ?? null)}</span>
    </div>
    {notices.length > 0 && <div className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">{notices.map((notice) => <p key={String(notice)}>{notice}</p>)}</div>}
    {state.statusError && <p role="alert" className="mt-2 text-xs leading-5 text-destructive">位置更新失败。{state.statusError}{status && " 显示上次记录。"}</p>}
  </section>;
}
