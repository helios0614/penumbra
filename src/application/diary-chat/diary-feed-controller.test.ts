import { describe, expect, it, vi } from "vitest";
import { createDiaryFeedController } from "./diary-feed-controller";
import type { DiaryFeedResult } from "@/domain/diary/diary-feed-client";

describe("calendar local manual feed", () => {
  it("uses any selected business date, guards only the POST, retains its real ID and reads index exactly once", async () => {
    let resolve!: (value: DiaryFeedResult) => void;
    const start = vi.fn((_date: string, _replace: boolean, _signal: AbortSignal) => new Promise<DiaryFeedResult>(yes => { resolve = yes; }));
    const refresh = vi.fn(async () => false), c = createDiaryFeedController(refresh, start);
    const task = c.start("2020-01-02"); await c.start("2026-10-30"); expect(start).toHaveBeenCalledOnce();
    resolve({ kind: "started", entryId: "exact-real-id" }); await task;
    expect(start.mock.calls[0].slice(0, 2)).toEqual(["2020-01-02", false]); expect(refresh).toHaveBeenCalledOnce();
    expect(c.getState()).toMatchObject({ busyDate: null, notices: { "2020-01-02": { kind: "started", entryId: "exact-real-id" } } }); c.dispose();
  });
  it("draft continuation needs no second POST and replacement requires the exact confirmed draft", async () => {
    const start = vi.fn(async (_date: string, _replace: boolean, _signal: AbortSignal): Promise<DiaryFeedResult> => ({ kind: "draft", entryId: "old" }));
    const c = createDiaryFeedController(vi.fn(async () => true), start);
    await c.replaceConfirmed("2020-01-02", "old"); expect(start).not.toHaveBeenCalled();
    await c.start("2020-01-02"); expect(c.getState().notices["2020-01-02"].entryId).toBe("old");
    await c.replaceConfirmed("2020-01-02", "wrong"); expect(start).toHaveBeenCalledOnce();
    await c.replaceConfirmed("2020-01-02", "old"); expect(start.mock.calls.map(c => c[1])).toEqual([false, true]); c.dispose();
  });
  it("unknown POST results do one read and never retry/replace; refusal also keeps defaults", async () => {
    const start = vi.fn(async (_date: string, _replace: boolean, _signal: AbortSignal): Promise<DiaryFeedResult> => { throw new Error("disconnect"); });
    const refresh = vi.fn(async () => { throw new Error("read offline"); }), c = createDiaryFeedController(refresh, start);
    await c.start("2020-01-02"); expect(c.getState()).toMatchObject({ busyDate: null, notices: { "2020-01-02": { kind: "uncertain" } } });
    expect(start).toHaveBeenCalledOnce(); expect(refresh).toHaveBeenCalledOnce();
    start.mockResolvedValueOnce({ kind: "refused" }); await c.start("2020-01-03"); expect(start.mock.calls.map(c => c[1])).toEqual([false, false]); c.dispose();
  });
  it("disposing aborts POST and suppresses late receipts and refresh", async () => {
    let resolve!: (value: DiaryFeedResult) => void;
    const start = vi.fn((_date: string, _replace: boolean, _signal: AbortSignal) => new Promise<DiaryFeedResult>(yes => { resolve = yes; }));
    const refresh = vi.fn(), c = createDiaryFeedController(refresh, start), listener = vi.fn(); c.subscribe(listener);
    const task = c.start("2020-01-02"); c.dispose(); const calls = listener.mock.calls.length;
    resolve({ kind: "started", entryId: "late" }); await task;
    expect(start.mock.calls[0][2].aborted).toBe(true); expect(listener).toHaveBeenCalledTimes(calls); expect(refresh).not.toHaveBeenCalled();
  });
});
