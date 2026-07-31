import type {
  ConversationDto,
  ConversationListItemDto,
  DeleteConversationResponseDto,
  UpdateConversationResponseDto,
} from "@/domain/conversation/conversation-dto";
import {
  ConversationContractError,
  type Conversation,
  type ConversationMutationResult,
  type ConversationSummary,
} from "@/domain/conversation/conversation-types";

export function mapConversation(payload: unknown): Conversation {
  const dto = parseConversation(payload, "conversation");
  return toConversation(dto);
}

export function mapConversationList(payload: unknown): ConversationSummary[] {
  if (!Array.isArray(payload)) {
    throw contractError("conversation list");
  }

  return payload.map((item) => {
    const dto = parseConversationListItem(item);
    return { ...toConversation(dto), messageCount: dto.message_count };
  });
}

export function mapUpdateConversationResponse(
  payload: unknown,
): ConversationMutationResult {
  const dto: UpdateConversationResponseDto = parseAcknowledgement(
    payload,
    "conversation update response",
  );
  return { ok: dto.ok };
}

export function mapDeleteConversationResponse(
  payload: unknown,
): ConversationMutationResult {
  const dto: DeleteConversationResponseDto = parseAcknowledgement(
    payload,
    "conversation delete response",
  );
  return { ok: dto.ok };
}

function parseConversation(payload: unknown, contract: string): ConversationDto {
  if (
    !isRecord(payload) ||
    typeof payload.id !== "string" ||
    typeof payload.title !== "string" ||
    typeof payload.model !== "string" ||
    !isFiniteNumber(payload.created_at) ||
    !isFiniteNumber(payload.updated_at)
  ) {
    throw contractError(contract);
  }

  return {
    id: payload.id,
    title: payload.title,
    model: payload.model,
    created_at: payload.created_at,
    updated_at: payload.updated_at,
  };
}

function parseConversationListItem(payload: unknown): ConversationListItemDto {
  const conversation = parseConversation(payload, "conversation list item");
  if (
    !isRecord(payload) ||
    !Number.isInteger(payload.message_count) ||
    (payload.message_count as number) < 0
  ) {
    throw contractError("conversation list item");
  }

  return { ...conversation, message_count: payload.message_count as number };
}

function toConversation(dto: ConversationDto): Conversation {
  return {
    id: dto.id,
    title: dto.title,
    modelKey: dto.model,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

function parseAcknowledgement(
  payload: unknown,
  contract: string,
): { ok: true } {
  if (!isRecord(payload) || payload.ok !== true) {
    throw contractError(contract);
  }

  return { ok: payload.ok };
}

function contractError(contract: string): ConversationContractError {
  return new ConversationContractError(
    `Backend response does not match the ${contract} contract`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
