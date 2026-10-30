import { afterEach, describe, expect, it, vi } from "vitest";
import { createDiaryChatController } from "./diary-chat-controller";
import { DiaryEntryMissingError, type DiaryChatEntry, type DiaryMessage } from "@/domain/diary/diary-chat-types";
import type { DiaryReadOptions } from "@/domain/diary";

const entry = (id = "a"): DiaryChatEntry => ({ id, date: "2026-10-09", title: "日记", status: "writing" });
const messages = (entryId = "a", id = "m"): readonly DiaryMessage[] => [{ id, entryId, role: "user", content: "材料及原文", createdAt: 10, updatedAt: 0, drift: null, thinking: null }];
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function setup() {
  const deps = { getEntry: vi.fn(async (id: string, _options?: DiaryReadOptions) => entry(id)), getMessages: vi.fn(async (id: string, _options?: DiaryReadOptions) => messages(id)) };
  return { deps, controller: createDiaryChatController(deps) };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Diary Chat owner and snapshot lifecycle", () => {
  it("loads entry and complete history, supports empty history and manual refresh", async () => {
    const { controller: c, deps } = setup();
    const loading = c.open("a"); expect(c.getState().status).toBe("loading"); await loading;
    expect(c.getState()).toMatchObject({ status: "ready", entry: entry(), messages: messages(), loading: false });
    deps.getMessages.mockResolvedValueOnce([]); await c.refresh();
    expect(c.getState()).toMatchObject({ status: "empty", entry: entry(), messages: [] }); c.dispose();
  });
  it("separates entry-not-found from history failures and preserves a last successful snapshot", async () => {
    const { controller: c, deps } = setup();
    deps.getEntry.mockRejectedValueOnce(new DiaryEntryMissingError()); await c.open("a");
    expect(c.getState().status).toBe("missing"); expect(deps.getMessages).not.toHaveBeenCalled();
    deps.getMessages.mockRejectedValueOnce(new Error("history")); await c.refresh();
    expect(c.getState()).toMatchObject({ status: "error", entry: entry(), error: { source: "history" } });
    await c.refresh(); deps.getMessages.mockRejectedValueOnce(new Error("offline")); await c.refresh();
    expect(c.getState()).toMatchObject({ status: "error", messages: messages() }); c.dispose();
  });
  it("does not mix late entry/history results from different entries", async () => {
    const { controller: c, deps } = setup(); const late = deferred<readonly DiaryMessage[]>();
    deps.getMessages.mockReturnValueOnce(late.promise);
    const old = c.open("a"); await settle(); const signal = deps.getMessages.mock.calls[0][1]!.signal!;
    await c.open("b"); expect(signal.aborted).toBe(true); late.resolve(messages("a")); await old;
    expect(c.getState()).toMatchObject({ entryId: "b", entry: entry("b"), messages: messages("b") });
    const lateEntry = deferred<DiaryChatEntry>(); deps.getEntry.mockReturnValueOnce(lateEntry.promise);
    const older = c.open("c"); await c.open("d"); lateEntry.resolve(entry("c")); await older;
    expect(c.getState().entryId).toBe("d"); expect(deps.getMessages.mock.calls.map(([id]) => id)).not.toContain("c"); c.dispose();
  });
  it("a superseded manual read cannot overwrite the latest read of the same entry", async () => {
    const { controller: c, deps } = setup(); await c.open("a");
    const late = deferred<readonly DiaryMessage[]>(); deps.getMessages.mockReturnValueOnce(late.promise);
    const older = c.refresh(); await settle(); await c.refresh(); late.resolve(messages("a", "stale")); await older;
    expect(c.getState().messages?.[0].id).toBe("m"); c.dispose();
  });
  it("coalesces matching events, ignores Main/other entries and never starts polling", async () => {
    vi.useFakeTimers(); const { controller: c, deps } = setup(); await c.open("a");
    c.handleEvent({ type: "message-created", messageId: "main", conversationId: "a" });
    c.handleEvent({ type: "diary-message-created", messageId: "x", entryId: "b" });
    c.handleEvent({ type: "capability-invalidated", messageId: "heart", conversationId: null });
    await vi.advanceTimersByTimeAsync(1000); expect(deps.getMessages).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 20; i++) c.handleEvent({ type: "diary-message-created", messageId: `m${i}`, entryId: "a" });
    await vi.advanceTimersByTimeAsync(200); expect(deps.getMessages).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3600_000); expect(deps.getMessages).toHaveBeenCalledTimes(2); c.dispose();
  });
  it("coalesces invalidations received during a read into one follow-up snapshot", async () => {
    vi.useFakeTimers(); const { controller: c, deps } = setup(); await c.open("a");
    const late = deferred<readonly DiaryMessage[]>(); deps.getMessages.mockReturnValueOnce(late.promise);
    const refresh = c.refresh(); await settle();
    for (let i = 0; i < 20; i++) c.invalidate();
    await vi.advanceTimersByTimeAsync(500); expect(deps.getMessages).toHaveBeenCalledTimes(2);
    late.resolve(messages()); await refresh; await vi.advanceTimersByTimeAsync(200);
    expect(deps.getMessages).toHaveBeenCalledTimes(3); c.dispose(); expect(vi.getTimerCount()).toBe(0);
  });
  it("deletion cancels reads and prevents a late snapshot from resurrecting the entry", async () => {
    vi.useFakeTimers(); const { controller: c, deps } = setup(); await c.open("a");
    const late = deferred<readonly DiaryMessage[]>(); deps.getMessages.mockReturnValueOnce(late.promise);
    const refresh = c.refresh(); await settle();
    c.handleEvent({ type: "diary-entry-deleted", entryId: "b" }); expect(c.getState().status).not.toBe("missing");
    c.handleEvent({ type: "diary-entry-deleted", entryId: "a" }); late.resolve(messages()); await refresh;
    c.handleEvent({ type: "diary-message-created", entryId: "a", messageId: "late" }); await vi.advanceTimersByTimeAsync(1000);
    expect(c.getState()).toMatchObject({ status: "missing", messages: null, error: { source: "deleted" } }); expect(deps.getMessages).toHaveBeenCalledTimes(2); c.dispose();
  });
  it("dispose aborts outstanding work, removes listeners and queued invalidations", async () => {
    vi.useFakeTimers(); const { controller: c, deps } = setup(); const late = deferred<DiaryChatEntry>(); deps.getEntry.mockReturnValueOnce(late.promise);
    const listener = vi.fn(); c.subscribe(listener); const read = c.open("a"); c.invalidate();
    c.dispose(); const count = listener.mock.calls.length; late.resolve(entry()); await read; await vi.advanceTimersByTimeAsync(1000);
    c.invalidate(); await c.open("b"); await c.refresh();
    expect(listener).toHaveBeenCalledTimes(count); expect(deps.getMessages).not.toHaveBeenCalled(); expect(deps.getEntry.mock.calls[0][1]!.signal!.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
});
