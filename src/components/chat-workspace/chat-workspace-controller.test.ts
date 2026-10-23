import { describe, expect, it, vi } from "vitest";

import {
  ChatWorkspaceContractError,
  createChatWorkspaceSnapshot,
  type ChatWorkspaceSnapshot,
} from "@/application/chat-workspace";
import type { ChatSetupViewModel } from "@/application/chat-setup";
import type { MessageHistoryState } from "@/application/message-history";
import type { RealtimeEvent } from "@/application/realtime";
import type { RealtimeReconciliationResult } from "@/application/realtime-reconciliation";
import type { ConversationSummary } from "@/domain/conversation";
import {
  createChatWorkspaceController,
  toSafeUiError,
  type ChatWorkspaceConversationLoader,
  type ChatWorkspaceControllerState,
} from "@/components/chat-workspace/chat-workspace-controller";
import { ApiError } from "@/lib/api";

describe("chat workspace controller bootstrap", () => {
  it("transitions idle to loading to ready", async () => {
    const pending = deferred<ChatWorkspaceSnapshot>();
    const controller = createChatWorkspaceController({}, {
      loadWorkspace: () => pending.promise,
    });
    const states: ChatWorkspaceControllerState[] = [];
    controller.subscribe((state) => states.push(state));

    expect(controller.getState()).toEqual({ status: "idle" });
    const load = controller.load();
    expect(controller.getState()).toEqual({ status: "loading" });
    pending.resolve(workspace("conv_a"));
    await load;

    expect(controller.getState()).toEqual({
      status: "ready",
      workspace: workspace("conv_a"),
      pendingConversationId: null,
      switchError: null,
    });
    expect(states.map(({ status }) => status)).toEqual(["loading", "ready"]);
  });

  it("represents empty conversations and no selection as a ready workspace", async () => {
    const empty = workspace(null, []);
    const controller = createChatWorkspaceController({}, {
      loadWorkspace: () => Promise.resolve(empty),
    });

    await controller.load();

    expect(controller.getState()).toEqual({
      status: "ready",
      workspace: empty,
      pendingConversationId: null,
      switchError: null,
    });
  });

  it("publishes a safe bootstrap error and supports retry", async () => {
    const fakeSecret = "fake-api-key-bootstrap";
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(fakeSecret, 503, {
        endpoint: "https://private.example",
        session: fakeSecret,
      }))
      .mockResolvedValueOnce(workspace("conv_b"));
    const controller = createChatWorkspaceController({}, {
      loadWorkspace: loader,
    });

    await controller.load();
    expect(controller.getState()).toEqual({
      status: "error",
      error: {
        code: "service",
        message: "暂时无法读取会话，请重试。",
      },
    });
    expect(JSON.stringify(controller.getState())).not.toContain(fakeSecret);

    await controller.retry();
    expect(controller.getState()).toMatchObject({
      status: "ready",
      workspace: { selectedConversationId: "conv_b" },
    });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("does not publish abort as an error and aborts the caller signal on retry", async () => {
    const first = abortableDeferredWorkspace();
    const second = deferred<ChatWorkspaceSnapshot>();
    const loader = vi
      .fn()
      .mockImplementationOnce(first.load)
      .mockImplementationOnce(() => second.promise);
    const controller = createChatWorkspaceController({}, {
      loadWorkspace: loader,
    });

    const firstLoad = controller.load();
    const secondLoad = controller.retry();
    second.resolve(workspace("conv_b"));
    await Promise.all([firstLoad, secondLoad]);

    expect(first.signal?.aborted).toBe(true);
    expect(controller.getState()).toMatchObject({
      status: "ready",
      workspace: { selectedConversationId: "conv_b" },
    });
  });

  it("prevents older bootstrap success and error from overwriting a retry", async () => {
    const oldSuccess = deferred<ChatWorkspaceSnapshot>();
    const newSuccess = deferred<ChatWorkspaceSnapshot>();
    const successController = createChatWorkspaceController({}, {
      loadWorkspace: vi
        .fn()
        .mockReturnValueOnce(oldSuccess.promise)
        .mockReturnValueOnce(newSuccess.promise),
    });

    const firstLoad = successController.load();
    const secondLoad = successController.load();
    newSuccess.resolve(workspace("conv_b"));
    await secondLoad;
    oldSuccess.resolve(workspace("conv_a"));
    await firstLoad;
    expect(successController.getState()).toMatchObject({
      workspace: { selectedConversationId: "conv_b" },
    });

    const oldError = deferred<ChatWorkspaceSnapshot>();
    const newReady = deferred<ChatWorkspaceSnapshot>();
    const errorController = createChatWorkspaceController({}, {
      loadWorkspace: vi
        .fn()
        .mockReturnValueOnce(oldError.promise)
        .mockReturnValueOnce(newReady.promise),
    });
    const staleLoad = errorController.load();
    const currentLoad = errorController.load();
    newReady.resolve(workspace("conv_b"));
    await currentLoad;
    oldError.reject(new ApiError("stale failure", 500));
    await staleLoad;
    expect(errorController.getState()).toMatchObject({
      status: "ready",
      workspace: { selectedConversationId: "conv_b" },
    });
  });

  it("aborts and suppresses updates on dispose", async () => {
    const request = abortableDeferredWorkspace();
    const listener = vi.fn();
    const controller = createChatWorkspaceController({}, {
      loadWorkspace: request.load,
    });
    controller.subscribe(listener);

    const load = controller.load();
    controller.dispose();
    await load;

    expect(request.signal?.aborted).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ status: "loading" });
  });

  it("cleans up the first Strict Mode lifecycle without leaking state", async () => {
    const firstRequest = abortableDeferredWorkspace();
    const firstListener = vi.fn();
    const first = createChatWorkspaceController({}, {
      loadWorkspace: firstRequest.load,
    });
    first.subscribe(firstListener);
    const firstLoad = first.load();
    first.dispose();

    const second = createChatWorkspaceController({}, {
      loadWorkspace: () => Promise.resolve(workspace("conv_b")),
    });
    await second.load();
    await firstLoad;

    expect(firstRequest.signal?.aborted).toBe(true);
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(second.getState()).toMatchObject({
      status: "ready",
      workspace: { selectedConversationId: "conv_b" },
    });
  });

  it("preserves an existing selection when reloading bootstrap", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce(workspace("conv_b"))
      .mockResolvedValueOnce(workspace("conv_b"));
    const controller = createChatWorkspaceController({
      preferredConversationId: "conv_a",
    }, { loadWorkspace: loader });

    await controller.load();
    await controller.load();

    expect(loader.mock.calls[1]?.[0]).toMatchObject({
      preferredConversationId: "conv_a",
      currentConversationId: "conv_b",
    });
  });
});

