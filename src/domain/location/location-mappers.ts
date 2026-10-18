import { LocationBusinessError, LocationContractError, type Coordinate, type LocationConfig, type LocationPoi, type LocationPois, type LocationStatus, type LocationValues, type PoiSearchResult } from "./location-types";

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LocationContractError();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new LocationContractError();
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean") throw new LocationContractError();
  return value;
}
function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new LocationContractError();
  return value;
}
export function optionalText(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const result = String(value).trim();
  return !result || result === "[]" ? null : result;
}
function nonnegative(value: unknown): number | null {
  if ((typeof value !== "number" && typeof value !== "string") || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}
export function coordinate(lng: unknown, lat: unknown): Coordinate | null {
  if (typeof lng !== "number" || typeof lat !== "number" || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return lng !== 0 && lat !== 0 && Math.abs(lng) <= 180 && Math.abs(lat) <= 90 ? { lng, lat } : null;
}
export function serializeWeekdays(days: readonly number[]): string {
  if (days.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) throw new LocationContractError();
  return [...new Set(days)].sort((a, b) => a - b).join(",");
}
export function parseWeekdays(value: string): number[] {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.some((part) => !/^[1-7]$/.test(part))) throw new LocationContractError();
  return serializeWeekdays(parts.map(Number)).split(",").filter(Boolean).map(Number);
}
export function parseLocationConfig(input: unknown): LocationConfig {
  const raw = record(input), credential = record(raw.credential);
  const values: LocationValues = {
    enabled: bool(raw.enabled), quiet_hours_enabled: bool(raw.quiet_hours_enabled),
    quiet_hours_start: text(raw.quiet_hours_start), quiet_hours_end: text(raw.quiet_hours_end),
    quiet_hours_weekday_start: text(raw.quiet_hours_weekday_start), quiet_hours_weekday_end: text(raw.quiet_hours_weekday_end),
    quiet_hours_weekend_start: text(raw.quiet_hours_weekend_start), quiet_hours_weekend_end: text(raw.quiet_hours_weekend_end),
    weekday_days: serializeWeekdays(parseWeekdays(text(raw.weekday_days))),
    home_lng: number(raw.home_lng), home_lat: number(raw.home_lat),
    home_threshold: number(raw.home_threshold), poi_radius: number(raw.poi_radius),
  };
  const configured = bool(credential.configured), masked = text(credential.masked);
  const secretRef = credential.secret_ref === null ? null : text(credential.secret_ref);
  if (configured && !secretRef) throw new LocationContractError();
  return { values, active: bool(raw.active), credential: { configured, masked, secretRef }, categories: Object.keys(record(raw.poi_types)) };
}
function safePhoto(value: unknown): string | null {
  if (!Array.isArray(value) || typeof value[0] !== "string") return null;
  try { const url = new URL(value[0]); return ["http:", "https:"].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}
export function parsePois(input: unknown): LocationPois {
  const result: Record<string, readonly LocationPoi[]> = Object.create(null);
  for (const [category, items] of Object.entries(record(input))) {
    if (!Array.isArray(items)) throw new LocationContractError();
    result[category] = items.map((item) => {
      const p = record(item);
      return { name: optionalText(p.name) ?? "未命名地点", category: optionalText(p.type), address: optionalText(p.address),
        distance: nonnegative(p.distance), phone: optionalText(p.tel), rating: optionalText(p.rating),
        cost: optionalText(p.cost), photo: safePhoto(p.photos) };
    });
  }
  return result;
}
export function parseLocationStatus(input: unknown): LocationStatus {
  const raw = record(input);
  if (!["unknown", "at_home", "outside"].includes(text(raw.state))) throw new LocationContractError();
  const weather = record(raw.weather), summary = optionalText(weather.weather), temperature = optionalText(weather.temperature);
  const stamp = number(raw.updated_at);
  return { enabled: bool(raw.enabled), state: raw.state as LocationStatus["state"], coordinate: coordinate(raw.lng, raw.lat),
    address: optionalText(raw.address), distanceFromHome: nonnegative(raw.distance_from_home), updatedAt: stamp > 0 ? stamp : null,
    weather: summary ? `${summary}${temperature ? ` ${temperature}°C` : ""}` : null, pois: parsePois(raw.nearby_pois) };
}
export function requireLocationAck(input: unknown): Record<string, unknown> {
  const raw = record(input);
  if (raw.ok === false) throw new LocationBusinessError();
  if (raw.ok !== true) throw new LocationContractError();
  return raw;
}
export function parsePoiSearch(input: unknown): PoiSearchResult {
  const raw = requireLocationAck(input), category = text(raw.category);
  return { category, resolvedQuery: text(raw.resolved_query), fallbackUsed: bool(raw.fallback_used), items: parsePois({ [category]: raw.pois })[category] };
}
export function parseSetHome(input: unknown) {
  const raw = requireLocationAck(input), position = coordinate(raw.home_lng, raw.home_lat);
  if (!position) throw new LocationContractError();
  return { coordinate: position, address: optionalText(raw.address) };
}
