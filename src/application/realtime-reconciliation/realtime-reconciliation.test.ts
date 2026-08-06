import { describe, expect, it, vi } from "vitest";

import {
  MessageHistoryContractError,
  createMessageHistoryState,
  type MessageHistoryState,
} from "@/application/message-history";
import {
  type RealtimeEvent,
} from "@/application/realtime";
import {
  isPersistedAssistantNotification,
  planRealtimeReconnect,
  planRealtimeReconciliation,
  reconcileMessageHistoryAfterReconnect,
  reconcileRealtimeEvent,
  RealtimeReconciliationContractError,
  removeMessageFromHistory,
  type RealtimeReconciliationDependencies,
} from "@/application/realtime-reconciliation";
import {
  MessageContractError,
  type Message,
} from "@/domain/message";
import { ApiError } from "@/lib/api";

describe("realtime reconciliation plans", () => {
  it("maps message-created to an expected-authoritative latest refresh", () => {
    expect(planRealtimeReconciliation(messageEvent("message-created"))).toEqual({
      kind: "refresh-latest-history",
      conversationId: "conv_1",
      reason: "message-created",
      authority: "expected-authoritative",
    });
  });

  it("maps message-updated to a latest-window-only refresh", () => {
    expect(planRealtimeReconciliation(messageEvent("message-updated"))).toEqual({
      kind: "refresh-latest-history",
      conversationId: "conv_1",
      reason: "message-updated",
      authority: "latest-window-only",
    });
  });

  it("maps message-deleted to strict ID removal", () => {
    expect(planRealtimeReconciliation(messageEvent("message-deleted"))).toEqual({
      kind: "remove-message",
      conversationId: "conv_1",
      messageId: "msg_1",
    });
  });

  it("maps file sync and reconnect to distinct scratch reload reasons", () => {
    expect(planRealtimeReconciliation({
      type: "file-synced",
      conversationId: "conv_1",
    })).toEqual({
      kind: "reload-history",
      conversationId: "conv_1",
      reason: "file-synced",
    });
    expect(planRealtimeReconnect("conv_1")).toEqual({
      kind: "reload-history",
      conversationId: "conv_1",
      reason: "reconnect",
    });
  });

  it.each([
    "conversation-created",
    "conversation-updated",
    "conversation-deleted",
  ] as const)("maps %s to conversation-list invalidation", (type) => {
    expect(planRealtimeReconciliation({ type, conversationId: "conv_1" })).toEqual({
      kind: "invalidate-conversation-list",
      conversationId: "conv_1",
      reason: type,
    });
  });

  it("maps unknown safely and ignores extra event fields", () => {
    const event = {
      ...messageEvent("message-created"),
      content: "must-not-be-used",
      capability: { secret: "must-not-be-used" },
    };
    expect(planRealtimeReconciliation(event)).toEqual({
      kind: "refresh-latest-history",
      conversationId: "conv_1",
      reason: "message-created",
      authority: "expected-authoritative",
    });

    const unknown = planRealtimeReconciliation({
      type: "unknown",
      rawType: "future-event",
      raw: { secret: "must-not-be-kept" },
    } as RealtimeEvent);
    expect(unknown).toEqual({ kind: "ignore", rawType: "future-event" });
    expect(JSON.stringify(unknown)).not.toContain("must-not-be-kept");
  });

  it.each([
    messageEvent("message-created", { messageId: "" }),
    messageEvent("message-updated", { conversationId: "   " }),
    { type: "message-deleted", messageId: "", conversationId: "conv_1" },
    { type: "file-synced", conversationId: "" },
    { type: "conversation-created", conversationId: "" },
    { type: "unknown", rawType: "" },
  ] as RealtimeEvent[])("rejects empty application identifiers", (event) => {
    expect(() => planRealtimeReconciliation(event)).toThrow(
      RealtimeReconciliationContractError,
    );
  });

  it("rejects an empty reconnect conversation ID", () => {
    expect(() => planRealtimeReconnect(" ")).toThrow(
      RealtimeReconciliationContractError,
    );
  });
});

