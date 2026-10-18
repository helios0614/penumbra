import { Clock3, CloudSun, Home, MapPin, Navigation } from "lucide-react";
import type { LocationController } from "@/application/location/location-controller";
import type { LocationState } from "@/application/location/location-state";
import { LocationSwitch } from "./LocationControls";
import { locationDistance, locationSummary, locationTime } from "./location-presentation";

export function LocationOverview({ state, controller }: { readonly state: LocationState; readonly controller: LocationController | null }) {
  const summary = locationSummary(state), status = state.status;
  const disabled = !state.draft || state.configLoading || Boolean(state.configError || state.pending);
  return <section className="mist-glass-strong rounded-[24px] px-4 py-4 sm:px-6" aria-labelledby="location-overview-title" aria-busy={state.statusLoading}>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 id="location-overview-title" className="flex items-center gap-2 text-base font-semibold"><MapPin className="size-4 text-primary" aria-hidden="true" />最近位置</h2>
      <LocationSwitch label="启用定位" checked={state.draft?.enabled ?? false} disabled={disabled} onChange={(value) => controller?.edit("enabled", value)} />
    </div>
    <div className="mt-2 flex items-start gap-3">
      <Home className="mt-1 size-5 shrink-0 text-muted-strong" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xl font-semibold">{summary.label}<span className="ml-3 text-xs font-normal text-muted-strong">{summary.collection}</span></p>
        <p className="mt-1 break-words text-sm leading-6">{status?.address || (state.statusLoading && !status ? "正在读取最近位置…" : "尚无可显示的地址")}</p>
      </div>
    </div>
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-primary/10 pt-3 text-xs text-muted-strong">
      {summary.distance !== null && <span className="inline-flex items-center gap-1.5"><Navigation className="size-3.5" aria-hidden="true" />距家 {locationDistance(summary.distance)}</span>}
      {status?.weather && <span className="inline-flex items-center gap-1.5"><CloudSun className="size-3.5" aria-hidden="true" />缓存天气 · {status.weather}</span>}
      <span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5" aria-hidden="true" />{locationTime(status?.updatedAt ?? null)}</span>
    </div>
    <div className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
      <p>最近上报的位置，非浏览器实时定位；地址、天气和附近地点可能来自较早缓存。</p>
      {summary.enabled === false && <p>定位已关闭，已有位置记录仍保留。开关修改需保存后生效。</p>}
      {state.config && !summary.hasHome && <p>尚未设置有效家庭位置，暂不显示距家距离。</p>}
      {status && !summary.hasPosition && <p>尚无有效坐标，请等待设备上报；也可在高级配置中填写家庭坐标。</p>}
      {summary.older && <p>这是一条超过 30 分钟的上报记录，仅供参考；不能据此判断手机在线状态。</p>}
      {state.homeAwaitingReport !== null && <p>家庭配置已更新，状态与距离等待后续位置上报重新计算。</p>}
    </div>
    {state.statusError && <p role="alert" className="mt-2 text-xs leading-5 text-destructive">最近位置读取失败。{state.statusError}{status && " 正在展示此前缓存。"}</p>}
  </section>;
}
