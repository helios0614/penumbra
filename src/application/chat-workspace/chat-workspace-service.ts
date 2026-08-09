import {
  loadBootstrapChatSetup,
  loadChatSetupForConversation,
  loadChatSetupForConversationWithModels,
  type ChatSetupViewModel,
} from "@/application/chat-setup";
import {
  DEFAULT_MESSAGE_HISTORY_PAGE_SIZE,
  loadInitialMessageHistory,
  type MessageHistoryState,
} from "@/application/message-history";
import { resolveWorkspaceConversationSelection } from "@/application/chat-workspace/chat-workspace-selection";
import {
  ChatWorkspaceContractError,
  type ChatWorkspaceLoadInput,
  type ChatWorkspaceSnapshot,
} from "@/application/chat-workspace/chat-workspace-types";
import {
  listConversations,
  type ConversationSummary,
} from "@/domain/conversation";
import {
  MESSAGE_HISTORY_LIMIT_MAX,
  MESSAGE_HISTORY_LIMIT_MIN,
} from "@/domain/message";
import type { ApiRequestOptions } from "@/lib/api";

export async function loadChatWorkspace(
  input: ChatWorkspaceLoadInput = {},
  options?: ApiRequestOptions,
): Promise<ChatWorkspaceSnapshot> {
  assertLoadInput(input);

  const conversations = await listConversations(options);
  const selectedConversation = resolveWorkspaceConversationSelection(
    conversations,
    input,
  );

  if (selectedConversation === null) {
    const setup = await loadBootstrapChatSetup(options);
    return createChatWorkspaceSnapshot({
      setup,
      conversations,
      selectedConversation: null,
      history: null,
    });
  }

  const [setup, history] = await Promise.all([
    loadChatSetupForConversation(selectedConversation, options),
    loadInitialMessageHistory(selectedConversation.id, {
      pageSize: input.historyPageSize,
      request: options,
    }),
  ]);

  return createChatWorkspaceSnapshot({
    setup,
    conversations,
    selectedConversation,
    history,
  });
}

export async function loadChatWorkspaceConversation(
  snapshot: ChatWorkspaceSnapshot,
  conversationId: string,
  options?: ApiRequestOptions,
): Promise<ChatWorkspaceSnapshot> {
  assertChatWorkspaceSnapshot(snapshot);
  assertConversationId(conversationId);

  const selectedConversation = snapshot.conversations.find(
    ({ id }) => id === conversationId,
  );
  if (selectedConversation === undefined) {
    throw contractError("Conversation switch target is not in the workspace");
  }

  const availableModels = snapshot.setup.models.map(({ key, label, provider }) => ({
    key,
    label,
    provider,
  }));
  const [setup, history] = await Promise.all([
    loadChatSetupForConversationWithModels(
      selectedConversation,
      availableModels,
      options,
    ),
    loadInitialMessageHistory(conversationId, {
      pageSize: snapshot.history?.pageSize ?? DEFAULT_MESSAGE_HISTORY_PAGE_SIZE,
      request: options,
    }),
  ]);
  assertMatchingHistory(conversationId, history);

  return Object.freeze({
    setup,
    conversations: snapshot.conversations,
    selectedConversationId: selectedConversation.id,
    selectedConversation,
    history,
  });
}

export type CreateChatWorkspaceSnapshotInput = {
  readonly setup: ChatSetupViewModel;
  readonly conversations: readonly ConversationSummary[];
  readonly selectedConversation: ConversationSummary | null;
  readonly history: MessageHistoryState | null;
};

export function createChatWorkspaceSnapshot(
  input: CreateChatWorkspaceSnapshotInput,
): ChatWorkspaceSnapshot {
  if (
    !isRecord(input) ||
    !isRecord(input.setup) ||
    !Array.isArray(input.conversations)
  ) {
    throw contractError("Chat workspace snapshot input is invalid");
  }

  const conversations = Object.freeze([...input.conversations]);
  const selectedConversation = input.selectedConversation;

  if (selectedConversation === null) {
    if (input.history !== null) {
      throw contractError("Unselected chat workspace cannot contain history");
    }

    return Object.freeze({
      setup: input.setup,
      conversations,
      selectedConversationId: null,
      selectedConversation: null,
      history: null,
    });
  }

  const canonicalConversation = conversations.find(
    ({ id }) => id === selectedConversation.id,
  );
  if (canonicalConversation === undefined) {
    throw contractError("Selected conversation is not in the workspace");
  }
  if (input.history === null) {
    throw contractError("Selected chat workspace requires message history");
  }
  assertMatchingHistory(canonicalConversation.id, input.history);

  return Object.freeze({
    setup: input.setup,
    conversations,
    selectedConversationId: canonicalConversation.id,
    selectedConversation: canonicalConversation,
    history: input.history,
  });
}

export function assertChatWorkspaceSnapshot(
  snapshot: ChatWorkspaceSnapshot,
): void {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.conversations)) {
    throw contractError("Chat workspace snapshot is invalid");
  }

  const { selectedConversationId, selectedConversation, history } = snapshot;
  if (selectedConversationId === null || selectedConversation === null) {
    if (
      selectedConversationId !== null ||
      selectedConversation !== null ||
      history !== null
    ) {
      throw contractError("Chat workspace selection is inconsistent");
    }
    return;
  }

  if (
    typeof selectedConversationId !== "string" ||
    selectedConversation.id !== selectedConversationId ||
    !snapshot.conversations.some(({ id }) => id === selectedConversationId) ||
    history === null
  ) {
    throw contractError("Chat workspace selection is inconsistent");
  }
  assertMatchingHistory(selectedConversationId, history);
}

function assertLoadInput(input: ChatWorkspaceLoadInput): void {
  if (!isRecord(input)) {
    throw contractError("Chat workspace input must be an object");
  }

  assertOptionalConversationId(input.preferredConversationId);
  assertOptionalConversationId(input.currentConversationId);

  if (
    input.historyPageSize !== undefined &&
    (!Number.isInteger(input.historyPageSize) ||
      input.historyPageSize < MESSAGE_HISTORY_LIMIT_MIN ||
      input.historyPageSize > MESSAGE_HISTORY_LIMIT_MAX)
  ) {
    throw contractError("Chat workspace history page size is invalid");
  }
}

function assertOptionalConversationId(conversationId: unknown): void {
  if (
    conversationId !== undefined &&
    conversationId !== null &&
    (typeof conversationId !== "string" || conversationId.length === 0)
  ) {
    throw contractError("Chat workspace input contains an invalid conversation ID");
  }
}

function assertConversationId(conversationId: unknown): asserts conversationId is string {
  if (typeof conversationId !== "string" || conversationId.length === 0) {
    throw contractError("Conversation switch requires a valid ID");
  }
}

function assertMatchingHistory(
  conversationId: string,
  history: MessageHistoryState,
): void {
  if (!isRecord(history) || history.conversationId !== conversationId) {
    throw contractError("Workspace history does not match its conversation");
  }
}

function contractError(message: string): ChatWorkspaceContractError {
  return new ChatWorkspaceContractError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
