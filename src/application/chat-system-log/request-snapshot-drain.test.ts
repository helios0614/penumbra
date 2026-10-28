import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequestSnapshotDrain } from "./request-snapshot-drain";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1000); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe("page-owned snapshot mailbox scheduling", () => {
  it("makes no idle reads, polls active send/regenerate at 2s, stops after grace, and restarts", async () => {
    const read = vi.fn(async () => 0), drain = createRequestSnapshotDrain(read);
    drain.resume(); await drain.drain(); await advance(600_000);
    expect(read).not.toHaveBeenCalled();
    const send = drain.start(), regenerate = drain.start();
    await advance(60_000); expect(read).toHaveBeenCalledTimes(30);
    send(); await advance(6000); expect(read).toHaveBeenCalledTimes(33);
    regenerate(); await advance(181_000);
    const settled = read.mock.calls.length;
    expect(settled - 33).toBeLessThanOrEqual(11);
    expect(vi.getTimerCount()).toBe(0);
    await advance(600_000); expect(read).toHaveBeenCalledTimes(settled);
    const next = drain.start(); await advance(200); expect(read).toHaveBeenCalledTimes(settled + 1); next();
  });
  it("collects consecutive captures and a second call 170s after main SSE, without any WS terminal", async () => {
    const mailbox: string[] = [], archived: string[] = [];
    const read = vi.fn(async () => { const records = mailbox.splice(0); archived.push(...records); return records.length; });
    const drain = createRequestSnapshotDrain(read), finish = drain.start();
    mailbox.push("main"); await advance(200);
    mailbox.push("during-stream"); await advance(2000);
    finish(); await advance(170_000);
    mailbox.push("late-tool-provider"); await advance(30_000);
    expect(archived).toEqual(["main", "during-stream", "late-tool-provider"]);
    expect(mailbox).toEqual([]);
    await advance(181_000); expect(vi.getTimerCount()).toBe(0);
    // A known later activity event can reopen demand after the bounded grace.
    mailbox.push("later-chain"); drain.request(); await advance(200);
    expect(archived[archived.length - 1]).toBe("later-chain");
  });
  it("coalesces event bursts, keeps one flight, and retains demand arriving during a read", async () => {
    let resolve!: (n: number) => void;
    const read = vi.fn(() => new Promise<number>(done => { resolve = done; }));
    const drain = createRequestSnapshotDrain(read), finish = drain.start();
    await advance(200);
    for (let n = 0; n < 100; n++) { drain.request(); void drain.drain(); }
    finish(); await advance(10_000); expect(read).toHaveBeenCalledOnce();
    resolve(1); await advance(0); await advance(1999); expect(read).toHaveBeenCalledOnce();
    await advance(1); expect(read).toHaveBeenCalledTimes(2);
    resolve(0); await advance(0);
  });
  it("performs the owed final read when tab suspension delays a timer beyond grace", async () => {
    let arrived = false;
    const read = vi.fn(async () => arrived ? 1 : 0), drain = createRequestSnapshotDrain(read);
    drain.start()(); await advance(200);
    arrived = true; vi.setSystemTime(Date.now() + 200_000);
    await advance(2000);
    expect(read).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
  });
  it("backs off network/5xx even under a dense event stream, and recovers", async () => {
    const times: number[] = [];
    const read = vi.fn(async () => { times.push(Date.now()); if (times.length <= 4) throw new Error("network/503"); return 0; });
    const drain = createRequestSnapshotDrain(read), finish = drain.start();
    for (let n = 0; n < 1000; n++) { drain.request(); await advance(100); }
    expect(times.slice(1, 5).map((time, index) => time - times[index])).toEqual([4000, 8000, 16_000, 30_000]);
    expect(times[5] - times[4]).toBe(2000); finish();
  });
  it.each(["unauthorized", "unavailable"] as const)("stops on %s; only auth can start a new identity", async result => {
    const read = vi.fn(async (): Promise<number | typeof result> => result);
    const drain = createRequestSnapshotDrain(read), finish = drain.start();
    await advance(200); finish(); drain.resume(); await advance(600_000);
    expect(read).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    read.mockResolvedValue(0); drain.start(); await advance(200);
    expect(read).toHaveBeenCalledTimes(result === "unauthorized" ? 2 : 1);
  });
});
