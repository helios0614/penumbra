import { coordinate } from "@/domain/location";
import type { LocationState } from "@/application/location/location-state";

export function locationTime(timestamp: number | null): string {
  return timestamp === null ? "尚无上报记录" : new Date(timestamp * 1000).toLocaleString("zh-CN", { hour12: false });
}
export function locationDistance(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m`;
}
const POI_PARENT_CATEGORIES = new Set([
  "餐饮服务", "购物服务", "生活服务", "住宿服务", "医疗保健服务", "科教文化服务", "体育休闲服务", "交通设施服务", "金融保险服务",
  "风景名胜", "商务住宅", "政府机构及社会团体", "公司企业", "公共设施", "地名地址信息", "道路附属设施", "汽车服务", "汽车销售", "汽车维修", "摩托车服务",
]);
export function locationPoiCategory(value: string | null | undefined): string {
  const categories = [...new Set((value ?? "").split(/[;；]/).map((part) => part.trim()).filter(Boolean))];
  // Keep broad labels when they are all we have; never infer a replacement category.
  const specific = categories.filter((category) => !POI_PARENT_CATEGORIES.has(category));
  return (specific.length ? specific : categories).slice(-2).join(" · ");
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
