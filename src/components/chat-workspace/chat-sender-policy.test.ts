import { describe, expect, it } from "vitest";

import type { ChatSendState } from "@/application/chat-send";
import type { ChatSetupViewModel } from "@/application/chat-setup";
import type { ChatWorkspaceSnapshot } from "@/application/chat-workspace";
import { getChatSenderAvailability } from "@/components/chat-workspace";
import type { ChatWorkspaceControllerState } from "@/components/chat-workspace";
import type { ConversationSummary } from "@/domain/conversation";

describe("chat sender readiness policy", () => {
  it("enables only a selected, idle, model-bound ready workspace", () => {
    expect(getChatSenderAvailability(readyState(), { kind: "idle" })).toEqual({
      enabled: true,
      placeholder: "输入消息…",
      statusMessage: null,
    });
  });

  it.each([
    [unavailableSetup(), "当前发送服务暂时不可用。"],
    [setup({ ready: false, reason: "unknown-model" }), "当前会话使用的模型已不可用。"],
    [setup({ ready: false, reason: "provider-not-configured" }), "当前模型服务尚未配置完成。"],
    [setup({ ready: false, reason: "generation-not-supported" }), "当前模型暂不支持生成。"],
  ] as const)("disables an unavailable or not-ready workspace", (chatSetup, message) => {
    const availability = getChatSenderAvailability(
      readyState({ setup: chatSetup }),
      { kind: "idle" },
    );
    expect(availability.enabled).toBe(false);
    expect(availability.statusMessage).toBe(message);
  });

  it("disables without a selection and while switching", () => {
    expect(getChatSenderAvailability(
      readyState({ selectedConversation: null, selectedConversationId: null, history: null }),
      { kind: "idle" },
    ).enabled).toBe(false);
    expect(getChatSenderAvailability({
      ...readyState(),
      pendingConversationId: "conv-b",
    }, { kind: "idle" }).enabled).toBe(false);
  });

  it.each([
    sendingState(),
    assistantState("streaming"),
    assistantState("finalizing"),
    assistantState("finalization-uncertain"),
    regenerateState("regenerate-streaming"),
    regenerateState("regenerate-finalizing"),
    regenerateState("regenerate-finalization-uncertain"),
    { kind: "error", error: safeError() } as const,
  ])("disables while execution is active or fatal", (sendState) => {
    expect(getChatSenderAvailability(
      readyState(),
      sendState as ChatSendState,
    ).enabled).toBe(false);
  });

  it("does not trust ready state for another model or conversation", () => {
    const mismatched = setup();
    mismatched.conversationId = "conv-b";
    mismatched.modelKey = "other-model";
    expect(getChatSenderAvailability(
      readyState({ setup: mismatched }),
      { kind: "idle" },
    )).toMatchObject({
      enabled: false,
      statusMessage: "当前会话的发送状态尚未就绪。",
    });
  });

  it("allows non-catalog literals but rejects an inconsistent ready reason", () => {
    const unknown = setup();
    unknown.modelKnown = false;
    expect(getChatSenderAvailability(
      readyState({ setup: unknown }),
      { kind: "idle" },
    ).enabled).toBe(true);

    const inconsistent = setup({
      ready: true,
      reason: "generation-not-supported",
    });
    expect(getChatSenderAvailability(
      readyState({ setup: inconsistent }),
      { kind: "idle" },
    ).enabled).toBe(false);
  });
});

function readyState(
  overrides: Partial<ChatWorkspaceSnapshot> = {},
): Extract<ChatWorkspaceControllerState, { status: "ready" }> {
  const conversation = selectedConversation();
  return {
    status: "ready",
    workspace: {
      setup: setup(),
      conversations: [conversation],
      selectedConversationId: conversation.id,
      selectedConversation: conversation,
      history: {
        conversationId: conversation.id,
        messages: [],
        pageSize: 50,
        oldestCursor: null,
        olderPageStatus: "exhausted",
      },
      ...overrides,
    },
    pendingConversationId: null,
    switchError: null,
  };
}

function setup(
  readiness: {
    readonly ready: boolean;
    readonly reason: "ready" | "unknown-model" | "provider-not-configured" | "generation-not-supported";
  } = { ready: true, reason: "ready" },
): ChatSetupViewModel {
  return {
    conversationId: "conv-a",
    conversationTitle: "Conversation A",
    modelKey: "model-a",
    modelLabel: "model-a",
    modelKnown: true,
    models: [{
      key: "model-a",
      label: "model-a",
      provider: "safe-provider",
      selected: true,
    }],
    status: readiness.reason,
    setupActionRequired: !readiness.ready,
    readiness: {
      kind: "available",
      value: {
        ready: readiness.ready,
        modelKey: "model-a",
        reason: readiness.reason,
        setupActionRequired: !readiness.ready,
      },
    },
  };
}

function unavailableSetup(): ChatSetupViewModel {
  return {
    ...setup(),
    status: "readiness-unavailable",
    setupActionRequired: true,
    readiness: { kind: "unavailable", reason: "network" },
  };
}

function selectedConversation(): ConversationSummary {
  return {
    id: "conv-a",
    title: "Conversation A",
    modelKey: "model-a",
    createdAt: 1,
    updatedAt: 2,
    messageCount: 0,
  };
}

function sendingState(): ChatSendState {
  return {
    kind: "sending-user",
    executionId: "execution-1",
    conversationId: "conv-a",
    optimisticUser: {
      overlayId: "user-overlay",
      clientMessageId: "client-1",
      content: "hello",
      createdAt: 1,
    },
  };
}

function assistantState(
  kind: "streaming" | "finalizing" | "finalization-uncertain",
): ChatSendState {
  const sending = sendingState();
  if (sending.kind !== "sending-user") throw new Error("invalid fixture");
  const base = {
    executionId: sending.executionId,
    conversationId: sending.conversationId,
    optimisticUser: sending.optimisticUser,
    assistant: {
      overlayId: "assistant-overlay",
      assistantMessageId: "server-id",
      content: "partial",
      thinking: null,
      simpleThink: null,
      usage: null,
      createdAt: 1,
    },
    executionError: null,
  };
  return kind === "finalization-uncertain"
    ? { ...base, kind, error: safeError() }
    : { ...base, kind };
}

function safeError() {
  return {
    code: "service" as const,
    message: "safe error",
    field: null,
    providerFailure: null,
  };
}

function regenerateState(
  kind:
    | "regenerate-streaming"
    | "regenerate-finalizing"
    | "regenerate-finalization-uncertain",
): ChatSendState {
  const base = {
    executionId: "regenerate-1",
    conversationId: "conv-a",
    targetMessageId: "assistant-1",
    assistant: {
      overlayId: "regenerate-overlay",
      assistantMessageId: "assistant-1",
      content: "partial",
      thinking: null,
      simpleThink: null,
      usage: null,
      createdAt: 1,
    },
    executionError: null,
  };
  return kind === "regenerate-finalization-uncertain"
    ? { ...base, kind, error: safeError() }
    : { ...base, kind };
}
