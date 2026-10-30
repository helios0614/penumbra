import { openRealtimeEvents, type RealtimeConnection } from "@/application/realtime";
import { WebSocketTransportError } from "@/lib/websocket";
import type { DiaryChatController } from "./diary-chat-controller";

export type DiaryChatConnectionState = "connecting" | "connected" | "reconnecting" | "blocked";

/** Only subscribes while a Diary Chat page owns this session. No history polling. */
export function createDiaryChatRealtime(controller: Pick<DiaryChatController, "invalidate" | "handleEvent">,
  onState: (state: DiaryChatConnectionState) => void, open = openRealtimeEvents) {
  let disposed = false, generation = 0, attempt = 0;
  let abort: AbortController | null = null, connection: RealtimeConnection | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  async function connect() {
    const current = ++generation;
    abort = new AbortController(); onState(attempt ? "reconnecting" : "connecting");
    let blocked = false;
    try {
      const next = await open({ signal: abort.signal });
      if (disposed || generation !== current) { next.close(); return; }
      connection = next; attempt = 0; onState("connected");
      controller.invalidate(); // Reconcile the GET/subscription gap once, also on reconnect.
      for await (const event of next.events) {
        if (disposed || generation !== current) return;
        controller.handleEvent(event);
      }
      blocked = (await next.closed).code === 1008;
    } catch (error) {
      blocked = error instanceof WebSocketTransportError && error.closeCode === 1008;
    } finally {
      if (!disposed && generation === current) {
        connection?.close(); connection = null;
        onState(blocked ? "blocked" : "reconnecting");
        if (!blocked) retry = setTimeout(() => void connect(), Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5)));
      }
    }
  }
  void connect();
  return { dispose() { disposed = true; ++generation; clearTimeout(retry); abort?.abort(); connection?.close(); connection = null; } };
}
