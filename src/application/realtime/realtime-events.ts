import {
  RealtimeContractError,
  type RealtimeEvent,
} from "@/application/realtime/realtime-types";

export function mapRealtimeEvent(input: unknown): RealtimeEvent {
  try {
    if (!isPlainRecord(input)) {
      throw contractError();
    }

    const rawType = ownValue(input, "type");
    if (typeof rawType !== "string" || rawType.trim().length === 0) {
      throw contractError();
    }

    switch (rawType) {
      case "msg_created":
        return mapMessageEvent(input, "message-created");
      case "msg_updated":
        return mapMessageEvent(input, "message-updated");
      case "msg_deleted":
        return mapMessageEvent(input, "message-deleted");
      case "conv_created":
        return mapConversationEvent(input, "conversation-created");
      case "conv_updated":
        return mapConversationEvent(input, "conversation-updated");
      case "conv_deleted":
        return mapConversationEvent(input, "conversation-deleted");
      case "file_synced":
        return {
          type: "file-synced",
          conversationId: eventId(input, "conv_id"),
        };
      default:
        return { type: "unknown", rawType };
    }
  } catch (error) {
    if (error instanceof RealtimeContractError) {
      throw error;
    }
    throw contractError();
  }
}

function mapMessageEvent(
  input: Record<string, unknown>,
  type: "message-created" | "message-updated" | "message-deleted",
): RealtimeEvent {
  const data = eventData(input);
  return {
    type,
    messageId: nonEmptyId(data, "id"),
    conversationId: nonEmptyId(data, "conv_id"),
  };
}

function mapConversationEvent(
  input: Record<string, unknown>,
  type:
    | "conversation-created"
    | "conversation-updated"
    | "conversation-deleted",
): RealtimeEvent {
  return {
    type,
    conversationId: eventId(input, "id"),
  };
}

function eventId(
  input: Record<string, unknown>,
  key: "id" | "conv_id",
): string {
  return nonEmptyId(eventData(input), key);
}

function eventData(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const data = ownValue(input, "data");
  if (!isPlainRecord(data)) {
    throw contractError();
  }
  return data;
}

function nonEmptyId(
  input: Record<string, unknown>,
  key: string,
): string {
  const value = ownValue(input, key);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw contractError();
  }
  return value;
}

function ownValue(
  input: Record<string, unknown>,
  key: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(input, key);
  if (!descriptor || !("value" in descriptor)) {
    throw contractError();
  }
  return descriptor.value;
}

function isPlainRecord(
  input: unknown,
): input is Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(input);
  return prototype === Object.prototype || prototype === null;
}

function contractError(): RealtimeContractError {
  return new RealtimeContractError(
    "Realtime event violates its contract",
  );
}
