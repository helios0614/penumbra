import { DeviceContextContractError, type DeviceGroup, type DeviceStatus, type WifiConfig, type WifiMapping, type WifiScene } from "./device-context-types";

function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DeviceContextContractError();
  return input as Record<string, unknown>;
}
function stamp(input: unknown): number {
  if (typeof input !== "number" || !Number.isFinite(input) || input < 0 || input > 8_640_000_000_000) throw new DeviceContextContractError();
  return input;
}
function bool(input: unknown): boolean | null {
  if (input !== null && typeof input !== "boolean") throw new DeviceContextContractError();
  return input;
}
function integer(input: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof input !== "number" || !Number.isInteger(input) || input < 0 || input > max) throw new DeviceContextContractError();
  return input;
}
function group(row: Record<string, unknown>): DeviceGroup {
  if (![null, "available", "unknown", "permission_denied", "unavailable"].includes(row.availability as string | null) || typeof row.fresh !== "boolean" || typeof row.reason !== "string") throw new DeviceContextContractError();
  const value = {
    availability: row.availability as DeviceGroup["availability"], fresh: row.fresh, reason: row.reason,
    observedAt: row.observed_at === null ? null : stamp(row.observed_at),
    receivedAt: row.received_at === null ? null : stamp(row.received_at),
    // SQLite sequences can exceed JS safe integers; they are metadata, never identity/order.
    sampleSeq: row.sample_seq === null ? null : integer(row.sample_seq, 2 ** 63),
    expiresAt: row.expires_at === null ? null : stamp(row.expires_at),
  };
  if (value.fresh && (value.availability !== "available" || value.reason !== "fresh" || value.observedAt === null || value.receivedAt === null || value.expiresAt === null)) throw new DeviceContextContractError();
  return value;
}
export function parseDeviceStatus(input: unknown): DeviceStatus {
  const row = object(input), battery = object(row.battery), wifi = object(row.wifi);
  if (row.device_id !== null && typeof row.device_id !== "string") throw new DeviceContextContractError();
  const b = group(battery), w = group(wifi);
  const scene = wifi.scene;
  if (!["home", "work", "other", "disconnected", "unknown"].includes(scene as string)) throw new DeviceContextContractError();
  const level = battery.level === null ? null : integer(battery.level, 100);
  const connected = bool(wifi.connected);
  if (w.fresh && (connected === null || (connected === false && scene !== "disconnected") || (connected === true && scene === "disconnected"))) throw new DeviceContextContractError();
  return { deviceId: row.device_id as string | null, evaluatedAt: stamp(row.evaluated_at),
    battery: { ...b, level: b.fresh ? level : null, powerConnected: b.fresh ? bool(battery.power_connected) : null, charging: b.fresh ? bool(battery.charging) : null },
    wifi: { ...w, connected: w.fresh ? connected : null, scene: w.fresh ? scene as WifiScene : "unknown" } };
}
export function validateWifiMappings(input: readonly WifiMapping[]): void {
  if (input.length > 128 || new Set(input.map((entry) => entry.ssid)).size !== input.length) throw new DeviceContextContractError();
  for (const entry of input) {
    const bytes = new TextEncoder().encode(entry.ssid).length;
    if (typeof entry.ssid !== "string" || bytes < 1 || bytes > 32 || /\p{C}/u.test(entry.ssid) || !["home", "work"].includes(entry.scene)) throw new DeviceContextContractError();
  }
}
export function parseWifiConfig(input: unknown): WifiConfig {
  const row = object(input);
  if (!Array.isArray(row.mappings)) throw new DeviceContextContractError();
  const mappings = row.mappings.map((value) => {
    const entry = object(value);
    if (typeof entry.ssid !== "string" || (entry.scene !== "home" && entry.scene !== "work")) throw new DeviceContextContractError();
    return { ssid: entry.ssid, scene: entry.scene } as WifiMapping;
  });
  validateWifiMappings(mappings);
  return { revision: integer(row.revision), mappings, cacheMaxAgeSeconds: stamp(row.cache_max_age_seconds) };
}
export function parseDeviceAiVisible(input: unknown): boolean {
  const row = object(input);
  // Existing settings contract defaults an absent field to true.
  if (row.device_context_ai_visible === undefined) return true;
  if (typeof row.device_context_ai_visible !== "boolean") throw new DeviceContextContractError();
  return row.device_context_ai_visible;
}
export function requireDeviceAck(input: unknown): void {
  if (object(input).ok !== true) throw new DeviceContextContractError();
}
