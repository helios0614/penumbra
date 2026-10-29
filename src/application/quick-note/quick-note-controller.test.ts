import { describe, expect, it, vi } from "vitest";
import * as client from "@/domain/quick-note";
import type { QuickNote, QuickNotePage, TriggerConfig } from "@/domain/quick-note";
import { ApiError } from "@/lib/api";
import { createQuickNoteController } from "./quick-note-controller";

const config: TriggerConfig = { hours: [5, 13, 20], labels: { "5": "夜晚", "13": "上午", "20": "下午" }, dayBoundaryHour: 5, timeZone: "Asia/Shanghai" };
const note: QuickNote = { id: "qn_1", periodStart: 1792098000, periodEnd: 1792126800, periodLabel: "历史上午", summary: '{"事件归纳":"事件"}', output: "已保存<br>正文", createdAt: 1792130000 };
const page = (items: readonly QuickNote[] = [note], p = 1, total = items.length): QuickNotePage => ({ items, page: p, pageSize: 10, total, hasMore: p * 10 < total });
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function setup() {
  const deps = {
    ...client,
    getTriggerConfig: vi.fn().mockResolvedValue(config),
    listQuickNotes: vi.fn().mockResolvedValue(page()),
    getIncomplete: vi.fn().mockResolvedValue([]),
    readQuickNote: vi.fn().mockResolvedValue(note),
    backfillQuickNote: vi.fn().mockResolvedValue(undefined),
    rerunQuickNote: vi.fn().mockResolvedValue(undefined),
    saveQuickNote: vi.fn().mockResolvedValue(undefined),
    deleteQuickNote: vi.fn().mockResolvedValue(undefined),
  };
  const controller = createQuickNoteController(deps, () => Date.parse("2026-10-16T02:00:00Z"));
  return { deps, controller };
}

