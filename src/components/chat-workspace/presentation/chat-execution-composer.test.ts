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

  it("removes overlay only after reconciliation returns the idle state", () => {
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

  it("allows reconciliation to contain only the persisted user", () => {
    const visible = composeVisibleChatMessages(
      [message("server-user", "user", "same text")],
      { kind: "idle" },
      "conv-a",
    );
    expect(visible.map(({ id }) => id)).toEqual(["server-user"]);
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