describe("chat workspace controller conversation switching", () => {
  it("keeps the old workspace while loading and atomically swaps on success", async () => {
    const pending = deferred<ChatWorkspaceSnapshot>();
    const oldWorkspace = workspace("conv_a");
    const nextWorkspace = workspace("conv_b");
    const switchLoader = vi.fn(() => pending.promise);
    const controller = await readyController(oldWorkspace, switchLoader);

    const selection = controller.selectConversation("conv_b");
    expect(controller.getState()).toEqual({
      status: "ready",
      workspace: oldWorkspace,
      pendingConversationId: "conv_b",
      switchError: null,
    });

    pending.resolve(nextWorkspace);
    await selection;

    expect(controller.getState()).toEqual({
      status: "ready",
      workspace: nextWorkspace,
      pendingConversationId: null,
      switchError: null,
    });
    expect(switchLoader).toHaveBeenCalledWith(
      oldWorkspace,
      "conv_b",
      { signal: expect.any(AbortSignal) },
    );
  });

  it("keeps old title/selection/history together after a switch error", async () => {
    const fakeMessage = "fake-private-message-content";
    const oldWorkspace = workspace("conv_a", undefined, fakeMessage);
    const controller = await readyController(
      oldWorkspace,
      () => Promise.reject(new ChatWorkspaceContractError(fakeMessage)),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await controller.selectConversation("conv_b");

    expect(controller.getState()).toEqual({
      status: "ready",
      workspace: oldWorkspace,
      pendingConversationId: null,
      switchError: {
        code: "contract",
        message: "会话数据暂时无法使用，请重试。",
      },
    });
    expect(controller.getState()).toMatchObject({
      workspace: {
        selectedConversationId: "conv_a",
        selectedConversation: { id: "conv_a" },
        history: { conversationId: "conv_a" },
      },
    });
    const failedState = controller.getState();
    expect(JSON.stringify(failedState.status === "ready"
      ? failedState.switchError
      : null)).not.toContain(fakeMessage);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("retries the last failed conversation switch", async () => {
    const oldWorkspace = workspace("conv_a");
    const nextWorkspace = workspace("conv_b");
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("failed", 500))
      .mockResolvedValueOnce(nextWorkspace);
    const controller = await readyController(oldWorkspace, loader);

    await controller.selectConversation("conv_b");
    await controller.retryConversationSwitch();

    expect(loader).toHaveBeenCalledTimes(2);
    expect(loader.mock.calls.map((call) => call[1])).toEqual([
      "conv_b",
      "conv_b",
    ]);
    expect(controller.getState()).toMatchObject({
      workspace: { selectedConversationId: "conv_b" },
      pendingConversationId: null,
      switchError: null,
    });
  });

  it("handles rapid A to B to C and ignores stale B success", async () => {
    const pendingB = deferred<ChatWorkspaceSnapshot>();
    const pendingC = deferred<ChatWorkspaceSnapshot>();
    const signals: AbortSignal[] = [];
    const loader = vi.fn((_workspace, conversationId, options) => {
      signals.push(options?.signal as AbortSignal);
      return conversationId === "conv_b" ? pendingB.promise : pendingC.promise;
    });
    const controller = await readyController(workspace("conv_a"), loader);

    const selectB = controller.selectConversation("conv_b");
    const selectC = controller.selectConversation("conv_c");
    expect(signals[0]?.aborted).toBe(true);
    expect(controller.getState()).toMatchObject({
      workspace: { selectedConversationId: "conv_a" },
      pendingConversationId: "conv_c",
    });

    pendingC.resolve(workspace("conv_c"));
    await selectC;
    pendingB.resolve(workspace("conv_b"));
    await selectB;

    expect(controller.getState()).toMatchObject({
      workspace: { selectedConversationId: "conv_c" },
      pendingConversationId: null,
    });
  });

  it("ignores a stale switch error after a newer selection succeeds", async () => {
    const pendingB = deferred<ChatWorkspaceSnapshot>();
    const pendingC = deferred<ChatWorkspaceSnapshot>();
    const loader = vi.fn((_workspace, conversationId) =>
      conversationId === "conv_b" ? pendingB.promise : pendingC.promise,
    );
    const controller = await readyController(workspace("conv_a"), loader);

    const selectB = controller.selectConversation("conv_b");
    const selectC = controller.selectConversation("conv_c");
    pendingC.resolve(workspace("conv_c"));
    await selectC;
    pendingB.reject(new ApiError("stale error", 500));
    await selectB;

    expect(controller.getState()).toMatchObject({
      workspace: { selectedConversationId: "conv_c" },
      switchError: null,
    });
  });

  it("cancels a pending switch when the visible conversation is reselected", async () => {
    const pendingB = deferred<ChatWorkspaceSnapshot>();
    let signal: AbortSignal | undefined;
    const controller = await readyController(workspace("conv_a"), (_workspace, _id, options) => {
      signal = options?.signal;
      return pendingB.promise;
    });

    const selectB = controller.selectConversation("conv_b");
    await controller.selectConversation("conv_a");

    expect(signal?.aborted).toBe(true);
    expect(controller.getState()).toMatchObject({
      workspace: { selectedConversationId: "conv_a" },
      pendingConversationId: null,
    });
    pendingB.resolve(workspace("conv_b"));
    await selectB;
    expect(controller.getState()).toMatchObject({
      workspace: { selectedConversationId: "conv_a" },
    });
  });

  it("aborts switch independently when bootstrap is restarted", async () => {
    const switchPending = deferred<ChatWorkspaceSnapshot>();
    let switchSignal: AbortSignal | undefined;
    const bootstrapLoader = vi.fn().mockResolvedValue(workspace("conv_a"));
    const controller = createChatWorkspaceController({}, {
      loadWorkspace: bootstrapLoader,
      loadConversation: (_workspace, _id, options) => {
        switchSignal = options?.signal;
        return switchPending.promise;
      },
    });
    await controller.load();

    const switching = controller.selectConversation("conv_b");
    await controller.load();
    expect(switchSignal?.aborted).toBe(true);
    expect(controller.getState()).toMatchObject({ status: "ready" });

    switchPending.resolve(workspace("conv_b"));
    await switching;
    expect(controller.getState()).toMatchObject({
      workspace: { selectedConversationId: "conv_a" },
    });
  });

  it("aborts an active switch on dispose without publishing an error", async () => {
    const request = abortableDeferredSwitch();
    const listener = vi.fn();
    const controller = await readyController(workspace("conv_a"), request.load);
    controller.subscribe(listener);

    const switching = controller.selectConversation("conv_b");
    controller.dispose();
    await switching;

    expect(request.signal?.aborted).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      pendingConversationId: "conv_b",
      switchError: null,
    });
  });
});

