import {
  ChatWorkspaceContractError,
  createChatWorkspaceSnapshot,
  loadChatWorkspace,
  loadChatWorkspaceConversation,
  type ChatWorkspaceLoadInput,
  type ChatWorkspaceSnapshot,
} from "@/application/chat-workspace";
import {
  reloadMessageHistoryFromScratch,
  type MessageHistoryRequestOptions,
  type MessageHistoryState,
} from "@/application/message-history";
import {
  createRegeneratePersistenceProjection,
  type ChatHistoryReconciliationResult,
} from "@/application/chat-send";
import type { RealtimeEvent } from "@/application/realtime";
import {
  reconcileMessageHistoryAfterReconnect,
  reconcileRealtimeEvent,
  type RealtimeReconciliationOptions,
  type RealtimeReconciliationResult,
} from "@/application/realtime-reconciliation";
import {
  listConversations,
  updateConversation,
  type ConversationSummary,
} from "@/domain/conversation";
import { loadChatSetupForConversation } from "@/application/chat-setup";
import type { MainSelection } from "@/domain/runtime";
import { ApiError, type ApiRequestOptions } from "@/lib/api";

export type ChatWorkspaceSafeUiErrorCode =
  | "authentication"
  | "network"
  | "timeout"
  | "service"
  | "contract"
  | "unknown";

export type ChatWorkspaceSafeUiError = {
  readonly code: ChatWorkspaceSafeUiErrorCode;
  readonly message: string;
};

export type ChatWorkspaceControllerState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | {
      readonly status: "ready";
      readonly workspace: ChatWorkspaceSnapshot;
      readonly pendingConversationId: string | null;
      readonly switchError: ChatWorkspaceSafeUiError | null;
      readonly configurationPending?: boolean;
    }
  | {
      readonly status: "error";
      readonly error: ChatWorkspaceSafeUiError;
    };

export const INITIAL_CHAT_WORKSPACE_CONTROLLER_STATE: ChatWorkspaceControllerState = {
  status: "idle",
};

export type ChatWorkspaceBootstrapLoader = (
  input?: ChatWorkspaceLoadInput,
  options?: ApiRequestOptions,
) => Promise<ChatWorkspaceSnapshot>;

export type ChatWorkspaceConversationLoader = (
  snapshot: ChatWorkspaceSnapshot,
  conversationId: string,
  options?: ApiRequestOptions,
) => Promise<ChatWorkspaceSnapshot>;

export type ChatWorkspaceHistoryReloader = (
  history: MessageHistoryState,
  options?: MessageHistoryRequestOptions,
) => Promise<MessageHistoryState>;

export type ChatWorkspaceConversationListLoader = (
  options?: ApiRequestOptions,
) => Promise<ConversationSummary[]>;

export type ChatWorkspaceRealtimeEventReconciler = (
  history: MessageHistoryState,
  event: RealtimeEvent,
  options?: RealtimeReconciliationOptions,
) => Promise<RealtimeReconciliationResult>;

export type ChatWorkspaceReconnectReconciler = (
  history: MessageHistoryState,
  options?: RealtimeReconciliationOptions,
) => Promise<RealtimeReconciliationResult>;

export type ChatWorkspaceControllerDependencies = {
  readonly loadWorkspace?: ChatWorkspaceBootstrapLoader;
  readonly loadConversation?: ChatWorkspaceConversationLoader;
  readonly reloadHistory?: ChatWorkspaceHistoryReloader;
  readonly loadConversationList?: ChatWorkspaceConversationListLoader;
  readonly reconcileRealtimeEvent?: ChatWorkspaceRealtimeEventReconciler;
  readonly reconcileAfterReconnect?: ChatWorkspaceReconnectReconciler;
  readonly loadSetup?: typeof loadChatSetupForConversation;
  readonly updateConversation?: typeof updateConversation;
};

