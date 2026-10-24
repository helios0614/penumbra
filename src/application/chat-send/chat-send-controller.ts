import {
  ChatExecutionContractError,
  openRegenerateExecution,
  openSendExecution,
  type ChatExecutionEvent,
  type ChatProviderFailureCode,
  type ChatExecutionStream,
  type RegeneratePersistenceReceipt,
  type RegenerateInput,
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
  areRegeneratePersistenceProjectionsEqual,
  createRegeneratePersistenceProjection,
  type ChatHistoryReconciliationResult,
} from "@/application/chat-send/chat-regenerate-persistence";
import {
  finalizationUncertainError,
  providerFailureError,
  toSafeChatExecutionError,
} from "@/application/chat-send/chat-send-errors";
import {
  mapChatRegenerateExecutionInput,
  mapChatSendExecutionInput,
} from "@/application/chat-send/chat-send-request";
import {
  INITIAL_CHAT_SEND_STATE,
  type ChatExecutionKind,
  type ChatRegenerateInput,
  type ChatSendInput,
  type ChatSendState,
  type OptimisticUserMessage,
  type SafeChatExecutionError,
} from "@/application/chat-send/chat-send-types";
import { ApiError } from "@/lib/api";

export type ChatSendExecutionOpener = (
  conversationId: string,
  input: SendMessageInput,
  options?: { readonly signal?: AbortSignal },
) => Promise<SendExecutionResult>;

export type ChatRegenerateExecutionOpener = (
  conversationId: string,
  messageId: string,
  input: RegenerateInput,
  options?: { readonly signal?: AbortSignal },
) => Promise<ChatExecutionStream>;

export type ChatHistoryReconciler = (
  conversationId: string,
  regenerateTargetMessageId?: string,
) => Promise<ChatHistoryReconciliationResult>;

export type ChatSendControllerDependencies = {
  readonly openExecution?: ChatSendExecutionOpener;
  readonly openRegenerateExecution?: ChatRegenerateExecutionOpener;
  readonly reconcileHistory: ChatHistoryReconciler;
  readonly createUuid?: () => string;
  readonly now?: () => number;
};

export interface ChatSendController {
  getState(): ChatSendState;
  send(input: ChatSendInput): Promise<boolean>;
  regenerate(input: ChatRegenerateInput): Promise<boolean>;
  retryFinalization(): Promise<void>;
  resetError(): void;
  releaseAfterReview(): void;
  subscribe(listener: (state: ChatSendState) => void): () => void;
  dispose(): void;
}

type ActiveExecutionBase = {
  readonly executionId: string;
  readonly conversationId: string;
  accumulator: StreamingAssistantAccumulator;
  executionError: SafeChatExecutionError | null;
  terminalFailure: boolean;
  recoveryReadSucceeded: boolean;
  abortController: AbortController;
};

type ActiveSendExecution = ActiveExecutionBase & {
  readonly kind: "send";
  readonly optimisticUser: OptimisticUserMessage;
  duplicateUserMessageId: string | null;
};

type ActiveRegenerateExecution = ActiveExecutionBase & {
  readonly kind: "regenerate";
  readonly targetMessageId: string;
  persistenceReceipt: RegeneratePersistenceReceipt | null;
  persistenceReceiptContractFailure: boolean;
  sawTargetStart: boolean;
};

type ActiveExecution = ActiveSendExecution | ActiveRegenerateExecution;