describe("chat workspace controller history reconciliation", () => {
  it("reloads only the selected HTTP history and atomically replaces it", async () => {
    const original = workspace("conv_a", undefined, "old history");
    const reloaded = history("conv_a", "persisted final");
    const reloadHistory = vi.fn().mockResolvedValue(reloaded);
    const controller = createChatWorkspaceController({}, {
      loadWorkspace: () => Promise.resolve(original),
      reloadHistory,
    });
    await controller.load();

    const reconciliation = await controller.reloadSelectedConversationHistory(
      "conv_a",
      "message-conv_a",
    );

    expect(reloadHistory).toHaveBeenCalledWith(
      original.history,
      { request: { signal: expect.any(AbortSignal) } },
    );
    expect(controller.getState()).toMatchObject({
      status: "ready",
      workspace: {
        selectedConversationId: "conv_a",
        history: { messages: [{ content: "persisted final" }] },
      },
    });
    expect(original.history?.messages[0]?.content).toBe("old history");
    expect(reconciliation).toEqual({
      persistedMessageIds: ["message-conv_a"],
      regenerateTarget: {
        id: "message-conv_a",
        content: "persisted final",
        thinking: null,
        simpleThink: null,
      },
    });
  });

  it("installs authoritative history while returning a missing regenerate target", async () => {
    const original = workspace("conv_a", undefined, "old history");
    const reloaded = history("conv_a", "authoritative history");
    const controller = createChatWorkspaceController({}, {
      loadWorkspace: () => Promise.resolve(original),
      reloadHistory: vi.fn().mockResolvedValue(reloaded),
    });
    await controller.load();

    const reconciliation = await controller.reloadSelectedConversationHistory(
      "conv_a",
      "missing-target",
    );

    expect(controller.getState()).toMatchObject({
      workspace: {
        history: { messages: [{ content: "authoritative history" }] },
      },
    });
    expect(reconciliation).toEqual({
      persistedMessageIds: ["message-conv_a"],
      regenerateTarget: null,
    });
  });

  it("preserves persistent history when reload fails and rejects other conversations", async () => {
    const original = workspace("conv_a", undefined, "old history");
    const expected = new ApiError("private reload", 500);
    const reloadHistory = vi.fn().mockRejectedValue(expected);
    const controller = createChatWorkspaceController({}, {
      loadWorkspace: () => Promise.resolve(original),
      reloadHistory,
    });
    await controller.load();

    await expect(controller.reloadSelectedConversationHistory("conv_a"))
      .rejects.toBe(expected);
    await expect(controller.reloadSelectedConversationHistory("conv_b"))
      .rejects.toBeInstanceOf(ChatWorkspaceContractError);
    expect(controller.getState()).toMatchObject({
      workspace: { history: { messages: [{ content: "old history" }] } },
    });
    expect(reloadHistory).toHaveBeenCalledOnce();
  });
});

