import { describe, expect, it, vi } from "vitest";

import {
  createChatRealtimeCoordinator,
  type ChatRealtimeContext,
  type ChatRealtimeCoordinatorDependencies,
} from "@/application/chat-realtime";
import type { RealtimeConnection, RealtimeEvent } from "@/application/realtime";
import type { WebSocketCloseInfo } from "@/lib/websocket";
import { WebSocketTransportError } from "@/lib/websocket";

describe("chat realtime connection lifecycle", () => {
  it("connects once, stays idempotent, and closes on stop", async () => {
    const socket = controlledConnection();
    const openConnection = vi.fn(async () => socket.connection);
    const harness = createHarness({ openConnection });

    harness.coordinator.start();
    harness.coordinator.start();
    await flushAsync();

    expect(openConnection).toHaveBeenCalledOnce();
    expect(harness.coordinator.getState()).toEqual({ kind: "connected" });

    harness.coordinator.stop();
    expect(socket.close).toHaveBeenCalledOnce();
    expect(harness.coordinator.getState()).toEqual({ kind: "idle" });
  });

  it("cancels the first Strict Mode setup before opening a single replacement", async () => {
    const queued: Array<() => void> = [];
    const socket = controlledConnection();
    const openConnection = vi.fn(async () => socket.connection);
    const harness = createHarness({
      openConnection,
      queueTask: (task) => queued.push(task),
    });

    harness.coordinator.start();
    harness.coordinator.stop();
    harness.coordinator.start();
    expect(openConnection).not.toHaveBeenCalled();

    queued.splice(0).forEach((task) => task());
    await flushAsync();
    expect(openConnection).toHaveBeenCalledOnce();
  });

  it("does not connect until the authenticated workspace is available", async () => {
    const harness = createHarness({
      context: {
        workspaceAvailable: false,
        authenticated: false,
        selectedConversationId: null,
        execution: { kind: "idle" },
      },
    });

    harness.coordinator.start();
    await flushAsync();
    expect(harness.openConnection).not.toHaveBeenCalled();

    harness.context.workspaceAvailable = true;
    harness.context.authenticated = true;
    harness.context.selectedConversationId = "conv-a";
    harness.coordinator.contextChanged();
    await flushAsync();
    expect(harness.openConnection).toHaveBeenCalledOnce();
  });

  it("keeps one global socket when the selected conversation changes", async () => {
    const harness = createHarness();
    harness.coordinator.start();
    await flushAsync();

    harness.context.selectedConversationId = "conv-b";
    harness.coordinator.contextChanged();
    await flushAsync();

    expect(harness.openConnection).toHaveBeenCalledOnce();
    expect(harness.coordinator.getState()).toEqual({ kind: "connected" });
  });

  it("marks policy/auth close unavailable and never schedules reconnect", async () => {
    const scheduled: Array<() => void> = [];
    const socket = controlledConnection();
    const harness = createHarness({
      openConnection: vi.fn(async () => socket.connection),
      scheduleReconnect: (task) => {
        scheduled.push(task);
        return fakeTimer();
      },
    });
    harness.coordinator.start();
    await flushAsync();

    socket.serverClose(1008);
    await flushAsync();
    expect(harness.coordinator.getState()).toEqual({
      kind: "unavailable",
      reason: "authentication",
    });
    expect(scheduled).toHaveLength(0);

    harness.coordinator.contextChanged();
    await flushAsync();
    expect(harness.openConnection).toHaveBeenCalledOnce();
  });

  it("does not reconnect when authentication closes before socket open", async () => {
    const scheduled: Array<() => void> = [];
    const harness = createHarness({
      openConnection: vi.fn(async () => Promise.reject(
        new WebSocketTransportError(
          "safe closed before open",
          "CLOSED_BEFORE_OPEN",
          1008,
        ),
      )),
      scheduleReconnect: (task) => {
        scheduled.push(task);
        return fakeTimer();
      },
    });

    harness.coordinator.start();
    await flushAsync();

    expect(harness.coordinator.getState()).toEqual({
      kind: "unavailable",
      reason: "authentication",
    });
    expect(scheduled).toHaveLength(0);
    expect(JSON.stringify(harness.coordinator.getState()))
      .not.toContain("closed before open");
  });

  it("reconnects after network close and performs HTTP scratch convergence", async () => {
    const scheduled: Array<() => void> = [];
    const queued: Array<() => void> = [];
    const first = controlledConnection();
    const second = controlledConnection();
    const openConnection = vi.fn()
      .mockResolvedValueOnce(first.connection)
      .mockResolvedValueOnce(second.connection);
    const harness = createHarness({
      openConnection,
      queueTask: (task) => queued.push(task),
      scheduleReconnect: (task) => {
        scheduled.push(task);
        return fakeTimer();
      },
    });

    harness.coordinator.start();
    queued.shift()?.();
    await flushAsync();
    first.serverClose(1006);
    await flushAsync();
    expect(harness.coordinator.getState()).toEqual({ kind: "reconnecting" });

    scheduled.shift()?.();
    queued.shift()?.();
    await flushAsync();
    expect(openConnection).toHaveBeenCalledTimes(2);
    expect(harness.reconcileAfterReconnect).toHaveBeenCalledWith("conv-a");
    expect(harness.refreshConversationList).toHaveBeenCalledOnce();
    expect(harness.coordinator.getState()).toEqual({ kind: "connected" });
  });

  it("retries an opening/network failure without exposing the raw error", async () => {
    const scheduled: Array<() => void> = [];
    const socket = controlledConnection();
    const secret = "wss://secret.example/private-cookie";
    const openConnection = vi.fn()
      .mockRejectedValueOnce(new Error(secret))
      .mockResolvedValueOnce(socket.connection);
    const harness = createHarness({
      openConnection,
      scheduleReconnect: (task) => {
        scheduled.push(task);
        return fakeTimer();
      },
    });

    harness.coordinator.start();
    await flushAsync();
    expect(harness.coordinator.getState()).toEqual({ kind: "reconnecting" });
    expect(JSON.stringify(harness.coordinator.getState())).not.toContain(secret);

    scheduled.shift()?.();
    await flushAsync();
    expect(openConnection).toHaveBeenCalledTimes(2);
    expect(harness.reconcileAfterReconnect).toHaveBeenCalledOnce();
  });

  it("treats a malformed event stream as an isolated reconnect condition", async () => {
    const scheduled: Array<() => void> = [];
    const socket = controlledConnection();
    const harness = createHarness({
      openConnection: vi.fn(async () => socket.connection),
      scheduleReconnect: (task) => {
        scheduled.push(task);
        return fakeTimer();
      },
    });
    harness.coordinator.start();
    await flushAsync();

    socket.fail(new Error("raw malformed payload"));
    socket.serverClose(1006);
    await flushAsync();
    expect(harness.coordinator.getState()).toEqual({ kind: "reconnecting" });
    expect(JSON.stringify(harness.coordinator.getState())).not.toContain("raw");
    expect(scheduled).toHaveLength(1);
  });
});

