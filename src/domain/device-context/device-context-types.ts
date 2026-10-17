export type WifiScene = "home" | "work" | "other" | "disconnected" | "unknown";
export interface DeviceGroup {
  readonly availability: "available" | "unknown" | "permission_denied" | "unavailable" | null;
  readonly observedAt: number | null;
  readonly receivedAt: number | null;
  readonly sampleSeq: number | null;
  readonly fresh: boolean;
  readonly reason: string;
  readonly expiresAt: number | null;
}
export interface DeviceBattery extends DeviceGroup {
  readonly level: number | null;
  readonly powerConnected: boolean | null;
  readonly charging: boolean | null;
}
export interface DeviceWifi extends DeviceGroup {
  readonly connected: boolean | null;
  readonly scene: WifiScene;
}
export interface DeviceStatus {
  readonly deviceId: string | null;
  readonly evaluatedAt: number;
  readonly battery: DeviceBattery;
  readonly wifi: DeviceWifi;
}
export interface WifiMapping { readonly ssid: string; readonly scene: "home" | "work" }
export interface WifiConfig {
  readonly revision: number;
  readonly mappings: readonly WifiMapping[];
  readonly cacheMaxAgeSeconds: number;
}
export class DeviceContextContractError extends Error {
  constructor() { super("手机状态接口返回的数据不符合契约，请重新读取。"); this.name = "DeviceContextContractError"; }
}