export function createChatSendController(
  dependencies: ChatSendControllerDependencies,
): ChatSendController {
  const openExecution = dependencies.openExecution ?? openSendExecution;
  const openRegenerate = dependencies.openRegenerateExecution ??
    openRegenerateExecution;
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
  ): ChatSendState => execution.kind === "send"
    ? {
        kind,
        executionId: execution.executionId,
        conversationId: execution.conversationId,
        optimisticUser: execution.optimisticUser,
        assistant: execution.accumulator.message,
        executionError: execution.executionError,
      }
    : {
        kind: kind === "streaming"
          ? "regenerate-streaming"
          : "regenerate-finalizing",
        executionId: execution.executionId,
        conversationId: execution.conversationId,
        targetMessageId: execution.targetMessageId,
        assistant: execution.accumulator.message,
        executionError: execution.executionError,
      };

  const finalize = async (execution: ActiveExecution) => {
    if (!isCurrent(execution)) return;
    publish(activeAssistantState("finalizing", execution));

    try {
      const reconciliation = execution.kind === "regenerate"
        ? await dependencies.reconcileHistory(
            execution.conversationId,
            execution.targetMessageId,
          )
        : await dependencies.reconcileHistory(execution.conversationId);
      if (!isCurrent(execution)) return;
      execution.recoveryReadSucceeded = true;
      if (
        execution.kind === "regenerate" &&
        execution.persistenceReceiptContractFailure
      ) {
        throw new Error("Regenerate persistence receipt contract failed");
      }
      if (!execution.terminalFailure || (execution.kind === "send" && execution.accumulator.message.assistantMessageId !== null)) {
        if (execution.kind === "regenerate") {
          if (!execution.sawTargetStart || !isRegeneratePersistenceConfirmed(execution, reconciliation)) {
            throw new Error(
              "Expected regenerate state is not yet present in HTTP history",
            );
          }
        } else {
          const expectedPersistedMessageId = execution.duplicateUserMessageId ??
            execution.accumulator.message.assistantMessageId;
          if (
            expectedPersistedMessageId === null ||
            !reconciliation.persistedMessageIds.includes(
              expectedPersistedMessageId,
            )
          ) {
            throw new Error(
              "Expected assistant is not yet present in HTTP history",
            );
          }
        }
      }

      active = null;
      publish(execution.executionError === null
        ? INITIAL_CHAT_SEND_STATE
        : { kind: "error", conversationId: execution.conversationId,
          confirmedFailure: execution.terminalFailure,
          failedMessageId: !execution.terminalFailure ? undefined : execution.kind === "regenerate" ? execution.targetMessageId : execution.accumulator.message.assistantMessageId ?? undefined,
          failedTargetContent: execution.kind === "regenerate" ? reconciliation.regenerateTarget?.content : undefined,
          ...(execution.kind === "send" && execution.accumulator.message.assistantMessageId === null
            ? { assistant: { ...execution.accumulator.message, error: execution.executionError.message } } : {}),
          error: execution.executionError });
    } catch {
      if (!isCurrent(execution)) return;
      publish(execution.kind === "send"
        ? {
            kind: "finalization-uncertain",
            recoveryReadSucceeded: execution.recoveryReadSucceeded,
            executionId: execution.executionId,
            conversationId: execution.conversationId,
            optimisticUser: execution.optimisticUser,
            assistant: execution.accumulator.message,
            executionError: execution.executionError,
            error: finalizationUncertainError(),
          }
        : {
            kind: "regenerate-finalization-uncertain",
            recoveryReadSucceeded: execution.recoveryReadSucceeded,
            executionId: execution.executionId,
            conversationId: execution.conversationId,
            targetMessageId: execution.targetMessageId,
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
        if (execution.kind === "send" &&
            (event.type === "failure" || (event.type === "debug-summary" && event.hasError)) &&
            execution.accumulator.message.assistantMessageId !== null &&
            event.messageId !== execution.accumulator.message.assistantMessageId) {
          throw new ChatExecutionContractError("Send failure ID does not match its assistant message ID");
        }
        if (execution.kind === "regenerate" &&
            (event.type === "failure" || (event.type === "debug-summary" && event.hasError)) &&
            event.messageId !== execution.targetMessageId) {
          throw new ChatExecutionContractError("Regenerate failure ID does not match the target message ID");
        }
        if (execution.kind === "regenerate" && event.type === "start") {
          if (event.assistantMessageId !== execution.targetMessageId) {
            throw new ChatExecutionContractError(
              "Regenerate start ID does not match the target message ID",
            );
          }
          execution.sawTargetStart = true;
        }
        if (execution.kind === "regenerate" && event.type === "persisted") {
          if (event.receipt.id !== execution.targetMessageId) {
            execution.persistenceReceiptContractFailure = true;
            execution.executionError = toSafeChatExecutionError(
              new ChatExecutionContractError(
                "Regenerate persistence receipt ID does not match the target message ID",
              ),
              "regenerate",
            );
          } else {
            execution.persistenceReceipt =
              createRegeneratePersistenceProjection(event.receipt);
          }
        }
        const reduction = reduceChatExecutionEvent(
          execution.accumulator,
          event,
        );
        execution.accumulator = reduction.accumulator;
        if (reduction.failure !== null && execution.executionError === null) {
          execution.terminalFailure = true;
          execution.executionError = providerFailureError(
            reduction.failure === "provider-failure"
              ? null
              : reduction.failure as ChatProviderFailureCode,
          );
        }
        if (execution.accumulator.message.error && execution.executionError?.code === "provider-failure") {
          execution.executionError = { ...execution.executionError, message: execution.accumulator.message.error };
        }
        publish(activeAssistantState("streaming", execution));
      }
    } catch (error) {
      if (!isCurrent(execution)) return;
      execution.executionError ??= toSafeChatExecutionError(
        error,
        execution.kind,
      );
    }

    execution.accumulator = flushAssistantAccumulator(execution.accumulator);
    if (
      execution.kind === "regenerate" &&
      !execution.sawTargetStart &&
      execution.executionError === null
    ) {
      execution.executionError = toSafeChatExecutionError(
        new ChatExecutionContractError(
          "Regenerate stream ended before its target start event",
        ),
        "regenerate",
      );
    }
    await finalize(execution);
  };

  const isCurrent = (execution: ActiveExecution) =>
    !disposed && active === execution;

  return {
    getState() {
      return state;
    },

    async send(input) {
      if (
        disposed ||
        active !== null ||
        (state.kind !== "idle" && state.kind !== "error")
      ) {
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
        kind: "send",
        executionId,
        conversationId: input.conversationId,
        optimisticUser,
        accumulator: createStreamingAssistantAccumulator(
          executionId,
          createdAt,
        ),
        executionError: null,
        terminalFailure: false,
        recoveryReadSucceeded: false,
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
        execution.executionError = toSafeChatExecutionError(error);
        execution.terminalFailure = isDefiniteRejection(error);
        void finalize(execution);
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

    async regenerate(input) {
      if (
        disposed ||
        active !== null ||
        (state.kind !== "idle" && state.kind !== "error")
      ) {
        return false;
      }
      if (
        !input.conversationId ||
        !input.targetMessageId ||
        !Number.isFinite(input.targetCreatedAt)
      ) {
        return false;
      }

      let executionId: string;
      try {
        executionId = `execution:regenerate:${createUuid()}`;
      } catch (error) {
        publish({
          kind: "error",
          error: toSafeChatExecutionError(error, "regenerate"),
        });
        return false;
      }

      const execution: ActiveRegenerateExecution = {
        kind: "regenerate",
        executionId,
        conversationId: input.conversationId,
        targetMessageId: input.targetMessageId,
        persistenceReceipt: null,
        persistenceReceiptContractFailure: false,
        accumulator: createStreamingAssistantAccumulator(
          executionId,
          input.targetCreatedAt,
        ),
        executionError: null,
        terminalFailure: false,
        recoveryReadSucceeded: false,
        sawTargetStart: false,
        abortController: new AbortController(),
      };
      active = execution;
      publish(activeAssistantState("streaming", execution));

      let result: ChatExecutionStream;
      try {
        result = await openRegenerate(
          input.conversationId,
          input.targetMessageId,
          mapChatRegenerateExecutionInput(input.generation),
          { signal: execution.abortController.signal },
        );
      } catch (error) {
        if (!isCurrent(execution)) return false;
        execution.executionError = toSafeChatExecutionError(error, "regenerate");
        execution.terminalFailure = isDefiniteRejection(error);
        void finalize(execution);
        return false;
      }

      if (!isCurrent(execution)) return false;
      void consume(execution, result.events);
      return true;
    },

    async retryFinalization() {
      if (!disposed && active === null && state.kind === "error" && !state.conversationId) {
        publish(INITIAL_CHAT_SEND_STATE);
        return;
      }
      if (!disposed && active === null && state.kind === "error" && state.conversationId) {
        const failedState = state;
        try {
          await dependencies.reconcileHistory(state.conversationId);
          if (state === failedState) publish(INITIAL_CHAT_SEND_STATE);
        } catch { /* Retain the safe error and the read-only recovery action. */ }
        return;
      }
      if (
        disposed ||
        active === null ||
        (
          state.kind !== "finalization-uncertain" &&
          state.kind !== "regenerate-finalization-uncertain"
        )
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

    releaseAfterReview() {
      if (!disposed && active?.recoveryReadSucceeded &&
          (state.kind === "finalization-uncertain" || state.kind === "regenerate-finalization-uncertain")) {
        // Explicit human review is not a completion/stop acknowledgement from the backend.
        active = null;
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
    state.kind === "finalization-uncertain" ||
    state.kind === "regenerate-streaming" ||
    state.kind === "regenerate-finalizing" ||
    state.kind === "regenerate-finalization-uncertain"
  );
}

export const isChatExecutionActive = isChatSendActive;

export function getChatExecutionKind(
  state: ChatSendState,
): ChatExecutionKind | null {
  switch (state.kind) {
    case "sending-user":
    case "streaming":
    case "finalizing":
    case "finalization-uncertain":
      return "send";
    case "regenerate-streaming":
    case "regenerate-finalizing":
    case "regenerate-finalization-uncertain":
      return "regenerate";
    case "idle":
    case "error":
      return null;
  }
}

function defaultUuid(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("Secure UUID generation is unavailable");
  }
  return globalThis.crypto.randomUUID();
}

function isDefiniteRejection(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

function isRegeneratePersistenceConfirmed(
  execution: ActiveRegenerateExecution,
  reconciliation: ChatHistoryReconciliationResult,
): boolean {
  const expected = execution.persistenceReceipt;
  const persisted = reconciliation.regenerateTarget;
  if (expected === null || persisted === null) return false;
  return areRegeneratePersistenceProjectionsEqual(persisted, expected);
}