describe("chat workspace safe UI errors", () => {
  it("maps error categories without retaining raw payload, endpoint, session, or content", () => {
    const fakeSecret = "fake-safe-ui-secret";
    const cases = [
      new ApiError(fakeSecret, 401, { raw: fakeSecret }),
      new ApiError(fakeSecret, 0, { endpoint: fakeSecret }, "NETWORK_ERROR"),
      new ApiError(fakeSecret, 0, { session: fakeSecret }, "TIMEOUT"),
      new ChatWorkspaceContractError(fakeSecret),
      { rawPayload: fakeSecret },
    ];

    for (const error of cases) {
      const safe = toSafeUiError(error);
      expect(JSON.stringify(safe)).not.toContain(fakeSecret);
      expect(Object.keys(safe).sort()).toEqual(["code", "message"]);
    }
  });
});

describe("chat workspace realtime update ports", () => {
  it("applies the existing realtime reconciliation result to persistent history", async () => {
    const original = workspace("conv_a", undefined, "old history");
    const nextHistory = history("conv_a", "HTTP refreshed history");
    const reconcile = vi.fn(async (
      _history: MessageHistoryState,
      event: RealtimeEvent,
    ) => reconciliationResult(nextHistory, event));
    const controller = createChatWorkspaceController({}, {
      loadWorkspace: async () => original,
      reconcileRealtimeEvent: reconcile,
    });
    await controller.load();
    const event = {
      type: "message-created",
      conversationId: "conv_a",
      messageId: "server-message",
    } as const;

    await controller.reconcileSelectedConversationRealtimeEvent(event);

    expect(reconcile).toHaveBeenCalledWith(
      original.history,
      event,
      { history: { request: { signal: expect.any(AbortSignal) } } },
    );
    expect(controller.getState()).toMatchObject({
      status: "ready",
      workspace: {
        history: { messages: [{ content: "HTTP refreshed history" }] },
      },
    });
  });

  it("applies reconnect scratch reconciliation without invoking send", async () => {
    const original = workspace("conv_a", undefined, "before reconnect");
    const nextHistory = history("conv_a", "scratch truth");
    const reconnect = vi.fn(async () => reconnectResult(nextHistory));
    const controller = createChatWorkspaceController({}, {
      loadWorkspace: async () => original,
      reconcileAfterReconnect: reconnect,
    });
    await controller.load();

    await controller.reconcileSelectedConversationAfterReconnect("conv_a");

    expect(reconnect).toHaveBeenCalledWith(
      original.history,
      { history: { request: { signal: expect.any(AbortSignal) } } },
    );
    expect(controller.getState()).toMatchObject({
      workspace: { history: { messages: [{ content: "scratch truth" }] } },
    });
  });

  it("refreshes non-current conversation summaries without loading history", async () => {
    const original = workspace("conv_a");
    const refreshed = conversations().map((conversation) =>
      conversation.id === "conv_b"
        ? { ...conversation, title: "Externally renamed" }
        : conversation);
    const loadWorkspace = vi.fn(async () => original);
    const loadConversationList = vi.fn(async () => refreshed);
    const reloadHistory = vi.fn();
    const controller = createChatWorkspaceController({}, {
      loadWorkspace,
      loadConversationList,
      reloadHistory,
    });
    await controller.load();

    await controller.refreshConversationList();

    expect(loadWorkspace).toHaveBeenCalledOnce();
    expect(reloadHistory).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({
      status: "ready",
      workspace: {
        selectedConversationId: "conv_a",
        conversations: expect.arrayContaining([
          expect.objectContaining({ id: "conv_b", title: "Externally renamed" }),
        ]),
      },
    });
    const state = controller.getState();
    if (state.status === "ready") {
      expect(state.workspace.history).toBe(original.history);
    }
  });

  it("stages a full workspace reload when the current conversation was deleted", async () => {
    const original = workspace("conv_a");
    const remaining = conversations().filter(({ id }) => id !== "conv_a");
    const fallback = workspace("conv_b", remaining, "new selected history");
    const loadWorkspace = vi.fn()
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(fallback);
    const controller = createChatWorkspaceController({}, {
      loadWorkspace,
      loadConversationList: async () => remaining,
    });
    const states: ChatWorkspaceControllerState[] = [];
    controller.subscribe((state) => states.push(state));
    await controller.load();
    states.length = 0;

    await controller.refreshConversationList();

    expect(loadWorkspace).toHaveBeenLastCalledWith(
      { currentConversationId: null },
      { signal: expect.any(AbortSignal) },
    );
    expect(states.map(({ status }) => status)).toEqual(["ready"]);
    expect(controller.getState()).toMatchObject({
      status: "ready",
      workspace: { selectedConversationId: "conv_b" },
    });
  });

  it("reloads effective setup on any conversation update without replacing current history", async () => {
    const original = workspace("conv_a");
    const loadSetup = vi.fn(async () => ({ ...original.setup, modelKey: "new-literal" }));
    const controller = createChatWorkspaceController({}, {
      loadWorkspace: async () => original,
      loadConversationList: async () => conversations(),
      loadSetup,
    });
    await controller.load();
    await controller.refreshConversationList();
    expect(loadSetup).toHaveBeenCalledWith(expect.objectContaining({ id: "conv_a" }), { signal: expect.any(AbortSignal) });
    expect(controller.getState()).toMatchObject({ workspace: { setup: { modelKey: "new-literal" }, history: original.history } });
    controller.dispose();
  });

  it("keeps the last workspace intact when a sidebar refresh fails", async () => {
    const original = workspace("conv_a");
    const failure = new ApiError("private list failure", 500);
    const controller = createChatWorkspaceController({}, {
      loadWorkspace: async () => original,
      loadConversationList: async () => Promise.reject(failure),
    });
    await controller.load();

    await expect(controller.refreshConversationList()).rejects.toBe(failure);
    expect(controller.getState()).toMatchObject({
      status: "ready",
      workspace: { selectedConversationId: "conv_a" },
    });
  });
});

