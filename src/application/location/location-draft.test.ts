import { describe, expect, it } from "vitest";
import { locationConfig } from "@/domain/location/location-fixtures";
import { buildLocationPatch, draftFromConfig, effectivePeriod, periodHint, rebaseDraft, validateDraft } from "./location-draft";

describe("Location field-level draft", () => {
  it("submits only changed fields, preserves empty overrides and never clears a blank Key", () => {
    const config = locationConfig(), draft = draftFromConfig(config);
    expect(draft.quiet_hours_weekday_start).toBe("");
    expect(buildLocationPatch(config, draft, " ")).toEqual({});
    expect(buildLocationPatch(config, { ...draft, weekday_days: "", quiet_hours_end: "09:30" }, "")).toEqual({ weekday_days: "", quiet_hours_end: "09:30" });
    expect(buildLocationPatch(config, draft, " fake-new-key ")).toEqual({ amap_key: "fake-new-key" });
    expect(buildLocationPatch(config, { ...draft, home_threshold: "500.0" }, "")).toEqual({});
  });
  it("falls back independently for each display endpoint without writing inherited values", () => {
    const config = locationConfig(), draft = { ...draftFromConfig(config), quiet_hours_weekday_end: "09:25" };
    expect(effectivePeriod(draft, "weekday")).toEqual({ start: "00:00", end: "09:25" });
    expect(effectivePeriod(draft, "weekend")).toEqual({ start: "00:00", end: "08:00" });
    expect(buildLocationPatch(config, draft, "")).toEqual({ quiet_hours_weekday_end: "09:25" });
    config.values.quiet_hours_weekday_end = "09:25";
    expect(buildLocationPatch(config, { ...draft, quiet_hours_weekday_end: "" }, "")).toEqual({ quiet_hours_weekday_end: "" });
  });
  it("supports overnight and equal endpoints with backend-compatible explanatory text", () => {
    const draft = { ...draftFromConfig(locationConfig()), quiet_hours_start: "23:00", quiet_hours_end: "08:00" };
    expect(validateDraft(draft)).toEqual({}); expect(periodHint("23:00", "08:00")).toContain("当前日类别");
    expect(periodHint("08:00", "08:00")).toBe("起止相同，无静默时长");
    expect(validateDraft({ ...draft, quiet_hours_end: "23:00" })).toEqual({});
  });
  it.each(["", "9:00", "24:00", "12:60", "08:00:00", "oops"])("rejects invalid unified time %j", (value) => {
    const draft = { ...draftFromConfig(locationConfig()), quiet_hours_start: value };
    expect(validateDraft(draft).quiet_hours_start).toBeDefined();
    expect(() => buildLocationPatch(locationConfig(), draft, "")).toThrow();
  });
  it("validates optional times and numeric constraints, including clearing both home coordinates", () => {
    const draft = draftFromConfig(locationConfig());
    expect(validateDraft({ ...draft, quiet_hours_weekday_start: "oops" }).quiet_hours_weekday_start).toBeDefined();
    expect(validateDraft({ ...draft, home_lng: "", home_lat: "" })).toEqual({});
    expect(buildLocationPatch(locationConfig(), { ...draft, home_lng: "", home_lat: "" }, "")).toEqual({ home_lng: 0, home_lat: 0 });
    expect(validateDraft({ ...draft, home_lat: "" }).home_lat).toBeDefined();
    expect(validateDraft({ ...draft, home_threshold: "49", poi_radius: "10001" })).toHaveProperty("poi_radius");
  });
  it("rebases untouched fields after polling while preserving local changes", () => {
    const config = locationConfig(), baseline = draftFromConfig(config), draft = { ...baseline, quiet_hours_end: "09:30" };
    const next = { ...baseline, quiet_hours_end: "10:00", home_threshold: "750", weekday_days: "" };
    expect(rebaseDraft(baseline, draft, next)).toMatchObject({ quiet_hours_end: "09:30", home_threshold: "750", weekday_days: "" });
    expect(rebaseDraft(baseline, { ...baseline, home_threshold: "500.0" }, next).home_threshold).toBe("750");
  });
});