describe("chat realtime event coordination", () => {
  it.each([
    ["assistant", "assistant-a"],
    ["user", "client-user-a"],
  ])("deduplicates the current execution %s creation notification", async (_label, messageId) => {
    const harness = createHarness({
      context: activeContext(),
    });

    await harness.coordinator.handleEvent(created(messageId));

    expect(harness.reconcileEvent).not.toHaveBeenCalled();
    expect(harness.reconcileAfterReconnect).not.toHaveBeenCalled();
    expect(harness.coordinator.getDirtyState().currentConversationHistory)
      .toBe(false);
    expect(harness.refreshConversationList).toHaveBeenCalledOnce();
  });

  it("defers an unrelated current message while streaming and flushes once idle", async () => {
    const harness = createHarness({ context: activeContext() });
    harness.coordinator.start();
    await flushAsync();

    await harness.coordinator.handleEvent(created("external-assistant"));
    await harness.coordinator.handleEvent(updated("old-message"));
    expect(harness.reconcileEvent).not.toHaveBeenCalled();
    expect(harness.coordinator.getDirtyState().currentConversationHistory)
      .toBe(true);

    harness.context.execution = { kind: "idle" };
    harness.coordinator.contextChanged();
    await flushAsync();
    expect(harness.reconcileAfterReconnect).toHaveBeenCalledTimes(1);
    expect(harness.coordinator.getDirtyState().currentConversationHistory)
      .toBe(false);
  });

  it.each([
    created("external-assistant"),
    updated("old-message"),
    deleted("deleted-message"),
  ])("reuses existing reconciliation for idle current message events", async (event) => {
    const harness = createHarness();
    await harness.coordinator.handleEvent(event);
    expect(harness.reconcileEvent).toHaveBeenCalledWith(event);
  });

  it("does not pollute current history for another conversation", async () => {
    const harness = createHarness();
    await harness.coordinator.handleEvent({
      type: "message-created",
      conversationId: "conv-b",
      messageId: "external",
    });
    expect(harness.reconcileEvent).not.toHaveBeenCalled();
    expect(harness.reconcileAfterReconnect).not.toHaveBeenCalled();
    expect(harness.refreshConversationList).toHaveBeenCalledOnce();
  });

  it("ignores unknown mapped events without retaining their type", async () => {
    const harness = createHarness();
    await harness.coordinator.handleEvent({
      type: "unknown",
      rawType: "future_private_event",
    });
    expect(harness.reconcileEvent).not.toHaveBeenCalled();
    expect(harness.refreshConversationList).not.toHaveBeenCalled();
    expect(JSON.stringify(harness.coordinator.getDirtyState()))
      .not.toContain("future_private_event");
  });

  it("uses scratch reconciliation for current file sync", async () => {
    const harness = createHarness();
    await harness.coordinator.handleEvent({
      type: "file-synced",
      conversationId: "conv-a",
    });
    await flushAsync();
    expect(harness.reconcileAfterReconnect).toHaveBeenCalledWith("conv-a");
  });

  it("defers a current conversation deletion during execution", async () => {
    const harness = createHarness({ context: activeContext() });
    harness.coordinator.start();
    await flushAsync();
    await harness.coordinator.handleEvent({
      type: "conversation-deleted",
      conversationId: "conv-a",
    });
    expect(harness.refreshConversationList).not.toHaveBeenCalled();
    expect(harness.coordinator.getDirtyState().conversationList).toBe(true);

    harness.context.execution = { kind: "idle" };
    harness.coordinator.contextChanged();
    await flushAsync();
    expect(harness.refreshConversationList).toHaveBeenCalledOnce();
  });

  it("refreshes only the sidebar for other conversation metadata events", async () => {
    const harness = createHarness();
    await harness.coordinator.handleEvent({
      type: "conversation-updated",
      conversationId: "conv-b",
    });
    expect(harness.refreshConversationList).toHaveBeenCalledOnce();
    expect(harness.reconcileEvent).not.toHaveBeenCalled();
  });

  it("keeps an active execution deletion conflict deferred", async () => {
    const harness = createHarness({ context: activeContext() });
    await harness.coordinator.handleEvent(deleted("assistant-a"));
    expect(harness.reconcileEvent).not.toHaveBeenCalled();
    expect(harness.coordinator.getDirtyState().currentConversationHistory)
      .toBe(true);
  });
});

