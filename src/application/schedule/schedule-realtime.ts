import { openRealtimeEvents, type RealtimeConnection, type RealtimeEvent } from "@/application/realtime";
import { WebSocketTransportError } from "@/lib/websocket";

export type AlarmNotice = Extract<RealtimeEvent, { type: "schedule-alarm" }>;
export interface ScheduleRealtimeState {
  readonly revision: number;
  readonly connection: "connecting" | "connected" | "reconnecting" | "blocked";
  readonly alarms: readonly AlarmNotice[];
}
export const initialScheduleRealtime: ScheduleRealtimeState = { revision: 0, connection: "connecting", alarms: [] };

/** One feature-owned subscription at the app root, independent of the open page. */
export function createScheduleRealtime(open = openRealtimeEvents) {
  let snapshot = initialScheduleRealtime, disposed = false, generation = 0, attempt = 0;
  const seen = new Set<string>(), listeners = new Set<(value: ScheduleRealtimeState) => void>();
  let abort: AbortController | null = null, connection: RealtimeConnection | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined, debounce: ReturnType<typeof setTimeout> | undefined;
  const publish = (change: Partial<ScheduleRealtimeState>) => { if (!disposed) { snapshot = { ...snapshot, ...change }; listeners.forEach((fn) => fn(snapshot)); } };
  const invalidate = () => publish({ revision: snapshot.revision + 1 });
  const connect = async () => {
    const current = ++generation;
    abort = new AbortController(); publish({ connection: attempt ? "reconnecting" : "connecting" });
    let blocked = false;
    try {
      const next = await open({ signal: abort.signal });
      if (disposed || current !== generation) { next.close(); return; }
      connection = next; attempt = 0; publish({ connection: "connected" }); invalidate();
      for await (const event of next.events) {
        if (disposed || current !== generation) return;
        if (event.type === "schedule-changed" || event.type === "schedule-alarm") {
          if (debounce === undefined) debounce = setTimeout(() => { debounce = undefined; invalidate(); }, 150);
        }
        if (event.type === "schedule-alarm") {
          const key = JSON.stringify([event.id, event.triggerAt]);
          if (!seen.has(key)) {
            seen.add(key);
            if (seen.size > 512) seen.delete(seen.values().next().value!);
            publish({ alarms: [...snapshot.alarms, event] });
          }
        }
      }
      blocked = (await next.closed).code === 1008;
    } catch (error) { blocked = error instanceof WebSocketTransportError && error.closeCode === 1008; }
    finally {
      if (!disposed && current === generation) {
        connection?.close(); connection = null;
        if (blocked) publish({ connection: "blocked" });
        else { publish({ connection: "reconnecting" }); retry = setTimeout(() => void connect(), Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5))); }
      }
    }
  };
  const stop = () => { generation++; clearTimeout(retry); clearTimeout(debounce); debounce = undefined; abort?.abort(); connection?.close(); connection = null; };
  const visible = () => { if (!document.hidden) invalidate(); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", visible);
  void connect();
  return {
    getState: () => snapshot,
    subscribe(fn: (value: ScheduleRealtimeState) => void) { listeners.add(fn); fn(snapshot); return () => { listeners.delete(fn); }; },
    dismissAlarm() { publish({ alarms: snapshot.alarms.slice(1) }); },
    reconnect() { if (!disposed) { stop(); attempt = 0; void connect(); } },
    dispose() { disposed = true; stop(); listeners.clear(); if (typeof document !== "undefined") document.removeEventListener("visibilitychange", visible); },
  };
}
