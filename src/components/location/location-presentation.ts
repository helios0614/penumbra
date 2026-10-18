import { coordinate } from "@/domain/location";
import type { LocationState } from "@/application/location/location-state";

export function locationTime(timestamp: number | null): string {
  return timestamp === null ? "尚无上报记录" : new Date(timestamp * 1000).toLocaleString("zh-CN", { hour12: false });
}
export function locationDistance(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m`;
}
export function locationSummary(state: LocationState, now = Date.now()) {
  const status = state.status, config = state.config;
  const hasPosition = Boolean(status?.coordinate);
  const hasHome = Boolean(config && coordinate(config.values.home_lng, config.values.home_lat));
  const enabled = config?.values.enabled ?? status?.enabled;
  const label = !hasPosition ? "未知" : status?.state === "at_home" ? "在家" : status?.state === "outside" ? "外出" : "未知";
  const distance = hasPosition && hasHome && status?.state !== "unknown" && state.homeAwaitingReport === null ? status?.distanceFromHome ?? null : null;
  return { label, hasPosition, hasHome, enabled, distance,
    older: Boolean(status?.updatedAt && now - status.updatedAt * 1000 > 30 * 60_000),
    collection: !config ? "采集许可尚未读取" : !config.values.enabled ? "定位已关闭" : config.active ? "后端允许采集" : "当前为定位静默时段" };
}
