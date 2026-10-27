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
  loadOlderMessageHistory,
  loadNewerMessageHistory,
  loadMessageHistoryAround,
  reconcileHistoryWindow,
  createMessageHistoryState,
  mergeOlderMessagePage,
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
  createConversation,
  deleteConversation,
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
  | "cursor-stale"
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
      readonly conversationMutation?: "create" | "rename" | "delete";
      readonly conversationListError?: ChatWorkspaceSafeUiError | null;
      readonly olderHistoryPending?: boolean;
      readonly olderHistoryError?: ChatWorkspaceSafeUiError | null;
      readonly newerHistoryPending?: boolean;
      readonly newerHistoryError?: ChatWorkspaceSafeUiError | null;
      readonly historyNavigationPending?: boolean;
      readonly searchRevision?: number;
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
  readonly createConversation?: typeof createConversation;
  readonly deleteConversation?: typeof deleteConversation;
  readonly loadOlderHistory?: typeof loadOlderMessageHistory;
  readonly loadNewerHistory?: typeof loadNewerMessageHistory;
  readonly loadAroundHistory?: typeof loadMessageHistoryAround;
  readonly canNavigate?: () => boolean;
};

export interface ChatWorkspaceController {
  getState(): ChatWorkspaceControllerState;
  load(): Promise<void>;
  retry(): Promise<void>;
  selectConversation(conversationId: string): Promise<void>;
  createConversation(): Promise<void>;
  renameConversation(conversationId: string, title: string): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;
  loadOlderHistory(): Promise<void>;
  loadNewerHistory(): Promise<void>;
  navigateHistory(conversationId: string, messageId?: string): Promise<void>;
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
  let mutation: "create" | "rename" | "delete" | undefined;
  let mutationController: AbortController | null = null;
  let olderController: AbortController | null = null;
  let olderSequence = 0;
  let windowGeneration = 0;
  let navigationController: AbortController | null = null;
  let navigationDeletedIds = new Set<string>();
  let olderDeletedIds = new Set<string>();
  const listeners = new Set<(state: ChatWorkspaceControllerState) => void>();

  const publish = (nextState: ChatWorkspaceControllerState) => {
    if (disposed) return;
    state = nextState.status === "ready" && mutation
      ? { ...nextState, conversationMutation: mutation } : nextState;
    listeners.forEach((listener) => listener(state));
  };

