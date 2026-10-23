import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { DiaryContractError, DiaryUnavailableError, type ArchivedDiary, type DiaryCalendar, type DiaryReadOptions } from "@/domain/diary";
import { createDiaryReaderController } from "./diary-reader-controller";

function calendar(month = "2026-10"): DiaryCalendar {
  return { month, items: [
    { date: `${month}-09`, entryId: "archive", title: "已保存标题", entryStatus: "done", hasDiaryMessages: true, hasSavedContent: true, calendarState: "archived", invalidReason: null },
    { date: `${month}-10`, entryId: "pending", title: null, entryStatus: "writing", hasDiaryMessages: true, hasSavedContent: false, calendarState: "pending", invalidReason: null },
    { date: `${month}-11`, entryId: "invalid", title: null, entryStatus: "done", hasDiaryMessages: true, hasSavedContent: false, calendarState: "invalid", invalidReason: "done_without_content" },
  ] };
}
const entry: ArchivedDiary = { id: "archive", date: "2026-10-09", title: null, content: "实际归档正文", importance: 0.8, tags: ["shared_moment"], keywords: ["日常"] };
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const controllers: ReturnType<typeof createDiaryReaderController>[] = [];
function setup(today = "2026-10-23") {
  const api = {
    getDiaryCalendar: vi.fn(async (month: string, _options?: DiaryReadOptions) => calendar(month)),
    getArchivedDiary: vi.fn(async (id: string, date: string, _options?: DiaryReadOptions) => ({ ...entry, id, date })),
  };
  const controller = createDiaryReaderController(api, () => today);
  controllers.push(controller);
  return { controller, api };
}
afterEach(() => { controllers.forEach((controller) => controller.dispose()); controllers.length = 0; });

