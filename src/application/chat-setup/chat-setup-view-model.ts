import type { Conversation } from "@/domain/conversation";

import {
  ChatSetupContractError,
  type ChatSetupStatus,
  type ChatSetupViewModel,
  type CreateChatSetupViewModelInput,
  type CreateUnavailableChatSetupViewModelInput,
} from "@/application/chat-setup/chat-setup-types";

export function createChatSetupViewModel(
  input: CreateChatSetupViewModelInput,
): ChatSetupViewModel {
  assertChatSetupInput(input);

  const { conversation, availableModels, readiness } = input;
  const modelKey = input.configuration?.selection?.model ?? readiness.modelKey;
  const readinessReason = readiness.generationUnsupported === true
    ? "generation-not-supported"
    : readiness.reason;

  if (input.configuration !== undefined && readiness.ready &&
      (!input.configuration.selection || input.configuration.diagnostic || readiness.modelKey !== modelKey)) {
    throw new ChatSetupContractError(
      "Conversation model and readiness model do not match",
    );
  }

  const selectedModel = availableModels.find((model) => model.key === modelKey);

  return {
    ...(input.configuration !== undefined ? { configuration: input.configuration } : {}),
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
    status: readinessReason,
    setupActionRequired: readiness.setupActionRequired,
    readiness: {
      kind: "available",
      value: {
        ready: readiness.ready,
        modelKey: readiness.modelKey,
        reason: readinessReason,
        setupActionRequired: readiness.setupActionRequired,
      },
    },
  };
}

export function createUnavailableChatSetupViewModel(
  input: CreateUnavailableChatSetupViewModelInput,
): ChatSetupViewModel {
  assertUnavailableChatSetupInput(input);

  const { conversation, availableModels, reason } = input;
  const modelKey = input.configuration?.selection?.model ?? conversation?.mainSelection?.model ?? null;
  const selectedModel = modelKey === null
    ? undefined
    : availableModels.find((model) => model.key === modelKey);

  return {
    ...(input.configuration !== undefined ? { configuration: input.configuration } : {}),
    conversationId: conversation?.id ?? null,
    conversationTitle: conversation?.title ?? null,
    modelKey,
    modelLabel: selectedModel?.label ?? modelKey,
    modelKnown: selectedModel !== undefined,
    models: availableModels.map((model) => ({
      key: model.key,
      label: model.label,
      provider: model.provider,
      selected: modelKey !== null && model.key === modelKey,
    })),
    status: "readiness-unavailable",
    setupActionRequired: true,
    readiness: { kind: "unavailable", reason },
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
    typeof readiness.setupActionRequired !== "boolean" ||
    (readiness.generationUnsupported !== undefined &&
      readiness.generationUnsupported !== true)
  ) {
    throw incompleteInputError();
  }
}

function assertUnavailableChatSetupInput(
  input: CreateUnavailableChatSetupViewModelInput,
): asserts input is CreateUnavailableChatSetupViewModelInput {
  if (!isRecord(input)) {
    throw incompleteInputError();
  }

  const { conversation, availableModels, reason } = input;
  if (conversation !== null) {
    assertChatSetupConversation(conversation);
  }

  if (
    !Array.isArray(availableModels) ||
    !availableModels.every(isAvailableModel) ||
    !isSafeReadinessReason(reason)
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
    /^[a-z][a-z0-9_-]{0,95}$/.test(value)
  );
}

function isSafeReadinessReason(
  value: unknown,
): value is CreateUnavailableChatSetupViewModelInput["reason"] {
  return (
    value === "not-found" ||
    value === "network" ||
    value === "timeout" ||
    value === "service" ||
    value === "contract" ||
    value === "unknown"
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