export interface ChatWorkspaceController {
  getState(): ChatWorkspaceControllerState;
  load(): Promise<void>;
  retry(): Promise<void>;
  selectConversation(conversationId: string): Promise<void>;
  retryConversationSwitch(): Promise<void>;
  reloadSelectedConversationHistory(
    conversationId: string,
    regenerateTargetMessageId?: string,
  ): Promise<ChatHistoryReconciliationResult>;
  reconcileSelectedConversationRealtimeEvent(
    event: RealtimeEvent,
  ): Promise<void>;
  reconcileSelectedConversationAfterReconnect(
    conversationId: string,
  ): Promise<void>;
  refreshConversationList(): Promise<void>;
  saveMainSelection(conversationId: string, selection: MainSelection): Promise<void>;
  subscribe(listener: (state: ChatWorkspaceControllerState) => void): () => void;
  dispose(): void;
}

export function createChatWorkspaceController(
  input: ChatWorkspaceLoadInput = {},
  dependencies: ChatWorkspaceControllerDependencies = {},
): ChatWorkspaceController {
  const bootstrapLoader = dependencies.loadWorkspace ?? loadChatWorkspace;
  const conversationLoader =
    dependencies.loadConversation ?? loadChatWorkspaceConversation;
  const historyReloader =
    dependencies.reloadHistory ?? reloadMessageHistoryFromScratch;
  const conversationListLoader =
    dependencies.loadConversationList ?? listConversations;
  const setupLoader = dependencies.loadSetup ?? loadChatSetupForConversation;
  const conversationUpdater = dependencies.updateConversation ?? updateConversation;
  let configurationController: AbortController | null = null;
  let configurationSequence = 0;
  const realtimeEventReconciler =
    dependencies.reconcileRealtimeEvent ?? reconcileRealtimeEvent;
  const reconnectReconciler =
    dependencies.reconcileAfterReconnect ?? reconcileMessageHistoryAfterReconnect;
  let state = INITIAL_CHAT_WORKSPACE_CONTROLLER_STATE;
  let bootstrapController: AbortController | null = null;
  let switchController: AbortController | null = null;
  let historyController: AbortController | null = null;
  let conversationListController: AbortController | null = null;
  let bootstrapSequence = 0;
  let switchSequence = 0;
  let historySequence = 0;
  let conversationListSequence = 0;
  let lastFailedConversationId: string | null = null;
  let disposed = false;
  const listeners = new Set<(state: ChatWorkspaceControllerState) => void>();

  const publish = (nextState: ChatWorkspaceControllerState) => {
    if (disposed) return;
    state = nextState;
    listeners.forEach((listener) => listener(state));
  };

  const load = async () => {
    if (disposed) return;
    configurationSequence += 1;
    configurationController?.abort();

    const currentConversationId =
      state.status === "ready"
        ? state.workspace.selectedConversationId
        : input.currentConversationId;
    const sequence = ++bootstrapSequence;

    bootstrapController?.abort();
    bootstrapController = new AbortController();
    const controller = bootstrapController;

    switchSequence += 1;
    switchController?.abort();
    switchController = null;
    historySequence += 1;
    historyController?.abort();
    historyController = null;
    conversationListSequence += 1;
    conversationListController?.abort();
    conversationListController = null;
    lastFailedConversationId = null;

    publish({ status: "loading" });

    try {
      const workspace = await bootstrapLoader(
        { ...input, currentConversationId },
        { signal: controller.signal },
      );
      if (
        disposed ||
        controller.signal.aborted ||
        sequence !== bootstrapSequence
      ) {
        return;
      }

      publish(readyState(workspace));
    } catch (error) {
      if (
        disposed ||
        controller.signal.aborted ||
        sequence !== bootstrapSequence ||
        isAbortError(error)
      ) {
        return;
      }

      publish({ status: "error", error: toSafeUiError(error) });
    } finally {
      if (sequence === bootstrapSequence && bootstrapController === controller) {
        bootstrapController = null;
      }
    }
  };

  const selectConversation = async (conversationId: string) => {
    if (disposed || state.status !== "ready") return;
    configurationSequence += 1;
    configurationController?.abort();

    // Aborting an in-flight PUT cannot undo it. If a switch fails, keep its old owner blocked until reread.
    const workspace: ChatWorkspaceSnapshot = state.configurationPending
      ? { ...state.workspace, setup: { ...state.workspace.setup, readiness: { kind: "unavailable", reason: "unknown" } } }
      : state.workspace;
    const sequence = ++switchSequence;
    switchController?.abort();
    switchController = null;
    historySequence += 1;
    historyController?.abort();
    historyController = null;
    conversationListSequence += 1;
    conversationListController?.abort();
    conversationListController = null;
    lastFailedConversationId = null;

    if (conversationId === workspace.selectedConversationId) {
      publish(readyState(workspace));
      return;
    }

    const controller = new AbortController();
    switchController = controller;
    publish({
      status: "ready",
      workspace,
      pendingConversationId: conversationId,
      switchError: null,
    });

    try {
      const nextWorkspace = await conversationLoader(
        workspace,
        conversationId,
        { signal: controller.signal },
      );
      if (
        disposed ||
        controller.signal.aborted ||
        sequence !== switchSequence
      ) {
        return;
      }

      publish(readyState(nextWorkspace));
    } catch (error) {
      if (
        disposed ||
        controller.signal.aborted ||
        sequence !== switchSequence ||
        isAbortError(error)
      ) {
        return;
      }

      lastFailedConversationId = conversationId;
      publish({
        status: "ready",
        workspace,
        pendingConversationId: null,
        switchError: toSafeUiError(error),
      });
    } finally {
      if (sequence === switchSequence && switchController === controller) {
        switchController = null;
      }
    }
  };

  const updateSelectedHistory = async (
    conversationId: string,
    operation: (
      history: MessageHistoryState,
      signal: AbortSignal,
    ) => Promise<MessageHistoryState>,
  ) => {
    if (
      disposed ||
      state.status !== "ready" ||
      state.pendingConversationId !== null ||
      state.workspace.selectedConversationId !== conversationId ||
      state.workspace.selectedConversation === null ||
      state.workspace.history === null
    ) {
      throw new ChatWorkspaceContractError(
        "History reconciliation requires the current selected conversation",
      );
    }

    const workspace = state.workspace;
    const currentHistory = workspace.history;
    if (currentHistory === null) {
      throw new ChatWorkspaceContractError(
        "History reconciliation requires loaded history",
      );
    }
    const sequence = ++historySequence;
    historyController?.abort();
    const controller = new AbortController();
    historyController = controller;

    try {
      const history = await operation(currentHistory, controller.signal);
      if (
        disposed ||
        controller.signal.aborted ||
        sequence !== historySequence ||
        state.status !== "ready" ||
        state.workspace.selectedConversationId !== conversationId
      ) {
        throw new ChatWorkspaceContractError(
          "History reconciliation became stale",
        );
      }

      const latestWorkspace = state.workspace;
      const nextWorkspace = createChatWorkspaceSnapshot({
        setup: latestWorkspace.setup,
        conversations: latestWorkspace.conversations,
        selectedConversation: latestWorkspace.selectedConversation,
        history,
      });
      publish({
        status: "ready",
        workspace: nextWorkspace,
        pendingConversationId: state.pendingConversationId,
        switchError: state.switchError,
        configurationPending: state.configurationPending,
      });
      return history;
    } finally {
      if (sequence === historySequence && historyController === controller) {
        historyController = null;
      }
    }
  };

  const reloadSelectedConversationHistory = async (
    conversationId: string,
    regenerateTargetMessageId?: string,
  ) => {
    const history = await updateSelectedHistory(
      conversationId,
      (currentHistory, signal) => historyReloader(currentHistory, {
        request: { signal },
      }),
    );
    const regenerateTarget = regenerateTargetMessageId === undefined
      ? null
      : history.messages.find(({ id }) => id === regenerateTargetMessageId) ??
        null;
    return {
      persistedMessageIds: history.messages.map(({ id }) => id),
      regenerateTarget: regenerateTarget === null
        ? null
        : createRegeneratePersistenceProjection(regenerateTarget),
    };
  };

  const reconcileSelectedConversationRealtimeEvent = async (
    event: RealtimeEvent,
  ) => {
    if (state.status !== "ready" || state.workspace.history === null) {
      throw new ChatWorkspaceContractError(
        "Realtime reconciliation requires loaded history",
      );
    }
    const conversationId = state.workspace.history.conversationId;
    await updateSelectedHistory(
      conversationId,
      async (history, signal) => (await realtimeEventReconciler(
        history,
        event,
        { history: { request: { signal } } },
      )).state,
    );
  };

  const reconcileSelectedConversationAfterReconnect = async (
    conversationId: string,
  ) => {
    await updateSelectedHistory(
      conversationId,
      async (history, signal) => (await reconnectReconciler(
        history,
        { history: { request: { signal } } },
      )).state,
    );
  };

  const refreshConversationList = async () => {
    if (
      disposed ||
      state.status !== "ready" ||
      state.pendingConversationId !== null || state.configurationPending
    ) {
      throw new ChatWorkspaceContractError(
        "Conversation refresh requires a stable workspace",
      );
    }

    const selectedConversationId = state.workspace.selectedConversationId;
    const sequence = ++conversationListSequence;
    conversationListController?.abort();
    const controller = new AbortController();
    conversationListController = controller;

    try {
      const conversations = await conversationListLoader({
        signal: controller.signal,
      });
      if (
        disposed ||
        controller.signal.aborted ||
        sequence !== conversationListSequence ||
        state.status !== "ready" ||
        state.pendingConversationId !== null ||
        state.workspace.selectedConversationId !== selectedConversationId
      ) {
        throw new ChatWorkspaceContractError(
          "Conversation refresh became stale",
        );
      }

      const workspace = state.workspace;
      const selectedConversation = selectedConversationId === null
        ? null
        : conversations.find(({ id }) => id === selectedConversationId) ?? null;
      if (
        selectedConversationId !== null &&
        (
          selectedConversation === null
        )
      ) {
        historySequence += 1;
        historyController?.abort();
        historyController = null;
        const nextWorkspace = await bootstrapLoader(
          {
            ...input,
            currentConversationId: null,
          },
          { signal: controller.signal },
        );
        if (
          disposed ||
          controller.signal.aborted ||
          sequence !== conversationListSequence
        ) {
          throw new ChatWorkspaceContractError(
            "Conversation refresh became stale",
          );
        }
        publish(readyState(nextWorkspace));
        return;
      }

      // conv_updated deliberately retains the legacy model; always invalidate effective selection.
      const setup = selectedConversation === null ? workspace.setup : await setupLoader(selectedConversation, { signal: controller.signal });
      if (disposed || controller.signal.aborted || sequence !== conversationListSequence ||
          state.status !== "ready" || state.pendingConversationId !== null || state.configurationPending ||
          state.workspace.selectedConversationId !== selectedConversationId) throw new ChatWorkspaceContractError("Configuration refresh became stale");
      const nextWorkspace = createChatWorkspaceSnapshot({
        setup,
        conversations,
        selectedConversation,
        history: state.workspace.history,
      });
      publish({
        status: "ready",
        workspace: nextWorkspace,
        pendingConversationId: null,
        switchError: state.switchError,
      });
    } finally {
      if (
        sequence === conversationListSequence &&
        conversationListController === controller
      ) {
        conversationListController = null;
      }
    }
  };

  const saveMainSelection = async (conversationId: string, selection: MainSelection) => {
    if (disposed || state.status !== "ready" || state.pendingConversationId !== null ||
        state.configurationPending || state.workspace.selectedConversationId !== conversationId) {
      throw new ChatWorkspaceContractError("Model selection owner is no longer current");
    }
    const sequence = ++configurationSequence;
    conversationListSequence += 1;
    conversationListController?.abort();
    configurationController?.abort();
    const controller = new AbortController();
    configurationController = controller;
    publish({ ...state, configurationPending: true });
    const current = () => !disposed && !controller.signal.aborted && sequence === configurationSequence &&
      state.status === "ready" && state.pendingConversationId === null && state.workspace.selectedConversationId === conversationId;
    try {
      await conversationUpdater(conversationId, { mainSelection: selection }, { signal: controller.signal });
      if (!current()) return;
      const conversations = await conversationListLoader({ signal: controller.signal });
      const selected = conversations.find(({ id }) => id === conversationId);
      if (!selected) throw new ChatWorkspaceContractError("Updated conversation is missing");
      const setup = await setupLoader(selected, { signal: controller.signal });
      if (!current() || state.status !== "ready") return;
      if (!setup.configuration ||
          JSON.stringify(setup.configuration.selection) !== JSON.stringify(selection)) {
        throw new ChatWorkspaceContractError("Model selection readback is not confirmed");
      }
      publish(readyState(createChatWorkspaceSnapshot({ setup, conversations, selectedConversation: selected, history: state.workspace.history })));
      if (setup.readiness.kind === "unavailable") throw new ChatWorkspaceContractError("Selection saved but readiness is unconfirmed");
    } catch (error) {
      if (current() && state.status === "ready") {
        // A failed PUT/readback may already have saved. Block sending until an explicit reread.
        publish({ ...state, configurationPending: false, workspace: { ...state.workspace, setup: {
          ...state.workspace.setup, readiness: { kind: "unavailable", reason: "unknown" },
        } } });
        throw error;
      }
    } finally {
      if (configurationController === controller) configurationController = null;
    }
  };

  return {
    getState() {
      return state;
    },

    load,

    retry: load,

    selectConversation,

    reloadSelectedConversationHistory,

    reconcileSelectedConversationRealtimeEvent,

    reconcileSelectedConversationAfterReconnect,

    refreshConversationList,
    saveMainSelection,

    async retryConversationSwitch() {
      if (
        disposed ||
        state.status !== "ready" ||
        state.pendingConversationId !== null ||
        lastFailedConversationId === null
      ) {
        return;
      }

      await selectConversation(lastFailedConversationId);
    },

    subscribe(listener) {
      if (disposed) {
        return () => undefined;
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      configurationSequence += 1;
      configurationController?.abort();
      bootstrapSequence += 1;
      switchSequence += 1;
      historySequence += 1;
      conversationListSequence += 1;
      listeners.clear();
      bootstrapController?.abort();
      switchController?.abort();
      historyController?.abort();
      conversationListController?.abort();
      bootstrapController = null;
      switchController = null;
      historyController = null;
      conversationListController = null;
      lastFailedConversationId = null;
    },
  };
}

export function toSafeUiError(error: unknown): ChatWorkspaceSafeUiError {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return {
        code: "authentication",
        message: "会话读取需要重新登录或授权。",
      };
    }
    if (error.code === "TIMEOUT") {
      return { code: "timeout", message: "会话读取超时，请重试。" };
    }
    if (error.code === "NETWORK_ERROR") {
      return { code: "network", message: "暂时无法连接服务，请重试。" };
    }
    return { code: "service", message: "暂时无法读取会话，请重试。" };
  }

  if (error instanceof Error && error.name.endsWith("ContractError")) {
    return {
      code: "contract",
      message: "会话数据暂时无法使用，请重试。",
    };
  }

  return { code: "unknown", message: "读取会话时发生错误，请重试。" };
}

function readyState(
  workspace: ChatWorkspaceSnapshot,
): ChatWorkspaceControllerState {
  return {
    status: "ready",
    workspace,
    pendingConversationId: null,
    switchError: null,
  };
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof ApiError && error.code === "ABORTED") ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}
