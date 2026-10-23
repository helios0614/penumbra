import { afterEach, describe, expect, it, vi } from "vitest";
import { getArchivedDiary, getDiaryCalendar } from "./diary-client";
import { DiaryContractError, DiaryUnavailableError } from "./diary-types";
import { hasDiaryText, parseArchivedDiary, parseDiaryCalendar } from "./diary-mappers";
import { diaryMonthDays, diaryWeekday, isDiaryDate, isDiaryMonth, localDiaryDate, shiftDiaryMonth } from "./diary-date";
import { ApiError } from "@/lib/api";

function row(patch: Record<string, unknown> = {}) {
  return { date: "2026-10-09", entry_id: "entry", title: null, entry_status: "done", has_diary_messages: false, has_saved_content: true, calendar_state: "archived", invalid_reason: null, ...patch };
}
const detail = (patch: Record<string, unknown> = {}) => ({ id: "entry", date: "2026-10-09", status: "done", title: "真实标题", content: "保存的正文\n\n第二段", ...patch });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());

describe("Diary business dates", () => {
  it.each(["0001-01", "0099-12", "2000-02", "2026-10", "9999-12"])("accepts supported month %s", (month) => expect(isDiaryMonth(month)).toBe(true));
  it.each(["0000-01", "10000-01", "2026-1", "２０２６-１０", "2026-00", "2026-13", "2026-10-01", "2026-10 "])("rejects invalid month %s", (month) => expect(isDiaryMonth(month)).toBe(false));
  it("handles Gregorian leap centuries, month edges and the full API year range", () => {
    expect(diaryMonthDays("2000-02")).toBe(29);
    expect(diaryMonthDays("1900-02")).toBe(28);
    expect(isDiaryDate("2024-02-29")).toBe(true);
    expect(isDiaryDate("2026-02-29")).toBe(false);
    expect(isDiaryDate("2026-04-31")).toBe(false);
    expect(isDiaryDate("2026-10-9")).toBe(false);
    expect(isDiaryDate("9999-12-31")).toBe(true);
    expect(diaryWeekday("0001-01-01")).toBe(0);
    expect(diaryWeekday("2026-10-01")).toBe(3);
    expect(diaryWeekday("2024-02-29")).toBe(3);
    expect(diaryWeekday("9999-12-31")).toBe(4);
    expect(shiftDiaryMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftDiaryMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftDiaryMonth("0001-01", -1)).toBeNull();
    expect(shiftDiaryMonth("9999-12", 1)).toBeNull();
  });
  it("uses local calendar fields without converting saved business dates to UTC", () => {
    const local = new Date(2026, 9, 9, 0, 1);
    expect(localDiaryDate(local)).toBe("2026-10-09");
    expect(parseArchivedDiary(detail(), "entry", "2026-10-09").date).toBe("2026-10-09");
  });
});

describe("Diary calendar read contract", () => {
  it("preserves the server's three states, null fields and raw persistence facts", () => {
    const calendar = parseDiaryCalendar([
      row({ date: "2026-10-11", entry_id: "invalid", entry_status: null, has_saved_content: false, calendar_state: "invalid", invalid_reason: "unknown_entry_status" }),
      row(),
      row({ date: "2026-10-10", entry_id: "pending", entry_status: "writing", has_saved_content: false, has_diary_messages: true, calendar_state: "pending" }),
    ], "2026-10");
    expect(calendar.items.map((item) => item.calendarState)).toEqual(["archived", "pending", "invalid"]);
    expect(calendar.items[0]).toMatchObject({ title: null, hasDiaryMessages: false, hasSavedContent: true });
    expect(calendar.items[2].entryStatus).toBeNull();
    expect(parseDiaryCalendar([], "2026-10")).toEqual({ month: "2026-10", items: [] });
  });
  it("keeps malformed business dates for a visible month diagnostic instead of normalizing or omitting them", () => {
    for (const date of ["2026-10-02junk", "2026-10-02T08:00:00", "2026-10-2"]) {
      expect(parseDiaryCalendar([row({ date, calendar_state: "invalid", invalid_reason: "invalid_business_date" })], "2026-10").items[0].date).toBe(date);
    }
  });
  it.each([null, "", " \n "])("preserves title %s without writing a fallback", (title) => {
    expect(parseDiaryCalendar([row({ title })], "2026-10").items[0].title).toBe(title);
  });
  it.each([
    { calendar_state: "finished" }, { calendar_state: "archived", has_saved_content: false },
    { calendar_state: "pending", entry_status: "writing", has_saved_content: false, has_diary_messages: false },
    { calendar_state: "invalid", invalid_reason: null }, { invalid_reason: "done_without_content" },
    { calendar_state: "invalid", invalid_reason: "done_without_content", has_saved_content: true },
    { calendar_state: "invalid", invalid_reason: "unknown_entry_status", entry_status: "writing" },
    { has_diary_messages: 1 }, { title: 12 }, { entry_status: undefined }, { entry_id: " " },
    { date: "2026-09-30" }, { date: "2026-11-01" }, { date: "2026-10-02junk" },
  ])("rejects contradictory or malformed index data: %j", (patch) => {
    expect(() => parseDiaryCalendar([row(patch)], "2026-10")).toThrow(DiaryContractError);
  });
  it("rejects duplicate identity/date and non-array failures rather than showing an empty month", () => {
    expect(() => parseDiaryCalendar([row(), row()], "2026-10")).toThrow(DiaryContractError);
    expect(() => parseDiaryCalendar([row(), row({ entry_id: "other" })], "2026-10")).toThrow(DiaryContractError);
    for (const input of [null, {}, { ok: false }, { items: [] }]) expect(() => parseDiaryCalendar(input, "2026-10")).toThrow(DiaryContractError);
  });
});

