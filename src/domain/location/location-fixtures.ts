import { parseLocationConfig, parseLocationStatus } from "./location-mappers";

export const configDto = {
  enabled: true, active: true, quiet_hours_enabled: false,
  quiet_hours_start: "00:00", quiet_hours_end: "08:00",
  quiet_hours_weekday_start: "", quiet_hours_weekday_end: "", quiet_hours_weekend_start: "", quiet_hours_weekend_end: "",
  weekday_days: "1,2,3,4,5", home_lng: 116.4, home_lat: 39.9, home_threshold: 500, poi_radius: 3000,
  poi_types: { "餐饮美食": "050000", "风景名胜": "110000" },
  credential: { configured: true, masked: "••••1234", secret_ref: "fake-ref" },
};
export const statusDto = {
  enabled: true, state: "at_home", lng: 116.4, lat: 39.9, address: "合成位置", distance_from_home: 0,
  updated_at: 1_800_000_000, weather: { weather: "小雨", temperature: "21" }, nearby_pois: {},
};
export const locationConfig = () => parseLocationConfig(configDto);
export const locationStatus = () => parseLocationStatus(statusDto);