describe("chat realtime dirty and HTTP request merging", () => {
  it("coalesces events arriving during one history refresh into one scratch reload", async () => {
    const firstRefresh = deferred<void>();
    const reconcileEvent = vi.fn(() => firstRefresh.promise);
    const harness = createHarness({ reconcileEvent });

    const first = harness.coordinator.handleEvent(created("one"));
    const second = harness.coordinator.handleEvent(updated("two"));
    const third = harness.coordinator.handleEvent(created("three"));
    expect(reconcileEvent).toHaveBeenCalledOnce();

    firstRefresh.resolve();
    await Promise.all([first, second, third]);
    await flushAsync();
    expect(harness.reconcileAfterReconnect).toHaveBeenCalledOnce();
  });

  it("retains dirty after refresh failure and supports an explicit retry", async () => {
    const reconcileEvent = vi.fn().mockRejectedValue(new Error("private"));
    const harness = createHarness({ reconcileEvent });
    await harness.coordinator.handleEvent(created("one"));
    expect(harness.coordinator.getDirtyState().currentConversationHistory)
      .toBe(true);

    harness.coordinator.retryReconciliation();
    await flushAsync();
    expect(harness.reconcileAfterReconnect).toHaveBeenCalledOnce();
    expect(harness.coordinator.getDirtyState().currentConversationHistory)
      .toBe(false);
  });

  it("coalesces multiple sidebar invalidations during an in-flight refresh", async () => {
    const listRefresh = deferred<void>();
    const refreshConversationList = vi.fn()
      .mockImplementationOnce(() => listRefresh.promise)
      .mockResolvedValue(undefined);
    const harness = createHarness({ refreshConversationList });

    const first = harness.coordinator.handleEvent({
      type: "conversation-created",
      conversationId: "conv-b",
    });
    const second = harness.coordinator.handleEvent({
      type: "conversation-updated",
      conversationId: "conv-b",
    });
    const third = harness.coordinator.handleEvent({
      type: "conversation-deleted",
      conversationId: "conv-c",
    });
    expect(refreshConversationList).toHaveBeenCalledOnce();

    listRefresh.resolve();
    await Promise.all([first, second, third]);
    await flushAsync();
    expect(refreshConversationList).toHaveBeenCalledTimes(2);
  });

  it("defers reconnect history ownership while SSE remains active", async () => {
    const scheduled: Array<() => void> = [];
    const first = controlledConnection();
    const second = controlledConnection();
    const harness = createHarness({
      context: activeContext(),
      openConnection: vi.fn()
        .mockResolvedValueOnce(first.connection)
        .mockResolvedValueOnce(second.connection),
      scheduleReconnect: (task) => {
        scheduled.push(task);
        return fakeTimer();
      },
    });
    harness.coordinator.start();
    await flushAsync();
    first.serverClose(1006);
    await flushAsync();
    scheduled.shift()?.();
    await flushAsync();

    expect(harness.reconcileAfterReconnect).not.toHaveBeenCalled();
    expect(harness.refreshConversationList).not.toHaveBeenCalled();
    expect(harness.coordinator.getDirtyState().currentConversationHistory)
      .toBe(true);
    harness.context.execution = { kind: "idle" };
    harness.coordinator.contextChanged();
    await flushAsync();
    expect(harness.reconcileAfterReconnect).toHaveBeenCalledWith("conv-a");
    expect(harness.refreshConversationList).toHaveBeenCalledOnce();
  });

  it("reconciles the current selection when conversation switches across reconnect", async () => {
    const scheduled: Array<() => void> = [];
    const first = controlledConnection();
    const second = controlledConnection();
    const harness = createHarness({
      openConnection: vi.fn()
        .mockResolvedValueOnce(first.connection)
        .mockResolvedValueOnce(second.connection),
      scheduleReconnect: (task) => {
        scheduled.push(task);
        return fakeTimer();
      },
    });
    harness.coordinator.start();
    await flushAsync();
    first.serverClose(1006);
    await flushAsync();
    harness.context.selectedConversationId = "conv-b";
    harness.coordinator.contextChanged();
    scheduled.shift()?.();
    await flushAsync();
    expect(harness.reconcileAfterReconnect).toHaveBeenCalledWith("conv-b");
  });
});

