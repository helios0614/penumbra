import type { JsonValue } from "@/domain/message";

import {
  cloneJsonArray,
  isPlainRecord,
  readOwnData,
} from "@/application/chat-execution/chat-execution-json";
import {
  ChatExecutionContractError,
  type ChatExecutionEvent,
  type ChatProviderFailureCode,
  type DuplicateSendAcknowledgement,
  type SafeUsageSummary,
} from "@/application/chat-execution/chat-execution-types";

export function mapChatExecutionEvent(input: unknown): ChatExecutionEvent {
  try {
    if (!isPlainRecord(input)) {
      throw eventContractError();
    }

    const rawType = requiredField(input, "type");
    if (typeof rawType !== "string") {
      throw eventContractError();
    }

    switch (rawType) {
      case "start":
        return {
          type: "start",
          assistantMessageId: nonEmptyString(input, "id", rawType),
        };
      case "chunk":
        return {
          type: "chunk",
          content: stringValue(input, "content", rawType),
        };
      case "mcp_loading":
        return {
          type: "mcp-loading",
          messageId: nonEmptyString(input, "msg_id", rawType),
          tools: stringValue(input, "tools", rawType),
        };
      case "heart_whisper":
        return {
          type: "heart-whisper",
          id: nonEmptyString(input, "id", rawType),
          messageId: nonEmptyString(input, "msg_id", rawType),
          content: stringValue(input, "content", rawType),
          createdAt: finiteNumber(input, "created_at", rawType),
        };
      case "toy_command":
        return {
          type: "toy-command",
          messageId: nonEmptyString(input, "msg_id", rawType),
          commands: stringArray(input, "commands", rawType),
        };
      case "cam_check":
        return {
          type: "camera-check",
          conversationId: nonEmptyString(input, "conv_id", rawType),
          modelKey: stringValue(input, "model_key", rawType),
          messageId: nonEmptyString(input, "msg_id", rawType),
        };
      case "cam_offline":
        return { type: "camera-offline" };
      case "poi_search":
        return {
          type: "poi-search",
          conversationId: nonEmptyString(input, "conv_id", rawType),
          categories: stringArray(input, "categories", rawType),
          messageId: nonEmptyString(input, "msg_id", rawType),
        };
      case "activity_check":
        return {
          type: "activity-check",
          conversationId: nonEmptyString(input, "conv_id", rawType),
          count: finiteNumber(input, "n", rawType),
          messageId: nonEmptyString(input, "msg_id", rawType),
        };
      case "music":
        return {
          type: "music",
          messageId: nonEmptyString(input, "msg_id", rawType),
          cards: jsonArray(input, "cards", rawType),
        };
      case "debug":
        return {
          type: "debug-summary",
          messageId: nonEmptyString(input, "msg_id", rawType),
          modelKey: stringValue(input, "model", rawType),
          hasError: booleanValue(input, "has_error", rawType),
          failureCode: safeProviderFailure(input),
          usage: safeUsage(requiredField(input, "usage"), rawType),
        };
      default:
        return { type: "unknown", rawType };
    }
  } catch (error) {
    if (error instanceof ChatExecutionContractError) {
      throw error;
    }
    throw eventContractError();
  }
}

function safeProviderFailure(
  record: Record<string, unknown>,
): ChatProviderFailureCode | null {
  const property = readOwnData(record, "error_text");
  if (!property.present || typeof property.value !== "string") {
    return null;
  }

  if (property.value.includes("provider_request_failed")) {
    return "provider_request_failed";
  }
  if (property.value.includes("provider_execution_failed")) {
    return "provider_execution_failed";
  }
  return null;
}

export function mapDuplicateSendAcknowledgement(
  input: unknown,
): DuplicateSendAcknowledgement {
  try {
    if (
      !isPlainRecord(input) ||
      requiredField(input, "ok") !== true ||
      requiredField(input, "duplicate") !== true
    ) {
      throw duplicateContractError();
    }

    const messageId = requiredField(input, "msg_id");
    if (typeof messageId !== "string" || messageId.trim().length === 0) {
      throw duplicateContractError();
    }

    return {
      kind: "duplicate",
      userMessageId: messageId,
    };
  } catch {
    throw duplicateContractError();
  }
}

function requiredField(
  record: Record<string, unknown>,
  key: string,
): unknown {
  const property = readOwnData(record, key);
  if (!property.present) {
    throw eventContractError();
  }
  return property.value;
}

function stringValue(
  record: Record<string, unknown>,
  key: string,
  rawType: string,
): string {
  const value = requiredField(record, key);
  if (typeof value !== "string") {
    throw eventContractError(rawType);
  }
  return value;
}

function nonEmptyString(
  record: Record<string, unknown>,
  key: string,
  rawType: string,
): string {
  const value = stringValue(record, key, rawType);
  if (value.trim().length === 0) {
    throw eventContractError(rawType);
  }
  return value;
}

function finiteNumber(
  record: Record<string, unknown>,
  key: string,
  rawType: string,
): number {
  const value = requiredField(record, key);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw eventContractError(rawType);
  }
  return value;
}

function booleanValue(
  record: Record<string, unknown>,
  key: string,
  rawType: string,
): boolean {
  const value = requiredField(record, key);
  if (typeof value !== "boolean") {
    throw eventContractError(rawType);
  }
  return value;
}

function stringArray(
  record: Record<string, unknown>,
  key: string,
  rawType: string,
): string[] {
  const value = requiredField(record, key);
  if (!Array.isArray(value)) {
    throw eventContractError(rawType);
  }

  const copy: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      !descriptor ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "string"
    ) {
      throw eventContractError(rawType);
    }
    copy.push(descriptor.value);
  }
  return copy;
}

function jsonArray(
  record: Record<string, unknown>,
  key: string,
  rawType: string,
): JsonValue[] {
  try {
    return cloneJsonArray(requiredField(record, key));
  } catch (error) {
    if (error instanceof ChatExecutionContractError) {
      throw eventContractError(rawType);
    }
    throw error;
  }
}

function safeUsage(value: unknown, rawType: string): SafeUsageSummary | null {
  if (value === null) {
    return null;
  }
  if (!isPlainRecord(value)) {
    throw eventContractError(rawType);
  }

  return {
    promptTokens: optionalUsageNumber(value, "prompt_tokens", rawType),
    completionTokens: optionalUsageNumber(
      value,
      "completion_tokens",
      rawType,
    ),
    totalTokens: optionalUsageNumber(value, "total_tokens", rawType),
  };
}

function optionalUsageNumber(
  usage: Record<string, unknown>,
  key: string,
  rawType: string,
): number | null {
  const property = readOwnData(usage, key);
  if (!property.present) {
    return null;
  }
  if (
    typeof property.value !== "number" ||
    !Number.isFinite(property.value)
  ) {
    throw eventContractError(rawType);
  }
  return property.value;
}

function eventContractError(rawType?: string): ChatExecutionContractError {
  return new ChatExecutionContractError(
    rawType === undefined
      ? "Backend response does not match the Chat event contract"
      : `Backend response does not match the ${rawType} Chat event contract`,
  );
}

function duplicateContractError(): ChatExecutionContractError {
  return new ChatExecutionContractError(
    "Backend response does not match the duplicate send acknowledgement contract",
  );
}
