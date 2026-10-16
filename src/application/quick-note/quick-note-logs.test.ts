import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { QuickNoteLog, streamQuickNoteLogs } from "@/domain/quick-note";
import { createQuickNoteLogSubscription, type QuickNoteLogState } from "./quick-note-logs";

const entry: QuickNoteLog = { seq: 20, ts: 1792100000, level: "info", message: "── Step 1: 辅助模型压缩 ──" };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe("Quick Note feature log subscription", () => {
  it("retains timestamp, level, and raw text, deduplicates replay seams, and exposes only connection state", async () => {
    vi.useFakeTimers();
    const states: QuickNoteLogState[] = [];
    const stream = async function* (_signal: AbortSignal, connected: () => void) { connected(); yield entry; yield entry; yield { ...entry, seq: 21, message: "Step 2 速记完成 ✓", level: "success" }; };
    const sub = createQuickNoteLogSubscription((state) => states.push(state), stream);
    await vi.advanceTimersByTimeAsync(0);
    const state = states[states.length - 1]!;
    expect(state.entries).toHaveLength(2);
    expect(state.entries[0]).toEqual(entry);
    expect(state.entries[1].message).toBe("Step 2 速记完成 ✓");
    expect(Object.keys(state).sort()).toEqual(["connection", "entries"]);
    expect(state.connection).toBe("reconnecting");
    sub.dispose();
  });
  it("replays the server's current buffer after reconnection, including reset sequence numbers", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const states: QuickNoteLogState[] = [];
    const stream = async function* (_signal: AbortSignal, connected: () => void) {
      connected(); calls++;
      yield calls === 1 ? entry : { ...entry, seq: 1, ts: entry.ts + 100, message: "服务器重启后的 Step 1" };
    };
    const sub = createQuickNoteLogSubscription((state) => states.push(state), stream);
    await vi.advanceTimersByTimeAsync(0);
    expect(states[states.length - 1]?.entries[0].seq).toBe(20);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(2);
    expect(states[states.length - 1]?.entries).toEqual([{ ...entry, seq: 1, ts: entry.ts + 100, message: "服务器重启后的 Step 1" }]);
    sub.dispose();
  });
  it("backs off repeated connection failures and stops all retry timers on disposal", async () => {
    vi.useFakeTimers();
    const stream = vi.fn(async function* () { throw new Error("offline"); yield entry; });
    const listener = vi.fn();
    const sub = createQuickNoteLogSubscription(listener, stream);
    await vi.advanceTimersByTimeAsync(0);
    expect(stream).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(stream).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(stream).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(stream).toHaveBeenCalledTimes(3);
    sub.dispose(); listener.mockClear();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(stream).toHaveBeenCalledTimes(3);
    expect(listener).not.toHaveBeenCalled();
  });
  it("halts automatic retries after auth failure and supports explicit reconnect", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const stream = vi.fn(async function* (_signal: AbortSignal, connected: () => void) {
      if (++attempts === 1) throw new ApiError("unauthorized", 401);
      connected(); yield entry;
    });
    const states: QuickNoteLogState[] = [];
    const sub = createQuickNoteLogSubscription((state) => states.push(state), stream);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(stream).toHaveBeenCalledTimes(1);
    expect(states[states.length - 1]?.connection).toBe("error");
    sub.reconnect();
    await vi.advanceTimersByTimeAsync(0);
    expect(states[states.length - 1]?.entries).toEqual([entry]);
    sub.dispose();
  });
  it("aborts old subscriptions, rejects late emissions, and clears listeners when leaving", async () => {
    vi.useFakeTimers();
    const gate = deferred<void>();
    const signals: AbortSignal[] = [];
    let calls = 0;
    const stream: typeof streamQuickNoteLogs = async function* (signal, connected) {
      signals.push(signal); connected();
      const call = ++calls;
      if (call === 1) await gate.promise;
      yield { ...entry, message: call === 1 ? "过期日志" : "当前日志" };
      await gate.promise;
    };
    const listener = vi.fn();
    const sub = createQuickNoteLogSubscription(listener, stream);
    sub.reconnect();
    await vi.advanceTimersByTimeAsync(0);
    expect(signals[0].aborted).toBe(true);
    expect(listener.mock.lastCall?.[0].entries[0].message).toBe("当前日志");
    sub.dispose(); listener.mockClear(); gate.resolve();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(signals[1].aborted).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });
  it("keeps a live but silent connection connected, without assuming task completion or progress", async () => {
    vi.useFakeTimers();
    const gate = deferred<void>();
    const stream = async function* (_signal: AbortSignal, connected: () => void) { connected(); yield entry; await gate.promise; };
    const listener = vi.fn();
    const sub = createQuickNoteLogSubscription(listener, stream);
    await vi.advanceTimersByTimeAsync(0);
    listener.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(listener).not.toHaveBeenCalled();
    sub.dispose(); gate.resolve();
  });
});
