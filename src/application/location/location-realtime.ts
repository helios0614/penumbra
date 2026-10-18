import { openRealtimeEvents } from "@/application/realtime";
import type { RealtimeConnection } from "@/application/realtime";
import { WebSocketTransportError } from "@/lib/websocket";

export type LocationConnectionState = "connecting" | "connected" | "reconnecting" | "blocked";
export function createLocationRealtime(refresh: (reportedAt?: number | null) => void, hideKey: () => void, onState: (state: LocationConnectionState) => void,
  open = openRealtimeEvents, visible = () => typeof document === "undefined" || !document.hidden) {
  let disposed = false, attempt = 0, generation = 0;
  let abort: AbortController | null = null, connection: RealtimeConnection | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined, debounce: ReturnType<typeof setTimeout> | undefined;
  let reportedAt: number | null = null;
  const reconcile = (stamp?: number | null) => { if (!disposed && visible()) refresh(stamp); };
  const connect = async () => {
    const current = ++generation;
    abort = new AbortController(); onState(attempt ? "reconnecting" : "connecting");
    let blocked = false;
    try {
      const next = await open({ signal: abort.signal });
      if (disposed || current !== generation) { next.close(); return; }
      connection = next; attempt = 0; onState("connected"); reconcile();
      for await (const event of next.events) {
        if (disposed || current !== generation) return;
        if (event.type === "location-updated" && visible()) {
          if (event.reportedAt !== null) reportedAt = Math.max(reportedAt ?? 0, event.reportedAt);
          if (debounce === undefined) debounce = setTimeout(() => { debounce = undefined; const stamp = reportedAt; reportedAt = null; reconcile(stamp); }, 200);
        }
      }
      blocked = (await next.closed).code === 1008;
    } catch (error) { blocked = error instanceof WebSocketTransportError && error.closeCode === 1008; }
    finally {
      if (!disposed && current === generation) {
        connection?.close(); connection = null;
        if (blocked) onState("blocked");
        else { onState("reconnecting"); retry = setTimeout(() => void connect(), Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5))); }
      }
    }
  };
  const stop = () => { generation++; clearTimeout(retry); clearTimeout(debounce); debounce = undefined; reportedAt = null; abort?.abort(); connection?.close(); connection = null; };
  const visibility = () => { if (visible()) reconcile(); else { hideKey(); clearTimeout(debounce); debounce = undefined; reportedAt = null; } };
  // Config.active and quiet/no-key heartbeat writes have no broadcast. Never search POI automatically.
  const timer = setInterval(reconcile, 60_000);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", visibility);
  void connect();
  return {
    reconnect() { if (!disposed) { stop(); attempt = 0; void connect(); } },
    dispose() { disposed = true; stop(); clearInterval(timer); if (typeof document !== "undefined") document.removeEventListener("visibilitychange", visibility); },
  };
}
