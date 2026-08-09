import {
  openSendExecution,
  type ChatExecutionEvent,
  type ChatProviderFailureCode,
  type SendExecutionResult,
  type SendMessageInput,
} from "@/application/chat-execution";
import {
  createStreamingAssistantAccumulator,
  flushAssistantAccumulator,
  reduceChatExecutionEvent,
  type StreamingAssistantAccumulator,
} from "@/application/chat-send/chat-send-accumulator";
import {
  finalizationUncertainError,
  providerFailureError,
  toSafeChatExecutionError,
} from "@/application/chat-send/chat-send-errors";
import { mapChatSendExecutionInput } from "@/application/chat-send/chat-send-request";
import {
  INITIAL_CHAT_SEND_STATE,
  type ChatSendInput,
  type ChatSendState,
  type OptimisticUserMessage,
  type SafeChatExecutionError,
} from "@/application/chat-send/chat-send-types";

export type ChatSendExecutionOpener = (
  conversationId: string,
  input: SendMessageInput,
  options?: { readonly signal?: AbortSignal },
) => Promise<SendExecutionResult>;

export type ChatHistoryReconciler = (
  conversationId: string,
) => Promise<readonly string[]>;

export type ChatSendControllerDependencies = {
  readonly openExecution?: ChatSendExecutionOpener;
  readonly reconcileHistory: ChatHistoryReconciler;
  readonly createUuid?: () => string;
  readonly now?: () => number;
};

export interface ChatSendController {
  getState(): ChatSendState;
  send(input: ChatSendInput): Promise<boolean>;
  retryFinalization(): Promise<void>;
  resetError(): void;
  subscribe(listener: (state: ChatSendState) => void): () => void;
  dispose(): void;
}

type ActiveExecution = {
  readonly executionId: string;
  readonly conversationId: string;
  readonly optimisticUser: OptimisticUserMessage;
  accumulator: StreamingAssistantAccumulator;
  executionError: SafeChatExecutionError | null;
  duplicateUserMessageId: string | null;
  abortController: AbortController;
};

