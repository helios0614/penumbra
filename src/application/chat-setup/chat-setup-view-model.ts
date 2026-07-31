import type { Conversation } from "@/domain/conversation";

import {
  ChatSetupContractError,
  type ChatSetupStatus,
  type ChatSetupViewModel,
  type CreateChatSetupViewModelInput,
} from "@/application/chat-setup/chat-setup-types";

const chatSetupStatuses: ReadonlySet<ChatSetupStatus> = new Set([
  "ready",
  "unknown-model",
  "provider-not-configured",
  "configuration-invalid",
]);

export function createChatSetupViewModel(
  input: CreateChatSetupViewModelInput,
): ChatSetupViewModel {
  assertChatSetupInput(input);

  const { conversation, availableModels, readiness } = input;
  const modelKey = conversation?.modelKey ?? readiness.modelKey;

  if (conversation !== null && readiness.modelKey !== modelKey) {
    throw new ChatSetupContractError(
      "Conversation model and readiness model do not match",
    );
  }

  if (conversation === null && !isNonEmptyString(modelKey)) {
    throw new ChatSetupContractError(
      "Bootstrap readiness does not provide a usable model key",
    );
  }

  const selectedModel = availableModels.find((model) => model.key === modelKey);

  return {
    conversationId: conversation?.id ?? null,
    conversationTitle: conversation?.title ?? null,
    modelKey,
    modelLabel: selectedModel?.label ?? modelKey,
    modelKnown: selectedModel !== undefined,
    models: availableModels.map((model) => ({
      key: model.key,
      label: model.label,
      provider: model.provider,
      selected: model.key === modelKey,
    })),
    status: readiness.reason,
    setupActionRequired: readiness.setupActionRequired,
  };
}

export function assertChatSetupConversation(
  conversation: Conversation,
): asserts conversation is Conversation {
  if (
    !isRecord(conversation) ||
    typeof conversation.id !== "string" ||
    typeof conversation.title !== "string" ||
    typeof conversation.modelKey !== "string"
  ) {
    throw new ChatSetupContractError(
      "Conversation does not provide the required chat setup data",
    );
  }
}

function assertChatSetupInput(
  input: CreateChatSetupViewModelInput,
): asserts input is CreateChatSetupViewModelInput {
  if (!isRecord(input)) {
    throw incompleteInputError();
  }

  const { conversation, availableModels, readiness } = input;
  if (conversation !== null) {
    assertChatSetupConversation(conversation);
  }

  if (
    !Array.isArray(availableModels) ||
    !availableModels.every(isAvailableModel) ||
    !isRecord(readiness) ||
    typeof readiness.ready !== "boolean" ||
    typeof readiness.modelKey !== "string" ||
    !isChatSetupStatus(readiness.reason) ||
    typeof readiness.setupActionRequired !== "boolean"
  ) {
    throw incompleteInputError();
  }
}

function isAvailableModel(
  value: unknown,
): value is CreateChatSetupViewModelInput["availableModels"][number] {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.label === "string" &&
    typeof value.provider === "string"
  );
}

function isChatSetupStatus(value: unknown): value is ChatSetupStatus {
  return (
    typeof value === "string" &&
    chatSetupStatuses.has(value as ChatSetupStatus)
  );
}

function incompleteInputError(): ChatSetupContractError {
  return new ChatSetupContractError(
    "Chat setup input does not provide the required domain data",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
