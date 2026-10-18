import type { RealtimeEvent } from "@/application/realtime";

import {
  RealtimeReconciliationContractError,
  type RealtimeReconciliationPlan,
} from "@/application/realtime-reconciliation/realtime-reconciliation-types";

export function planRealtimeReconciliation(
  event: RealtimeEvent,
): RealtimeReconciliationPlan {
  assertEventInput(event);

  switch (event.type) {
    case "location-updated":
      return { kind: "ignore", rawType: "location_update" };
    case "activity-log":
      return { kind: "ignore", rawType: "activity_log" };
    case "activity-config-changed":
      return { kind: "ignore", rawType: "activity_config_changed" };
    case "message-created":
      assertId(event.messageId);
      assertId(event.conversationId);
      return {
        kind: "refresh-latest-history",
        conversationId: event.conversationId,
        reason: "message-created",
        authority: "expected-authoritative",
      };
    case "message-updated":
      assertId(event.messageId);
      assertId(event.conversationId);
      return {
        kind: "refresh-latest-history",
        conversationId: event.conversationId,
        reason: "message-updated",
        authority: "latest-window-only",
      };
    case "message-deleted":
      assertId(event.messageId);
      assertId(event.conversationId);
      return {
        kind: "remove-message",
        conversationId: event.conversationId,
        messageId: event.messageId,
      };
    case "file-synced":
      assertId(event.conversationId);
      return {
        kind: "reload-history",
        conversationId: event.conversationId,
        reason: "file-synced",
      };
    case "conversation-created":
    case "conversation-updated":
    case "conversation-deleted":
      assertId(event.conversationId);
      return {
        kind: "invalidate-conversation-list",
        conversationId: event.conversationId,
        reason: event.type,
      };
    case "unknown":
      assertId(event.rawType);
      return { kind: "ignore", rawType: event.rawType };
    default:
      return invalidEvent();
  }
}

export function planRealtimeReconnect(
  conversationId: string,
): RealtimeReconciliationPlan {
  assertId(conversationId);
  return {
    kind: "reload-history",
    conversationId,
    reason: "reconnect",
  };
}

function assertEventInput(
  event: RealtimeEvent,
): asserts event is RealtimeEvent {
  if (typeof event !== "object" || event === null || Array.isArray(event)) {
    invalidEvent();
  }
}

export function assertReconciliationId(id: string): void {
  assertId(id);
}

function assertId(id: string): void {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw contractError("Realtime reconciliation requires non-empty identifiers");
  }
}

function invalidEvent(): never {
  throw contractError("Realtime reconciliation received an invalid event");
}

function contractError(message: string): RealtimeReconciliationContractError {
  return new RealtimeReconciliationContractError(message);
}
