import type {
  CreateConversationRequestDto,
  UpdateConversationRequestDto,
} from "@/domain/conversation/conversation-dto";
import {
  mapConversation,
  mapDeleteConversationResponse,
  mapConversationList,
  mapUpdateConversationResponse,
} from "@/domain/conversation/conversation-mappers";
import type {
  Conversation,
  ConversationMutationResult,
  ConversationSummary,
  CreateConversationInput,
  UpdateConversationInput,
} from "@/domain/conversation/conversation-types";
import {
  apiGet,
  apiPost,
  apiRequest,
  type ApiRequestOptions,
} from "@/lib/api";

export const CONVERSATIONS_ENDPOINT = "/api/conversations";

export async function listConversations(
  options?: ApiRequestOptions,
): Promise<ConversationSummary[]> {
  return mapConversationList(
    await apiGet<unknown>(CONVERSATIONS_ENDPOINT, options),
  );
}

export async function createConversation(
  input: CreateConversationInput = {},
  options?: ApiRequestOptions,
): Promise<Conversation> {
  const body: CreateConversationRequestDto = {};
  if (input.title !== undefined) body.title = input.title;
  if (input.modelKey !== undefined) body.model = input.modelKey;

  return mapConversation(
    await apiPost<unknown>(CONVERSATIONS_ENDPOINT, body, options),
  );
}

export async function updateConversation(
  conversationId: string,
  input: UpdateConversationInput,
  options?: ApiRequestOptions,
): Promise<ConversationMutationResult> {
  const body: UpdateConversationRequestDto = {};
  if (input.title !== undefined) body.title = input.title;
  if (input.modelKey !== undefined) body.model = input.modelKey;

  return mapUpdateConversationResponse(
    await apiRequest<unknown>(conversationPath(conversationId), {
      ...options,
      method: "PUT",
      body,
    }),
  );
}

export async function deleteConversation(
  conversationId: string,
  options?: ApiRequestOptions,
): Promise<ConversationMutationResult> {
  return mapDeleteConversationResponse(
    await apiRequest<unknown>(conversationPath(conversationId), {
      ...options,
      method: "DELETE",
      body: undefined,
    }),
  );
}

function conversationPath(conversationId: string): string {
  return `${CONVERSATIONS_ENDPOINT}/${encodeURIComponent(conversationId)}`;
}
