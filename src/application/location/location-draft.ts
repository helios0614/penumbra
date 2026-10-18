import { parseWeekdays, serializeWeekdays, type LocationConfig, type LocationPatch, type LocationValues } from "@/domain/location";

export type LocationDraft = { [K in keyof LocationValues]: LocationValues[K] extends boolean ? boolean : string };
export const TIME_KEYS = ["quiet_hours_start", "quiet_hours_end", "quiet_hours_weekday_start", "quiet_hours_weekday_end", "quiet_hours_weekend_start", "quiet_hours_weekend_end"] as const;
export const NUMBER_KEYS = ["home_lng", "home_lat", "home_threshold", "poi_radius"] as const;
export const SETTINGS_KEYS = ["enabled", "quiet_hours_enabled", ...TIME_KEYS, "weekday_days"] as const;
const ALL_KEYS: readonly (keyof LocationDraft)[] = [...SETTINGS_KEYS, ...NUMBER_KEYS];
export type LocationSaveSection = "settings" | "position" | "key";
export type TimeKey = typeof TIME_KEYS[number];
export const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function draftFromConfig(config: LocationConfig): LocationDraft {
  const v = config.values;
  return { ...v, home_lng: v.home_lng === 0 ? "" : String(v.home_lng), home_lat: v.home_lat === 0 ? "" : String(v.home_lat),
    home_threshold: String(v.home_threshold), poi_radius: String(v.poi_radius) };
}
export function changedFields(baseline: LocationDraft, draft: LocationDraft): (keyof LocationDraft)[] {
  return (Object.keys(baseline) as (keyof LocationDraft)[]).filter((key) => {
    if (NUMBER_KEYS.some((field) => field === key)) {
      const before = Number(baseline[key]), after = Number(draft[key]);
      if (Number.isFinite(before) && Number.isFinite(after) && before === after) return false;
    }
    return draft[key] !== baseline[key];
  });
}
export function hasDraftChanges(baseline: LocationDraft | null, draft: LocationDraft | null, fields: readonly (keyof LocationDraft)[]): boolean {
  return Boolean(baseline && draft && changedFields(baseline, draft).some((key) => fields.includes(key)));
}
export function rebaseDraft(baseline: LocationDraft, draft: LocationDraft, next: LocationDraft): LocationDraft {
  return { ...next, ...Object.fromEntries(changedFields(baseline, draft).map((key) => [key, draft[key]])) };
}
export function validateDraft(draft: LocationDraft, fields: readonly (keyof LocationDraft)[] = ALL_KEYS): Partial<Record<keyof LocationDraft, string>> {
  const errors: Partial<Record<keyof LocationDraft, string>> = {};
  for (const key of TIME_KEYS) {
    const optional = key.includes("weekday") || key.includes("weekend");
    if (!(optional && draft[key] === "") && !validTime(draft[key])) errors[key] = "请输入有效的 HH:mm 时间";
  }
  try { parseWeekdays(draft.weekday_days); } catch { errors.weekday_days = "请选择有效的星期"; }
  const lng = Number(draft.home_lng), lat = Number(draft.home_lat);
  if (!Number.isFinite(lng) || Math.abs(lng) > 180) errors.home_lng = "经度应在 -180 至 180 之间";
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) errors.home_lat = "纬度应在 -90 至 90 之间";
  if ((lng === 0) !== (lat === 0)) errors.home_lat = "请填写完整坐标，或同时清空两项";
  const threshold = Number(draft.home_threshold), radius = Number(draft.poi_radius);
  if (!draft.home_threshold.trim() || !Number.isInteger(threshold) || threshold < 50) errors.home_threshold = "请填写不小于 50 的整数";
  if (!draft.poi_radius.trim() || !Number.isInteger(radius) || radius < 500 || radius > 10000) errors.poi_radius = "请填写 500–10000 之间的整数";
  return Object.fromEntries(Object.entries(errors).filter(([key]) => fields.includes(key as keyof LocationDraft)));
}
export function buildLocationPatch(config: LocationConfig, draft: LocationDraft, replacementKey: string, fields: readonly (keyof LocationDraft)[] = ALL_KEYS): LocationPatch {
  if (Object.keys(validateDraft(draft, fields)).length) throw new Error("请先检查配置中的输入。");
  const values = fields.map((key) => [key, NUMBER_KEYS.some((field) => field === key) ? Number(draft[key])
    : key === "weekday_days" ? serializeWeekdays(parseWeekdays(draft[key])) : draft[key]] as const);
  const patch = Object.fromEntries(values.filter(([key, value]) => value !== config.values[key])) as LocationPatch;
  if (replacementKey.trim()) patch.amap_key = replacementKey.trim();
  return patch;
}
export function effectivePeriod(draft: LocationDraft, kind: "weekday" | "weekend") {
  return { start: draft[`quiet_hours_${kind}_start`] || draft.quiet_hours_start, end: draft[`quiet_hours_${kind}_end`] || draft.quiet_hours_end };
}
export function periodHint(start: string, end: string): string {
  if (!validTime(start) || !validTime(end)) return "请填写有效时间";
  if (start === end) return "起止相同，无静默时长";
  return start > end ? "跨午夜，按当前日类别应用" : "开始包含，结束不包含";
}