async function readyController(
  initialWorkspace: ChatWorkspaceSnapshot,
  loadConversation: ChatWorkspaceConversationLoader,
) {
  const controller = createChatWorkspaceController({}, {
    loadWorkspace: () => Promise.resolve(initialWorkspace),
    loadConversation,
  });
  await controller.load();
  return controller;
}

function workspace(
  selectedId: string | null,
  list: readonly ConversationSummary[] = conversations(),
  content = "safe message",
): ChatWorkspaceSnapshot {
  const selected = list.find(({ id }) => id === selectedId) ?? null;
  return createChatWorkspaceSnapshot({
    setup: setup(),
    conversations: list,
    selectedConversation: selected,
    history: selected === null ? null : history(selected.id, content),
  });
}

function setup(): ChatSetupViewModel {
  return {
    conversationId: null,
    conversationTitle: null,
    modelKey: "backend-default",
    modelLabel: "Backend default",
    modelKnown: true,
    models: [],
    status: "ready",
    setupActionRequired: false,
    readiness: {
      kind: "available",
      value: {
        ready: true,
        modelKey: "backend-default",
        reason: "ready",
        setupActionRequired: false,
      },
    },
  };
}

function conversations(): ConversationSummary[] {
  return ["conv_a", "conv_b", "conv_c"].map((id, index) => ({
    id,
    title: `Conversation ${id}`,
    modelKey: `model-${index}`,
    createdAt: index,
    updatedAt: index,
    messageCount: index,
  }));
}