  const load = async () => {
    if (disposed || mutation || dependencies.canNavigate?.() === false) return;
    windowGeneration += 1;
    navigationController?.abort();
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
    olderSequence += 1;
    olderController?.abort();
    olderController = null;

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

  const selectConversation = async (conversationId: string, internal = false) => {
    if (disposed || state.status !== "ready" || (mutation && !internal) || dependencies.canNavigate?.() === false) return;
    windowGeneration += 1;
    navigationController?.abort();
    olderSequence += 1;
    olderController?.abort();
    olderController = null;
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
    removedMessageId?: string,
    resetWindow = false,
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
    const generation = windowGeneration;
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
      const retainedHistory = resetWindow && generation === windowGeneration ? history : latestWorkspace.history?.window && history.window
        ? reconcileHistoryWindow(latestWorkspace.history, history, generation === windowGeneration)
        : retainEarlierHistory(latestWorkspace.history, history);
      const filtered = removedMessageId === undefined ? retainedHistory.messages : retainedHistory.messages.filter(({ id }) => id !== removedMessageId);
      const nextHistory = { ...retainedHistory, messages: filtered, oldestCursor: filtered[0]?.createdAt ?? null };
      const nextWorkspace = createChatWorkspaceSnapshot({
        setup: latestWorkspace.setup,
        conversations: latestWorkspace.conversations,
        selectedConversation: latestWorkspace.selectedConversation,
        // A latest-window reread must not discard pages the user is reading.
        history: nextHistory,
      });
      publish({
        ...state,
        status: "ready",
        workspace: nextWorkspace,
        pendingConversationId: state.pendingConversationId,
        switchError: state.switchError,
        configurationPending: state.configurationPending,
        olderHistoryPending: state.olderHistoryPending,
        olderHistoryError: state.olderHistoryError,
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
    if (state.status === "ready" && state.workspace.selectedConversationId === conversationId) publish({ ...state, searchRevision: (state.searchRevision ?? 0) + 1 });
    const regenerateTarget = regenerateTargetMessageId === undefined
      ? null
      : history.messages.find(({ id }) => id === regenerateTargetMessageId) ??
        null;
    return {
      persistedMessageIds: history.messages.map(({ id }) => id),
      assistants: history.messages.filter(message => message.roleKind === "assistant").map(createRegeneratePersistenceProjection),
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
    if (navigationController && event.type === "message-deleted" && event.conversationId === conversationId) navigationDeletedIds.add(event.messageId);
    if (event.type === "file-synced" && event.conversationId === conversationId) {
      windowGeneration += 1;
      navigationController?.abort();
    }
    if (olderController && event.type === "message-deleted" && event.conversationId === conversationId) olderDeletedIds.add(event.messageId);
    await updateSelectedHistory(
      conversationId,
      async (history, signal) => (await realtimeEventReconciler(
        history,
        event,
        { history: { request: { signal } } },
      )).state,
      event.type === "message-deleted" && event.conversationId === conversationId ? event.messageId : undefined,
      event.type === "file-synced" && event.conversationId === conversationId,
    );
    if (state.status === "ready" && state.workspace.selectedConversationId === conversationId &&
        (event.type === "message-updated" || event.type === "message-deleted" || event.type === "file-synced" || event.type === "capability-invalidated")) {
      publish({ ...state, searchRevision: (state.searchRevision ?? 0) + 1 });
    }
  };

  const reconcileSelectedConversationAfterReconnect = async (
    conversationId: string,
  ) => {
    const reset = state.status === "ready" && state.workspace.history?.window?.reachesLatest === false;
    await updateSelectedHistory(
      conversationId,
      async (history, signal) => (await reconnectReconciler(
        history,
        { history: { request: { signal } } },
      )).state,
      undefined,
      reset,
    );
    if (state.status === "ready" && state.workspace.selectedConversationId === conversationId) publish({ ...state, searchRevision: (state.searchRevision ?? 0) + 1 });
  };

  const refreshConversationList = async () => {
    if (
      disposed ||
      state.status !== "ready" ||
      state.pendingConversationId !== null || state.configurationPending || mutation
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
        if (dependencies.canNavigate?.() === false) {
          throw new ChatWorkspaceContractError("Active execution prevents changing the conversation");
        }
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
        ...state,
        status: "ready",
        workspace: nextWorkspace,
        pendingConversationId: null,
        switchError: state.switchError,
        conversationListError: null,
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
    if (disposed || mutation || dependencies.canNavigate?.() === false || state.status !== "ready" || state.pendingConversationId !== null ||
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

  // Conversation writes share a Workspace owner and synchronous mutation lock.
  // Execution-specific protection (e.g. deleting an active target) belongs to its owner.
  const mutateConversation = async (
    kind: "create" | "rename" | "delete",
    conversationId?: string,
    title?: string,
  ) => {
    if (mutation) {
      if (kind === "create" && mutation === "create") return;
      throw new ChatWorkspaceContractError("Another conversation mutation is in progress");
    }
    if (disposed || state.status !== "ready" || state.pendingConversationId !== null ||
        state.configurationPending || dependencies.canNavigate?.() === false) {
      throw new ChatWorkspaceContractError("Conversation management requires a stable workspace");
    }
    if (kind !== "create" && !state.workspace.conversations.some(({ id }) => id === conversationId)) {
      throw new ChatWorkspaceContractError("Conversation is no longer available");
    }
    const normalizedTitle = title?.trim();
    if (kind === "rename" && !normalizedTitle) throw new ChatWorkspaceContractError("Conversation title is empty");
    mutation = kind;
    const controller = new AbortController();
    mutationController = controller;
    conversationListSequence += 1;
    conversationListController?.abort();
    publish({ ...state, conversationListError: null });
    const current = () => !disposed && !controller.signal.aborted && state.status === "ready";
    let createdId: string | null = null;
    try {
      if (kind === "create") {
        // Only preserve the origin. Main selection and carryover quantity stay
        // server-owned; the first send resolves restricted DB message references.
        const sourceId = state.workspace.selectedConversationId;
        createdId = (await (dependencies.createConversation ?? createConversation)(sourceId ? { carryoverSourceConversationId: sourceId } : {}, { signal: controller.signal })).id;
      } else if (kind === "rename") {
        await conversationUpdater(conversationId!, { title: normalizedTitle }, { signal: controller.signal });
      } else {
        await (dependencies.deleteConversation ?? deleteConversation)(conversationId!, { signal: controller.signal });
      }
      if (!current() || state.status !== "ready") return;
      if (kind !== "create") {
        const workspace = state.workspace;
        const conversations = kind === "delete"
          ? workspace.conversations.filter(({ id }) => id !== conversationId)
          : workspace.conversations.map((item) => item.id === conversationId ? { ...item, title: normalizedTitle! } : item);
        const selected = conversations.find(({ id }) => id === workspace.selectedConversationId) ?? null;
        if (!selected) {
          historySequence += 1; historyController?.abort();
          olderSequence += 1; olderController?.abort(); olderController = null;
        }
        publish({ ...state, workspace: createChatWorkspaceSnapshot({
          setup: workspace.setup, conversations, selectedConversation: selected,
          history: selected ? workspace.history : null,
        }), olderHistoryPending: selected ? state.olderHistoryPending : false });
      }
      try {
        const conversations = await conversationListLoader({ signal: controller.signal });
        if (!current() || state.status !== "ready") return;
        if (createdId && !conversations.some(({ id }) => id === createdId)) {
          throw new ChatWorkspaceContractError("Created conversation is not in the confirmed list");
        }
        const workspace = state.workspace;
        const selected = conversations.find(({ id }) => id === workspace.selectedConversationId) ?? null;
        publish({ ...state, workspace: createChatWorkspaceSnapshot({
          setup: workspace.setup, conversations, selectedConversation: selected,
          history: selected ? workspace.history : null,
        }) });
        const target = createdId ?? (kind === "delete" && !selected ? conversations[0]?.id : null);
        if (target) await selectConversation(target, true);
      } catch {
        if (current() && state.status === "ready") publish({ ...state, conversationListError: {
          code: "service", message: kind === "create"
            ? "会话已创建，但列表尚未确认。请刷新列表核对，避免重复新建。"
            : "操作已完成，但列表更新失败，请刷新列表。",
        } });
      }
    } finally {
      mutation = undefined;
      if (mutationController === controller) mutationController = null;
      if (current() && state.status === "ready") publish({ ...state, conversationMutation: undefined });
    }
  };

  const navigateHistory = async (conversationId: string, messageId?: string) => {
    if (disposed || state.status !== "ready" || state.pendingConversationId !== null || state.workspace.selectedConversationId !== conversationId || mutation) throw new ChatWorkspaceContractError("History navigation owner is no longer current");
    const generation = ++windowGeneration;
    navigationController?.abort();
    olderController?.abort(); olderController = null; olderSequence += 1;
    const controller = new AbortController(); navigationController = controller;
    const deletedDuringNavigation = new Set<string>(); navigationDeletedIds = deletedDuringNavigation;
    publish({ ...state, historyNavigationPending: true, olderHistoryPending: false, newerHistoryPending: false });
    const history = state.workspace.history;
    try {
      if (!history) throw new ChatWorkspaceContractError("History unavailable");
      const next = messageId === undefined
        ? await historyReloader(history, { request: { signal: controller.signal } })
        : await (dependencies.loadAroundHistory ?? loadMessageHistoryAround)(conversationId, messageId, { pageSize: history.pageSize, request: { signal: controller.signal } });
      if (disposed || controller.signal.aborted || generation !== windowGeneration || state.status !== "ready" || state.workspace.selectedConversationId !== conversationId || state.pendingConversationId !== null) throw new ChatWorkspaceContractError("History navigation became stale");
      if (messageId && deletedDuringNavigation.has(messageId)) throw new ChatWorkspaceContractError("History target no longer exists");
      const messages = next.messages.filter(item=>!deletedDuringNavigation.has(item.id));
      publish({ ...state, workspace: { ...state.workspace, history: { ...next, messages, oldestCursor: messages[0]?.createdAt ?? null } }, historyNavigationPending: false, olderHistoryError: null, newerHistoryError: null });
    } finally {
      if (navigationController === controller) navigationController = null;
      if (!disposed && generation === windowGeneration && state.status === "ready") publish({ ...state, historyNavigationPending: false });
    }
  };

  const loadWindowPage = async (direction: "older" | "newer") => {
    if (disposed || state.status !== "ready" || state.pendingConversationId !== null || olderController || state.historyNavigationPending) return;
    const history = state.workspace.history;
    if (!history?.window || (direction === "older" ? history.olderPageStatus !== "maybe-more" : !history.window.hasNewer)) return;
    const previousError = direction === "older" ? state.olderHistoryError : state.newerHistoryError;
    if (previousError?.code === "cursor-stale") {
      const edge = direction === "older" ? history.messages[0] : history.messages[history.messages.length-1];
      try { await navigateHistory(history.conversationId, edge?.id); }
      catch (error) { if(state.status==="ready")publish({...state,[direction==="older"?"olderHistoryError":"newerHistoryError"]:toSafeUiError(error)}); }
      return;
    }
    const generation = windowGeneration, owner = history.conversationId;
    const controller = new AbortController(); olderController = controller;
    const deleted = new Set<string>(); olderDeletedIds = deleted;
    publish({ ...state, [direction === "older" ? "olderHistoryPending" : "newerHistoryPending"]: true,
      [direction === "older" ? "olderHistoryError" : "newerHistoryError"]: null });
    const current = () => !disposed && !controller.signal.aborted && generation === windowGeneration && state.status === "ready" && state.pendingConversationId === null && state.workspace.selectedConversationId === owner;
    try {
      const result = await (direction === "older" ? dependencies.loadOlderHistory ?? loadOlderMessageHistory : dependencies.loadNewerHistory ?? loadNewerMessageHistory)(history, { request: { signal: controller.signal } });
      if (!current() || state.status !== "ready") return;
      const latest = state.workspace.history!;
      const oldIds = new Set(history.messages.map(m => m.id));
      const latestById = new Map(latest.messages.map(m => [m.id, m]));
      let messages = result.messages.filter(m => !deleted.has(m.id)).map(m => latestById.get(m.id) ?? m);
      const resultIds = new Set(messages.map(m => m.id));
      const extra = latest.messages.filter(m => !oldIds.has(m.id) && !resultIds.has(m.id));
      messages = direction === "older" ? [...messages, ...extra] : [...extra, ...messages];
      const next = { ...result, messages, oldestCursor: messages[0]?.createdAt ?? null,
        window: direction === "older" ? { ...result.window!, newerCursor: latest.window!.newerCursor, hasNewer: latest.window!.hasNewer, reachesLatest: latest.window!.reachesLatest } : { ...result.window!, olderCursor: latest.window!.olderCursor },
        olderPageStatus: direction === "older" ? result.olderPageStatus : latest.olderPageStatus };
      publish({ ...state, workspace: { ...state.workspace, history: next } });
    } catch (error) {
      if (current() && state.status === "ready") publish({ ...state, [direction === "older" ? "olderHistoryError" : "newerHistoryError"]: toSafeUiError(error) });
    } finally {
      if (olderController === controller) olderController = null;
      if (current() && state.status === "ready") publish({ ...state, olderHistoryPending: false, newerHistoryPending: false });
    }
  };

  const loadOlderHistory = async () => {
    if (state.status === "ready" && state.workspace.history?.window) return loadWindowPage("older");
    if (disposed || state.status !== "ready" || state.pendingConversationId !== null || olderController) return;
    const history = state.workspace.history;
    if (!history || history.olderPageStatus !== "maybe-more") return;
    const sequence = ++olderSequence;
    const owner = state.workspace.selectedConversationId;
    const controller = new AbortController();
    olderController = controller;
    const deletedDuringRequest = new Set<string>();
    olderDeletedIds = deletedDuringRequest;
    publish({ ...state, olderHistoryPending: true, olderHistoryError: null });
    const current = () => !disposed && !controller.signal.aborted && sequence === olderSequence &&
      state.status === "ready" && state.pendingConversationId === null && state.workspace.selectedConversationId === owner;
    try {
      const result = await (dependencies.loadOlderHistory ?? loadOlderMessageHistory)(history, { request: { signal: controller.signal } });
      if (!current() || state.status !== "ready") return;
      const latest = state.workspace.history;
      if (!latest || latest.oldestCursor !== history.oldestCursor) return;
      const latestIds = new Set(latest.messages.map(({ id }) => id));
      const originalIds = new Set(history.messages.map(({ id }) => id));
      const older = result.messages.filter((item) => !originalIds.has(item.id) && !latestIds.has(item.id) && !deletedDuringRequest.has(item.id));
      const merged = mergeOlderMessagePage(latest, older);
      publish({ ...state, workspace: { ...state.workspace, history: { ...merged, olderPageStatus: result.olderPageStatus } } });
    } catch (error) {
      if (current() && state.status === "ready") publish({ ...state, olderHistoryError: toSafeUiError(error) });
    } finally {
      if (olderController === controller) olderController = null;
      if (current() && state.status === "ready") publish({ ...state, olderHistoryPending: false });
    }
  };

  return {
    getState() {
      return state;
    },

    load,

    retry: load,

    selectConversation,
    createConversation: () => mutateConversation("create"),
    renameConversation: (id, title) => mutateConversation("rename", id, title),
    deleteConversation: (id) => mutateConversation("delete", id),
    loadOlderHistory,
    loadNewerHistory: () => loadWindowPage("newer"),
    navigateHistory,

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
      windowGeneration += 1;
      navigationController?.abort();
      mutationController?.abort();
      olderController?.abort();
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
    const data = error.data as {detail?:{code?:unknown}} | null;
    if (error.status === 409 && data?.detail?.code === "cursor_stale") return {code:"cursor-stale",message:"历史游标已失效。再次点击可重新读取当前位置；也可回到最新。"};
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

function retainEarlierHistory(current: MessageHistoryState | null, incoming: MessageHistoryState): MessageHistoryState {
  if (current?.window && incoming.window) return reconcileHistoryWindow(current, incoming);
  if (!current || current.conversationId !== incoming.conversationId || incoming.oldestCursor === null) return incoming;
  const ids = new Set(incoming.messages.map(({ id }) => id));
  const overlap = current.messages.findIndex(item => ids.has(item.id));
  const earlier = (overlap >= 0 ? current.messages.slice(0, overlap) : current.messages.filter(item => item.createdAt < incoming.oldestCursor!)).filter(item => !ids.has(item.id));
  if (!earlier.length) return incoming;
  return createMessageHistoryState(incoming.conversationId, [...earlier, ...incoming.messages], {
    pageSize: incoming.pageSize, olderPageStatus: current.olderPageStatus,
  });
}
