import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapRealtimeEvent, RealtimeContractError, type RealtimeConnection, type RealtimeEvent } from "@/application/realtime";
import { planRealtimeReconciliation } from "@/application/realtime-reconciliation";
import { WebSocketTransportError } from "@/lib/websocket";
import { createLocationRealtime } from "./location-realtime";

function channel(code = 1006) {
  let done = false, waiting: ((value: IteratorResult<RealtimeEvent>) => void) | null = null;
  const queue: RealtimeEvent[] = [];
  const finish = () => { done = true; waiting?.({ done: true, value: undefined }); waiting = null; };
  const connection: RealtimeConnection = {
    events: { [Symbol.asyncIterator]: () => ({ next: () => {
      if (queue.length) return Promise.resolve({ done: false as const, value: queue.shift()! });
      if (done) return Promise.resolve({ done: true as const, value: undefined });
      return new Promise<IteratorResult<RealtimeEvent>>((resolve) => { waiting = resolve; });
    } }) },
    closed: Promise.resolve({ code, reason: "", wasClean: false, initiatedLocally: false }), close: vi.fn(finish),
  };
  return { connection, finish, push(event: RealtimeEvent) {
    if (waiting) { const resolve = waiting; waiting = null; resolve({ done: false, value: event }); } else queue.push(event);
  } };
}
const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
const subscriptions: ReturnType<typeof createLocationRealtime>[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { subscriptions.forEach((sync) => sync.dispose()); subscriptions.length = 0; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Location realtime invalidation", () => {
  it("accepts partial broadcasts as invalidations with only time metadata and leaves chat history unchanged", () => {
    for (const data of [{}, { lng: 116.4, nearby_pois: null }, { address: "private-location", updated_at: 123 }]) {
      const event = mapRealtimeEvent({ type: "location_update", data });
      expect(event).toEqual({ type: "location-updated", reportedAt: "updated_at" in data ? data.updated_at : null });
      expect(planRealtimeReconciliation(event)).toEqual({ kind: "ignore", rawType: "location_update" });
    }
    expect(() => mapRealtimeEvent({ type: "location_update", data: null })).toThrow(RealtimeContractError);
  });
  it("reconciles connection boundaries, batches notifications and refreshes again after reconnect", async () => {
    const first = channel(), second = channel(), refresh = vi.fn(), onState = vi.fn();
    const open = vi.fn().mockResolvedValueOnce(first.connection).mockResolvedValueOnce(second.connection);
    subscriptions.push(createLocationRealtime(refresh, vi.fn(), onState, open)); await flush();
    expect(refresh).toHaveBeenCalledTimes(1);
    first.push({ type: "location-updated", reportedAt: 123 }); first.push({ type: "location-updated", reportedAt: 124 }); first.push({ type: "unknown", rawType: "location_check" });
    await flush(); await vi.advanceTimersByTimeAsync(200); expect(refresh).toHaveBeenCalledTimes(2); expect(refresh).toHaveBeenLastCalledWith(124);
    first.finish(); await flush(); await vi.advanceTimersByTimeAsync(1000);
    expect(open).toHaveBeenCalledTimes(2); expect(refresh).toHaveBeenCalledTimes(3); expect(onState).toHaveBeenLastCalledWith("connected");
  });
  it("does not poll or react to events while hidden, hides keys, and reloads on return", async () => {
    const document = new EventTarget(); let hidden = false;
    Object.defineProperty(document, "hidden", { get: () => hidden }); vi.stubGlobal("document", document);
    const refresh = vi.fn(), hide = vi.fn(), socket = channel();
    const sync = createLocationRealtime(refresh, hide, vi.fn(), vi.fn().mockResolvedValue(socket.connection)); subscriptions.push(sync);
    await flush(); hidden = true; document.dispatchEvent(new Event("visibilitychange"));
    socket.push({ type: "location-updated", reportedAt: null }); await flush(); await vi.advanceTimersByTimeAsync(120_000);
    expect(refresh).toHaveBeenCalledTimes(1); expect(hide).toHaveBeenCalledOnce();
    hidden = false; document.dispatchEvent(new Event("visibilitychange")); expect(refresh).toHaveBeenCalledTimes(2);
    sync.dispose(); document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(120_000);
    expect(refresh).toHaveBeenCalledTimes(2); expect(socket.connection.close).toHaveBeenCalled();
  });
  it("stops authentication retries until manual reconnect and ignores late openings after disposal", async () => {
    const refresh = vi.fn(), socket = channel(), onState = vi.fn();
    const open = vi.fn().mockRejectedValueOnce(new WebSocketTransportError("auth", "CLOSED_BEFORE_OPEN", 1008)).mockResolvedValue(socket.connection);
    const sync = createLocationRealtime(refresh, vi.fn(), onState, open); subscriptions.push(sync); await flush();
    expect(onState).toHaveBeenLastCalledWith("blocked"); await vi.advanceTimersByTimeAsync(30_000); expect(open).toHaveBeenCalledTimes(1);
    sync.reconnect(); await flush(); expect(refresh).toHaveBeenCalledOnce();
    let resolve!: (value: RealtimeConnection) => void;
    const pending = new Promise<RealtimeConnection>((done) => { resolve = done; });
    const late = channel(), lateRefresh = vi.fn(), second = createLocationRealtime(lateRefresh, vi.fn(), vi.fn(), () => pending);
    second.dispose(); resolve(late.connection); await flush(); expect(lateRefresh).not.toHaveBeenCalled(); expect(late.connection.close).toHaveBeenCalled();
  });
});
