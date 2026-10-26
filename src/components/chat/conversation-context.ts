import { readMessageWindow } from "@/domain/message/message-window";
import type { Message } from "@/domain/message/message-types";
import { apiGet, type ApiRequestOptions } from "@/lib/api";

export type ConversationContextAnchor = {
  readonly conversationId: string;
  readonly messageId: string;
  readonly conversationTitle: string;
};
export type ConversationContext = {
  readonly conversationId: string;
  readonly conversationTitle?: string;
  readonly messageId: string;
  readonly messages: readonly Message[];
};
export type ConversationContextReader = (
  anchor: ConversationContextAnchor, options: ApiRequestOptions,
) => Promise<ConversationContext>;

export const readConversationContext: ConversationContextReader = async (anchor, options) => {
  const [window, title] = await Promise.all([readMessageWindow(anchor.conversationId, {
    anchorId: anchor.messageId, beforeLimit: 2, afterLimit: 2,
  }, options), readPublicConversationTitle(anchor.conversationId, options)]);
  return { conversationId: window.conversationId, conversationTitle: title,
    messageId: anchor.messageId, messages: window.messages };
};

export async function readPublicConversationTitle(owner: string, options?: ApiRequestOptions): Promise<string> {
  const value = await apiGet<{ conversation_id: string; conversation_title: string }>(
    `/api/conversations/${encodeURIComponent(owner)}/public-title`, options);
  if (value?.conversation_id !== owner || typeof value.conversation_title !== "string")
    throw new Error("Invalid public source title");
  return value.conversation_title;
}

export const contextTime = (seconds: number) => new Date(seconds * 1000).toLocaleString(undefined, {
  year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
});