function history(conversationId: string, content: string): MessageHistoryState {
  return {
    conversationId,
    messages: [{
      id: `message-${conversationId}`,
      conversationId,
      rawRole: "user",
      roleKind: "user",
      content,
      createdAt: 0,
      simpleThink: null,
      thinking: null,
      isCarryover: false,
      attachments: [],
      mcpToolCalls: [],
      cacheRegion: null,
      voice: null,
    }],
    pageSize: 50,
    oldestCursor: 0,
    olderPageStatus: "exhausted",
  };
}

function reconciliationResult(
  state: MessageHistoryState,
  event: RealtimeEvent,
): RealtimeReconciliationResult {
  const plan = event.type === "message-created"
    ? {
        kind: "refresh-latest-history" as const,
        conversationId: event.conversationId,
        reason: "message-created" as const,
        authority: "expected-authoritative" as const,
      }
    : { kind: "ignore" as const, rawType: "test" };
  return {
    state,
    plan,
    applied: "refreshed-latest",
    historyChanged: true,
    authority: "authoritative",
    scope: "current-conversation",
    conversationInvalidated: false,
  };
}

function reconnectResult(
  state: MessageHistoryState,
): RealtimeReconciliationResult {
  return {
    state,
    plan: {
      kind: "reload-history",
      conversationId: state.conversationId,
      reason: "reconnect",
    },
    applied: "reloaded-history",
    historyChanged: true,
    authority: "authoritative",
    scope: "current-conversation",
    conversationInvalidated: false,
  };
}

function abortableDeferredWorkspace() {
  let signal: AbortSignal | undefined;
  const load = vi.fn((_input, options) => {
    signal = options?.signal;
    return new Promise<ChatWorkspaceSnapshot>((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => {
        reject(new ApiError("aborted", 0, undefined, "ABORTED"));
      }, { once: true });
    });
  });
  return { load, get signal() { return signal; } };
}

function abortableDeferredSwitch() {
  let signal: AbortSignal | undefined;
  const load = vi.fn((_workspace, _conversationId, options) => {
    signal = options?.signal;
    return new Promise<ChatWorkspaceSnapshot>((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => {
        reject(new ApiError("aborted", 0, undefined, "ABORTED"));
      }, { once: true });
    });
  });
  return { load, get signal() { return signal; } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
