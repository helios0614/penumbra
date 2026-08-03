import type {
  MessageDto,
  MessageHistoryDto,
  MessageVoiceDto,
} from "@/domain/message/message-dto";
import {
  MessageContractError,
  type JsonValue,
  type Message,
  type MessageRoleKind,
  type MessageVoice,
} from "@/domain/message/message-types";

export function mapMessage(payload: unknown): Message {
  return toMessage(parseMessage(payload, "message"));
}

export function mapMessageHistory(payload: unknown): Message[] {
  if (!Array.isArray(payload)) {
    throw contractError("message history");
  }

  const dto: MessageHistoryDto = payload.map((item) =>
    parseMessage(item, "message history item"),
  );
  return dto.map(toMessage);
}

function parseMessage(payload: unknown, contract: string): MessageDto {
  if (
    !isPlainRecord(payload) ||
    !isNonEmptyString(payload.id) ||
    !isNonEmptyString(payload.conv_id) ||
    typeof payload.role !== "string" ||
    typeof payload.content !== "string" ||
    !isFiniteNumber(payload.created_at) ||
    !isNullableString(payload.simple_think) ||
    !isCarryoverValue(payload.is_carryover) ||
    !isNullableString(payload.thinking) ||
    !isNullableString(payload.cache_region)
  ) {
    throw contractError(contract);
  }

  const dto: MessageDto = {
    id: payload.id,
    conv_id: payload.conv_id,
    role: payload.role,
    content: payload.content,
    created_at: payload.created_at,
    simple_think: payload.simple_think,
    is_carryover: payload.is_carryover,
    attachments: cloneJsonArray(payload.attachments, contract),
    thinking: payload.thinking,
    mcp_tool_calls: cloneJsonArray(payload.mcp_tool_calls, contract),
    cache_region: payload.cache_region,
  };

  if (payload.voice !== undefined) {
    dto.voice = parseVoice(payload.voice, contract);
  }

  return dto;
}

function parseVoice(payload: unknown, contract: string): MessageVoiceDto {
  if (
    !isPlainRecord(payload) ||
    !isNonEmptyString(payload.audio_id) ||
    !isNonEmptyString(payload.msg_id) ||
    typeof payload.provider !== "string" ||
    typeof payload.voice_id !== "string" ||
    typeof payload.url !== "string" ||
    !(payload.duration === null || isFiniteNumber(payload.duration)) ||
    typeof payload.favorited !== "boolean" ||
    !isFiniteNumber(payload.created_at) ||
    !isFiniteNumber(payload.updated_at)
  ) {
    throw contractError(contract);
  }

  return {
    audio_id: payload.audio_id,
    msg_id: payload.msg_id,
    provider: payload.provider,
    voice_id: payload.voice_id,
    url: payload.url,
    duration: payload.duration,
    favorited: payload.favorited,
    created_at: payload.created_at,
    updated_at: payload.updated_at,
  };
}

function toMessage(dto: MessageDto): Message {
  return {
    id: dto.id,
    conversationId: dto.conv_id,
    rawRole: dto.role,
    roleKind: toRoleKind(dto.role),
    content: dto.content,
    createdAt: dto.created_at,
    simpleThink: dto.simple_think,
    thinking: dto.thinking,
    isCarryover:
      dto.is_carryover === null ? null : dto.is_carryover === 1,
    attachments: dto.attachments,
    mcpToolCalls: dto.mcp_tool_calls,
    cacheRegion: dto.cache_region,
    voice: dto.voice === undefined ? null : toMessageVoice(dto.voice),
  };
}

function toMessageVoice(dto: MessageVoiceDto): MessageVoice {
  return {
    audioId: dto.audio_id,
    messageId: dto.msg_id,
    provider: dto.provider,
    voiceId: dto.voice_id,
    url: dto.url,
    duration: dto.duration,
    favorited: dto.favorited,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

function toRoleKind(role: string): MessageRoleKind {
  switch (role) {
    case "user":
    case "assistant":
    case "system":
      return role;
    case "cam_trigger":
    case "cam_user":
    case "cam_log":
      return "hidden-runtime";
    default:
      return "unknown";
  }
}

function cloneJsonArray(value: unknown, contract: string): JsonValue[] {
  if (!Array.isArray(value)) {
    throw contractError(contract);
  }

  const ancestors = new WeakSet<object>();
  const copy: JsonValue[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw contractError(contract);
    }
    copy.push(cloneJsonValue(value[index], contract, ancestors));
  }
  return copy;
}

function cloneJsonValue(
  value: unknown,
  contract: string,
  ancestors: WeakSet<object>,
): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (isFiniteNumber(value)) {
    return value;
  }

  if (typeof value !== "object") {
    throw contractError(contract);
  }

  if (ancestors.has(value)) {
    throw contractError(contract);
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      const copy: JsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw contractError(contract);
        }
        copy.push(cloneJsonValue(value[index], contract, ancestors));
      }
      return copy;
    }

    if (!isPlainRecord(value)) {
      throw contractError(contract);
    }

    const copy: Record<string, JsonValue> = {};
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) {
        throw contractError(contract);
      }
      Object.defineProperty(copy, key, {
        value: cloneJsonValue(descriptor.value, contract, ancestors),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return copy;
  } finally {
    ancestors.delete(value);
  }
}

function contractError(contract: string): MessageContractError {
  return new MessageContractError(
    `Backend response does not match the ${contract} contract`,
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCarryoverValue(value: unknown): value is 0 | 1 | null {
  return value === 0 || value === 1 || value === null;
}
