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
  /** Exact server identity from this submission's validated receipt/duplicate ACK. */
  readonly persistedMessageId?: string;
  readonly content: string;
  readonly createdAt: number;
  readonly attachments?: readonly string[];
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

type ChatSendStateBase =
  | { readonly kind: "idle"; readonly confirmedSend?: { readonly conversationId: string; readonly clientMessageId: string } }
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
      readonly regeneratePartial?: StreamingAssistantMessage;
      readonly rejectedSubmission?: OptimisticUserMessage;
      readonly acceptedSend?: { readonly conversationId: string; readonly clientMessageId: string };
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

/** A reviewed unknown execution remains recoverable after its input lock is released. */
export type ChatExecutionRecovery = Extract<ChatSendStateBase, {
  readonly kind: "finalization-uncertain" | "regenerate-finalization-uncertain";
}>;

export type ChatSendState = ChatSendStateBase & {
  readonly recoveries?: readonly ChatExecutionRecovery[];
  /** A late, authoritative result may clear only this original submission's recovery. */
  readonly reconciledSend?: { readonly conversationId: string; readonly clientMessageId: string };
};

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