describe("local message deletion", () => {
  it("removes only the matching server ID and recomputes the oldest cursor", () => {
    const sameContent = "same content";
    const first = message("first", 10, { content: sameContent });
    const target = message("target", 20, { content: sameContent });
    const state = history([first, target, message("last", 30)], {
      pageSize: 3,
      olderPageStatus: "stalled",
    });
    const originalMessages = [...state.messages];

    const result = removeMessageFromHistory(state, "conv_1", "first");

    expect(result).not.toBe(state);
    expect(result.messages).not.toBe(state.messages);
    expect(result.messages.map(({ id }) => id)).toEqual(["target", "last"]);
    expect(result.oldestCursor).toBe(20);
    expect(result.pageSize).toBe(3);
    expect(result.olderPageStatus).toBe("stalled");
    expect(state.messages).toEqual(originalMessages);
    expect(state.oldestCursor).toBe(10);
    expect(target.content).toBe(sameContent);
  });

  it("keeps createdAt=0 as the cursor and never infers exhaustion", () => {
    const state = history([
      message("epoch", 0),
      message("remove", 1),
    ], {
      pageSize: 2,
      olderPageStatus: "maybe-more",
    });

    const result = removeMessageFromHistory(state, "conv_1", "remove");

    expect(result.oldestCursor).toBe(0);
    expect(result.olderPageStatus).toBe("maybe-more");
    expect(result.pageSize).toBe(2);
  });

  it("uses null for an empty cursor but preserves older-page knowledge", () => {
    const state = history([message("only", 0)], {
      pageSize: 1,
      olderPageStatus: "stalled",
    });

    const result = removeMessageFromHistory(state, "conv_1", "only");

    expect(result.messages).toEqual([]);
    expect(result.oldestCursor).toBeNull();
    expect(result.olderPageStatus).toBe("stalled");
  });

  it("returns the original state and messages when the ID is absent", () => {
    const state = history([message("existing", 1)]);
    const result = removeMessageFromHistory(state, "conv_1", "missing");

    expect(result).toBe(state);
    expect(result.messages).toBe(state.messages);
  });

  it("rejects a mismatched conversation without exposing state content", () => {
    const fakeSecret = "fake-message-secret";
    const state = history([message("existing", 1, { content: fakeSecret })]);
    const error = captureError(() =>
      removeMessageFromHistory(state, "conv_other", "existing")
    );

    expect(error).toBeInstanceOf(RealtimeReconciliationContractError);
    expect(String(error)).not.toContain(fakeSecret);
    expect(String(error)).not.toContain("conv_other");
  });
});

