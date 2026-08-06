import type { ConversationSummary } from "@/domain/conversation";

import {
  ChatWorkspaceContractError,
  type ChatWorkspaceSelectionOptions,
} from "@/application/chat-workspace/chat-workspace-types";

/**
 * Resolves the frontend selection without reordering or deriving a backend
 * default. The first-list-item fallback preserves the current Chat UI policy.
 */
export function resolveWorkspaceConversationSelection(
  conversations: readonly ConversationSummary[],
  options: ChatWorkspaceSelectionOptions = {},
): ConversationSummary | null {
  assertConversationList(conversations);
  assertSelectionOptions(options);

  const currentConversation = findConversation(
    conversations,
    options.currentConversationId,
  );
  if (currentConversation !== null) {
    return currentConversation;
  }

  const preferredConversation = findConversation(
    conversations,
    options.preferredConversationId,
  );
  if (preferredConversation !== null) {
    return preferredConversation;
  }

  return conversations[0] ?? null;
}

function findConversation(
  conversations: readonly ConversationSummary[],
  conversationId: string | null | undefined,
): ConversationSummary | null {
  if (conversationId === null || conversationId === undefined) {
    return null;
  }

  return conversations.find(({ id }) => id === conversationId) ?? null;
}

function assertSelectionOptions(
  options: ChatWorkspaceSelectionOptions,
): void {
  if (!isRecord(options)) {
    throw contractError("Conversation selection options must be an object");
  }

  assertOptionalConversationId(options.preferredConversationId);
  assertOptionalConversationId(options.currentConversationId);
}

function assertConversationList(
  conversations: readonly ConversationSummary[],
): void {
  if (!Array.isArray(conversations)) {
    throw contractError("Conversation selection requires a conversation list");
  }

  const seenIds = new Set<string>();
  for (const conversation of conversations) {
    if (
      !isRecord(conversation) ||
      typeof conversation.id !== "string" ||
      conversation.id.length === 0
    ) {
      throw contractError("Conversation selection received invalid domain data");
    }
    if (seenIds.has(conversation.id)) {
      throw contractError("Conversation selection requires unique conversation IDs");
    }
    seenIds.add(conversation.id);
  }
}

function assertOptionalConversationId(
  conversationId: unknown,
): asserts conversationId is string | null | undefined {
  if (
    conversationId !== undefined &&
    conversationId !== null &&
    (typeof conversationId !== "string" || conversationId.length === 0)
  ) {
    throw contractError("Conversation selection received an invalid ID");
  }
}

function contractError(message: string): ChatWorkspaceContractError {
  return new ChatWorkspaceContractError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
