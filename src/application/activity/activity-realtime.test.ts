import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapRealtimeEvent, RealtimeContractError, type RealtimeConnection, type RealtimeEvent } from "@/application/realtime";
import { planRealtimeReconciliation } from "@/application/realtime-reconciliation";
import { WebSocketTransportError, type WebSocketCloseInfo } from "@/lib/websocket";
import { createActivityRealtime, type ActivitySyncActions } from "./activity-realtime";

function channel(code = 1006) {
  let done = false;
  const queue: RealtimeEvent[] = [];
  let waiting: ((result: IteratorResult<RealtimeEvent>) => void) | null = null;
  const finish = () => { done = true; waiting?.({ done: true, value: undefined }); waiting = null; };
  const connection: RealtimeConnection = {
    events: { [Symbol.asyncIterator]: () => ({ next: () => {
      if (queue.length) return Promise.resolve({ done: false as const, value: queue.shift()! });
      if (done) return Promise.resolve({ done: true as const, value: undefined });
      return new Promise<IteratorResult<RealtimeEvent>>((resolve) => { waiting = resolve; });
    } }) },
    closed: Promise.resolve({ code, reason: "", wasClean: false, initiatedLocally: false } satisfies WebSocketCloseInfo), close: vi.fn(finish),
  };
  return { connection, finish, push(event: RealtimeEvent) { if (waiting) { const resolve = waiting; waiting = null; resolve({ done: false, value: event }); } else queue.push(event); } };
}
const actions = (): ActivitySyncActions => ({ invalidateLogs: vi.fn(), refreshRecent: vi.fn(), refreshPhone: vi.fn(), refreshConfig: vi.fn(), restored: vi.fn() });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const subscriptions: ReturnType<typeof createActivityRealtime>[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { subscriptions.forEach((value) => value.dispose()); subscriptions.length = 0; vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Activity realtime business adapter", () => {
  it("projects only invalidation metadata, never treating the broadcast PC name as a stored row", () => {
    const event = mapRealtimeEvent({ type: "activity_log", data: { timestamp: 1000, time: "00:16:40", date: "2026-10-17", device: "pc", app: "chrome.exe", title: "private window" } });
    expect(event).toEqual({ type: "activity-log", timestamp: 1000, device: "pc" });
    expect(JSON.stringify(event)).not.toContain("private");
    expect(planRealtimeReconciliation(event)).toEqual({ kind: "ignore", rawType: "activity_log" });
  });
  it("separately adapts the legacy flag without making it the phone permission switch", () => {
    const event = mapRealtimeEvent({ type: "activity_config_changed", data: { activity_tracking_enabled: false } });
    expect(event).toEqual({ type: "activity-config-changed", enabled: false });
    expect(planRealtimeReconciliation(event).kind).toBe("ignore");
  });
  it.each([{ type: "activity_log", data: {} }, { type: "activity_config_changed", data: { activity_tracking_enabled: "false" } }])("rejects malformed known business notifications", (event) => expect(() => mapRealtimeEvent(event)).toThrow(RealtimeContractError));
});

describe("Activity synchronization lifecycle", () => {
  it("reconciles initial connection, invalidates activity, then rechecks after reconnect", async () => {
    const first = channel(), second = channel(), callbacks = actions(), onState = vi.fn();
    const open = vi.fn().mockResolvedValueOnce(first.connection).mockResolvedValueOnce(second.connection);
    subscriptions.push(createActivityRealtime(callbacks, onState, open)); await flush();
    expect(callbacks.restored).toHaveBeenCalledTimes(1);
    first.push({ type: "activity-log", timestamp: 1000, device: "pc" }); first.push({ type: "activity-config-changed", enabled: false }); await flush();
    expect(callbacks.invalidateLogs).toHaveBeenCalledTimes(1); expect(callbacks.refreshConfig).toHaveBeenCalledTimes(1);
    first.finish(); await flush(); await vi.advanceTimersByTimeAsync(1000);
    expect(open).toHaveBeenCalledTimes(2); expect(callbacks.restored).toHaveBeenCalledTimes(2);
    expect(onState).toHaveBeenLastCalledWith("connected");
  });
  it("uses low-frequency reads for persisted PC samples without requiring a broadcast", async () => {
    const callbacks = actions(), socket = channel(); subscriptions.push(createActivityRealtime(callbacks, vi.fn(), vi.fn().mockResolvedValue(socket.connection)));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(callbacks.refreshPhone).toHaveBeenCalledTimes(2); expect(callbacks.refreshRecent).toHaveBeenCalledTimes(1);
  });
  it("backs off failed openings and stops authentication failures until a manual reconnect", async () => {
    const callbacks = actions(), socket = channel();
    const open = vi.fn().mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new WebSocketTransportError("auth", "CLOSED_BEFORE_OPEN", 1008)).mockResolvedValue(socket.connection);
    const onState = vi.fn(); const sync = createActivityRealtime(callbacks, onState, open); subscriptions.push(sync);
    await flush(); await vi.advanceTimersByTimeAsync(1000); expect(onState).toHaveBeenLastCalledWith("blocked");
    await vi.advanceTimersByTimeAsync(120_000); expect(open).toHaveBeenCalledTimes(2);
    sync.reconnect(); await flush(); expect(open).toHaveBeenCalledTimes(3); expect(callbacks.restored).toHaveBeenCalledTimes(1);
  });
  it("rechecks on visibility restoration and removes listeners/timers on unmount", async () => {
    const document = new EventTarget(); let hidden = true;
    Object.defineProperty(document, "hidden", { get: () => hidden }); vi.stubGlobal("document", document);
    const callbacks = actions(), socket = channel(); const sync = createActivityRealtime(callbacks, vi.fn(), vi.fn().mockResolvedValue(socket.connection)); subscriptions.push(sync);
    await flush(); await vi.advanceTimersByTimeAsync(60_000); expect(callbacks.refreshRecent).not.toHaveBeenCalled();
    hidden = false; document.dispatchEvent(new Event("visibilitychange")); expect(callbacks.restored).toHaveBeenCalledTimes(2);
    sync.dispose(); document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(120_000);
    expect(callbacks.restored).toHaveBeenCalledTimes(2); expect(callbacks.refreshPhone).not.toHaveBeenCalled(); expect(socket.connection.close).toHaveBeenCalled();
  });
  it("closes a connection that arrives after disposal without subscribing or publishing", async () => {
    const socket = channel(); let resolve!: (value: RealtimeConnection) => void;
    const open = vi.fn(() => new Promise<RealtimeConnection>((done) => { resolve = done; }));
    const callbacks = actions(), onState = vi.fn(); const sync = createActivityRealtime(callbacks, onState, open); subscriptions.push(sync);
    sync.dispose(); resolve(socket.connection); await flush();
    expect(socket.connection.close).toHaveBeenCalled(); expect(callbacks.restored).not.toHaveBeenCalled(); expect(onState).toHaveBeenCalledTimes(1);
  });
});