export function createChatSendController(
  dependencies: ChatSendControllerDependencies,
): ChatSendController {
  const openExecution = dependencies.openExecution ?? openSendExecution;
  const createUuid = dependencies.createUuid ?? defaultUuid;
  const now = dependencies.now ?? (() => Date.now() / 1000);
  let state = INITIAL_CHAT_SEND_STATE;
  let active: ActiveExecution | null = null;
  let disposed = false;
  const listeners = new Set<(state: ChatSendState) => void>();

  const publish = (nextState: ChatSendState) => {
    if (disposed) return;
    state = nextState;
    listeners.forEach((listener) => listener(state));
  };

  const activeAssistantState = (
    kind: "streaming" | "finalizing",
    execution: ActiveExecution,
  ): ChatSendState => ({
    kind,
    executionId: execution.executionId,
    conversationId: execution.conversationId,
    optimisticUser: execution.optimisticUser,
    assistant: execution.accumulator.message,
    executionError: execution.executionError,
  });

  const finalize = async (execution: ActiveExecution) => {
    if (!isCurrent(execution)) return;
    publish(activeAssistantState("finalizing", execution));

    try {
      const persistedMessageIds = await dependencies.reconcileHistory(
        execution.conversationId,
      );
      if (!isCurrent(execution)) return;
      const expectedPersistedMessageId =
        execution.duplicateUserMessageId ??
        execution.accumulator.message.assistantMessageId;
      if (
        execution.executionError === null &&
        (
          expectedPersistedMessageId === null ||
          !persistedMessageIds.includes(expectedPersistedMessageId)
        )
      ) {
        throw new Error("Expected assistant is not yet present in HTTP history");
      }

      active = null;
      publish(execution.executionError === null
        ? INITIAL_CHAT_SEND_STATE
        : { kind: "error", error: execution.executionError });
    } catch {
      if (!isCurrent(execution)) return;
      publish({
        kind: "finalization-uncertain",
        executionId: execution.executionId,
        conversationId: execution.conversationId,
        optimisticUser: execution.optimisticUser,
        assistant: execution.accumulator.message,
        executionError: execution.executionError,
        error: finalizationUncertainError(),
      });
    }
  };

  const consume = async (
    execution: ActiveExecution,
    events: AsyncIterable<ChatExecutionEvent>,
  ) => {
    try {
      for await (const event of events) {
        if (!isCurrent(execution)) return;
        const reduction = reduceChatExecutionEvent(
          execution.accumulator,
          event,
        );
        execution.accumulator = reduction.accumulator;
        if (reduction.failure !== null && execution.executionError === null) {
          execution.executionError = providerFailureError(
            reduction.failure === "provider-failure"
              ? null
              : reduction.failure as ChatProviderFailureCode,
          );
        }
        publish(activeAssistantState("streaming", execution));
      }
    } catch (error) {
      if (!isCurrent(execution)) return;
      execution.executionError = toSafeChatExecutionError(error);
    }

    execution.accumulator = flushAssistantAccumulator(execution.accumulator);
    await finalize(execution);
  };

  const isCurrent = (execution: ActiveExecution) =>
    !disposed && active === execution;

  return {
    getState() {
      return state;
    },

    async send(input) {
      if (disposed || active !== null || state.kind !== "idle") {
        return false;
      }

      const content = input.content.trim();
      if (!content || !input.conversationId) {
        return false;
      }

      let clientMessageId: string;
      try {
        clientMessageId = createUuid();
      } catch (error) {
        publish({ kind: "error", error: toSafeChatExecutionError(error) });
        return false;
      }

      const executionId = `execution:${clientMessageId}`;
      const createdAt = now();
      const optimisticUser: OptimisticUserMessage = {
        overlayId: `${executionId}:user`,
        clientMessageId,
        content,
        createdAt,
      };
      const execution: ActiveExecution = {
        executionId,
        conversationId: input.conversationId,
        optimisticUser,
        accumulator: createStreamingAssistantAccumulator(
          executionId,
          createdAt,
        ),
        executionError: null,
        duplicateUserMessageId: null,
        abortController: new AbortController(),
      };
      active = execution;
      publish({
        kind: "sending-user",
        executionId,
        conversationId: input.conversationId,
        optimisticUser,
      });

      let result: SendExecutionResult;
      try {
        result = await openExecution(
          input.conversationId,
          mapChatSendExecutionInput(
            content,
            clientMessageId,
            input.generation,
          ),
          { signal: execution.abortController.signal },
        );
      } catch (error) {
        if (!isCurrent(execution)) return false;
        active = null;
        publish({ kind: "error", error: toSafeChatExecutionError(error) });
        return false;
      }

      if (!isCurrent(execution)) return false;
      if (result.kind === "duplicate") {
        execution.duplicateUserMessageId = result.userMessageId;
        void finalize(execution);
      } else {
        publish(activeAssistantState("streaming", execution));
        void consume(execution, result.events);
      }
      return true;
    },

    async retryFinalization() {
      if (
        disposed ||
        active === null ||
        state.kind !== "finalization-uncertain"
      ) {
        return;
      }
      await finalize(active);
    },

    resetError() {
      if (!disposed && active === null && state.kind === "error") {
        publish(INITIAL_CHAT_SEND_STATE);
      }
    },

    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      active?.abortController.abort();
      active = null;
    },
  };
}

export function isChatSendActive(state: ChatSendState): boolean {
  return (
    state.kind === "sending-user" ||
    state.kind === "streaming" ||
    state.kind === "finalizing" ||
    state.kind === "finalization-uncertain"
  );
}

function defaultUuid(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("Secure UUID generation is unavailable");
  }
  return globalThis.crypto.randomUUID();
}
