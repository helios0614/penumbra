import type { ChatSetupViewModel } from "@/application/chat-setup";
import type { MessageHistoryState } from "@/application/message-history";
import type { ConversationSummary } from "@/domain/conversation";

export type ChatWorkspaceSnapshot = {
  readonly setup: ChatSetupViewModel;
  readonly conversations: readonly ConversationSummary[];
  readonly selectedConversationId: string | null;
  readonly selectedConversation: ConversationSummary | null;
  readonly history: MessageHistoryState | null;
};

export type ChatWorkspaceLoadInput = {
  readonly preferredConversationId?: string | null;
  readonly currentConversationId?: string | null;
  readonly historyPageSize?: number;
};

export type ChatWorkspaceSelectionOptions = {
  readonly preferredConversationId?: string | null;
  readonly currentConversationId?: string | null;
};

export class ChatWorkspaceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatWorkspaceContractError";
  }
}
