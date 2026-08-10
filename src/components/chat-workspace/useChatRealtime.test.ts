import { describe, expect, it } from "vitest";

import type { ChatSendState } from "@/application/chat-send";
import type { ChatWorkspaceControllerState } from "@/components/chat-workspace";
import { toRealtimeContext } from "@/components/chat-workspace/useChatRealtime";

describe("chat realtime React context projection", () => {
  it("enables realtime only for an authenticated-ready workspace", () => {
    expect(toRealtimeContext(
      { status: "loading" },
      { kind: "idle" },
    )).toEqual({
      workspaceAvailable: false,
      authenticated: false,
      selectedConversationId: null,
      execution: { kind: "idle" },
    });

    expect(toRealtimeContext(
      readyWorkspace("conv-a"),
      { kind: "idle" },
    )).toMatchObject({
      workspaceAvailable: true,
      authenticated: true,
      selectedConversationId: "conv-a",
    });
  });

  it.each([
    "sending-user",
    "streaming",
    "finalizing",
    "finalization-uncertain",
  ] as const)("keeps %s under SSE execution ownership", (kind) => {
    const state = activeSendState(kind);
    const context = toRealtimeContext(readyWorkspace("conv-a"), state);

    expect(context.execution).toMatchObject({
      kind: "active",
      conversationId: "conv-a",
      userMessageId: "client-a",
      assistantMessageId: kind === "sending-user" ? null : "assistant-a",
    });
  });

  it("does not keep terminal send errors as active realtime ownership", () => {
    const context = toRealtimeContext(readyWorkspace("conv-a"), {
      kind: "error",
      error: safeError(),
    });
    expect(context.execution).toEqual({ kind: "idle" });
  });
});

function readyWorkspace(
  selectedConversationId: string,
): ChatWorkspaceControllerState {
  return {
    status: "ready",
    workspace: { selectedConversationId },
    pendingConversationId: null,
    switchError: null,
  } as ChatWorkspaceControllerState;
}

function activeSendState(
  kind: "sending-user" | "streaming" | "finalizing" | "finalization-uncertain",
): ChatSendState {
  const base = {
    executionId: "execution-a",
    conversationId: "conv-a",
    optimisticUser: {
      overlayId: "overlay-user-a",
      clientMessageId: "client-a",
      content: "hello",
      createdAt: 1,
    },
  };
  if (kind === "sending-user") return { kind, ...base };
  const assistant = {
    overlayId: "overlay-assistant-a",
    assistantMessageId: "assistant-a",
    content: "streaming",
    thinking: null,
    simpleThink: null,
    usage: null,
    createdAt: 1,
  };
  if (kind === "finalization-uncertain") {
    return {
      kind,
      ...base,
      assistant,
      executionError: null,
      error: safeError(),
    };
  }
  return { kind, ...base, assistant, executionError: null };
}

function safeError() {
  return {
    code: "network" as const,
    message: "safe",
    field: null,
    providerFailure: null,
  };
}
