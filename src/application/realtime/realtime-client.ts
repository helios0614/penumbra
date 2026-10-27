import { observeDebugRealtime } from "@/application/chat-system-log/chat-system-log-client";
import { mapRealtimeEvent } from "@/application/realtime/realtime-events";
import {
  RealtimeDataError,
  type OpenRealtimeEventsOptions,
  type RealtimeConnection,
  type RealtimeEvent,
} from "@/application/realtime/realtime-types";
import { runtimeConfig } from "@/lib/runtime-config";
import { openWebSocketConnection } from "@/lib/websocket";

export function openRealtimeEvents(
  options: OpenRealtimeEventsOptions = {},
): Promise<RealtimeConnection> {
  return openWebSocketConnection<RealtimeEvent>(runtimeConfig.websocketUrl, {
    parseMessage: parseRealtimeMessageData,
    signal: options.signal,
    openTimeoutMs: options.openTimeoutMs,
  });
}

export function parseRealtimeMessageData(data: unknown): RealtimeEvent {
  if (typeof data !== "string") {
    throw new RealtimeDataError(
      "Realtime WebSocket message must be JSON text",
    );
  }

  let input: unknown;
  try {
    input = JSON.parse(data) as unknown;
  } catch {
    throw new RealtimeDataError(
      "Realtime WebSocket message is not valid JSON",
    );
  }

  try { observeDebugRealtime(input); } catch { /* Diagnostics cannot break realtime delivery. */ }
  return mapRealtimeEvent(input);
}
