import { describe, expect, it } from "vitest";
import { diaryCalendarWeeks, diaryDateLabel, diaryDateWeekday, diaryItemDescription, diaryTitle } from "./diary-calendar";
import type { DiaryCalendarItem } from "@/domain/diary";

describe("Diary calendar presentation", () => {
  it.each(["0001-01", "0099-02", "1900-02", "2000-02", "2024-02", "2026-10", "2026-12", "2027-01", "9999-12"])("builds only the requested month with Monday-first complete weeks: %s", (month) => {
    const weeks = diaryCalendarWeeks(month), days = weeks.flat().filter((date): date is string => date !== null);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(days[0]).toBe(`${month}-01`);
    expect(new Set(days).size).toBe(days.length);
    expect(days.every((date) => date.startsWith(month))).toBe(true);
    expect(weeks.length).toBeGreaterThanOrEqual(4); expect(weeks.length).toBeLessThanOrEqual(6);
  });
  it("keeps correct weekday placement, leap days and padding without requesting neighbor months", () => {
    expect(diaryCalendarWeeks("2026-10")[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(diaryCalendarWeeks("2021-02")).toHaveLength(4);
    expect(diaryCalendarWeeks("2024-02").flat()).toContain("2024-02-29");
    expect(diaryCalendarWeeks("1900-02").flat()).not.toContain("1900-02-29");
    expect(diaryDateLabel("0099-01-01")).toBe("99年1月1日");
    expect(diaryDateWeekday("2026-10-09")).toBe("星期五");
  });
  it("distinguishes saved draft from persisted messages without claiming successful generation", () => {
    const pending: DiaryCalendarItem = { date: "2026-10-09", entryId: "entry", title: null, entryStatus: "writing", hasDiaryMessages: true, hasSavedContent: false, calendarState: "pending", invalidReason: null };
    expect(diaryItemDescription(pending)).toBe("有日记会话记录，尚未归档。");
    expect(diaryItemDescription({ ...pending, hasSavedContent: true })).toBe("有保存的正文草稿，尚未归档。");
    expect(diaryTitle(null)).toBe("无标题"); expect(diaryTitle(" \n ")).toBe("无标题");
    expect(diaryTitle("真实标题")).toBe("真实标题");
  });
});