type MutableContext = {
  -readonly [Key in keyof ChatRealtimeContext]: ChatRealtimeContext[Key];
};

function createHarness(
  overrides: Partial<ChatRealtimeCoordinatorDependencies> & {
    readonly context?: ChatRealtimeContext;
  } = {},
) {
  const context = { ...defaultContext(), ...overrides.context } as MutableContext;
  const fallbackSocket = controlledConnection();
  const openConnection = overrides.openConnection ??
    vi.fn(async () => fallbackSocket.connection);
  const reconcileEvent = overrides.reconcileEvent ?? vi.fn(async () => undefined);
  const reconcileAfterReconnect = overrides.reconcileAfterReconnect ??
    vi.fn(async () => undefined);
  const refreshConversationList = overrides.refreshConversationList ??
    vi.fn(async () => undefined);
  const coordinator = createChatRealtimeCoordinator({
    openConnection,
    getContext: () => context,
    reconcileEvent,
    reconcileAfterReconnect,
    refreshConversationList,
    queueTask: overrides.queueTask,
    scheduleReconnect: overrides.scheduleReconnect,
    cancelReconnect: overrides.cancelReconnect,
  });
  return {
    context,
    coordinator,
    openConnection,
    reconcileEvent,
    reconcileAfterReconnect,
    refreshConversationList,
  };
}