describe("Quick Note loading, pagination, and request lifetimes", () => {
  it("does not reload records when opening the editor reads an unchanged config", async () => {
    const { deps, controller: c } = setup(); await c.loadConfig();
    const data = c.getState().data;
    await c.applyConfig({ ...config, hours: [...config.hours], labels: { ...config.labels } });
    expect(deps.listQuickNotes).toHaveBeenCalledOnce(); expect(c.getState().data).toBe(data);
    c.dispose();
  });
  it("applies readback config to date queries and invalidates stale config and candidates", async () => {
    const { deps, controller: c } = setup(); await c.loadConfig();
    const candidate = deferred<readonly client.IncompletePeriod[]>(); deps.getIncomplete.mockReturnValueOnce(candidate.promise);
    const candidates = c.loadCandidates();
    const pendingConfig = deferred<TriggerConfig>(); deps.getTriggerConfig.mockReturnValueOnce(pendingConfig.promise);
    const older = c.loadConfig();
    const updated = { ...config, hours: [6, 14, 21], dayBoundaryHour: 6, labels: { "6": "夜", "14": "日", "21": "晚" } };
    await c.applyConfig(updated);
    expect(deps.listQuickNotes).toHaveBeenLastCalledWith(expect.objectContaining({ periodFrom: Date.parse("2026-10-15T22:00Z") / 1000, periodTo: Date.parse("2026-10-16T22:00Z") / 1000 }), expect.anything());
    pendingConfig.resolve(config); candidate.resolve([]); await Promise.all([older, candidates]);
    expect(c.getState()).toMatchObject({ config: updated, candidates: null, candidatesLoading: false });
    c.dispose();
  });
  it("waits for real config, computes business date and paginated bounds, and recovers config failures", async () => {
    const { deps, controller: c } = setup();
    deps.getTriggerConfig.mockRejectedValueOnce(new Error("offline"));
    await c.loadConfig();
    expect(c.getState()).toMatchObject({ config: null, configLoading: false, configError: expect.stringContaining("配置") });
    expect(deps.listQuickNotes).not.toHaveBeenCalled();
    await c.loadConfig();
    expect(c.getState()).toMatchObject({ date: "2026-10-16", page: 1, status: "success" });
    expect(deps.listQuickNotes).toHaveBeenCalledWith({ page: 1, pageSize: 10, periodFrom: Date.parse("2026-10-15T21:00Z") / 1000, periodTo: Date.parse("2026-10-16T21:00Z") / 1000 }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    c.dispose();
  });
  it("exposes loading, empty data, and read errors with GET-only recovery", async () => {
    const { deps, controller: c } = setup();
    const pending = deferred<QuickNotePage>();
    deps.listQuickNotes.mockReturnValueOnce(pending.promise);
    const starting = c.loadConfig();
    await Promise.resolve();
    expect(c.getState().status).toBe("loading");
    pending.resolve(page([]));
    await starting;
    expect(c.getState().data?.items).toEqual([]);
    deps.listQuickNotes.mockRejectedValueOnce(new ApiError("offline", 0));
    await c.load();
    expect(c.getState()).toMatchObject({ status: "error", error: expect.any(String) });
    await c.load();
    expect(c.getState().status).toBe("success");
    expect(deps.backfillQuickNote).not.toHaveBeenCalled();
    c.dispose();
  });
  it("loads every backend page for the selected date before publishing the overview", async () => {
    const { deps, controller: c } = setup();
    await c.loadConfig();
    const records = Array.from({ length: 25 }, (_, index) => ({ ...note, id: `note-${index}`, createdAt: note.createdAt - index }));
    const lastPage = deferred<QuickNotePage>();
    deps.listQuickNotes.mockClear();
    deps.listQuickNotes.mockResolvedValueOnce(page(records.slice(0, 10), 1, 25)).mockResolvedValueOnce(page(records.slice(10, 20), 2, 25)).mockReturnValueOnce(lastPage.promise);
    const reading = c.selectDate("2026-10-15");
    await Promise.resolve(); await Promise.resolve();
    expect(c.getState()).toMatchObject({ status: "loading", data: null });
    expect(deps.listQuickNotes.mock.calls.map(([query]) => query.page)).toEqual([1, 2, 3]);
    lastPage.resolve(page(records.slice(20), 3, 25));
    await reading;
    expect(c.getState()).toMatchObject({ date: "2026-10-15", page: 1 });
    expect(c.getState().data?.items).toEqual(records);
    const signals = deps.listQuickNotes.mock.calls.map(([query, options]) => {
      expect(query).toMatchObject({ periodFrom: Date.parse("2026-10-14T21:00Z") / 1000, periodTo: Date.parse("2026-10-15T21:00Z") / 1000, pageSize: 10 });
      return options.signal;
    });
    expect(new Set(signals).size).toBe(1);
    c.dispose();
  });
  it("ignores stale date/page responses even when transport ignores abort", async () => {
    const { deps, controller: c } = setup();
    await c.loadConfig();
    const older = deferred<QuickNotePage>();
    const newer = deferred<QuickNotePage>();
    deps.listQuickNotes.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const first = c.selectDate("2026-10-15");
    const signal = deps.listQuickNotes.mock.lastCall?.[1].signal;
    expect(c.getState().data).toBeNull();
    const second = c.selectDate("2026-10-14");
    expect(signal.aborted).toBe(true);
    newer.resolve(page([{ ...note, id: "current" }]));
    await second;
    older.resolve(page([{ ...note, id: "stale" }]));
    await first;
    expect(c.getState().data?.items[0].id).toBe("current");
    expect(c.getState().date).toBe("2026-10-14");
    c.dispose();
  });
  it("retains the previous complete list on a later-page failure and recovers with GET only", async () => {
    const { deps, controller: c } = setup();
    await c.loadConfig();
    const records = Array.from({ length: 11 }, (_, index) => ({ ...note, id: `new-${index}` }));
    deps.listQuickNotes.mockResolvedValueOnce(page(records.slice(0, 10), 1, 11)).mockRejectedValueOnce(new ApiError("offline", 0));
    await c.load();
    expect(c.getState()).toMatchObject({ status: "error", data: { items: [note] } });
    deps.listQuickNotes.mockResolvedValueOnce(page(records.slice(0, 10), 1, 11)).mockResolvedValueOnce(page(records.slice(10), 2, 11));
    await c.load();
    expect(c.getState()).toMatchObject({ status: "success", data: { items: records } });
    expect(deps.rerunQuickNote).not.toHaveBeenCalled();
    expect(deps.backfillQuickNote).not.toHaveBeenCalled();
    c.dispose();
  });
  it("cancels later pages and ignores their late responses after switching dates", async () => {
    const { deps, controller: c } = setup();
    await c.loadConfig();
    const oldPage = deferred<QuickNotePage>();
    deps.listQuickNotes.mockResolvedValueOnce(page([note], 1, 11)).mockReturnValueOnce(oldPage.promise);
    const oldRead = c.selectDate("2026-10-15");
    await Promise.resolve();
    const signal = deps.listQuickNotes.mock.lastCall?.[1].signal;
    const current = { ...note, id: "current" };
    deps.listQuickNotes.mockResolvedValueOnce(page([current]));
    await c.selectDate("2026-10-14");
    expect(signal.aborted).toBe(true);
    oldPage.resolve(page([{ ...note, id: "late" }], 2, 11));
    await oldRead;
    expect(c.getState()).toMatchObject({ date: "2026-10-14", data: { items: [current] } });
    c.dispose();
  });
  it("deduplicates page overlaps without reordering and stops a non-advancing page chain", async () => {
    const { deps, controller: c } = setup();
    await c.loadConfig();
    const next = { ...note, id: "next" };
    deps.listQuickNotes.mockResolvedValueOnce(page([note], 1, 11)).mockResolvedValueOnce(page([note, next], 2, 11));
    await c.load();
    expect(c.getState().data?.items).toEqual([note, next]);
    deps.listQuickNotes.mockResolvedValueOnce(page([note], 1, 21)).mockResolvedValueOnce(page([note], 2, 21));
    const before = deps.listQuickNotes.mock.calls.length;
    await c.load();
    expect(deps.listQuickNotes.mock.calls.length - before).toBe(2);
    expect(c.getState()).toMatchObject({ status: "error", error: expect.stringContaining("完整读取"), data: { items: [note, next] } });
    c.dispose();
  });
  it("coalesces repeated loads and ignores repeated selection of the current date", async () => {
    const { deps, controller: c } = setup();
    await c.loadConfig();
    const waiting = deferred<QuickNotePage>();
    deps.listQuickNotes.mockReturnValueOnce(waiting.promise);
    const first = c.load();
    const second = c.load();
    expect(second).toBe(first);
    await c.selectDate(c.getState().date);
    expect(deps.listQuickNotes).toHaveBeenCalledTimes(2);
    waiting.resolve(page());
    await first;
    c.dispose();
  });
  it("protects a newer config request and does not publish after disposal", async () => {
    const { deps, controller: c } = setup();
    const older = deferred<TriggerConfig>();
    deps.getTriggerConfig.mockReturnValueOnce(older.promise);
    const first = c.loadConfig();
    const oldSignal = deps.getTriggerConfig.mock.lastCall?.[0].signal;
    await c.loadConfig();
    expect(oldSignal.aborted).toBe(true);
    older.resolve({ ...config, timeZone: "UTC" });
    await first;
    expect(c.getState().config?.timeZone).toBe("Asia/Shanghai");
    const waiting = deferred<QuickNotePage>();
    deps.listQuickNotes.mockReturnValueOnce(waiting.promise);
    const listener = vi.fn();
    c.subscribe(listener);
    const read = c.load();
    const readSignal = deps.listQuickNotes.mock.lastCall?.[1].signal;
    c.dispose();
    listener.mockClear();
    waiting.resolve(page([]));
    await read;
    expect(readSignal.aborted).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("Quick Note edit lifecycle and conflicts", () => {
  it("normalizes line breaks, preserves drafts during refresh/date switch, saves, and cancels", async () => {
    const { deps, controller: c } = setup();
    await c.loadConfig();
    c.beginEdit(note);
    expect(c.getState().editor?.draft).toBe("已保存\n正文");
    c.changeDraft("[HEART:keep]\n我的草稿");
    deps.listQuickNotes.mockResolvedValueOnce(page([{ ...note, output: "后台新正文" }]));
    await c.load();
    await c.selectDate("2026-10-15");
    expect(c.getState().editor?.draft).toBe("[HEART:keep]\n我的草稿");
    await c.saveEditor();
    expect(deps.saveQuickNote).toHaveBeenCalledWith(note.id, "[HEART:keep]\n我的草稿", expect.any(Object));
    expect(c.getState().editor).toBeNull();
    c.beginEdit(note); c.changeDraft("放弃修改"); c.cancelEdit();
    expect(c.getState().editor).toBeNull();
    expect(deps.saveQuickNote).toHaveBeenCalledTimes(1);
    c.dispose();
  });
  it("retains the complete user input when a save fails", async () => {
    const { deps, controller: c } = setup();
    await c.loadConfig(); c.beginEdit(note); c.changeDraft("失败后仍保留\n[DRIFT:内容]");
    deps.saveQuickNote.mockRejectedValueOnce(new ApiError("failed", 500));
    await c.saveEditor();
    expect(c.getState().editor).toMatchObject({ draft: "失败后仍保留\n[DRIFT:内容]", error: expect.any(String) });
    expect(c.getState().pending).toBeNull();
    c.dispose();
  });
  it("does not issue PUT after preflight GET fails", async () => {
    const { deps, controller: c } = setup();
    await c.loadConfig(); c.beginEdit(note); c.changeDraft("草稿");
    deps.readQuickNote.mockRejectedValueOnce(new ApiError("network", 0));
    await c.saveEditor();
    expect(c.getState().editor?.draft).toBe("草稿");
    expect(deps.saveQuickNote).not.toHaveBeenCalled();
    c.dispose();
  });
  it("detects external generation changes and requires explicit rebasing before replacement", async () => {
    const { deps, controller: c } = setup();
    await c.loadConfig(); c.beginEdit(note); c.changeDraft("草稿");
    const updated = { ...note, output: "后台重跑正文" };
    deps.readQuickNote.mockResolvedValue(updated);
    await c.saveEditor();
    expect(c.getState().editor).toMatchObject({ draft: "草稿", conflict: updated, error: expect.stringContaining("变化") });
    expect(deps.saveQuickNote).not.toHaveBeenCalled();
    c.acceptConflict();
    await c.saveEditor();
    expect(deps.saveQuickNote).toHaveBeenCalledOnce();
    c.dispose();
  });
  it("keeps a deleted record's draft and refuses to recreate it on save", async () => {
    const { deps, controller: c } = setup();
    await c.loadConfig(); c.beginEdit(note); c.changeDraft("孤立草稿");
    deps.readQuickNote.mockResolvedValue(null);
    await c.saveEditor();
    expect(c.getState().editor).toMatchObject({ draft: "孤立草稿", error: expect.stringContaining("已删除") });
    expect(deps.saveQuickNote).not.toHaveBeenCalled();
    c.dispose();
  });
  it("reconciles a disconnected save through GET and never repeats the write automatically", async () => {
    const { deps, controller: c } = setup();
    await c.loadConfig(); c.beginEdit(note); c.changeDraft("保存的新正文");
    deps.saveQuickNote.mockRejectedValueOnce(new ApiError("timeout", 0, null, "TIMEOUT"));
    deps.readQuickNote.mockResolvedValueOnce(note).mockResolvedValueOnce({ ...note, output: "保存的新正文" });
    await c.saveEditor();
    expect(c.getState().editor).toBeNull();
    expect(c.getState().notice?.text).toContain("已核对，正文已保存");
    expect(deps.saveQuickNote).toHaveBeenCalledOnce();
    c.dispose();
  });
  it("blocks repeat saves while the result remains uncertain, and allows GET-only verification", async () => {
    const { deps, controller: c } = setup();
    await c.loadConfig(); c.beginEdit(note); c.changeDraft("保留草稿");
    deps.saveQuickNote.mockRejectedValueOnce(new ApiError("timeout", 0, null, "TIMEOUT"));
    deps.readQuickNote.mockResolvedValueOnce(note).mockRejectedValueOnce(new ApiError("offline", 0));
    await c.saveEditor();
    expect(c.getState().editor).toMatchObject({ draft: "保留草稿", uncertain: true });
    await c.saveEditor();
    expect(deps.saveQuickNote).toHaveBeenCalledOnce();
    deps.readQuickNote.mockResolvedValue({ ...note, output: "保留草稿" });
    await c.verifyEditor();
    expect(c.getState().editor).toBeNull();
    expect(deps.saveQuickNote).toHaveBeenCalledOnce();
    c.dispose();
  });
});

describe("Quick Note mutations, feedback, and failure recovery", () => {
  it("removes stale accepted/read-failed feedback after GET recovery without repeating the mutation", async () => {
    const { deps, controller: c } = setup(); await c.loadConfig();
    deps.listQuickNotes.mockRejectedValueOnce(new ApiError("offline", 0));
    await c.mutate("backfill", "target", { date: "2026-10-15", periodLabel: "夜晚", endHour: 5, overwrite: false });
    expect(c.getState().notice).toMatchObject({ tone: "error", reconcile: true });
    expect(c.getState().notice?.toast).toBeUndefined();
    await c.load(); expect(c.getState().notice).toBeNull(); expect(deps.backfillQuickNote).toHaveBeenCalledOnce(); c.dispose();
  });
  it("clears completed feedback on content switch and rejects a late old-content result", async () => {
    const { deps, controller: c } = setup(); await c.loadConfig();
    await c.mutate("step2", note.id); expect(c.getState().notice?.toast).toBe("success");
    c.clearNotice(); expect(c.getState().notice).toBeNull();
    const write = deferred<void>(); deps.rerunQuickNote.mockReturnValueOnce(write.promise);
    const pending = c.mutate("step2", note.id); c.clearNotice(); write.resolve(); await pending;
    expect(c.getState().notice).toBeNull(); c.dispose();
  });
  it("loads candidate errors/empty states and retries only after another GET", async () => {
    const { deps, controller: c } = setup();
    deps.getIncomplete.mockRejectedValueOnce(new ApiError("bad", 503));
    await c.loadCandidates();
    expect(c.getState()).toMatchObject({ candidates: null, candidatesLoading: false, candidatesError: expect.any(String) });
    await c.loadCandidates();
    expect(c.getState()).toMatchObject({ candidates: [], candidatesError: null });
    expect(deps.backfillQuickNote).not.toHaveBeenCalled();
    c.dispose();
  });
  it("submits ordinary retry safely, keeps the date, and reports accepted rather than complete", async () => {
    const { deps, controller: c } = setup();
    await c.loadConfig();
    const input = { date: "2026-10-15", periodLabel: "夜晚", endHour: 5, overwrite: false };
    await c.mutate("backfill", "2026-10-15:5", input);
    expect(deps.backfillQuickNote).toHaveBeenCalledWith(input, expect.any(Object));
    expect(c.getState()).toMatchObject({ date: "2026-10-16", page: 1, notice: { tone: "info", text: "已提交补写请求", toast: "info" } });
    c.dispose();
  });
  it("passes explicit overwrite only when the confirmed input requests it", async () => {
    const { deps, controller: c } = setup();
    await c.loadConfig();
    const input = { date: "2026-10-15", periodLabel: "夜晚", endHour: 5, overwrite: true };
    await c.mutate("backfill", "target", input);
    expect(deps.backfillQuickNote.mock.calls[0][0].overwrite).toBe(true);
    c.dispose();
  });
  it.each(["step1", "step2", "delete"] as const)("wires %s and reports its distinct result", async (kind) => {
    const { deps, controller: c } = setup();
    await c.loadConfig();
    await c.mutate(kind, note.id);
    if (kind === "delete") expect(deps.deleteQuickNote).toHaveBeenCalledWith(note.id, expect.any(Object));
    else expect(deps.rerunQuickNote).toHaveBeenCalledWith(note.id, kind, expect.any(Object));
    expect(c.getState().notice?.text).toContain(kind === "delete" ? "已删除" : kind === "step1" ? "Step 1 已完成" : "Step 2 已完成");
    if (kind === "step1") expect(c.getState().notice?.description).toContain("原正文已清空");
    c.dispose();
  });
  it("reports Step 2 502 as incomplete and refreshes saved data", async () => {
    const { deps, controller: c } = setup();
    await c.loadConfig();
    deps.rerunQuickNote.mockRejectedValueOnce(new ApiError("private error", 502));
    await c.mutate("step2", note.id);
    expect(c.getState().notice).toMatchObject({ tone: "error", text: expect.stringContaining("502") });
    expect(c.getState().data?.items[0].output).toBe(note.output);
    expect(c.getState().notice?.text).not.toContain("private error");
    c.dispose();
  });
  it("reconciles uncertain writes and recovers failed reads without issuing another mutation", async () => {
    const { deps, controller: c } = setup();
    await c.loadConfig();
    deps.rerunQuickNote.mockRejectedValueOnce(new ApiError("lost", 0, null, "TIMEOUT"));
    deps.listQuickNotes.mockRejectedValueOnce(new ApiError("offline", 0));
    await c.mutate("step2", note.id);
    expect(c.getState().notice?.text).toContain("暂时无法确认");
    expect(c.getState().status).toBe("error");
    await c.load();
    expect(deps.rerunQuickNote).toHaveBeenCalledOnce();
    c.dispose();
  });
  it("reports accepted-but-unsynced results without repeating POST to recover GET", async () => {
    const { deps, controller: c } = setup();
    await c.loadConfig();
    deps.listQuickNotes.mockRejectedValueOnce(new ApiError("offline", 0));
    await c.mutate("backfill", "target", { date: "2026-10-15", periodLabel: "夜晚", endHour: 5, overwrite: false });
    expect(c.getState().notice?.text).toContain("重新读取失败");
    await c.load();
    expect(deps.backfillQuickNote).toHaveBeenCalledOnce();
    c.dispose();
  });
  it("clears old-date feedback and ignores the superseded write reconciliation", async () => {
    const { deps, controller: c } = setup();
    await c.loadConfig();
    const oldRead = deferred<QuickNotePage>();
    deps.listQuickNotes.mockReturnValueOnce(oldRead.promise);
    const mutation = c.mutate("step2", note.id);
    await Promise.resolve();
    await c.selectDate("2026-10-15");
    oldRead.resolve(page([]));
    await mutation;
    expect(c.getState()).toMatchObject({ date: "2026-10-15", notice: null });
    expect(c.getState().notice).toBeNull();
    c.dispose();
  });
  it("starts a fresh reconciliation after a write instead of sharing a pre-write read", async () => {
    const { deps, controller: c } = setup();
    await c.loadConfig();
    const waiting = deferred<QuickNotePage>();
    deps.listQuickNotes.mockReturnValueOnce(waiting.promise);
    const staleRead = c.load();
    const signal = deps.listQuickNotes.mock.lastCall?.[1].signal;
    const updated = { ...note, output: "重跑后完整正文" };
    deps.listQuickNotes.mockResolvedValueOnce(page([updated]));
    await c.mutate("step2", note.id);
    expect(signal.aborted).toBe(true);
    waiting.resolve(page([note]));
    await staleRead;
    expect(c.getState().data?.items).toEqual([updated]);
    expect(deps.rerunQuickNote).toHaveBeenCalledOnce();
    c.dispose();
  });
  it("keeps pending operations single-flight and aborts/ignores them on leaving the page", async () => {
    const { deps, controller: c } = setup();
    await c.loadConfig();
    const waiting = deferred<void>();
    deps.rerunQuickNote.mockReturnValueOnce(waiting.promise);
    const listener = vi.fn(); c.subscribe(listener);
    const writing = c.mutate("step1", note.id);
    expect(c.getState().pending).toEqual({ kind: "step1", target: note.id });
    await c.mutate("step1", note.id);
    expect(deps.rerunQuickNote).toHaveBeenCalledOnce();
    const signal = deps.rerunQuickNote.mock.calls[0][2].signal;
    c.dispose(); listener.mockClear(); waiting.resolve();
    await writing;
    expect(signal.aborted).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    expect(deps.listQuickNotes).toHaveBeenCalledTimes(1);
  });
});