describe("Archived Diary detail", () => {
  it("projects only saved reading fields and preserves complete plain text", () => {
    const content = "第一段\n\n**不是 Markdown**\r\n<script>不会执行</script>" + "longword".repeat(500);
    expect(parseArchivedDiary(detail({ title: null, content, auto_feed_status: "feeding", model: "private", auto_feed_config: "large" }), "entry", "2026-10-09"))
      .toEqual({ id: "entry", date: "2026-10-09", title: null, content });
  });
  it.each([{ ok: false, message: "private" }, detail({ status: "writing" }), detail({ content: "" }), detail({ content: " \n\t\u0085\u001c\u3000" }), detail({ content: null })])("rejects missing/unarchived/empty detail", (value) => {
    expect(() => parseArchivedDiary(value, "entry", "2026-10-09")).toThrow(DiaryUnavailableError);
  });
  it.each([detail({ id: "other" }), detail({ date: "2026-10-10" }), detail({ title: 2 }), null])("rejects identity, date and shape mismatches", (value) => {
    expect(() => parseArchivedDiary(value, "entry", "2026-10-09")).toThrow(DiaryContractError);
  });
  it("matches Python Unicode whitespace rules without stripping actual prose", () => {
    expect(hasDiaryText("\u001c\u001d\u001e\u001f\u0085\u00a0\u2000\u202f\u3000\n")).toBe(false);
    expect(hasDiaryText("\ufeff")).toBe(true); // Python does not strip BOM.
    expect(hasDiaryText("\u0085正文\u0085")).toBe(true);
  });
});

describe("Diary client is read-only", () => {
  it("requests only one month's lightweight index and an explicitly opened entry", async () => {
    const id = "diary /?中文", abort = new AbortController();
    const fetch = vi.fn().mockResolvedValueOnce(json([row()])).mockResolvedValueOnce(json(detail({ id })));
    vi.stubGlobal("fetch", fetch);
    await getDiaryCalendar("2026-10", { signal: abort.signal });
    await getArchivedDiary(id, "2026-10-09");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/diary/reader/calendar?month=2026-10", `/api/diary/entries/${encodeURIComponent(id)}`]);
    expect(fetch.mock.calls.every(([, options]) => options.method === "GET" && options.credentials === "include" && options.cache === "no-store" && options.body === undefined)).toBe(true);
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it("rejects invalid requests before fetch and keeps HTTP and business errors visible", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ detail: { code: "diary_calendar_read_failed" } }, 500)).mockResolvedValueOnce(json({ ok: false, message: "private-error" }));
    vi.stubGlobal("fetch", fetch);
    await expect(getDiaryCalendar("0000-01")).rejects.toThrow(DiaryContractError);
    await expect(getArchivedDiary("", "2026-10-09")).rejects.toThrow(DiaryContractError);
    expect(fetch).not.toHaveBeenCalled();
    await expect(getDiaryCalendar("2026-10")).rejects.toBeInstanceOf(ApiError);
    await expect(getArchivedDiary("entry", "2026-10-09")).rejects.toThrow(DiaryUnavailableError);
  });
});
