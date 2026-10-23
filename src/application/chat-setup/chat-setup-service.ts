import type { Conversation } from "@/domain/conversation";
import {
  getMainConfiguration,
  getChatReadiness,
  RuntimeContractError,
  type AvailableModel,
  type ChatReadiness,
  type MainConfiguration,
} from "@/domain/runtime";
import { ApiError, type ApiRequestOptions } from "@/lib/api";

import type {
  ChatSetupViewModel,
  SafeReadinessReason,
} from "@/application/chat-setup/chat-setup-types";

type LoadedReadinessState =
  | { readonly kind: "available"; readonly value: ChatReadiness }
  | { readonly kind: "unavailable"; readonly reason: SafeReadinessReason };
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

  return loadSetup(conversation, options);
}

// Retain this Application entry point for workspace callers; catalog is only a suggestion.
export async function loadChatSetupForConversationWithModels(
  conversation: Conversation,
  _availableModels: readonly AvailableModel[],
  options?: ApiRequestOptions,
): Promise<ChatSetupViewModel> {
  assertChatSetupConversation(conversation);
  return loadSetup(conversation, options);
}

export async function loadBootstrapChatSetup(options?: ApiRequestOptions): Promise<ChatSetupViewModel> {
  return loadSetup(null, options);
}

async function loadSetup(conversation: Conversation | null, options?: ApiRequestOptions): Promise<ChatSetupViewModel> {
  const [configuration, readiness] = await Promise.all([
    loadConfiguration(conversation?.id, options),
    loadReadinessState(conversation?.id, options),
  ]);
  if (configuration.kind === "unavailable") {
    return createUnavailableChatSetupViewModel({ conversation, availableModels: [], configuration: null, reason: configuration.reason });
  }
  if (readiness.kind === "unavailable") {
    return createUnavailableChatSetupViewModel({ conversation, availableModels: [], configuration: configuration.value, reason: readiness.reason });
  }
  try {
    return createChatSetupViewModel({ conversation, availableModels: [], configuration: configuration.value, readiness: readiness.value });
  } catch (error) {
    // Concurrent configuration changes must block execution without hiding readable history.
    return createUnavailableChatSetupViewModel({ conversation, availableModels: [], configuration: configuration.value, reason: toSafeReadinessReason(error) });
  }
}

async function loadConfiguration(conversationId: string | undefined, options?: ApiRequestOptions): Promise<
  { kind: "available"; value: MainConfiguration } | { kind: "unavailable"; reason: SafeReadinessReason }
> {
  try { return { kind: "available", value: await getMainConfiguration(conversationId, options) }; }
  catch (error) {
    if (isAuthenticationError(error) || isAbortError(error)) throw error;
    return { kind: "unavailable", reason: toSafeReadinessReason(error) };
  }
}

async function loadReadinessState(
  conversationId: string | undefined,
  options?: ApiRequestOptions,
): Promise<LoadedReadinessState> {
  try {
    const readiness = await getChatReadiness(conversationId, options);
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