describe("single-event reconciliation", () => {
  it("refreshes latest for a created message without constructing a WS Message", async () => {
    const state = history([message("old", 1)]);
    const persisted = message("assistant", 2, {
      rawRole: "assistant",
      roleKind: "assistant",
      content: "HTTP final",
    });
    const refreshed = history([state.messages[0]!, persisted]);
    const dependencies = dependencySpies({ refreshResult: refreshed });
    const event = {
      ...messageEvent("message-created", { messageId: "assistant" }),
      content: "untrusted WS content",
    } as unknown as RealtimeEvent;

    const result = await reconcileRealtimeEvent(state, event, { dependencies });

    expect(dependencies.refreshLatestMessageHistory).toHaveBeenCalledWith(
      state,
      undefined,
    );
    expect(dependencies.reloadMessageHistoryFromScratch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      state: refreshed,
      applied: "refreshed-latest",
      historyChanged: true,
      authority: "authoritative",
      scope: "current-conversation",
      conversationInvalidated: false,
    });
    expect(result.state.messages[1]).toBe(persisted);
    expect(result.state.messages[1]?.content).toBe("HTTP final");
    expect(state.messages).toHaveLength(1);
  });

  it("does not request or change history for another conversation create", async () => {
    const state = history([message("existing", 1)]);
    const dependencies = dependencySpies();

    const result = await reconcileRealtimeEvent(
      state,
      messageEvent("message-created", { conversationId: "conv_other" }),
      { dependencies },
    );

    expectNoHistoryRequest(dependencies);
    expect(result).toMatchObject({
      state,
      applied: "no-history-change",
      historyChanged: false,
      authority: "not-applicable",
      scope: "other-conversation",
    });
    expect(result.plan).toMatchObject({ conversationId: "conv_other" });
  });

  it("propagates latest-refresh errors without wrapping them", async () => {
    const state = history([message("existing", 1)]);
    const errors = [
      new ApiError("api failure", 500),
      new MessageContractError("message failure"),
      new MessageHistoryContractError("history failure"),
    ];

    for (const error of errors) {
      const dependencies = dependencySpies();
      dependencies.refreshLatestMessageHistory.mockRejectedValueOnce(error);
      await expect(reconcileRealtimeEvent(
        state,
        messageEvent("message-created"),
        { dependencies },
      )).rejects.toBe(error);
    }
  });

  it("refreshes only latest for message-updated and preserves best-effort authority", async () => {
    const oldTarget = message("early-target", 1, { content: "stale" });
    const state = history([oldTarget, message("latest", 100)]);
    const refreshed = history([
      oldTarget,
      message("latest", 100, { content: "latest HTTP value" }),
    ]);
    const dependencies = dependencySpies({ refreshResult: refreshed });
    const event = {
      ...messageEvent("message-updated", { messageId: "early-target" }),
      content: "must not patch the target",
    } as unknown as RealtimeEvent;

    const result = await reconcileRealtimeEvent(state, event, { dependencies });

    expect(dependencies.refreshLatestMessageHistory).toHaveBeenCalledTimes(1);
    expect(dependencies.reloadMessageHistoryFromScratch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      state: refreshed,
      applied: "refreshed-latest",
      authority: "latest-window-only",
      scope: "current-conversation",
    });
    expect(result.plan).toMatchObject({
      reason: "message-updated",
      authority: "latest-window-only",
    });
    expect(result.state.messages[0]).toBe(oldTarget);
    expect(result.state.messages[0]?.content).toBe("stale");
  });

  it("does not request for another conversation update", async () => {
    const state = history([message("existing", 1)]);
    const dependencies = dependencySpies();
    const result = await reconcileRealtimeEvent(
      state,
      messageEvent("message-updated", { conversationId: "conv_other" }),
      { dependencies },
    );

    expectNoHistoryRequest(dependencies);
    expect(result.scope).toBe("other-conversation");
    expect(result.authority).toBe("not-applicable");
  });

  it("applies committed deletion locally without any HTTP call", async () => {
    const state = history([message("remove", 1), message("keep", 2)]);
    const dependencies = dependencySpies();
    const result = await reconcileRealtimeEvent(
      state,
      messageEvent("message-deleted", { messageId: "remove" }),
      { dependencies },
    );

    expectNoHistoryRequest(dependencies);
    expect(result.state.messages.map(({ id }) => id)).toEqual(["keep"]);
    expect(result).toMatchObject({
      applied: "removed-message",
      historyChanged: true,
      authority: "authoritative",
      scope: "current-conversation",
    });
  });

  it("treats an absent deletion as an authoritative idempotent no-op", async () => {
    const state = history([message("keep", 1)]);
    const dependencies = dependencySpies();
    const result = await reconcileRealtimeEvent(
      state,
      messageEvent("message-deleted", { messageId: "absent" }),
      { dependencies },
    );

    expectNoHistoryRequest(dependencies);
    expect(result.state).toBe(state);
    expect(result).toMatchObject({
      applied: "no-history-change",
      historyChanged: false,
      authority: "authoritative",
      scope: "current-conversation",
    });
  });

  it("does not delete current history for another conversation", async () => {
    const state = history([message("same-id", 1)]);
    const dependencies = dependencySpies();
    const result = await reconcileRealtimeEvent(
      state,
      messageEvent("message-deleted", {
        messageId: "same-id",
        conversationId: "conv_other",
      }),
      { dependencies },
    );

    expectNoHistoryRequest(dependencies);
    expect(result.state).toBe(state);
    expect(result.scope).toBe("other-conversation");
  });

  it("reloads from scratch for file sync and discards prior loaded pages", async () => {
    const state = history([
      message("old-page", 1),
      message("old-latest", 2),
    ], { olderPageStatus: "stalled" });
    const reloaded = history([message("fresh", 100)], {
      olderPageStatus: "exhausted",
    });
    const dependencies = dependencySpies({ reloadResult: reloaded });

    const result = await reconcileRealtimeEvent(
      state,
      { type: "file-synced", conversationId: "conv_1" },
      { dependencies },
    );

    expect(dependencies.reloadMessageHistoryFromScratch).toHaveBeenCalledWith(
      state,
      undefined,
    );
    expect(dependencies.refreshLatestMessageHistory).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      state: reloaded,
      applied: "reloaded-history",
      authority: "authoritative",
      scope: "current-conversation",
    });
    expect(result.state.messages.map(({ id }) => id)).toEqual(["fresh"]);
  });

  it("does not reload another conversation after file sync", async () => {
    const state = history([message("existing", 1)]);
    const dependencies = dependencySpies();
    const result = await reconcileRealtimeEvent(
      state,
      { type: "file-synced", conversationId: "conv_other" },
      { dependencies },
    );

    expectNoHistoryRequest(dependencies);
    expect(result.state).toBe(state);
    expect(result.scope).toBe("other-conversation");
    expect(result.plan).toMatchObject({ reason: "file-synced" });
  });

  it("propagates file reload errors without wrapping them", async () => {
    const state = history([message("existing", 1)]);
    const errors = [
      new ApiError("api failure", 500),
      new MessageContractError("message failure"),
      new MessageHistoryContractError("history failure"),
    ];

    for (const error of errors) {
      const dependencies = dependencySpies();
      dependencies.reloadMessageHistoryFromScratch.mockRejectedValueOnce(error);
      await expect(reconcileRealtimeEvent(
        state,
        { type: "file-synced", conversationId: "conv_1" },
        { dependencies },
      )).rejects.toBe(error);
    }
  });

  it.each([
    "conversation-created",
    "conversation-updated",
    "conversation-deleted",
  ] as const)("invalidates only the conversation list for %s", async (type) => {
    const state = history([message("existing", 1)]);
    const dependencies = dependencySpies();
    const result = await reconcileRealtimeEvent(
      state,
      { type, conversationId: "conv_1" },
      { dependencies },
    );

    expectNoHistoryRequest(dependencies);
    expect(result).toMatchObject({
      state,
      applied: "no-history-change",
      historyChanged: false,
      authority: "not-applicable",
      scope: "not-applicable",
      conversationInvalidated: true,
    });
    expect(result.state.messages).toBe(state.messages);
  });

  it("ignores unknown events without requests, mutation, raw payload, or logs", async () => {
    const state = history([message("existing", 1)]);
    const dependencies = dependencySpies();
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const event = {
      type: "unknown",
      rawType: "future-event",
      raw: { secret: "fake-unknown-secret" },
    } as RealtimeEvent;

    try {
      const result = await reconcileRealtimeEvent(state, event, { dependencies });

      expectNoHistoryRequest(dependencies);
      expect(result.state).toBe(state);
      expect(result.plan).toEqual({ kind: "ignore", rawType: "future-event" });
      expect(JSON.stringify(result.plan)).not.toContain("fake-unknown-secret");
      expect(consoleLog).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleLog.mockRestore();
      consoleError.mockRestore();
    }
  });
});

