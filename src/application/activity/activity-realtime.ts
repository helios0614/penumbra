import { openRealtimeEvents, type RealtimeConnection } from "@/application/realtime";
import { WebSocketTransportError } from "@/lib/websocket";

export interface ActivitySyncActions {
  readonly invalidateLogs: () => void;
  readonly refreshRecent: () => void;
  readonly refreshPhone: () => void;
  readonly refreshConfig: () => void;
  readonly restored: () => void;
}
export type ActivityConnectionState = "connecting" | "connected" | "reconnecting" | "blocked";

export function createActivityRealtime(actions: ActivitySyncActions, onState: (value: ActivityConnectionState) => void,
  open = openRealtimeEvents, visible = () => typeof document === "undefined" || !document.hidden) {
  let disposed = false, attempt = 0, generation = 0;
  let abort: AbortController | null = null, connection: RealtimeConnection | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const connect = async () => {
    const current = ++generation;
    abort = new AbortController();
    onState(attempt ? "reconnecting" : "connecting");
    let authBlocked = false;
    try {
      const next = await open({ signal: abort.signal });
      if (disposed || generation !== current) { next.close(); return; }
      connection = next; attempt = 0;
      onState("connected");
      actions.restored(); // Also reconciles the initial GET/WS subscription boundary.
      for await (const event of next.events) {
        if (disposed || generation !== current) return;
        if (event.type === "activity-log" && visible()) actions.invalidateLogs();
        if (event.type === "activity-config-changed") actions.refreshConfig();
      }
      authBlocked = (await next.closed).code === 1008;
    } catch (error) {
      authBlocked = error instanceof WebSocketTransportError && error.closeCode === 1008;
    } finally {
      if (!disposed && generation === current) {
        connection?.close(); connection = null;
        if (authBlocked) onState("blocked");
        else {
          onState("reconnecting");
          retry = setTimeout(() => void connect(), Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5)));
        }
      }
    }
  };
  const stopConnection = () => {
    generation++; clearTimeout(retry); abort?.abort(); connection?.close(); connection = null;
  };
  const resume = () => {
    if (!visible() || disposed) return;
    actions.restored();
  };
  // PC polls can be persisted without a broadcast. Always reconcile complete snapshots.
  const logsTimer = setInterval(() => { if (visible()) actions.refreshRecent(); }, 60_000);
  const phoneTimer = setInterval(() => { if (visible()) actions.refreshPhone(); }, 30_000);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", resume);
  void connect();
  return {
    reconnect() { if (!disposed) { stopConnection(); attempt = 0; void connect(); } },
    dispose() {
      disposed = true; stopConnection(); clearInterval(logsTimer); clearInterval(phoneTimer);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", resume);
    },
  };
}
