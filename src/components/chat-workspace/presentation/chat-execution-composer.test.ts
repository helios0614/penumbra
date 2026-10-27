import { describe, expect, it } from "vitest";

import type {
  ChatSendState,
  OptimisticUserMessage,
  StreamingAssistantMessage,
} from "@/application/chat-send";
import { composeVisibleChatMessages } from "@/components/chat-workspace/presentation";
import type { Message } from "@/domain/message";

describe("chat execution presentation composition", () => {
  it("returns only mapped persistent messages while idle and hides runtime roles", () => {
    const persistent = Object.freeze([
      Object.freeze(message("persisted-user", "user", "same text")),
      Object.freeze(message("runtime", "hidden-runtime", "private runtime")),
    ]);

    const visible = composeVisibleChatMessages(
      persistent,
      { kind: "idle" },
      "conv-a",
    );

    expect(visible.map(({ id }) => id)).toEqual(["persisted-user"]);
    expect(JSON.stringify(visible)).not.toContain("private runtime");
    expect(persistent).toHaveLength(2);
  });

  it("adds optimistic user without changing persistent history or count", () => {
    const persistent = Object.freeze([Object.freeze(
      message("persisted-user", "user", "same text"),
    )]);
    const visible = composeVisibleChatMessages(
      persistent,
      sendingState(),
      "conv-a",
    );

    expect(visible).toHaveLength(2);
    expect(visible.map(({ id }) => id)).toEqual([
      "persisted-user",
      "execution:1:user",
    ]);
    expect(visible[1]).toMatchObject({
      kind: "user",
      content: "same text",
      executionStatus: "optimistic",
    });
    expect(persistent).toHaveLength(1);
  });

  it.each([
    ["streaming", "streaming"],
    ["finalizing", "finalizing"],
    ["finalization-uncertain", "unconfirmed"],
  ] as const)("composes assistant overlay for %s", (kind, executionStatus) => {
    const state = assistantState(kind);
    const visible = composeVisibleChatMessages([], state, "conv-a");

    expect(visible).toHaveLength(2);
    expect(visible[1]).toMatchObject({
      kind: "assistant",
      id: "execution:1:assistant",
      content: "partial",
      thinking: "thinking",
      simpleThink: "simple",
      executionStatus,
    });
  });

  it("keeps partial assistant explicitly unconfirmed in an error overlay", () => {
    const visible = composeVisibleChatMessages([], {
      kind: "error",
      conversationId: "conv-a",
      error: safeError(),
      optimisticUser: optimisticUser(),
      assistant: assistant(),
    }, "conv-a");

    expect(visible.map((item) => item.executionStatus)).toEqual([
      "unconfirmed",
      "unconfirmed",
    ]);
  });

  it("does not attach an execution to another conversation", () => {
    const visible = composeVisibleChatMessages(
      [message("persisted-b", "assistant", "B")],
      assistantState("streaming"),
      "conv-b",
    );
    expect(visible.map(({ id }) => id)).toEqual(["persisted-b"]);
  });

  it("keeps an unlinked user overlay until identity or completion evidence arrives", () => {
    const persistedUser = message("server-user", "user", "same text");
    const persistedAssistant = message("server-assistant", "assistant", "final");
    const before = composeVisibleChatMessages(
      [persistedUser],
      assistantState("finalizing"),
      "conv-a",
    );
    const after = composeVisibleChatMessages(
      [persistedUser, persistedAssistant],
      { kind: "idle" },
      "conv-a",
    );

    expect(before.map(({ id }) => id)).toEqual([
      "server-user",
      "execution:1:user",
      "execution:1:assistant",
    ]);
    expect(after.map(({ id }) => id)).toEqual([
      "server-user",
      "server-assistant",
    ]);
  });

  it.each(["sending-user", "streaming", "finalizing", "finalization-uncertain"] as const)("uses the authoritative exact user while retaining %s generation", kind => {
    const state = kind === "sending-user" ? sendingState() : assistantState(kind);
    const linked = { ...state, optimisticUser: { ...optimisticUser(), persistedMessageId: "server-user" } };
    const visible = composeVisibleChatMessages([message("server-user", "user", "server authority")], linked, "conv-a");
    expect(visible.filter(row => row.kind === "user")).toMatchObject([{ id: "server-user", content: "server authority" }]);
    expect(visible.find(row => row.kind === "user")).not.toHaveProperty("executionStatus");
    expect(visible.find(row => row.kind === "assistant")?.executionStatus).toBe(kind === "finalization-uncertain" ? "unconfirmed" : kind === "finalizing" ? "finalizing" : "streaming");
  });

  it("requires the linked row to be a user of this conversation", () => {
    const state = { ...sendingState(), optimisticUser: { ...optimisticUser(), persistedMessageId: "server-user" } };
    for (const row of [message("server-user", "assistant", "same text"), { ...message("server-user", "user", "same text"), conversationId: "other" }]) {
      expect(composeVisibleChatMessages([row], state, "conv-a").some(row => row.id === "execution:1:user")).toBe(true);
    }
  });

  it("allows reconciliation to contain only the persisted user", () => {
    const visible = composeVisibleChatMessages(
      [message("server-user", "user", "same text")],
      { kind: "idle" },
      "conv-a",
    );
    expect(visible.map(({ id }) => id)).toEqual(["server-user"]);
  });

  it.each([
    ["regenerate-streaming", "streaming", ""],
    ["regenerate-finalizing", "finalizing", "partial"],
    ["regenerate-finalization-uncertain", "unconfirmed", "partial"],
  ] as const)("replaces the persistent target in place for %s", (
    kind,
    executionStatus,
    content,
  ) => {
    const oldTarget = Object.freeze(
      message("assistant-target", "assistant", "original persisted content"),
    );
    const persistent = Object.freeze([
      Object.freeze(message("persisted-user", "user", "question")),
      oldTarget,
    ]);
    const state = regenerateState(kind, content);

    const visible = composeVisibleChatMessages(persistent, state, "conv-a");

    expect(visible).toHaveLength(2);
    expect(visible.map(({ id }) => id)).toEqual([
      "persisted-user",
      "assistant-target",
    ]);
    expect(visible[1]).toMatchObject({
      kind: "assistant",
      content,
      thinking: content ? "thinking" : null,
      simpleThink: content ? "simple" : null,
      executionStatus,
    });
    expect(oldTarget.content).toBe("original persisted content");
    expect(persistent).toHaveLength(2);
  });

  it("uses authoritative same-ID persistent content after regenerate becomes idle", () => {
    const targetBefore = message(
      "assistant-target",
      "assistant",
      "original persisted content",
    );
    const targetAfter = message(
      "assistant-target",
      "assistant",
      "authoritative regenerated content",
    );

    const during = composeVisibleChatMessages(
      [targetBefore],
      regenerateState("regenerate-finalizing", "temporary content"),
      "conv-a",
    );
    const after = composeVisibleChatMessages(
      [targetAfter],
      { kind: "idle" },
      "conv-a",
    );

    expect(during).toHaveLength(1);
    expect(during[0]).toMatchObject({
      id: "assistant-target",
      content: "temporary content",
    });
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({
      id: "assistant-target",
      content: "authoritative regenerated content",
    });
  });

  it("does not replace a missing target or a target in another conversation", () => {
    const persistent = [message("assistant-target", "assistant", "original")];
    const missingTarget = regenerateState("regenerate-streaming", "temporary");
    if (missingTarget.kind !== "regenerate-streaming") {
      throw new Error("invalid regenerate fixture");
    }
    expect(composeVisibleChatMessages(
      persistent,
      { ...missingTarget, targetMessageId: "missing" },
      "conv-a",
    )[0]).toMatchObject({ content: "original" });
    expect(composeVisibleChatMessages(
      persistent,
      regenerateState("regenerate-streaming", "temporary"),
      "conv-b",
    )).toHaveLength(1);
  });
});