describe("reconnect reconciliation", () => {
  it("reloads the current HTTP window without opening a socket or inventing replay", async () => {
    const state = history([message("old", 1)]);
    const reloaded = history([message("fresh", 2)]);
    const dependencies = dependencySpies({ reloadResult: reloaded });
    const websocket = vi.fn(() => {
      throw new Error("must not open");
    });
    vi.stubGlobal("WebSocket", websocket);

    try {
      const result = await reconcileMessageHistoryAfterReconnect(state, {
        dependencies,
      });

      expect(websocket).not.toHaveBeenCalled();
      expect(dependencies.refreshLatestMessageHistory).not.toHaveBeenCalled();
      expect(dependencies.reloadMessageHistoryFromScratch).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        state: reloaded,
        applied: "reloaded-history",
        authority: "authoritative",
        scope: "current-conversation",
        plan: { kind: "reload-history", reason: "reconnect" },
      });
      expect(result).not.toHaveProperty("replayed");
      expect(result).not.toHaveProperty("eventCursor");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("propagates reconnect reload errors unchanged", async () => {
    const error = new ApiError("reload failed", 503);
    const dependencies = dependencySpies();
    dependencies.reloadMessageHistoryFromScratch.mockRejectedValueOnce(error);

    await expect(reconcileMessageHistoryAfterReconnect(
      history([message("old", 1)]),
      { dependencies },
    )).rejects.toBe(error);
  });
});

describe("SSE assistant ID to WS persistence correlation", () => {
  it("matches only exact message-created assistant and conversation IDs", () => {
    const event = messageEvent("message-created", {
      messageId: "assistant_1",
      conversationId: "conv_1",
    });

    expect(isPersistedAssistantNotification(
      event,
      "assistant_1",
      "conv_1",
    )).toBe(true);
    expect(isPersistedAssistantNotification(
      event,
      "assistant_2",
      "conv_1",
    )).toBe(false);
    expect(isPersistedAssistantNotification(
      event,
      "assistant_1",
      "conv_2",
    )).toBe(false);
  });

  it.each([
    messageEvent("message-updated"),
    messageEvent("message-deleted"),
    { type: "conversation-created", conversationId: "conv_1" },
    { type: "file-synced", conversationId: "conv_1" },
    { type: "unknown", rawType: "msg_created" },
  ] as RealtimeEvent[])("does not correlate non-created events", (event) => {
    expect(isPersistedAssistantNotification(event, "msg_1", "conv_1")).toBe(false);
  });

  it.each([
    ["", "conv_1"],
    ["assistant_1", ""],
    ["   ", "conv_1"],
  ])("rejects empty correlation IDs", (assistantMessageId, conversationId) => {
    expect(() => isPersistedAssistantNotification(
      messageEvent("message-created", { messageId: "assistant_1" }),
      assistantMessageId,
      conversationId,
    )).toThrow(RealtimeReconciliationContractError);
  });

  it("is pure and creates neither Message nor HTTP work", () => {
    const event = Object.freeze(messageEvent("message-created"));
    const before = { ...event };

    const result = isPersistedAssistantNotification(event, "msg_1", "conv_1");

    expect(result).toBe(true);
    expect(event).toEqual(before);
    expect(Object.keys({ result })).toEqual(["result"]);
  });
});

describe("reconciliation contract safety", () => {
  it("does not include supplied identifiers, content, endpoint, or session in errors", () => {
    const secrets = [
      "fake-message-content",
      "https://fake-secret.invalid/api",
      "fake-session-secret",
    ];
    const state = history([message("existing", 1, { content: secrets[0] })]);
    const errors = [
      captureError(() => removeMessageFromHistory(
        state,
        secrets[2]!,
        "existing",
      )),
      captureError(() => planRealtimeReconnect("")),
      captureError(() => planRealtimeReconciliation({
        type: "message-created",
        messageId: "",
        conversationId: secrets[1]!,
      })),
    ];

    for (const error of errors) {
      expect(error).toBeInstanceOf(RealtimeReconciliationContractError);
      for (const secret of secrets) {
        expect(String(error)).not.toContain(secret);
      }
    }
  });
});

type MessageEventType =
  | "message-created"
  | "message-updated"
  | "message-deleted";

function messageEvent(
  type: MessageEventType,
  overrides: Partial<Extract<RealtimeEvent, { type: MessageEventType }>> = {},
): Extract<RealtimeEvent, { type: MessageEventType }> {
  return {
    type,
    messageId: "msg_1",
    conversationId: "conv_1",
    ...overrides,
  } as Extract<RealtimeEvent, { type: MessageEventType }>;
}

function message(
  id: string,
  createdAt: number,
  overrides: Partial<Message> = {},
): Message {
  return {
    id,
    conversationId: "conv_1",
    rawRole: "user",
    roleKind: "user",
    content: id,
    createdAt,
    simpleThink: null,
    thinking: null,
    isCarryover: false,
    attachments: [],
    mcpToolCalls: [],
    cacheRegion: null,
    voice: null,
    ...overrides,
  };
}

function history(
  messages: readonly Message[],
  options: {
    readonly pageSize?: number;
    readonly olderPageStatus?: MessageHistoryState["olderPageStatus"];
  } = {},
): MessageHistoryState {
  return createMessageHistoryState("conv_1", messages, {
    pageSize: options.pageSize ?? Math.max(1, messages.length),
    olderPageStatus: options.olderPageStatus ?? "maybe-more",
  });
}

function dependencySpies(
  options: {
    readonly refreshResult?: MessageHistoryState;
    readonly reloadResult?: MessageHistoryState;
  } = {},
) {
  const fallback = history([message("fallback", 999)]);
  return {
    refreshLatestMessageHistory: vi.fn(
      async () => options.refreshResult ?? fallback,
    ),
    reloadMessageHistoryFromScratch: vi.fn(
      async () => options.reloadResult ?? fallback,
    ),
  } satisfies RealtimeReconciliationDependencies;
}

function expectNoHistoryRequest(
  dependencies: ReturnType<typeof dependencySpies>,
): void {
  expect(dependencies.refreshLatestMessageHistory).not.toHaveBeenCalled();
  expect(dependencies.reloadMessageHistoryFromScratch).not.toHaveBeenCalled();
}

function captureError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected function to throw");
}
