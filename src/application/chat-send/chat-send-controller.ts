import { aliasChatTrace, bindChatTrace, traceChat } from "@/lib/chat-timeline";
import {
  ChatExecutionContractError,
  openRegenerateExecution,
  openSendExecution,
  type ChatExecutionEvent,
  type ChatProviderFailureCode,
  type ChatExecutionStream,
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
import type { ChatHistoryReconciliationResult } from "@/application/chat-send/chat-regenerate-persistence";
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
  type ChatExecutionRecovery,
  type ChatRegenerateInput,
  type ChatSendInput,
  type ChatSendState,
  type OptimisticUserMessage,
  type SafeChatExecutionError,
  type StreamingAssistantMessage,
} from "@/application/chat-send/chat-send-types";
import { assistantFailureCode, assistantFailureIndex, formatAssistantFailure } from "@/domain/message/assistant-failure";
import type { ChatSendResult } from "./chat-send-result";
import { isDefiniteChatRejection } from "./chat-send-rejection";
import { ApiError } from "@/lib/api";
import { cancelChatExecution, encodeChatExecutionId, mapMainChatExecution, readActiveChatExecution, readChatExecution, type MainChatExecution } from "@/application/chat-execution/chat-execution-status";
import { readChatExecutionResults } from "@/application/chat-execution/chat-execution-results";

export type ChatSendExecutionOpener = (
  conversationId: string,
  input: SendMessageInput,
  options?: { readonly signal?: AbortSignal },
) => Promise<SendExecutionResult>;

export type ChatRegenerateExecutionOpener = (
  conversationId: string,
  messageId: string,
  input: RegenerateInput,
  options?: { readonly signal?: AbortSignal; readonly headers?: HeadersInit },
) => Promise<ChatExecutionStream>;

export type ChatHistoryReconciler = (
  conversationId: string,
  regenerateTargetMessageId?: string,
) => Promise<ChatHistoryReconciliationResult>;

export type ChatSendControllerDependencies = {
  readonly readExecutionResults?: typeof readChatExecutionResults;
  readonly readExecution?: typeof readChatExecution;
  readonly readActiveExecution?: typeof readActiveChatExecution;
  readonly cancelExecution?: typeof cancelChatExecution;
  readonly openExecution?: ChatSendExecutionOpener;
  readonly openRegenerateExecution?: ChatRegenerateExecutionOpener;
  readonly reconcileHistory: ChatHistoryReconciler;
  readonly lookupSendResult?: (conversationId: string, clientMessageId: string) => Promise<ChatSendResult>;
  readonly createUuid?: () => string;
  readonly now?: () => number;
};

export interface ChatSendController {
  getState(): ChatSendState;
  send(input: ChatSendInput): Promise<boolean>;
  regenerate(input: ChatRegenerateInput): Promise<boolean>;
  reconcileUserPersistence(): Promise<void>;
  retryFinalization(options?: { readonly manual?: boolean }): Promise<void>;
  resetError(): void;
  cancel(): Promise<void>;
  discoverActive(conversationId: string): Promise<void>;
  recoverStoppedResults(conversationId: string): Promise<void>;
  subscribe(listener: (state: ChatSendState) => void): () => void;
  dispose(): void;
}

type ActiveExecutionBase = {
  status: MainChatExecution | null;
  readonly executionId: string;
  readonly conversationId: string;
  accumulator: StreamingAssistantAccumulator;
  executionError: SafeChatExecutionError | null;
  terminalFailure: boolean;
  recoveryReadSucceeded: boolean;
  abortController: AbortController;
  /** Includes POST/header waiting. Silence is not evidence that the relay ended. */
  transportPending: boolean;
  finalization: Promise<void> | null;
};

type ActiveSendExecution = ActiveExecutionBase & {
  readonly kind: "send";
  optimisticUser: OptimisticUserMessage;
  duplicateUserMessageId: string | null;
  receiptLookup: Promise<ChatSendResult | null> | null;
};