describe("Diary month lifecycle", () => {
  it("loads only the current month and reads selected detail only for archived records", async () => {
    const { controller, api } = setup();
    expect(controller.getState()).toMatchObject({ month: "2026-10", selectedDate: "2026-10-23", reader: null });
    await controller.load();
    controller.selectDate("2026-10-10");
    await controller.openEntry("pending"); await controller.openEntry("invalid"); await controller.openEntry("missing");
    expect(api.getArchivedDiary).not.toHaveBeenCalled();
    controller.selectDate("2026-10-09"); await controller.openEntry("archive");
    expect(api.getArchivedDiary).toHaveBeenCalledWith("archive", "2026-10-09", { signal: expect.any(AbortSignal) });
    controller.back();
    expect(controller.getState()).toMatchObject({ selectedDate: "2026-10-09", month: "2026-10", reader: null });
    expect(api.getDiaryCalendar).toHaveBeenCalledTimes(1);
  });
  it("clamps selection on month changes, crosses years, and returns to today's month/date", async () => {
    const { controller, api } = setup(); await controller.load(); controller.selectDate("2026-10-31");
    await controller.selectMonth("2024-02");
    expect(controller.getState().selectedDate).toBe("2024-02-29");
    await controller.selectMonth("2025-02"); expect(controller.getState().selectedDate).toBe("2025-02-28");
    await controller.selectMonth("2026-12"); await controller.selectMonth("2027-01");
    await controller.goToday();
    expect(controller.getState()).toMatchObject({ month: "2026-10", selectedDate: "2026-10-23" });
    expect(api.getDiaryCalendar.mock.calls.map(([month]) => month)).toEqual(["2026-10", "2024-02", "2025-02", "2026-12", "2027-01", "2026-10"]);
    const count = api.getDiaryCalendar.mock.calls.length;
    await controller.selectMonth("2026-10"); await controller.goToday(); await controller.selectMonth("0000-01");
    controller.selectDate("2026-11-01"); controller.selectDate("2026-10-32");
    expect(api.getDiaryCalendar).toHaveBeenCalledTimes(count);
    expect(controller.getState().selectedDate).toBe("2026-10-23");
  });
  it("aborts rapid month changes and suppresses both stale successes and stale failures", async () => {
    const { controller, api } = setup(), first = deferred<DiaryCalendar>(), second = deferred<DiaryCalendar>();
    api.getDiaryCalendar.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const a = controller.load();
    const b = controller.selectMonth("2026-11");
    expect(api.getDiaryCalendar.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(controller.getState()).toMatchObject({ calendar: null, selectedDate: "2026-11-23", calendarLoading: true });
    await controller.selectMonth("2026-12");
    first.resolve(calendar()); second.reject(new Error("stale-private-error")); await Promise.all([a, b]);
    expect(controller.getState()).toMatchObject({ month: "2026-12", calendar: { month: "2026-12" }, calendarError: null });
  });
  it("coalesces duplicate requests and exposes only confirmed manual refresh success", async () => {
    const { controller, api } = setup(), delayed = deferred<DiaryCalendar>();
    api.getDiaryCalendar.mockImplementationOnce(() => delayed.promise);
    const a = controller.load(), b = controller.load(), c = controller.refresh();
    expect(a).toBe(b); expect(a).toBe(c); expect(api.getDiaryCalendar).toHaveBeenCalledTimes(1);
    delayed.resolve(calendar()); await a;
    expect(controller.getState().notice).toBeNull();
    await controller.refresh(); expect(controller.getState().notice?.text).toBe("日历已刷新");
    controller.selectDate("2026-10-09"); expect(controller.getState().notice).toBeNull();
  });
  it("keeps failed reads distinct from empty months and retains only the current month's stale index", async () => {
    const { controller, api } = setup();
    api.getDiaryCalendar.mockRejectedValueOnce(new ApiError("private", 0, undefined, "TIMEOUT"));
    await controller.load(); expect(controller.getState()).toMatchObject({ calendar: null, calendarError: "读取超时，请重试。", calendarLoading: false });
    await controller.load();
    api.getDiaryCalendar.mockRejectedValueOnce(new Error("private failure")); await controller.refresh();
    expect(controller.getState()).toMatchObject({ calendar: { month: "2026-10" }, notice: null });
    expect(controller.getState().calendarError).not.toContain("private");
    api.getDiaryCalendar.mockRejectedValueOnce(new Error("offline")); await controller.selectMonth("2026-11");
    expect(controller.getState().calendar).toBeNull();
    api.getDiaryCalendar.mockResolvedValueOnce({ month: "2026-11", items: [] }); await controller.load();
    expect(controller.getState()).toMatchObject({ calendar: { items: [] }, calendarError: null });
  });
});

describe("Diary selected-entry preview", () => {
  it("reads only the selected archived day after the index arrives, even if the month has other archived days", async () => {
    const { controller, api } = setup(entry.date), delayed = deferred<ArchivedDiary>();
    api.getDiaryCalendar.mockResolvedValueOnce({ ...calendar(), items: [...calendar().items, { ...calendar().items[0], entryId: "other", date: "2026-10-12" }] });
    api.getArchivedDiary.mockImplementationOnce(() => delayed.promise);
    await controller.load();
    expect(api.getArchivedDiary).toHaveBeenCalledTimes(1);
    expect(api.getArchivedDiary.mock.calls[0].slice(0, 2)).toEqual([entry.id, entry.date]);
    expect(controller.getState()).toMatchObject({ preview: { entryId: entry.id, loading: true, entry: null }, reader: null });
    delayed.resolve(entry); await controller.selectDate(entry.date);
    expect(controller.getState().preview?.entry).toEqual(entry);
  });
  it("shares the in-flight preview with the reader and reuses completed detail on return and reselection", async () => {
    const { controller, api } = setup(), delayed = deferred<ArchivedDiary>(); await controller.load();
    api.getArchivedDiary.mockImplementationOnce(() => delayed.promise);
    const preview = controller.selectDate(entry.date), reading = controller.openEntry(entry.id);
    expect(preview).toBe(reading); expect(api.getArchivedDiary).toHaveBeenCalledTimes(1);
    delayed.resolve(entry); await reading;
    expect(controller.getState()).toMatchObject({ reader: { entry }, preview: { entry } });
    controller.back(); await controller.selectDate("2026-10-10"); await controller.selectDate(entry.date); await controller.openEntry(entry.id);
    expect(api.getArchivedDiary).toHaveBeenCalledTimes(1);
  });
  it.each(["success", "failure"])("aborts rapid date changes and ignores a stale preview %s", async (outcome) => {
    const { controller, api } = setup(), old = deferred<ArchivedDiary>();
    api.getDiaryCalendar.mockResolvedValueOnce({ ...calendar(), items: [...calendar().items, { ...calendar().items[0], entryId: "second", date: "2026-10-12" }] });
    await controller.load(); api.getArchivedDiary.mockImplementationOnce(() => old.promise);
    const first = controller.selectDate(entry.date);
    await controller.selectDate("2026-10-12");
    expect(api.getArchivedDiary.mock.calls[0][2]?.signal?.aborted).toBe(true);
    if (outcome === "success") old.resolve(entry); else old.reject(new DiaryUnavailableError());
    await first;
    expect(controller.getState()).toMatchObject({ selectedDate: "2026-10-12", preview: { entryId: "second", entry: { id: "second" }, loading: false, error: null }, reader: null, calendar: { month: "2026-10" } });
    await controller.selectDate("2026-10-10"); expect(controller.getState().preview).toBeNull();
    await controller.selectDate("2026-10-11"); await controller.selectDate("2026-10-13");
    expect(api.getArchivedDiary).toHaveBeenCalledTimes(2);
  });
  it.each([new Error("offline"), new DiaryUnavailableError(), new DiaryContractError(), new ApiError("gone", 404)])("keeps a successful calendar index and the reading entrance when preview fails", async (error) => {
    const { controller, api } = setup(); await controller.load();
    api.getArchivedDiary.mockRejectedValueOnce(error); await controller.selectDate(entry.date);
    expect(controller.getState()).toMatchObject({ calendar: calendar(), calendarError: null, preview: { entry: null, loading: false }, reader: null });
    expect(controller.getState().preview?.error).toBeTruthy();
    await controller.openEntry(entry.id);
    expect(api.getArchivedDiary).toHaveBeenCalledTimes(2); expect(controller.getState().reader?.entry).toEqual(entry);
  });
  it("refreshes cached detail explicitly and does not reuse it across months", async () => {
    const { controller, api } = setup(); await controller.load(); await controller.selectDate(entry.date); await controller.openEntry(entry.id);
    api.getArchivedDiary.mockResolvedValueOnce({ ...entry, content: "刷新后的实际正文", importance: 0, tags: [], keywords: [] });
    await controller.refresh(); controller.back();
    expect(controller.getState().preview?.entry).toMatchObject({ content: "刷新后的实际正文", importance: 0 });
    expect(api.getArchivedDiary).toHaveBeenCalledTimes(2);
    await controller.refresh(); await controller.selectDate(entry.date);
    expect(api.getArchivedDiary).toHaveBeenCalledTimes(3);
    expect(controller.getState().notice).toBeNull();
    await controller.selectMonth("2026-11"); await controller.selectDate("2026-11-09");
    await controller.selectMonth("2026-10"); await controller.selectDate(entry.date);
    expect(api.getArchivedDiary).toHaveBeenCalledTimes(5);
  });
  it("cancels preview when selecting an empty day or leaving its month, without caching late results", async () => {
    const { controller, api } = setup(), old = deferred<ArchivedDiary>(); await controller.load();
    api.getArchivedDiary.mockImplementationOnce(() => old.promise);
    const preview = controller.selectDate(entry.date); await controller.selectDate("2026-10-13");
    expect(api.getArchivedDiary.mock.calls[0][2]?.signal?.aborted).toBe(true);
    old.resolve(entry); await preview; expect(controller.getState().preview).toBeNull();
    await controller.selectDate(entry.date); expect(api.getArchivedDiary).toHaveBeenCalledTimes(2);
    const next = deferred<ArchivedDiary>(); api.getArchivedDiary.mockImplementationOnce(() => next.promise);
    await controller.refresh(); const pending = controller.selectDate(entry.date);
    await controller.selectMonth("2026-11");
    expect(api.getArchivedDiary.mock.calls[2][2]?.signal?.aborted).toBe(true);
    next.resolve(entry); await pending;
    expect(controller.getState().preview?.date).not.toBe(entry.date);
  });
  it("preserves the calendar refresh notice while background preview finishes", async () => {
    const { controller, api } = setup(); await controller.load(); await controller.selectDate(entry.date);
    const delayed = deferred<ArchivedDiary>(); api.getArchivedDiary.mockImplementationOnce(() => delayed.promise);
    await controller.refresh(); expect(controller.getState().notice?.text).toBe("日历已刷新");
    delayed.resolve(entry); await Promise.resolve();
    expect(controller.getState().notice?.text).toBe("日历已刷新");
  });
  it("cancels a preview from the retained old index when the refreshed index no longer archives that date", async () => {
    const { controller, api } = setup(), index = deferred<DiaryCalendar>(), detail = deferred<ArchivedDiary>(); await controller.load();
    api.getDiaryCalendar.mockImplementationOnce(() => index.promise);
    const refreshing = controller.refresh();
    api.getArchivedDiary.mockImplementationOnce(() => detail.promise);
    const preview = controller.selectDate(entry.date);
    index.resolve({ month: "2026-10", items: [] }); await refreshing;
    expect(api.getArchivedDiary.mock.calls[0][2]?.signal?.aborted).toBe(true);
    detail.resolve(entry); await preview;
    expect(controller.getState()).toMatchObject({ calendar: { items: [] }, preview: null, reader: null });
  });
  it("keeps reader invalidation when an in-flight preview is promoted to reading", async () => {
    const { controller, api } = setup(), detail = deferred<ArchivedDiary>(); await controller.load();
    api.getArchivedDiary.mockImplementationOnce(() => detail.promise);
    const preview = controller.selectDate(entry.date), reading = controller.openEntry(entry.id);
    detail.reject(new DiaryUnavailableError()); await Promise.all([preview, reading]);
    expect(controller.getState()).toMatchObject({ calendar: null, preview: null, reader: { entry: null, loading: false } });
    api.getDiaryCalendar.mockResolvedValueOnce({ month: "2026-10", items: [] }); controller.back(); await Promise.resolve();
    expect(api.getDiaryCalendar).toHaveBeenCalledTimes(2);
  });
  it("aborts preview on unmount and never publishes a late error", async () => {
    const { controller, api } = setup(), old = deferred<ArchivedDiary>(), listener = vi.fn(); await controller.load();
    api.getArchivedDiary.mockImplementationOnce(() => old.promise); controller.subscribe(listener);
    const preview = controller.selectDate(entry.date), calls = listener.mock.calls.length;
    controller.dispose(); old.reject(new Error("late")); await preview;
    expect(listener).toHaveBeenCalledTimes(calls);
    expect(api.getArchivedDiary.mock.calls[0][2]?.signal?.aborted).toBe(true);
  });
});

describe("Diary reader lifecycle", () => {
  it.each([new DiaryUnavailableError(), new DiaryContractError(), new ApiError("gone", 404)])("invalidates old archived content and re-reads the month on return", async (error) => {
    const { controller, api } = setup(); await controller.load(); controller.selectDate("2026-10-09");
    await controller.openEntry("archive");
    api.getArchivedDiary.mockRejectedValueOnce(error); await controller.refresh();
    expect(controller.getState()).toMatchObject({ reader: { entry: null, loading: false }, calendar: null, notice: null });
    controller.back(); await Promise.resolve();
    expect(api.getDiaryCalendar).toHaveBeenCalledTimes(2);
    expect(controller.getState().selectedDate).toBe("2026-10-09");
  });
  it("preserves readable content on a network refresh failure, marks it stale, and permits retry", async () => {
    const { controller, api } = setup(); await controller.load(); await controller.openEntry("archive");
    api.getArchivedDiary.mockRejectedValueOnce(new ApiError("private", 0, undefined, "NETWORK_ERROR"));
    await controller.refresh();
    expect(controller.getState().reader).toMatchObject({ entry, error: "网络连接中断，请重试。", loading: false });
    expect(controller.getState().notice).toBeNull();
    await controller.refresh();
    expect(controller.getState()).toMatchObject({ reader: { entry, error: null }, notice: { text: "正文已刷新" } });
    expect(api.getDiaryCalendar).toHaveBeenCalledTimes(1);
  });
  it("discards an in-flight older month index after detail invalidation instead of reviving its archived marker", async () => {
    const { controller, api } = setup(), oldIndex = deferred<DiaryCalendar>(); await controller.load();
    api.getDiaryCalendar.mockImplementationOnce(() => oldIndex.promise);
    const refreshing = controller.refresh();
    api.getArchivedDiary.mockRejectedValueOnce(new DiaryUnavailableError()); await controller.openEntry("archive");
    expect(api.getDiaryCalendar.mock.calls[1][1]?.signal?.aborted).toBe(true);
    oldIndex.resolve(calendar()); await refreshing; expect(controller.getState().calendar).toBeNull();
    api.getDiaryCalendar.mockResolvedValueOnce({ month: "2026-10", items: [] });
    controller.back(); await Promise.resolve();
    expect(api.getDiaryCalendar).toHaveBeenCalledTimes(3);
    expect(controller.getState().calendar?.items).toEqual([]);
  });
  it("cancels an entry read on return, ignores late detail, and does not notify an abandoned reader", async () => {
    const { controller, api } = setup(), delayed = deferred<ArchivedDiary>(); await controller.load();
    api.getArchivedDiary.mockImplementationOnce(() => delayed.promise);
    const reading = controller.openEntry("archive");
    controller.back();
    expect(api.getArchivedDiary.mock.calls[0][2]?.signal?.aborted).toBe(true);
    delayed.resolve(entry); await reading;
    expect(controller.getState()).toMatchObject({ reader: null, notice: null });
  });
  it("coalesces entry refresh and prevents an old entry replacing a newer one", async () => {
    const { controller, api } = setup(), delayed = deferred<ArchivedDiary>();
    api.getDiaryCalendar.mockResolvedValueOnce({ ...calendar(), items: [...calendar().items, { ...calendar().items[0], entryId: "second", date: "2026-10-12" }] });
    await controller.load(); api.getArchivedDiary.mockImplementationOnce(() => delayed.promise);
    const a = controller.openEntry("archive"); expect(controller.refresh()).toBe(a);
    api.getArchivedDiary.mockResolvedValueOnce({ ...entry, id: "second", date: "2026-10-12" });
    await controller.openEntry("second"); delayed.resolve(entry); await a;
    expect(controller.getState().reader?.entry?.id).toBe("second");
  });
  it("aborts on disposal and never publishes late success, error or toast", async () => {
    const { controller, api } = setup(), delayed = deferred<DiaryCalendar>(), listener = vi.fn();
    controller.subscribe(listener); api.getDiaryCalendar.mockImplementationOnce(() => delayed.promise);
    const request = controller.refresh(); const calls = listener.mock.calls.length;
    controller.dispose(); delayed.resolve(calendar()); await request;
    expect(listener).toHaveBeenCalledTimes(calls);
    expect(api.getDiaryCalendar.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await controller.load(); await controller.openEntry("archive"); await controller.selectMonth("2027-01");
    expect(api.getDiaryCalendar).toHaveBeenCalledTimes(1);
  });
});
