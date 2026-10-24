import { openRealtimeEvents, type RealtimeEvent } from "@/application/realtime";
import { isPersistedAssistantNotification } from "@/application/realtime-reconciliation";
import { WebSocketTransportError } from "@/lib/websocket";

import {
  INITIAL_CHAT_REALTIME_STATE,
  INITIAL_REALTIME_DIRTY_STATE,
  type ChatRealtimeContext,
  type ChatRealtimeCoordinator,
  type ChatRealtimeCoordinatorDependencies,
  type ChatRealtimeState,
  type RealtimeDirtyState,
} from "@/application/chat-realtime/chat-realtime-types";

const RECONNECT_DELAYS_MS = Object.freeze([1_000, 2_000, 5_000, 10_000]);
const AUTHENTICATION_CLOSE_CODE = 1008;

export function createChatRealtimeCoordinator(
  dependencies: ChatRealtimeCoordinatorDependencies,
): ChatRealtimeCoordinator {
  const openConnection = dependencies.openConnection ?? openRealtimeEvents;
  const queueTask = dependencies.queueTask ?? defaultQueueTask;
  const scheduleReconnect = dependencies.scheduleReconnect ??
    ((task, delayMs) => setTimeout(task, delayMs));
  const cancelReconnect = dependencies.cancelReconnect ?? clearTimeout;

  let state = INITIAL_CHAT_REALTIME_STATE;
  let dirty = INITIAL_REALTIME_DIRTY_STATE;
  let started = false;
  let lifecycleGeneration = 0;
  let openingController: AbortController | null = null;
  let connection: Awaited<ReturnType<typeof openConnection>> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let authenticationBlocked = false;
  let requiresReconnectReconciliation = false;
  let historyInFlight: Promise<void> | null = null;
  let conversationListInFlight: Promise<void> | null = null;
  const listeners = new Set<(state: ChatRealtimeState) => void>();
  const capabilityAnchors = new Map<string, Extract<RealtimeEvent, { type: "capability-invalidated" }>>();

  const publish = (nextState: ChatRealtimeState) => {
    state = nextState;
    listeners.forEach((listener) => listener(state));
  };

  const markDirty = (next: Partial<RealtimeDirtyState>) => {
    dirty = Object.freeze({ ...dirty, ...next });
  };

  const canConnect = () => {
    const context = dependencies.getContext();
    return context.workspaceAvailable && context.authenticated;
  };

  const isLifecycleCurrent = (generation: number) =>
    started && generation === lifecycleGeneration && canConnect();

  const flushConversationList = async (): Promise<void> => {
    const context = dependencies.getContext();
    if (
      !dirty.conversationList ||
      conversationListInFlight !== null ||
      (
        context.execution.kind === "active" && !context.execution.recovering &&
        dirty.currentConversationHistory
      ) ||
      !canConnect()
    ) {
      return conversationListInFlight ?? Promise.resolve();
    }

    markDirty({ conversationList: false });
    let succeeded = false;
    const request = (async () => {
      try {
        await dependencies.refreshConversationList();
        succeeded = true;
      } catch {
        markDirty({ conversationList: true });
      } finally {
        conversationListInFlight = null;
        if (succeeded && dirty.conversationList) {
          void flushConversationList();
        }
      }
    })();
    conversationListInFlight = request;
    return request;
  };

  const flushDeferredHistory = async (): Promise<void> => {
    const context = dependencies.getContext();
    if (
      !dirty.currentConversationHistory ||
      historyInFlight !== null ||
      (context.execution.kind === "active" && !context.execution.recovering) ||
      !context.workspaceAvailable ||
      !context.authenticated ||
      context.selectedConversationId === null
    ) {
      return historyInFlight ?? Promise.resolve();
    }

    const conversationId = context.selectedConversationId;
    markDirty({ currentConversationHistory: false });
    let succeeded = false;
    const request = (async () => {
      try {
        await dependencies.reconcileAfterReconnect(conversationId);
        succeeded = true;
      } catch {
        markDirty({ currentConversationHistory: true });
      } finally {
        historyInFlight = null;
        if (succeeded && dirty.currentConversationHistory) {
          void flushDeferredHistory();
        }
        if (succeeded) void flushCapabilityAnchors();
      }
    })();
    historyInFlight = request;
    return request;
  };

  const reconcileEventNow = async (event: RealtimeEvent): Promise<boolean> => {
    if (historyInFlight !== null) {
      markDirty({ currentConversationHistory: true });
      await historyInFlight;
      return false;
    }

    let succeeded = false;
    const request = (async () => {
      try {
        await dependencies.reconcileEvent(event);
        succeeded = true;
      } catch {
        markDirty({ currentConversationHistory: true });
      } finally {
        historyInFlight = null;
        if (succeeded && dirty.currentConversationHistory) {
          void flushDeferredHistory();
        }
        if (succeeded) void flushCapabilityAnchors();
      }
    })();
    historyInFlight = request;
    await request;
    return succeeded;
  };

  const flushCapabilityAnchors = async (): Promise<void> => {
    const context = dependencies.getContext();
    if (historyInFlight !== null || !canConnect() || context.selectedConversationId === null ||
        (context.execution.kind === "active" && !context.execution.recovering)) return;
    const next = capabilityAnchors.entries().next().value;
    if (!next) return;
    const [key, event] = next;
    const generation = lifecycleGeneration;
    capabilityAnchors.delete(key);
    if (event.conversationId !== null && event.conversationId !== context.selectedConversationId) {
      await flushCapabilityAnchors();
      return;
    }
    // Keep older loaded anchors when a capability event arrives during SSE or
    // another HTTP read. A latest-window reread alone cannot refresh them.
    if (!await reconcileEventNow(event) && generation === lifecycleGeneration) capabilityAnchors.set(key, event);
  };

  const flushDirty = () => {
    void flushConversationList();
    void flushDeferredHistory();
    void flushCapabilityAnchors();
  };

  const scheduleOpen = (reconnecting: boolean) => {
    if (
      !started ||
      authenticationBlocked ||
      !canConnect() ||
      openingController !== null ||
      connection
    ) {
      return;
    }

    const generation = lifecycleGeneration;
    publish({ kind: reconnecting ? "reconnecting" : "connecting" });
    queueTask(() => {
      if (!isLifecycleCurrent(generation)) return;
      void open(generation, reconnecting);
    });
  };

  const scheduleNextReconnect = () => {
    if (!started || !canConnect() || reconnectTimer !== null) return;

    requiresReconnectReconciliation = true;
    publish({ kind: "reconnecting" });
    const delay = RECONNECT_DELAYS_MS[
      Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)
    ]!;
    reconnectAttempt += 1;
    const generation = lifecycleGeneration;
    reconnectTimer = scheduleReconnect(() => {
      reconnectTimer = null;
      if (!isLifecycleCurrent(generation)) return;
      scheduleOpen(true);
    }, delay);
  };

  const monitor = async (
    activeConnection: NonNullable<typeof connection>,
    generation: number,
  ) => {
    try {
      for await (const event of activeConnection.events) {
        if (!isLifecycleCurrent(generation) || connection !== activeConnection) {
          return;
        }
        void handleEvent(event);
      }
    } catch {
      // Transport and event-contract details never enter coordinator state.
    }

    const close = await activeConnection.closed;
    if (!isLifecycleCurrent(generation) || connection !== activeConnection) {
      return;
    }
    connection = null;

    if (close.code === AUTHENTICATION_CLOSE_CODE) {
      authenticationBlocked = true;
      publish({ kind: "unavailable", reason: "authentication" });
      return;
    }

    scheduleNextReconnect();
  };

  const open = async (generation: number, reconnecting: boolean) => {
    if (!isLifecycleCurrent(generation) || openingController !== null) return;

    const controller = new AbortController();
    openingController = controller;
    try {
      const opened = await openConnection({ signal: controller.signal });
      if (!isLifecycleCurrent(generation) || controller.signal.aborted) {
        opened.close();
        return;
      }

      connection = opened;
      reconnectAttempt = 0;
      publish({ kind: "connected" });
      if (reconnecting || requiresReconnectReconciliation) {
        requiresReconnectReconciliation = false;
        markDirty({
          currentConversationHistory: true,
          conversationList: true,
        });
        flushDirty();
      }
      void monitor(opened, generation);
    } catch (error) {
      if (
        isLifecycleCurrent(generation) &&
        !controller.signal.aborted &&
        isAuthenticationFailure(error)
      ) {
        authenticationBlocked = true;
        publish({ kind: "unavailable", reason: "authentication" });
      } else if (isLifecycleCurrent(generation) && !controller.signal.aborted) {
        scheduleNextReconnect();
      }
    } finally {
      if (openingController === controller) {
        openingController = null;
      }
    }
  };

  const handleEvent = async (event: RealtimeEvent): Promise<void> => {
    const context = dependencies.getContext();

    switch (event.type) {
      case "capability-invalidated":
        if (event.conversationId !== null && event.conversationId !== context.selectedConversationId) return;
        capabilityAnchors.set(`${event.conversationId ?? ""}:${event.messageId}`, event);
        await flushCapabilityAnchors();
        return;
      case "location-updated":
      case "activity-log":
      case "activity-config-changed":
      case "unknown":
        return;
      case "conversation-created":
      case "conversation-updated":
      case "conversation-deleted":
        markDirty({ conversationList: true });
        if (
          context.execution.kind === "active" && !context.execution.recovering &&
          event.conversationId === context.selectedConversationId
        ) {
          return;
        }
        await flushConversationList();
        return;
      case "file-synced":
        markDirty({ conversationList: true });
        if (event.conversationId === context.selectedConversationId) {
          markDirty({ currentConversationHistory: true });
        }
        flushDirty();
        return;
      case "message-created":
      case "message-updated":
      case "message-deleted":
        markDirty({ conversationList: true });
        void flushConversationList();
        if (event.conversationId !== context.selectedConversationId) {
          return;
        }
        if (
          event.type === "message-created" &&
          isCurrentExecutionPersistenceNotification(event, context)
        ) {
          return;
        }
        if (context.execution.kind === "active" && !context.execution.recovering) {
          markDirty({ currentConversationHistory: true });
          return;
        }
        await reconcileEventNow(event);
        return;
    }
  };

  const stopConnection = () => {
    lifecycleGeneration += 1;
    openingController?.abort();
    openingController = null;
    connection?.close();
    connection = null;
    if (reconnectTimer !== null) {
      cancelReconnect(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectAttempt = 0;
    requiresReconnectReconciliation = false;
  };

  return {
    getState() {
      return state;
    },

    getDirtyState() {
      return dirty;
    },

    start() {
      if (started) return;
      started = true;
      lifecycleGeneration += 1;
      if (canConnect()) scheduleOpen(false);
    },

    stop() {
      if (!started && state.kind === "idle") return;
      started = false;
      stopConnection();
      capabilityAnchors.clear();
      dirty = INITIAL_REALTIME_DIRTY_STATE;
      publish(INITIAL_CHAT_REALTIME_STATE);
    },

    contextChanged() {
      if (!started) return;
      if (!canConnect()) {
        authenticationBlocked = false;
        stopConnection();
        capabilityAnchors.clear();
        dirty = INITIAL_REALTIME_DIRTY_STATE;
        publish(INITIAL_CHAT_REALTIME_STATE);
        return;
      }
      if (
        !authenticationBlocked &&
        connection === null &&
        openingController === null &&
        reconnectTimer === null
      ) {
        scheduleOpen(false);
      }
      flushDirty();
    },

    handleEvent,

    retryReconciliation() {
      flushDirty();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function isCurrentExecutionPersistenceNotification(
  event: Extract<RealtimeEvent, { readonly type: "message-created" }>,
  context: ChatRealtimeContext,
): boolean {
  const execution = context.execution;
  if (
    execution.kind !== "active" ||
    execution.recovering ||
    execution.executionKind !== "send" ||
    execution.conversationId !== event.conversationId
  ) {
    return false;
  }

  if (
    execution.assistantMessageId !== null &&
    isPersistedAssistantNotification(
      event,
      execution.assistantMessageId,
      execution.conversationId,
    )
  ) {
    return true;
  }

  return execution.userMessageId !== null &&
    event.messageId === execution.userMessageId;
}

function defaultQueueTask(task: () => void): void {
  if (typeof globalThis.queueMicrotask === "function") {
    globalThis.queueMicrotask(task);
    return;
  }
  void Promise.resolve().then(task);
}

function isAuthenticationFailure(error: unknown): boolean {
  return error instanceof WebSocketTransportError &&
    error.closeCode === AUTHENTICATION_CLOSE_CODE;
}
