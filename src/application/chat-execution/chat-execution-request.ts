import type { SendMessageRequestDto } from "@/application/chat-execution/chat-execution-dto";
import {
  isPlainRecord,
  readOwnData,
} from "@/application/chat-execution/chat-execution-json";
import {
  ChatExecutionContractError,
  type RegenerateInput,
  type SendMessageInput,
} from "@/application/chat-execution/chat-execution-types";

const omitted = Symbol("omitted chat execution input");

export function mapSendMessageRequest(
  input: SendMessageInput,
): SendMessageRequestDto {
  try {
    if (!isPlainRecord(input)) {
      throw requestContractError("Send input must be a plain object");
    }

    const content = requiredValue(input, "content");
    if (typeof content !== "string") {
      throw requestContractError("Send content must be a string");
    }

    const request: SendMessageRequestDto = { content };
    const contextLimit = optionalValue(input, "contextLimit");
    if (contextLimit !== omitted) {
      request.context_limit = finiteNumber(contextLimit, "context limit");
    }

    const attachments = optionalValue(input, "attachments");
    if (attachments !== omitted) {
      request.attachments = stringArray(attachments, "attachments");
    }

    const whisperMode = optionalValue(input, "whisperMode");
    if (whisperMode !== omitted) {
      request.whisper_mode = booleanValue(whisperMode, "whisper mode");
    }

    const fastMode = optionalValue(input, "fastMode");
    if (fastMode !== omitted) {
      request.fast_mode = booleanValue(fastMode, "fast mode");
    }

    const temperature = optionalValue(input, "temperature");
    if (temperature !== omitted) {
      request.temperature = nullableFiniteNumber(temperature, "temperature");
    }

    const thinkingEffort = optionalValue(input, "thinkingEffort");
    if (thinkingEffort !== omitted) {
      request.thinking_effort = nullableString(
        thinkingEffort,
        "thinking effort",
      );
    }

    const clientMessageId = optionalValue(input, "clientMessageId");
    if (clientMessageId !== omitted) {
      request.client_msg_id = nullableString(
        clientMessageId,
        "client message ID",
      );
    }

    return request;
  } catch (error) {
    if (error instanceof ChatExecutionContractError) {
      throw error;
    }
    throw requestContractError("Send input does not match the request contract");
  }
}

export function mapRegenerateQuery(
  input: RegenerateInput = {},
): URLSearchParams {
  try {
    if (!isPlainRecord(input)) {
      throw requestContractError("Regenerate input must be a plain object");
    }

    const params = new URLSearchParams();
    const contextLimit = optionalValue(input, "contextLimit");
    if (contextLimit !== omitted) {
      params.set(
        "context_limit",
        String(finiteNumber(contextLimit, "context limit")),
      );
    }

    const whisperMode = optionalValue(input, "whisperMode");
    if (whisperMode !== omitted) {
      params.set(
        "whisper_mode",
        String(booleanValue(whisperMode, "whisper mode")),
      );
    }

    const fastMode = optionalValue(input, "fastMode");
    if (fastMode !== omitted) {
      params.set(
        "fast_mode",
        String(booleanValue(fastMode, "fast mode")),
      );
    }

    const temperature = optionalValue(input, "temperature");
    if (temperature !== omitted && temperature !== null) {
      params.set(
        "temperature",
        String(finiteNumber(temperature, "temperature")),
      );
    }

    const thinkingEffort = optionalValue(input, "thinkingEffort");
    if (thinkingEffort !== omitted) {
      if (thinkingEffort !== null && typeof thinkingEffort !== "string") {
        throw requestContractError("Regenerate thinking effort is invalid");
      }
      // Explicit null suppresses a persisted Main Thinking preference.
      params.set("thinking_effort", thinkingEffort === null ? "null" : thinkingEffort);
    }

    return params;
  } catch (error) {
    if (error instanceof ChatExecutionContractError) {
      throw error;
    }
    throw requestContractError(
      "Regenerate input does not match the request contract",
    );
  }
}

function requiredValue(
  input: Record<string, unknown>,
  key: string,
): unknown {
  const property = readOwnData(input, key);
  if (!property.present) {
    throw requestContractError("Send input is missing required data");
  }
  return property.value;
}

function optionalValue(
  input: Record<string, unknown>,
  key: string,
): unknown | typeof omitted {
  const property = readOwnData(input, key);
  return !property.present || property.value === undefined
    ? omitted
    : property.value;
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw requestContractError(`Chat ${field} must be a finite number`);
  }
  return value;
}

function nullableFiniteNumber(
  value: unknown,
  field: string,
): number | null {
  return value === null ? null : finiteNumber(value, field);
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw requestContractError(`Chat ${field} must be a boolean`);
  }
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value !== null && typeof value !== "string") {
    throw requestContractError(`Chat ${field} must be a string or null`);
  }
  return value;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw requestContractError(`Chat ${field} must be a string array`);
  }

  const copy: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      !descriptor ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "string"
    ) {
      throw requestContractError(`Chat ${field} must be a string array`);
    }
    copy.push(descriptor.value);
  }
  return copy;
}

function requestContractError(message: string): ChatExecutionContractError {
  return new ChatExecutionContractError(message);
}
