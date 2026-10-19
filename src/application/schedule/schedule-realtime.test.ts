import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapRealtimeEvent, type RealtimeConnection, type RealtimeEvent } from "@/application/realtime";
import { planRealtimeReconciliation } from "@/application/realtime-reconciliation";
import { WebSocketTransportError } from "@/lib/websocket";
import { createScheduleRealtime } from "./schedule-realtime";
import { createScheduleController } from "./schedule-controller";

function channel(code = 1006) {
  let done = false, waiting: ((result: IteratorResult<RealtimeEvent>) => void) | null = null;
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
  return { connection, finish, push(event: RealtimeEvent) { if (waiting) { const resolve = waiting; waiting = null; resolve({ done: false, value: event }); } else queue.push(event); } };
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const alarm = { type: "schedule-alarm", id: "sch_a", content: "休息", triggerAt: "2026-10-19 22:00" } as const;
const subscriptions: ReturnType<typeof createScheduleRealtime>[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { subscriptions.forEach((value) => value.dispose()); subscriptions.length = 0; vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("schedule realtime contracts", () => {
  it("maps invalidation, real alarm fields and reserved monitor compatibility without changing chat", () => {
    const changed = mapRealtimeEvent({ type: "schedule_changed" });
    expect(changed).toEqual({ type: "schedule-changed" });
    const triggered = mapRealtimeEvent({ type: "schedule_alarm", data: { id: alarm.id, content: alarm.content, trigger_at: alarm.triggerAt } });
    expect(triggered).toEqual(alarm);
    const monitor = mapRealtimeEvent({ type: "monitor_alert", data: { content: "查岗" } });
    expect(monitor).toEqual({ type: "monitor-alert", content: "查岗" });
    for (const event of [changed, triggered, monitor]) expect(planRealtimeReconciliation(event).kind).toBe("ignore");
  });
  it.each([{ type: "schedule_alarm", data: {} }, { type: "schedule_alarm", data: { id: "a", content: null, trigger_at: "bad" } }, { type: "monitor_alert" }])("isolates malformed legacy notices without breaking the shared stream", (event) => {
    expect(mapRealtimeEvent(event)).toEqual({ type: "unknown", rawType: event.type });
  });
});

describe("root-owned schedule synchronization", () => {
  it("refreshes server data after AI invalidation and after reconnect, including an event lost while offline", async () => {
    const first = channel(), second = channel(); let rows: unknown[] = [];
    const fetch = vi.fn(async () => new Response(JSON.stringify(rows), { headers: { "Content-Type": "application/json" } })); vi.stubGlobal("fetch", fetch);
    const controller = createScheduleController("reminder");
    const runtime = createScheduleRealtime(vi.fn().mockResolvedValueOnce(first.connection).mockResolvedValueOnce(second.connection)); subscriptions.push(runtime);
    let revision = -1;
    const unsubscribe = runtime.subscribe((state) => { if (state.revision !== revision) { revision = state.revision; void controller.refresh(); } });
    await flush(); expect(controller.getState().items).toEqual([]);
    rows = [{ id: "ai", type: "reminder", status: "active", content: "AI 新建的关注", trigger_at: "2020-01-01", created_at: 10 }];
    first.push({ type: "schedule-changed" }); first.push({ type: "schedule-changed" }); await flush();
    const before = fetch.mock.calls.length; await vi.advanceTimersByTimeAsync(150); await flush();
    expect(fetch).toHaveBeenCalledTimes(before + 1); expect(controller.getState().items[0].id).toBe("ai");
    first.finish(); await flush(); rows = []; await vi.advanceTimersByTimeAsync(1000); await flush();
    expect(runtime.getState().connection).toBe("connected"); expect(controller.getState().items).toEqual([]);
    unsubscribe(); controller.dispose();
  });
  it("receives alarms without an open page and deduplicates across page changes and reconnects", async () => {
    const first = channel(), second = channel();
    const runtime = createScheduleRealtime(vi.fn().mockResolvedValueOnce(first.connection).mockResolvedValueOnce(second.connection)); subscriptions.push(runtime); await flush();
    first.push(alarm); first.push(alarm); await flush(); expect(runtime.getState().alarms).toEqual([alarm]);
    const page = vi.fn(); const unsubscribe = runtime.subscribe(page); unsubscribe(); runtime.dismissAlarm();
    first.finish(); await flush(); await vi.advanceTimersByTimeAsync(1000); second.push(alarm); await flush();
    expect(runtime.getState().alarms).toEqual([]);
    second.push({ ...alarm, id: "sch_b" }); await flush(); expect(runtime.getState().alarms[0].id).toBe("sch_b");
    expect(page).toHaveBeenCalledOnce();
  });
  it("backs off and blocks authentication failures until explicit reconnection", async () => {
    const socket = channel(); const open = vi.fn().mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new WebSocketTransportError("auth", "CLOSED_BEFORE_OPEN", 1008)).mockResolvedValue(socket.connection);
    const runtime = createScheduleRealtime(open); subscriptions.push(runtime); await flush();
    expect(runtime.getState().connection).toBe("reconnecting"); await vi.advanceTimersByTimeAsync(1000);
    expect(runtime.getState().connection).toBe("blocked"); await vi.advanceTimersByTimeAsync(60_000); expect(open).toHaveBeenCalledTimes(2);
    runtime.reconnect(); await flush(); expect(open).toHaveBeenCalledTimes(3); expect(runtime.getState().revision).toBe(1);
  });
  it("also recognizes policy closure after an established connection", async () => {
    const socket = channel(1008), open = vi.fn().mockResolvedValue(socket.connection);
    const runtime = createScheduleRealtime(open); subscriptions.push(runtime); await flush(); socket.finish(); await flush();
    expect(runtime.getState().connection).toBe("blocked"); await vi.advanceTimersByTimeAsync(60_000); expect(open).toHaveBeenCalledOnce();
  });
  it("rechecks on visibility restore and removes pending invalidations, timers and subscriptions on disposal", async () => {
    const document = new EventTarget(); let hidden = true;
    Object.defineProperty(document, "hidden", { get: () => hidden }); vi.stubGlobal("document", document);
    const socket = channel(), open = vi.fn().mockResolvedValue(socket.connection);
    const runtime = createScheduleRealtime(open); subscriptions.push(runtime); const listener = vi.fn(); runtime.subscribe(listener); await flush();
    const revision = runtime.getState().revision;
    document.dispatchEvent(new Event("visibilitychange")); expect(runtime.getState().revision).toBe(revision);
    hidden = false; document.dispatchEvent(new Event("visibilitychange")); expect(runtime.getState().revision).toBe(revision + 1);
    socket.push({ type: "schedule-changed" }); await flush(); runtime.dispose(); const calls = listener.mock.calls.length;
    document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(60_000);
    expect(listener).toHaveBeenCalledTimes(calls); expect(open).toHaveBeenCalledOnce(); expect(socket.connection.close).toHaveBeenCalled();
  });
  it("closes a connection arriving after the app runtime is disposed", async () => {
    const socket = channel(); let resolve!: (value: RealtimeConnection) => void;
    const runtime = createScheduleRealtime(() => new Promise((done) => { resolve = done; })); subscriptions.push(runtime);
    runtime.dispose(); resolve(socket.connection); await flush(); expect(socket.connection.close).toHaveBeenCalled(); expect(runtime.getState().revision).toBe(0);
  });
});
