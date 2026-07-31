import type { Conversation } from "@/domain/conversation";
import {
  getAvailableModels,
  getChatReadiness,
} from "@/domain/runtime";
import type { ApiRequestOptions } from "@/lib/api";

import type { ChatSetupViewModel } from "@/application/chat-setup/chat-setup-types";
import {
  assertChatSetupConversation,
  createChatSetupViewModel,
} from "@/application/chat-setup/chat-setup-view-model";

export async function loadChatSetupForConversation(
  conversation: Conversation,
  options?: ApiRequestOptions,
): Promise<ChatSetupViewModel> {
  assertChatSetupConversation(conversation);

  const [availableModels, readiness] = await Promise.all([
    getAvailableModels(options),
    getChatReadiness(conversation.modelKey, options),
  ]);

  return createChatSetupViewModel({
    conversation,
    availableModels,
    readiness,
  });
}

export async function loadBootstrapChatSetup(
  options?: ApiRequestOptions,
): Promise<ChatSetupViewModel> {
  const [availableModels, readiness] = await Promise.all([
    getAvailableModels(options),
    getChatReadiness(undefined, options),
  ]);

  return createChatSetupViewModel({
    conversation: null,
    availableModels,
    readiness,
  });
}
