import { ApiError } from "@/lib/api";
import type { ActivityDevice, ActivityQuery, ActivityRecord, ActivitySummary } from "@/domain/activity";
import type { DeviceStatus, WifiConfig } from "@/domain/device-context";

export interface ActivityReadFailure { readonly kind: "network" | "auth" | "other"; readonly message: string; readonly status?: number; readonly code?: string }
export interface ReadState<T> { readonly data: T | null; readonly loading: boolean; readonly error: string | null; readonly failure?: ActivityReadFailure }
export interface DeviceSnapshot { readonly status: DeviceStatus; readonly startedAt: number }
export interface ActivityReads {
  readonly logs: ReadState<readonly ActivityRecord[]>;
  readonly dates: ReadState<readonly string[]>;
  readonly phone: ReadState<DeviceSnapshot>;
  readonly visibility: ReadState<boolean>;
  readonly wifi: ReadState<WifiConfig>;
  readonly summary: ReadState<readonly ActivitySummary[]>;
  readonly legacyEnabled: ReadState<boolean>;
}
export interface ActivityState extends ActivityReads {
  readonly query: ActivityQuery;
  readonly device: ActivityDevice;
  readonly pending: "wifi" | "visibility" | "clear" | null;
  readonly notice: { readonly error: boolean; readonly text: string; readonly source?: "wifi" | "wifi-dialog" | "visibility" | "clear" } | null;
  readonly clockNow: number;
}
const empty = <T>(): ReadState<T> => ({ data: null, loading: false, error: null });
export const INITIAL_ACTIVITY_STATE: ActivityState = {
  query: { kind: "recent", hours: 3 }, device: "all", pending: null, notice: null, clockNow: 0,
  logs: empty(), dates: empty(), phone: empty(), visibility: empty(), wifi: empty(), summary: empty(), legacyEnabled: empty(),
};
export function activityFailure(error: unknown): string {
  if (error instanceof ApiError) {
    if ([401, 403].includes(error.status)) return "当前会话无权访问，请检查登录状态后重新读取。";
    if (error.status === 409) return "配置已被其他页面修改，已重新读取；请核对后再操作。";
    if (error.status === 422 || error.status === 400) return "配置未通过校验：网络名称须为 1–32 个 UTF-8 字节、无控制字符，且不能重复，最多 128 个标记。";
  }
  return "请求失败，请检查连接后重新读取。";
}
export function activityReadFailure(error: unknown): ActivityReadFailure {
  return { kind: error instanceof ApiError && error.status === 401 ? "auth" : error instanceof ApiError && error.code === "NETWORK_ERROR" ? "network" : "other",
    message: error instanceof Error ? error.message : "未知读取错误", ...(error instanceof ApiError ? { status: error.status, code: error.code } : {}) };
}