function sendingState(): ChatSendState {
  return {
    kind: "sending-user",
    executionId: "execution:1",
    conversationId: "conv-a",
    optimisticUser: optimisticUser(),
  };
}

function assistantState(
  kind: "streaming" | "finalizing" | "finalization-uncertain",
): ChatSendState {
  const base = {
    executionId: "execution:1",
    conversationId: "conv-a",
    optimisticUser: optimisticUser(),
    assistant: assistant(),
    executionError: null,
  };
  return kind === "finalization-uncertain"
    ? { ...base, kind, error: safeError() }
    : { ...base, kind };
}

function regenerateState(
  kind:
    | "regenerate-streaming"
    | "regenerate-finalizing"
    | "regenerate-finalization-uncertain",
  content: string,
): ChatSendState {
  const base = {
    executionId: "execution:regenerate",
    conversationId: "conv-a",
    targetMessageId: "assistant-target",
    assistant: {
      ...assistant(),
      assistantMessageId: content ? "assistant-target" : null,
      content,
      thinking: content ? "thinking" : null,
      simpleThink: content ? "simple" : null,
    },
    executionError: null,
  };
  return kind === "regenerate-finalization-uncertain"
    ? { ...base, kind, error: safeError() }
    : { ...base, kind };
}

function optimisticUser(): OptimisticUserMessage {
  return {
    overlayId: "execution:1:user",
    clientMessageId: "client-1",
    content: "same text",
    createdAt: 11,
  };
}

function assistant(): StreamingAssistantMessage {
  return {
    overlayId: "execution:1:assistant",
    assistantMessageId: "server-candidate",
    content: "partial",
    thinking: "thinking",
    simpleThink: "simple",
    usage: null,
    createdAt: 11,
  };
}

function safeError() {
  return {
    code: "provider-failure" as const,
    message: "safe failure",
    field: null,
    providerFailure: "provider_execution_failed" as const,
  };
}

function message(
  id: string,
  roleKind: Message["roleKind"],
  content: string,
): Message {
  return {
    id,
    conversationId: "conv-a",
    rawRole: roleKind === "hidden-runtime" ? "cam_trigger" : roleKind,
    roleKind,
    content,
    createdAt: 10,
    simpleThink: null,
    thinking: null,
    isCarryover: false,
    attachments: [],
    mcpToolCalls: [],
    cacheRegion: null,
    voice: null,
  };
}
