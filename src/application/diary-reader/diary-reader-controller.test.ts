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
const entry: ArchivedDiary = { id: "archive", date: "2026-10-09", title: null, content: "实际归档正文" };
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const controllers: ReturnType<typeof createDiaryReaderController>[] = [];
function setup() {
  const api = {
    getDiaryCalendar: vi.fn(async (month: string, _options?: DiaryReadOptions) => calendar(month)),
    getArchivedDiary: vi.fn(async (_id: string, _date: string, _options?: DiaryReadOptions) => entry),
  };
  const controller = createDiaryReaderController(api, () => "2026-10-23");
  controllers.push(controller);
  return { controller, api };
}
afterEach(() => { controllers.forEach((controller) => controller.dispose()); controllers.length = 0; });

describe("Diary month lifecycle", () => {
  it("loads only the current month, selects days without requests, and reads detail only for archived records", async () => {
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
