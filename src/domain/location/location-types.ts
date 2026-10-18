export interface LocationValues {
  enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  quiet_hours_weekday_start: string;
  quiet_hours_weekday_end: string;
  quiet_hours_weekend_start: string;
  quiet_hours_weekend_end: string;
  weekday_days: string;
  home_lng: number;
  home_lat: number;
  home_threshold: number;
  poi_radius: number;
}
export interface LocationCredential {
  readonly configured: boolean;
  readonly masked: string;
  readonly secretRef: string | null;
}
export interface LocationConfig {
  readonly values: LocationValues;
  readonly credential: LocationCredential;
  readonly active: boolean;
  readonly categories: readonly string[];
}
export interface Coordinate { readonly lng: number; readonly lat: number }
export interface LocationPoi {
  readonly name: string;
  readonly category: string | null;
  readonly address: string | null;
  readonly distance: number | null;
  readonly phone: string | null;
  readonly rating: string | null;
  readonly cost: string | null;
  readonly photo: string | null;
}
export type LocationPois = Readonly<Record<string, readonly LocationPoi[]>>;
export interface LocationStatus {
  readonly enabled: boolean;
  readonly state: "at_home" | "outside" | "unknown";
  readonly coordinate: Coordinate | null;
  readonly address: string | null;
  readonly distanceFromHome: number | null;
  readonly updatedAt: number | null;
  readonly weather: string | null;
  readonly pois: LocationPois;
}
export interface PoiSearchResult {
  readonly category: string;
  readonly resolvedQuery: string;
  readonly fallbackUsed: boolean;
  readonly items: readonly LocationPoi[];
}
export type LocationPatch = Partial<LocationValues> & { amap_key?: string };
export class LocationContractError extends Error {
  constructor() { super("Location response violates its contract"); this.name = "LocationContractError"; }
}
export class LocationBusinessError extends Error {
  constructor() { super("定位服务未完成此操作，请检查配置和最近位置后重试。"); this.name = "LocationBusinessError"; }
}
