import { apiGet, apiRequest, type ApiRequestOptions } from "@/lib/api";
import { parseDeviceAiVisible, parseDeviceStatus, parseWifiConfig, requireDeviceAck, validateWifiMappings } from "./device-context-mappers";
import { DeviceContextContractError, type WifiConfig, type WifiMapping } from "./device-context-types";

export async function getDeviceStatus(options?: ApiRequestOptions) {
  return parseDeviceStatus(await apiGet<unknown>("/api/device-context/status", { ...options, cache: "no-store" }));
}
export async function getDeviceAiVisible(options?: ApiRequestOptions) {
  return parseDeviceAiVisible(await apiGet<unknown>("/api/settings", { ...options, cache: "no-store" }));
}
export async function setDeviceAiVisible(visible: boolean, options?: ApiRequestOptions) {
  requireDeviceAck(await apiRequest<unknown>("/api/settings", { ...options, method: "PUT", body: { device_context_ai_visible: visible } }));
}
export async function getWifiConfig(options?: ApiRequestOptions) {
  return parseWifiConfig(await apiGet<unknown>("/api/device-context/wifi-config", { ...options, cache: "no-store" }));
}
export async function saveWifiConfig(config: WifiConfig, mappings: readonly WifiMapping[], options?: ApiRequestOptions) {
  if (!Number.isSafeInteger(config.revision) || config.revision < 0 || config.revision > 9_007_199_254_740_990) throw new DeviceContextContractError();
  validateWifiMappings(mappings);
  return parseWifiConfig(await apiRequest<unknown>("/api/device-context/wifi-config", { ...options, method: "PUT", body: { revision: config.revision, mappings } }));
}
