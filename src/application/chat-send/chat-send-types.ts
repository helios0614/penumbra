import type {
  ChatProviderFailureCode,
  RegenerateInput,
  SafeUsageSummary,
  SendMessageInput,
} from "@/application/chat-execution";

export type ChatGenerationUiValues = Omit<
  SendMessageInput,
  "content" | "clientMessageId"
>;

export type ChatRegenerateGenerationUiValues = RegenerateInput;
export type ChatExecutionKind = "send" | "regenerate";

export type OptimisticUserMessage = {
  readonly overlayId: string;
  readonly clientMessageId: string;
  readonly content: string;
  readonly createdAt: number;
};

export type StreamingAssistantMessage = {
  readonly overlayId: string;
  readonly assistantMessageId: string | null;
  readonly content: string;
  readonly thinking: string | null;
  readonly simpleThink: string | null;
  readonly usage: SafeUsageSummary | null;
  readonly createdAt: number;
  readonly error?: string;
  readonly toolPending?: boolean;
};

export type SafeChatExecutionErrorCode =
  | "authentication"
  | "regenerate-target-not-found"
  | "regenerate-target-invalid"
  | "regenerate-target-not-latest"
  | "regenerate-conflict"
  | "unknown-model"
  | "invalid-generation-options"
  | "unsupported-generation-option"
  | "provider-not-configured"
  | "provider-failure"
  | "network"
  | "timeout"
  | "contract"
  | "service"
  | "unknown";

export type SafeChatExecutionError = {
  readonly code: SafeChatExecutionErrorCode;
  readonly message: string;
  readonly field: ChatGenerationOptionField | null;
  readonly providerFailure: ChatProviderFailureCode | null;
};

export type ChatGenerationOptionField =
  | "attachments"
  | "client_msg_id"
  | "temperature"
  | "context_limit"
  | "thinking_effort"
  | "fast_mode"
  | "whisper_mode";

type ActiveChatSendState = {
  readonly executionId: string;
  readonly conversationId: string;
  readonly optimisticUser: OptimisticUserMessage;
};

type AssistantChatSendState = ActiveChatSendState & {
  readonly assistant: StreamingAssistantMessage;
  readonly executionError: SafeChatExecutionError | null;
};

type ActiveChatRegenerateState = {
  readonly executionId: string;
  readonly conversationId: string;
  readonly targetMessageId: string;
  readonly assistant: StreamingAssistantMessage;
  readonly executionError: SafeChatExecutionError | null;
};

export type ChatSendState =
  | { readonly kind: "idle" }
  | (ActiveChatSendState & { readonly kind: "sending-user" })
  | (AssistantChatSendState & { readonly kind: "streaming" })
  | (AssistantChatSendState & { readonly kind: "finalizing" })
  | (AssistantChatSendState & {
      readonly kind: "finalization-uncertain";
      readonly recoveryReadSucceeded?: boolean;
      readonly error: SafeChatExecutionError;
    })
  | {
      readonly kind: "error";
      readonly error: SafeChatExecutionError;
      readonly conversationId?: string;
      readonly optimisticUser?: OptimisticUserMessage;
      readonly assistant?: StreamingAssistantMessage;
      readonly confirmedFailure?: boolean;
      readonly failedMessageId?: string;
      readonly failedTargetContent?: string;
    }
  | (ActiveChatRegenerateState & {
      readonly kind: "regenerate-streaming";
    })
  | (ActiveChatRegenerateState & {
      readonly kind: "regenerate-finalizing";
    })
  | (ActiveChatRegenerateState & {
      readonly kind: "regenerate-finalization-uncertain";
      readonly recoveryReadSucceeded?: boolean;
      readonly error: SafeChatExecutionError;
    });

export type ChatSendInput = {
  readonly conversationId: string;
  readonly content: string;
  readonly generation?: ChatGenerationUiValues;
};

export type ChatRegenerateInput = {
  readonly conversationId: string;
  readonly targetMessageId: string;
  readonly targetCreatedAt: number;
  readonly generation?: ChatRegenerateGenerationUiValues;
};

export const INITIAL_CHAT_SEND_STATE: ChatSendState = Object.freeze({
  kind: "idle",
});