function defaultContext(): ChatRealtimeContext {
  return {
    workspaceAvailable: true,
    authenticated: true,
    selectedConversationId: "conv-a",
    execution: { kind: "idle" },
  };
}

function activeContext(): ChatRealtimeContext {
  return {
    ...defaultContext(),
    execution: {
      kind: "active",
      conversationId: "conv-a",
      userMessageId: "client-user-a",
      assistantMessageId: "assistant-a",
    },
  };
}

function created(messageId: string): RealtimeEvent {
  return { type: "message-created", conversationId: "conv-a", messageId };
}

function updated(messageId: string): RealtimeEvent {
  return { type: "message-updated", conversationId: "conv-a", messageId };
}

function deleted(messageId: string): RealtimeEvent {
  return { type: "message-deleted", conversationId: "conv-a", messageId };
}

function controlledConnection() {
  const values: RealtimeEvent[] = [];
  const waiters: Array<{
    readonly resolve: (value: IteratorResult<RealtimeEvent>) => void;
    readonly reject: (error: unknown) => void;
  }> = [];
  let ended = false;
  let failure: unknown;
  const closed = deferred<WebSocketCloseInfo>();
  const finishEvents = () => {
    ended = true;
    waiters.splice(0).forEach(({ resolve }) =>
      resolve({ done: true, value: undefined }));
  };
  const close = vi.fn(() => {
    finishEvents();
    closed.resolve({
      code: 1000,
      reason: "local",
      wasClean: true,
      initiatedLocally: true,
    });
  });
  const connection: RealtimeConnection = {
    events: {
      [Symbol.asyncIterator]() {
        return {
          next: () => {
            const value = values.shift();
            if (value !== undefined) {
              return Promise.resolve({ done: false as const, value });
            }
            if (failure !== undefined) return Promise.reject(failure);
            if (ended) {
              return Promise.resolve({ done: true as const, value: undefined });
            }
            return new Promise<IteratorResult<RealtimeEvent>>((resolve, reject) => {
              waiters.push({ resolve, reject });
            });
          },
        };
      },
    },
    closed: closed.promise,
    close,
  };
  return {
    connection,
    close,
    push(event: RealtimeEvent) {
      const waiter = waiters.shift();
      if (waiter) waiter.resolve({ done: false, value: event });
      else values.push(event);
    },
    fail(error: unknown) {
      failure = error;
      waiters.splice(0).forEach(({ reject }) => reject(error));
    },
    serverClose(code: number) {
      finishEvents();
      closed.resolve({
        code,
        reason: "private server reason",
        wasClean: false,
        initiatedLocally: false,
      });
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function fakeTimer(): ReturnType<typeof setTimeout> {
  return Object.create(null) as ReturnType<typeof setTimeout>;
}
