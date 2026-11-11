import { settingsRecord } from "@/domain/service-settings/settings-client";
import { apiGet, apiRequest, ApiError } from "@/lib/api";

const settingsPath = "/api/settings";
const keepalivePath = settingsPath + "/keepalive";

export type SystemCacheTtl = "5m" | "1h";
type CacheSettings = {
  cache_enabled: boolean;
  anthropic_system_cache_ttl: SystemCacheTtl;
  cache_keepalive_enabled: boolean;
  cache_keepalive_threshold_min: number;
};

export type ChatAdvancedField = "include_heart" | "include_drift" | "enable_hidden_heart" | "enable_hidden_drift";

async function read(path: string, signal: AbortSignal) {
  const data = await apiGet<unknown>(path, { signal, cache: "no-store" });
  if (!settingsRecord(data)) throw new Error("后端返回的配置格式无效。");
  return data;
}

async function write(path: string, body: Record<string, boolean | number | string>, signal: AbortSignal) {
  const data = await apiRequest<unknown>(path, { method: "PUT", body, signal });
  if (!settingsRecord(data) || data.ok !== true) throw new Error("后端未确认保存。");
}

export async function readCacheSettings(signal: AbortSignal): Promise<CacheSettings> {
  const [settings, keepalive] = await Promise.all([read(settingsPath, signal), read(keepalivePath, signal)]);
  const { cache_enabled, anthropic_system_cache_ttl } = settings;
  const { cache_keepalive_enabled, cache_keepalive_threshold_min } = keepalive;
  if (typeof cache_enabled !== "boolean" ||
      (anthropic_system_cache_ttl !== "5m" && anthropic_system_cache_ttl !== "1h") ||
      typeof cache_keepalive_enabled !== "boolean" ||
      typeof cache_keepalive_threshold_min !== "number" || !Number.isInteger(cache_keepalive_threshold_min)) {
    throw new Error("后端返回的缓存配置格式无效。");
  }
  return { cache_enabled, anthropic_system_cache_ttl, cache_keepalive_enabled, cache_keepalive_threshold_min };
}

export function setCacheEnabled(value: boolean, signal: AbortSignal) {
  return write(settingsPath + "/cache-toggle", { cache_enabled: value }, signal);
}

export function setSystemCacheTtl(value: SystemCacheTtl, signal: AbortSignal) {
  return write(settingsPath + "/anthropic-system-cache-ttl", { ttl: value }, signal);
}

export function setKeepalive(
  update: Partial<Pick<CacheSettings, "cache_keepalive_enabled" | "cache_keepalive_threshold_min">>,
  signal: AbortSignal,
) {
  return write(keepalivePath, update, signal);
}

export async function readChatAdvancedSettings(signal: AbortSignal): Promise<Record<ChatAdvancedField, boolean>> {
  const { include_heart, include_drift, enable_hidden_heart, enable_hidden_drift } = await read(settingsPath, signal);
  if (typeof include_heart !== "boolean" || typeof include_drift !== "boolean" ||
      typeof enable_hidden_heart !== "boolean" || typeof enable_hidden_drift !== "boolean") {
    throw new Error("后端返回的 HEART / DRIFT 配置格式无效。");
  }
  return { include_heart, include_drift, enable_hidden_heart, enable_hidden_drift };
}

export function setChatAdvancedField(field: ChatAdvancedField, value: boolean, signal: AbortSignal) {
  const path = field === "include_heart" || field === "include_drift" ? settingsPath + "/context_toggle" : settingsPath;
  return write(path, { [field]: value }, signal);
}

export function advancedSettingsError(error: unknown): string {
  if (error instanceof ApiError && settingsRecord(error.data)) {
    const { detail } = error.data;
    if (settingsRecord(detail) && typeof detail.code === "string") return detail.code;
    if (Array.isArray(detail) && settingsRecord(detail[0]) && typeof detail[0].msg === "string") return detail[0].msg;
  }
  return error instanceof Error ? error.message : "请求失败。";
}
