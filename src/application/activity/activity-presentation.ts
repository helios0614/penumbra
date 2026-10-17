import type { ActivityDevice, ActivityRecord } from "@/domain/activity";
import type { DeviceGroup, DeviceWifi } from "@/domain/device-context";
import type { DeviceSnapshot } from "./activity-state";

export function activityCounts(records: readonly ActivityRecord[]) {
  return { all: records.length, pc: records.filter((row) => row.device === "pc").length, phone: records.filter((row) => row.device === "phone").length };
}
export function filterActivity(records: readonly ActivityRecord[], device: ActivityDevice): readonly ActivityRecord[] {
  return device === "all" ? records : records.filter((row) => row.device === device);
}
export function deviceGroupCurrent(group: DeviceGroup, snapshot: DeviceSnapshot, now: number): boolean {
  // expires_at is the backend's display deadline, not a new client TTL or scene rule.
  return group.fresh && group.expiresAt !== null && group.expiresAt > snapshot.status.evaluatedAt + Math.max(0, now - snapshot.startedAt) / 1000;
}
export function deviceUnavailable(group: DeviceGroup, deadlinePassed: boolean): string {
  if (group.reason === "expired" || deadlinePassed) return "未知 · 采样已过期";
  if (group.availability === "permission_denied") return "未知 · 手机权限未授予";
  if (group.reason === "not_configured") return "尚未绑定手机";
  if (group.reason === "missing") return "尚未收到采样";
  if (group.reason === "clock_invalid") return "未知 · 采样时间异常";
  return "未知 · 状态不可用";
}
export function wifiSceneLabel(wifi: DeviceWifi): string {
  return { home: "家里", work: "公司", other: "其他网络", disconnected: "未连接", unknown: "未知网络" }[wifi.scene];
}
export function activityEventLabel(event: Pick<ActivityRecord, "app">): string {
  if (["screen_on", "亮屏"].includes(event.app)) return "屏幕亮起";
  if (["screen_off", "锁屏"].includes(event.app)) return "屏幕关闭";
  // The HTTP adapter already resolves known packages. Unknown package/process names stay literal.
  if (!event.app) return "未命名事件";
  const known = ["微信", "QQ", "TIM", "小红书", "微博", "企业微信", "钉钉", "飞书", "抖音", "快手", "哔哩哔哩", "网易云音乐", "QQ音乐", "Chrome", "Edge", "ChatGPT", "Claude", "Spotify", "淘宝", "京东", "支付宝", "知乎", "高德地图", "百度地图"];
  return known.includes(event.app) ? `打开了 ${event.app}` : event.app;
}
export function eventTime(timestamp: number, timeZone?: string): string {
  return new Intl.DateTimeFormat("zh-CN", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(timestamp * 1000);
}
export function eventDate(timestamp: number, timeZone?: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(timestamp * 1000);
}
export function sampleTime(timestamp: number | null): string {
  return timestamp === null ? "尚无采样时间" : `${eventDate(timestamp)} ${eventTime(timestamp)}`;
}
export function sampleMinute(timestamp: number, timeZone?: string): string {
  return new Intl.DateTimeFormat("zh-CN", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(timestamp * 1000);
}
