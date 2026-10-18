import { apiGet, apiPost, apiRequest, type ApiRequestOptions } from "@/lib/api";
import { parseLocationConfig, parseLocationStatus, parsePoiSearch, parseSetHome, record, requireLocationAck } from "./location-mappers";
import { LocationContractError, type LocationPatch } from "./location-types";

const base = "/api/location";
export async function getLocationConfig(options?: ApiRequestOptions) {
  return parseLocationConfig(await apiGet<unknown>(`${base}/config`, { ...options, cache: "no-store" }));
}
export async function getLocationStatus(options?: ApiRequestOptions) {
  return parseLocationStatus(await apiGet<unknown>(`${base}/status`, { ...options, cache: "no-store" }));
}
export async function saveLocationConfig(patch: LocationPatch, options?: ApiRequestOptions) {
  requireLocationAck(await apiRequest<unknown>(`${base}/config`, { ...options, method: "PUT", body: patch }));
}
export async function setLocationHome(options?: ApiRequestOptions) {
  return parseSetHome(await apiPost<unknown>(`${base}/set-home`, undefined, options));
}
export async function searchLocationPois(category: string, options?: ApiRequestOptions) {
  if (!category.trim() || category.includes("|")) throw new LocationContractError();
  return parsePoiSearch(await apiPost<unknown>(`${base}/poi-search`, { category: category.trim() }, { ...options, timeoutMs: 65_000 }));
}
export async function revealLocationKey(secretRef: string, options?: ApiRequestOptions): Promise<string> {
  const raw = record(await apiPost<unknown>(`${base}/secrets/reveal`, { secret_ref: secretRef }, { ...options, cache: "no-store" }));
  if (typeof raw.secret !== "string") throw new LocationContractError();
  return raw.secret;
}
export async function clearLocationKey(secretRef: string, options?: ApiRequestOptions) {
  requireLocationAck(await apiPost<unknown>(`${base}/secrets/clear`, { secret_ref: secretRef }, { ...options, cache: "no-store" }));
}
