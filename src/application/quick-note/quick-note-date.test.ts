import { describe, expect, it } from "vitest";
import { businessDate, businessRange, boundarySeconds, formatPeriod, parseDateKey, shiftDate } from "./quick-note-date";
import type { TriggerConfig } from "@/domain/quick-note";

const config: TriggerConfig = { hours: [5, 13, 20], labels: { "5": "夜晚", "13": "上午", "20": "下午" }, dayBoundaryHour: 5, timeZone: "Asia/Shanghai" };
describe("Quick Note business dates", () => {
  it("uses the business timezone and boundary instead of browser midnight", () => {
    expect(businessDate(config, Date.parse("2026-10-15T20:59:59Z"))).toBe("2026-10-15");
    expect(businessDate(config, Date.parse("2026-10-15T21:00:00Z"))).toBe("2026-10-16");
    expect(businessRange("2026-10-16", config)).toEqual({ periodFrom: Date.parse("2026-10-15T21:00:00Z") / 1000, periodTo: Date.parse("2026-10-16T21:00:00Z") / 1000 });
  });
  it("uses changed server configuration rather than the production examples", () => {
    const other = { ...config, hours: [3, 12], dayBoundaryHour: 3, timeZone: "Pacific/Auckland" };
    expect(businessRange("2026-10-16", other).periodFrom).toBe(Date.parse("2026-10-15T14:00:00Z") / 1000);
    expect(businessDate(other, Date.parse("2026-10-15T13:59:59Z"))).toBe("2026-10-15");
  });
  it.each([["2026-03-07", 23], ["2026-10-31", 25]])("calculates D and D+1 separately across DST on %s", (date, hours) => {
    const range = businessRange(date, { ...config, dayBoundaryHour: 5, timeZone: "America/New_York" });
    expect(range.periodTo - range.periodFrom).toBe(hours * 3600);
  });
  it("handles half-hour offsets, month/year boundaries, and leap days", () => {
    expect(boundarySeconds("2026-10-16", 5, "Asia/Kolkata")).toBe(Date.parse("2026-10-15T23:30:00Z") / 1000);
    expect(shiftDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDate("2024-03-01", -1)).toBe("2024-02-29");
    expect(shiftDate("2026-01-01", -2)).toBe("2025-12-30");
    expect(() => parseDateKey("2026-02-30")).toThrow();
  });
  it("fails explicitly for nonexistent wall boundaries and resolves repeated ones consistently", () => {
    expect(() => boundarySeconds("2026-03-08", 2, "America/New_York")).toThrow("不存在");
    expect(boundarySeconds("2026-11-01", 1, "America/New_York")).toBe(Date.parse("2026-11-01T05:00:00Z") / 1000);
  });
  it("labels real cross-day periods without deriving names from current config", () => {
    expect(formatPeriod(Date.parse("2026-10-16T12:00:00Z") / 1000, Date.parse("2026-10-16T21:00:00Z") / 1000, config.timeZone)).toBe("2026-10-16 20:00 — 2026-10-17（跨天） 05:00");
  });
});
