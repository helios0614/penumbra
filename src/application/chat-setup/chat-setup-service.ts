import type { Conversation } from "@/domain/conversation";
import {
  getAvailableModels,
  getChatReadiness,
  RuntimeContractError,
} from "@/domain/runtime";
import { ApiError, type ApiRequestOptions } from "@/lib/api";

import type {
  ChatReadinessState,
  ChatSetupViewModel,
  SafeReadinessReason,
} from "@/application/chat-setup/chat-setup-types";
import {
  assertChatSetupConversation,
  createChatSetupViewModel,
  createUnavailableChatSetupViewModel,
} from "@/application/chat-setup/chat-setup-view-model";

export async function loadChatSetupForConversation(
  conversation: Conversation,
  options?: ApiRequestOptions,
): Promise<ChatSetupViewModel> {
  assertChatSetupConversation(conversation);

  const [availableModels, readiness] = await Promise.all([
    getAvailableModels(options),
    loadReadinessState(conversation.modelKey, options),
  ]);

  return createSetupViewModel(conversation, availableModels, readiness);
}

export async function loadBootstrapChatSetup(
  options?: ApiRequestOptions,
): Promise<ChatSetupViewModel> {
  const [availableModels, readiness] = await Promise.all([
    getAvailableModels(options),
    loadReadinessState(undefined, options),
  ]);

  return createSetupViewModel(null, availableModels, readiness);
}

async function loadReadinessState(
  modelKey: string | undefined,
  options?: ApiRequestOptions,
): Promise<ChatReadinessState> {
  try {
    const readiness = await getChatReadiness(modelKey, options);
    return { kind: "available", value: readiness };
  } catch (error) {
    if (isAuthenticationError(error) || isAbortError(error)) {
      throw error;
    }

    return {
      kind: "unavailable",
      reason: toSafeReadinessReason(error),
    };
  }
}

function createSetupViewModel(
  conversation: Conversation | null,
  availableModels: Awaited<ReturnType<typeof getAvailableModels>>,
  readiness: ChatReadinessState,
): ChatSetupViewModel {
  if (readiness.kind === "available") {
    return createChatSetupViewModel({
      conversation,
      availableModels,
      readiness: readiness.value,
    });
  }

  return createUnavailableChatSetupViewModel({
    conversation,
    availableModels,
    reason: readiness.reason,
  });
}

function toSafeReadinessReason(error: unknown): SafeReadinessReason {
  if (error instanceof ApiError) {
    if (error.status === 404) return "not-found";
    if (error.code === "NETWORK_ERROR") return "network";
    if (error.code === "TIMEOUT") return "timeout";
    return "service";
  }

  if (error instanceof RuntimeContractError) {
    return "contract";
  }

  return "unknown";
}

function isAuthenticationError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof ApiError && error.code === "ABORTED") ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}
