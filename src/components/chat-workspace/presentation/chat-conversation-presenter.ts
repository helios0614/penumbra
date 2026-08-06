import type { ConversationSummary } from "@/domain/conversation";

import type { ChatConversationItemViewModel } from "@/components/chat-workspace/presentation/chat-presentation-types";

export const EMPTY_CONVERSATION_TITLE = "未命名会话";

export type PresentChatConversationsOptions = {
  readonly selectedConversationId: string | null;
  readonly pendingConversationId?: string | null;
};

export function presentChatConversations(
  conversations: readonly ConversationSummary[],
  options: PresentChatConversationsOptions,
): readonly ChatConversationItemViewModel[] {
  return conversations.map((conversation) =>
    presentChatConversation(conversation, options),
  );
}

export function presentChatConversation(
  conversation: ConversationSummary,
  options: PresentChatConversationsOptions,
): ChatConversationItemViewModel {
  const hasTitle = conversation.title.trim().length > 0;
  const hasModelKey = conversation.modelKey.trim().length > 0;

  return Object.freeze({
    id: conversation.id,
    title: hasTitle ? conversation.title : EMPTY_CONVERSATION_TITLE,
    subtitle: `${conversation.messageCount} 条消息`,
    modelKey: hasModelKey ? conversation.modelKey : null,
    updatedAt: Number.isFinite(conversation.updatedAt)
      ? conversation.updatedAt
      : null,
    isSelected: conversation.id === options.selectedConversationId,
    isPending: conversation.id === (options.pendingConversationId ?? null),
  });
}
