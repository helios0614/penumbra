import { mapMessage, mapMessageHistory } from "@/domain/message/message-mappers";
import {
  MessageContractError,
  type Message,
  type MessageHistoryQuery,
} from "@/domain/message/message-types";
import { apiGet, type ApiRequestOptions } from "@/lib/api";

export const MESSAGE_HISTORY_LIMIT_MIN = 1;
export const MESSAGE_HISTORY_LIMIT_MAX = 500;

export async function readPublicMessage(messageId: string, options?: ApiRequestOptions): Promise<Message> {
  return mapMessage(await apiGet<unknown>(`/api/messages/${encodeURIComponent(messageId)}/public`, options));
}

export async function listConversationMessages(
  conversationId: string,
  query: MessageHistoryQuery = {},
  options?: ApiRequestOptions,
): Promise<Message[]> {
  return mapMessageHistory(
    await apiGet<unknown>(messageHistoryPath(conversationId, query), options),
  );
}

function messageHistoryPath(
  conversationId: string,
  query: MessageHistoryQuery,
): string {
  if (typeof query !== "object" || query === null || Array.isArray(query)) {
    throw new MessageContractError("Message history query must be an object");
  }

  const params = new URLSearchParams();

  if (query.limit !== undefined) {
    if (
      !Number.isInteger(query.limit) ||
      query.limit < MESSAGE_HISTORY_LIMIT_MIN ||
      query.limit > MESSAGE_HISTORY_LIMIT_MAX
    ) {
      throw new MessageContractError(
        "Message history limit must be an integer between 1 and 500",
      );
    }
    params.set("limit", String(query.limit));
  }

  if (query.before !== undefined) {
    if (typeof query.before !== "number" || !Number.isFinite(query.before)) {
      throw new MessageContractError(
        "Message history before must be a finite Unix-seconds number",
      );
    }
    params.set("before", String(query.before));
  }

  const path = `/api/conversations/${encodeURIComponent(conversationId)}/messages`;
  params.set("public_view", "true");
  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}