type ActiveRegenerateExecution = ActiveExecutionBase & {
  readonly kind: "regenerate";
  readonly targetMessageId: string;
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
  const readExecution = dependencies.readExecution ?? readChatExecution;
  const readActiveExecution = dependencies.readActiveExecution ?? readActiveChatExecution;
  const cancelExecution = dependencies.cancelExecution ?? cancelChatExecution;
  const readExecutionResults = dependencies.readExecutionResults ?? readChatExecutionResults;
  let state = INITIAL_CHAT_SEND_STATE;
  let serverExecution: MainChatExecution | undefined;
  let conversationOwner: string | undefined;
  let discovering = false, discoveryUnknown = false, cancelling = false;
  let checking = 0;
  let controlError: string | undefined;
  let discovery: Promise<void> | null = null;
  let resultsRecovery: Promise<void> | null = null;
  let resultsError: string | undefined;
  const stoppedExecutions: { execution: MainChatExecution; createdAt: number }[] = [];
  const rememberStopped = (result: MainChatExecution, createdAt: number) => {
    if (result.terminal && result.outcome === "cancelled" && !stoppedExecutions.some(item => item.execution.executionId === result.executionId)) {
      stoppedExecutions.push({ execution: result, createdAt });
    }
  };
  let active: ActiveExecution | null = null;
  const recoveries = new Map<string, { execution: ActiveExecution; snapshot: ChatExecutionRecovery }>();
  let disposed = false;
  const listeners = new Set<(state: ChatSendState) => void>();

  const publish = (nextState: ChatSendState) => {
    if (disposed) return;
    if ("executionId" in nextState) {
      const assistant = "assistant" in nextState ? nextState.assistant : undefined;
      aliasChatTrace(`${nextState.executionId}:assistant`, nextState);
      if (assistant?.assistantMessageId) aliasChatTrace(assistant.assistantMessageId, nextState);
      if ("targetMessageId" in nextState) aliasChatTrace(nextState.targetMessageId, nextState);
      traceChat("session.publish", nextState, { phase: nextState.kind, size: assistant?.content.length ?? 0 });
    } else if (active) traceChat("session.publish", active, { phase: nextState.kind });
    const { recoveries: _previousRecoveries, serverExecution: _previousServer, discovering: _discovering, checking: _checking, discoveryUnknown: _unknown, cancelling: _cancelling, controlError: _controlError, resultsError: _resultsError, ...current } = nextState;
    state = { ...current,
      ...(conversationOwner ? { executionConversationId: conversationOwner } : {}),
      ...(serverExecution ? { serverExecution } : {}),
      ...(discovering ? { discovering } : {}), ...(discoveryUnknown ? { discoveryUnknown } : {}),
      ...(checking || discovering ? { checking: true } : {}),
      ...(cancelling ? { cancelling } : {}), ...(controlError ? { controlError } : {}),
      ...(resultsError ? { resultsError } : {}),
      ...(stoppedExecutions.length ? { stoppedExecutions: [...stoppedExecutions] } : {}),
      ...(recoveries.size ? { recoveries: [...recoveries.values()].map(item => item.snapshot) } : {}) };
    listeners.forEach((listener) => listener(state));
  };

  const publishFinalization = (execution: ActiveExecution, nextState: ChatSendState) => {
    if (active === execution) {
      if (nextState.kind === "idle" || nextState.kind === "error") active = null;
      publish(nextState);
      return;
    }
    const recovery = recoveries.get(execution.executionId);
    if (!recovery || recovery.execution !== execution) return;
    if (nextState.kind === "finalizing" || nextState.kind === "regenerate-finalizing") return;
    if (nextState.kind === "finalization-uncertain" || nextState.kind === "regenerate-finalization-uncertain") {
      recovery.snapshot = nextState;
      publish(state);
      return;
    }
    recoveries.delete(execution.executionId);
    const reconciledSend = nextState.kind === "idle" ? nextState.confirmedSend
      : nextState.kind === "error" ? nextState.acceptedSend : undefined;
    // A late result removes only its own recovery; the new execution is untouched.
    publish({ ...state, ...(reconciledSend ? { reconciledSend } : {}) });
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

  const lookupReceipt = (execution: ActiveSendExecution): Promise<ChatSendResult | null> => {
    if (!dependencies.lookupSendResult) return Promise.resolve(null);
    if (execution.receiptLookup) return execution.receiptLookup;
    execution.receiptLookup = (async () => {
      const receipt = await dependencies.lookupSendResult!(execution.conversationId, execution.optimisticUser.clientMessageId);
      if (!isCurrent(execution)) return null;
      if (receipt.conversationId !== execution.conversationId || receipt.clientMessageId !== execution.optimisticUser.clientMessageId ||
          !receipt.userMessageId ||
          execution.duplicateUserMessageId !== null && receipt.userMessageId !== execution.duplicateUserMessageId ||
          execution.optimisticUser.persistedMessageId !== undefined && receipt.userMessageId !== execution.optimisticUser.persistedMessageId) {
        throw new ChatExecutionContractError("Send receipt identity mismatch");
      }
      if (execution.optimisticUser.persistedMessageId === undefined) {
        execution.optimisticUser = { ...execution.optimisticUser, persistedMessageId: receipt.userMessageId };
      }
      if (receipt.execution) acceptStatus(execution, receipt.execution);
      if (receipt.assistantMessageId) aliasChatTrace(receipt.assistantMessageId, execution);
      traceChat("receipt.read", execution, { phase: receipt.assistantMessageId ? "assistant" : "user" });
      return receipt;
    })().finally(() => { execution.receiptLookup = null; });
    return execution.receiptLookup;
  };

  const reconcileUserPersistence = async () => {
    const execution = active;
    if (disposed || execution?.kind !== "send" || execution.optimisticUser.persistedMessageId !== undefined) return;
    try {
      const receipt = await lookupReceipt(execution);
      if (receipt && isCurrent(execution) && "executionId" in state && state.executionId === execution.executionId &&
          "optimisticUser" in state && state.optimisticUser !== execution.optimisticUser) {
        // User acceptance changes only its projection, never the assistant/unknown state.
        publish({ ...state, optimisticUser: execution.optimisticUser });
      }
      if (execution.status?.terminal && active === execution) void finalize(execution);
    } catch { /* Missing, stale or unavailable receipts cannot authorize a merge/retry. */ }
  };

  const acceptStatus = (execution: ActiveExecution, value: MainChatExecution) => {
    if (value.conversationId !== execution.conversationId || value.executionId !== execution.executionId || value.kind !== execution.kind) {
      throw new ChatExecutionContractError("Execution identity mismatch");
    }
    // A durable terminal observation is monotonic, even if an older GET returns late.
    if (execution.status?.terminal) return;
    execution.status = value;
    rememberStopped(value, execution.accumulator.message.createdAt);
    if (active === execution) {
      serverExecution = value; controlError = undefined;
      // A concurrent terminal control/result response must not wait behind an
      // older status GET before closing the relay or releasing the send gate.
      if (value.terminal) { execution.abortController.abort(); publish(state); }
    }
  };

  const uncertainState = (execution: ActiveExecution): ChatExecutionRecovery => ({
    ...activeAssistantState("finalizing", execution),
    kind: execution.kind === "send" ? "finalization-uncertain" : "regenerate-finalization-uncertain",
    recoveryReadSucceeded: execution.recoveryReadSucceeded,
    error: finalizationUncertainError(),
  } as ChatExecutionRecovery);

  const performFinalization = async (execution: ActiveExecution) => {
    if (!isCurrent(execution)) return;
    execution.recoveryReadSucceeded = false;
    if (!execution.transportPending) publishFinalization(execution, activeAssistantState("finalizing", execution));
    let reconciliation: ChatHistoryReconciliationResult | null = null;
    try {
      if (!execution.status?.terminal) {
        const result = await readExecution(execution.conversationId, execution.executionId);
        if (!isCurrent(execution)) return;
        acceptStatus(execution, result);
      }
    } catch { /* A missing/unavailable execution is unknown, never stopped. */ }
    if (!isCurrent(execution)) return;
    // Background/manual GETs observe a live POST/SSE; they do not own its
    // presentation or reader. Recheck after await: EOF may have arrived meanwhile.
    if (execution.transportPending && !execution.status?.terminal) {
      if (active === execution) publish(state);
      return;
    }
    publishFinalization(execution, activeAssistantState("finalizing", execution));
    try {
      if (execution.kind === "send" && !execution.status?.terminal && !execution.optimisticUser.persistedMessageId && execution.receiptLookup === null) {
        try { await lookupReceipt(execution); } catch { /* Exact execution GET survives message deletion. */ }
      }
      reconciliation = execution.kind === "regenerate"
        ? await dependencies.reconcileHistory(execution.conversationId, execution.targetMessageId)
        : await dependencies.reconcileHistory(execution.conversationId);
      if (!isCurrent(execution)) return;
      execution.recoveryReadSucceeded = true;
    } catch { /* Keep the temporary presentation when HTTP history is unavailable. */ }
    if (!isCurrent(execution)) return;
    const result = execution.status;
    if (!result?.terminal) {
      publishFinalization(execution, uncertainState(execution));
      return;
    }

    // Only durable terminal evidence permits closing our relay and releasing generation.
    execution.abortController.abort();
    if (result.outcome === "cancelled") {
      if (active === execution) controlError = reconciliation ? undefined : "执行已终结，历史暂时无法读取；临时结果已保留，可重新核对。";
      publishFinalization(execution, execution.kind === "send"
        ? { kind: "idle", confirmedSend: { conversationId: execution.conversationId, clientMessageId: execution.optimisticUser.clientMessageId } }
        : INITIAL_CHAT_SEND_STATE);
      return;
    }
    if (!reconciliation) {
      // This is a terminal-only presentation recovery, never a nonterminal release.
      const snapshot = { ...uncertainState(execution), serverExecution: result };
      recoveries.set(execution.executionId, { execution, snapshot });
      if (active === execution) {
        active = null;
        controlError = "执行已终结，历史暂时无法读取；临时回复已保留，可重新核对。";
        publish(INITIAL_CHAT_SEND_STATE);
      } else publish(state);
      return;
    }
    const saved = reconciliation.assistants?.find(row => row.id === result.assistantMessageId);
    if (saved) {
      const index = assistantFailureIndex(saved.content);
      const message = index < 0 ? null : formatAssistantFailure(saved.content.slice(index));
      const prior = execution.executionError;
      execution.executionError = message === null ? null : {
        ...providerFailureError(assistantFailureCode(saved.content)),
        message: prior?.code === "provider-failure" && prior.message.includes("\n") && !message.includes("\n") ? prior.message : message,
      };
    } else if (result.outcome === "completed" && (execution.kind !== "regenerate" || !execution.terminalFailure) && execution.executionError?.code !== "provider-failure") execution.executionError = null;
    const error = execution.executionError;
    const acceptedSend = execution.kind === "send"
      ? { conversationId: execution.conversationId, clientMessageId: execution.optimisticUser.clientMessageId } : undefined;
    publishFinalization(execution, error ? { kind: "error", conversationId: execution.conversationId,
      confirmedFailure: true, acceptedSend, error,
      failedMessageId: execution.kind === "regenerate" ? execution.targetMessageId : result.assistantMessageId ?? undefined,
      failedTargetContent: execution.kind === "regenerate" ? reconciliation.regenerateTarget?.content : saved?.content,
      ...(execution.kind === "regenerate" ? { regeneratePartial: execution.accumulator.message }
        : result.assistantMessageId ? {} : { assistant: execution.accumulator.message }),
    } : acceptedSend ? { kind: "idle", confirmedSend: acceptedSend } : INITIAL_CHAT_SEND_STATE);
  };

  const finalize = (execution: ActiveExecution): Promise<void> => {
    if (execution.finalization) return execution.finalization;
    execution.finalization = performFinalization(execution).finally(() => { execution.finalization = null; });
    return execution.finalization;
  };

  const consume = async (
    execution: ActiveExecution,
    events: AsyncIterable<ChatExecutionEvent>,
  ) => {
    try {
      for await (const event of events) {
        if (!isCurrent(execution) || execution.status?.terminal) return;
        traceChat("controller.event", execution, { event: event.type });
        if (event.type === "start" && execution.accumulator.message.assistantMessageId !== null &&
            event.assistantMessageId !== execution.accumulator.message.assistantMessageId) {
          if (execution.kind === "regenerate") throw new ChatExecutionContractError("Conflicting assistant start identity");
          // A new send start means the backend began another attempt: the
          // previous attempt's partial body and error are no longer current.
          execution.accumulator = createStreamingAssistantAccumulator(execution.executionId, execution.accumulator.message.createdAt);
          execution.executionError = null;
          execution.terminalFailure = false;
        }
        if (execution.kind === "send" &&
            (event.type === "failure" || (event.type === "debug-summary" && event.hasError)) &&
            execution.accumulator.message.assistantMessageId !== null &&
            event.messageId !== execution.accumulator.message.assistantMessageId) {
          // Failure for another (stale) attempt: ignore it instead of aborting this stream.
          continue;
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
            execution.executionError = toSafeChatExecutionError(
              new ChatExecutionContractError(
                "Regenerate persistence receipt ID does not match the target message ID",
              ),
              "regenerate",
            );
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
        // Reduce hidden marker buffers and validate identity even when the
        // subscribed presentation does not change.
        const nextState = activeAssistantState("streaming", execution);
        if (!sameStreamingPresentation(state, nextState)) publish(nextState);
      }
    } catch (error) {
      if (!isCurrent(execution) || execution.status?.terminal) return;
      execution.executionError ??= toSafeChatExecutionError(
        error,
        execution.kind,
      );
    }

    execution.transportPending = false;
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
    !disposed && (active === execution || recoveries.get(execution.executionId)?.execution === execution);

  const settleDiscovered = async (result: MainChatExecution) => {
    if (!result.terminal) return;
    rememberStopped(result, now());
    publish(INITIAL_CHAT_SEND_STATE);
    try {
      await dependencies.reconcileHistory(result.conversationId);
      if (serverExecution === result) controlError = undefined;
    } catch {
      if (serverExecution === result) controlError = "执行已终结，历史暂时无法读取；可重新核对。";
    }
    publish(state);
  };

  function discoverActive(conversationId: string): Promise<void> {
    conversationOwner = conversationId;
    if (disposed || active || serverExecution && !serverExecution.terminal) return Promise.resolve();
    if (discovery) return discovery;
    discovering = true; publish(state);
    discovery = (async () => {
      try {
        const result = await readActiveExecution(conversationId);
        if (disposed || active) return;
        // Null proves only that this discovery found no live Main execution.
        if (result) serverExecution = stoppedExecutions.find(item => item.execution.executionId === result.executionId)?.execution ?? result;
        discoveryUnknown = false; controlError = undefined;
      } catch {
        if (disposed || active) return;
        discoveryUnknown = true; controlError = "尚未确认会话的执行状态；请重新核对。";
      } finally { discovering = false; discovery = null; publish(state); }
    })();
    return discovery;
  }

  function recoverStoppedResults(conversationId: string): Promise<void> {
    if (disposed || conversationOwner && conversationOwner !== conversationId) return Promise.resolve();
    conversationOwner = conversationId;
    if (resultsRecovery) return resultsRecovery;
    checking++; publish(state);
    // A finite traversal of bounded pages, only on entry/read-only recovery.
    // Merge successful pages immediately, retaining them if a later GET fails.
    resultsRecovery = (async () => {
      let before: string | undefined;
      const cursors = new Set<string>();
      try {
        do {
          const page = await readExecutionResults(conversationId, before);
          if (disposed) return;
          for (const item of page.results) {
            const result = item.execution;
            const execution = active?.executionId === result.executionId ? active : recoveries.get(result.executionId)?.execution;
            if (execution) { acceptStatus(execution, result); void finalize(execution); }
            else if (serverExecution?.executionId === result.executionId && !serverExecution.terminal) {
              serverExecution = result;
              void settleDiscovered(result);
            }
            rememberStopped(result, item.createdAt);
            const index = stoppedExecutions.findIndex(row => row.execution.executionId === result.executionId);
            stoppedExecutions[index] = item;
          }
          stoppedExecutions.sort((a, b) => a.createdAt - b.createdAt || a.execution.executionId.localeCompare(b.execution.executionId));
          publish(state);
          before = page.nextCursor ?? undefined;
          if (before && cursors.has(before)) throw new ChatExecutionContractError("Repeated execution results cursor");
          if (before) cursors.add(before);
        } while (before);
        resultsError = undefined;
      } catch {
        resultsError = "已停止回复暂时无法完整读取；已显示的内容已保留，可重新核对。";
      } finally { resultsRecovery = null; checking--; publish(state); }
    })();
    return resultsRecovery;
  }

  const reconcileConflict = async (error: unknown, execution: ActiveExecution): Promise<boolean> => {
    if (!(error instanceof ApiError) || error.status !== 409 ||
        (error.data as { detail?: { code?: string } })?.detail?.code !== "chat_execution_active") return false;
    active = null; serverExecution = undefined; discoveryUnknown = true;
    publish(execution.kind === "send" ? { kind: "error", conversationId: execution.conversationId,
      error: execution.executionError!, rejectedSubmission: execution.optimisticUser }
      : { kind: "error", conversationId: execution.conversationId, confirmedFailure: true, error: execution.executionError! });
    await discoverActive(execution.conversationId);
    return true;
  };

  const retainTerminalPresentation = () => {
    if (!active?.status?.terminal) return;
    recoveries.set(active.executionId, { execution: active,
      snapshot: { ...uncertainState(active), serverExecution: active.status } });
    active = null;
  };

  return {
    getState() {
      return state;
    },

    async send(input) {
      retainTerminalPresentation();
      if (
        disposed ||
        active !== null || isChatExecutionActive(state) ||
        (state.kind !== "idle" && state.kind !== "error" && !state.serverExecution?.terminal)
      ) {
        return false;
      }

      const content = input.content;
      if ((!content.trim() && !input.generation?.attachments?.length) || !input.conversationId) {
        return false;
      }

      let clientMessageId: string;
      try {
        clientMessageId = createUuid();
      } catch (error) {
        publish({ kind: "error", error: toSafeChatExecutionError(error) });
        return false;
      }

      const executionId = encodeChatExecutionId("send", clientMessageId);
      const createdAt = now();
      const optimisticUser: OptimisticUserMessage = {
        overlayId: `${executionId}:user`,
        clientMessageId,
        content,
        createdAt,
        ...(input.generation?.attachments?.length ? { attachments: [...input.generation.attachments] } : {}),
      };
      const execution: ActiveExecution = {
        kind: "send",
        status: null,
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
        receiptLookup: null,
        abortController: new AbortController(),
        transportPending: true,
        finalization: null,
      };
      active = execution;
      conversationOwner = input.conversationId;
      serverExecution = undefined; controlError = undefined;
      bindChatTrace(execution.abortController.signal, execution);
      traceChat("execution.begin", execution, { phase: execution.kind });
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
        execution.transportPending = false;
        if (!isCurrent(execution)) return false;
        execution.executionError = toSafeChatExecutionError(error);
        if (await reconcileConflict(error, execution)) return false;
        execution.terminalFailure = isDefiniteChatRejection(error, "send");
        if (execution.terminalFailure) {
          active = null;
          publish({ kind: "error", conversationId: execution.conversationId, error: execution.executionError, rejectedSubmission: execution.optimisticUser });
          return false;
        }
        void finalize(execution);
        return false;
      }

      if (!isCurrent(execution) || execution.status?.terminal) return false;
      if (result.kind === "duplicate") {
        execution.transportPending = false;
        execution.duplicateUserMessageId = result.userMessageId;
        execution.optimisticUser = { ...execution.optimisticUser, persistedMessageId: result.userMessageId };
        void finalize(execution);
      } else {
        publish(activeAssistantState("streaming", execution));
        void reconcileUserPersistence();
        void consume(execution, result.events);
      }
      return true;
    },

    async regenerate(input) {
      retainTerminalPresentation();
      if (
        disposed ||
        active !== null || isChatExecutionActive(state) ||
        (state.kind !== "idle" && state.kind !== "error" && !state.serverExecution?.terminal)
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
      let requestId: string;
      try {
        requestId = createUuid();
        executionId = encodeChatExecutionId("regenerate", requestId);
      } catch (error) {
        publish({
          kind: "error",
          error: toSafeChatExecutionError(error, "regenerate"),
        });
        return false;
      }

      const execution: ActiveRegenerateExecution = {
        kind: "regenerate",
        status: null,
        executionId,
        conversationId: input.conversationId,
        targetMessageId: input.targetMessageId,
        accumulator: createStreamingAssistantAccumulator(
          executionId,
          input.targetCreatedAt,
        ),
        executionError: null,
        terminalFailure: false,
        recoveryReadSucceeded: false,
        sawTargetStart: false,
        abortController: new AbortController(),
        transportPending: true,
        finalization: null,
      };
      active = execution;
      conversationOwner = input.conversationId;
      serverExecution = undefined; controlError = undefined;
      bindChatTrace(execution.abortController.signal, execution);
      traceChat("execution.begin", execution, { phase: execution.kind });
      publish(activeAssistantState("streaming", execution));

      let result: ChatExecutionStream;
      try {
        result = await openRegenerate(
          input.conversationId,
          input.targetMessageId,
          mapChatRegenerateExecutionInput(input.generation),
          { signal: execution.abortController.signal, headers: { "X-Chat-Execution-Id": requestId } },
        );
      } catch (error) {
        execution.transportPending = false;
        if (!isCurrent(execution)) return false;
        execution.executionError = toSafeChatExecutionError(error, "regenerate");
        if (await reconcileConflict(error, execution)) return false;
        execution.terminalFailure = isDefiniteChatRejection(error, "regenerate");
        if (execution.terminalFailure) {
          active = null;
          publish({ kind: "error", conversationId: execution.conversationId, confirmedFailure: true,
            failedMessageId: execution.targetMessageId, error: execution.executionError });
          return false;
        }
        void finalize(execution);
        return false;
      }

      if (!isCurrent(execution) || execution.status?.terminal) return false;
      void consume(execution, result.events);
      return true;
    },

    reconcileUserPersistence,

    async retryFinalization() {
      if (disposed) return;
      checking++; publish(state);
      try {
        if (discovery) { await discovery; return; }
        if (active) { await finalize(active); return; }
        for (const { execution } of [...recoveries.values()]) await finalize(execution);
        if (serverExecution && !serverExecution.terminal) {
          const original = serverExecution;
          try {
            const result = await readExecution(original.conversationId, original.executionId);
            if (disposed || serverExecution !== original) return;
            serverExecution = result; controlError = undefined;
            if (result.terminal) await settleDiscovered(result); else publish(state);
          } catch {
            if (disposed || serverExecution !== original) return;
            controlError = "执行状态暂时无法读取；尚未确认终结。"; publish(state);
          }
          return;
        }
        if (conversationOwner) {
          if (discoveryUnknown) await discoverActive(conversationOwner);
          else {
            try { await dependencies.reconcileHistory(conversationOwner); controlError = undefined; publish(state); }
            catch { controlError = "历史暂时无法读取；当前展示已保留，可重新核对。"; publish(state); }
          }
        }
      } finally { checking--; publish(state); }
    },

    resetError() {
      if (!disposed && active === null && state.kind === "error") {
        publish(INITIAL_CHAT_SEND_STATE);
      }
    },

    async cancel() {
      const execution = active;
      const identity = execution ? { conversationId: execution.conversationId, executionId: execution.executionId } : serverExecution;
      if (disposed || cancelling || !identity || serverExecution?.terminal || serverExecution?.cancelRequested) return;
      cancelling = true; controlError = undefined; publish(state);
      try {
        const response = await cancelExecution(identity.conversationId, identity.executionId);
        if (disposed || execution && active !== execution || !execution && serverExecution?.executionId !== identity.executionId) return;
        if (execution) acceptStatus(execution, response.execution);
        else if (!serverExecution?.terminal) serverExecution = response.execution;
        else return;
        if (response.execution.terminal) {
          if (execution) await finalize(execution);
          else await settleDiscovered(response.execution);
        }
      } catch (error) {
        if (disposed || execution && active !== execution || !execution && (serverExecution?.executionId !== identity.executionId || serverExecution.terminal)) return;
        // 409 supplies a safe exact status, but still cannot prove termination.
        if (error instanceof ApiError && error.status === 409) {
          try {
            const data = error.data as { detail?: { execution?: unknown } };
            const value = mapMainChatExecution(data?.detail?.execution, identity.conversationId, identity.executionId);
            if (execution) acceptStatus(execution, value); else serverExecution = value;
          } catch { /* Invalid/absent projection retains unknown. */ }
        }
        controlError = error instanceof ApiError && error.status === 404
          ? "尚未找到原执行，不能确认停止；可重新核对后再次停止。"
          : error instanceof ApiError && error.status === 409
            ? "当前服务无法控制原执行；请等待并重新核对。"
            : "停止请求结果尚未确认；请重新核对。";
      } finally { cancelling = false; publish(state); }
    },

    discoverActive,
    recoverStoppedResults,

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
      recoveries.forEach(({ execution }) => execution.abortController.abort());
      recoveries.clear();
      active = null;
    },
  };
}

function sameStreamingPresentation(left: ChatSendState, right: ChatSendState): boolean {
  if ((left.kind !== "streaming" && left.kind !== "regenerate-streaming") ||
      (right.kind !== "streaming" && right.kind !== "regenerate-streaming") || left.kind !== right.kind) return false;
  const sameOwner = left.kind === "streaming" && right.kind === "streaming"
    ? left.optimisticUser === right.optimisticUser
    : left.kind === "regenerate-streaming" && right.kind === "regenerate-streaming" && left.targetMessageId === right.targetMessageId;
  const a = left.executionError, b = right.executionError;
  return sameOwner && left.executionId === right.executionId && left.conversationId === right.conversationId &&
    sameAssistantPresentation(left.assistant, right.assistant) &&
    (a === b || a !== null && b !== null && a.code === b.code && a.message === b.message && a.field === b.field && a.providerFailure === b.providerFailure);
}

function sameAssistantPresentation(a: StreamingAssistantMessage, b: StreamingAssistantMessage): boolean {
  const x = a.usage, y = b.usage;
  return a === b || a.overlayId === b.overlayId && a.assistantMessageId === b.assistantMessageId &&
    a.content === b.content && a.thinking === b.thinking && a.simpleThink === b.simpleThink &&
    a.createdAt === b.createdAt && a.error === b.error && a.toolPending === b.toolPending &&
    (x === y || x !== null && y !== null && x.promptTokens === y.promptTokens && x.completionTokens === y.completionTokens && x.totalTokens === y.totalTokens);
}

export function isChatSendActive(state: ChatSendState): boolean {
  if (state.discovering || state.discoveryUnknown) return true;
  if (state.serverExecution) return !state.serverExecution.terminal;
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
