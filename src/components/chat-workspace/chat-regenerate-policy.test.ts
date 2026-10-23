import { describe, expect, it } from "vitest";

import type { ChatSendState, StreamingAssistantMessage } from "@/application/chat-send";
import type { ChatSetupViewModel } from "@/application/chat-setup";
import type { ChatWorkspaceSnapshot } from "@/application/chat-workspace";
import {
  getChatRegenerateAvailability,
  isRegenerateTargetMessage,
  type ChatWorkspaceControllerState,
} from "@/components/chat-workspace";
import type { ConversationSummary } from "@/domain/conversation";
import type { Message } from "@/domain/message";

describe("chat regenerate eligibility", () => {
  it("enables only the latest persisted non-carryover tail assistant", () => {
    const state = readyState([
      message("user-1", "user"),
      message("assistant-old", "assistant"),
      message("runtime", "hidden-runtime"),
      message("assistant-latest", "assistant"),
      message("carryover-tail", "assistant", { isCarryover: true }),
    ]);

    expect(getChatRegenerateAvailability(state, { kind: "idle" }))
      .toMatchObject({
        enabled: true,
        target: { id: "assistant-latest" },
      });
    expect(isRegenerateTargetMessage(state, "assistant-latest")).toBe(true);
    expect(isRegenerateTargetMessage(state, "assistant-old")).toBe(false);
    expect(isRegenerateTargetMessage(state, "user-1")).toBe(false);
    expect(isRegenerateTargetMessage(state, "runtime")).toBe(false);
    expect(isRegenerateTargetMessage(state, "carryover-tail")).toBe(false);
  });

  it.each([
    ["user", message("tail-user", "user")],
    ["system", message("tail-system", "system")],
    ["unknown", message("tail-unknown", "unknown")],
  ] as const)("matches canonical latest user/assistant semantics with a %s tail", (label, tail) => {
    const state = readyState([message("assistant-old", "assistant"), tail]);
    expect(getChatRegenerateAvailability(state, { kind: "idle" }).enabled)
      .toBe(label !== "user");
  });

  it("rejects wrong-conversation and nullable carryover messages", () => {
    expect(getChatRegenerateAvailability(readyState([
      message("wrong", "assistant", { conversationId: "conv-b" }),
    ]), { kind: "idle" }).enabled).toBe(false);
    expect(getChatRegenerateAvailability(readyState([
      message("legacy-null", "assistant", { isCarryover: null }),
    ]), { kind: "idle" }).enabled).toBe(false);
  });

  it("does not treat optimistic or streaming overlays as persisted targets", () => {
    const state = readyState([message("persisted-user", "user")]);
    expect(isRegenerateTargetMessage(state, "execution:user")).toBe(false);
    expect(isRegenerateTargetMessage(state, "execution:assistant")).toBe(false);
  });

  it("disables before Workspace ready and without a selected conversation", () => {
    expect(getChatRegenerateAvailability(
      { status: "loading" },
      { kind: "idle" },
    ).enabled).toBe(false);

    const selected = readyState([message("assistant", "assistant")]);
    const noSelection: ChatWorkspaceControllerState = {
      ...selected,
      workspace: {
        ...selected.workspace,
        selectedConversationId: null,
        selectedConversation: null,
        history: null,
      },
    };
    expect(getChatRegenerateAvailability(noSelection, { kind: "idle" }).enabled)
      .toBe(false);
  });

  it.each([
    ["send active", sendActive()],
    ["regenerate active", regenerateActive()],
  ] as const)("disables while %s", (_label, execution) => {
    const availability = getChatRegenerateAvailability(
      readyState([message("assistant", "assistant")]),
      execution,
    );
    expect(availability).toMatchObject({
      enabled: false,
      target: { id: "assistant" },
    });
  });

  it("disables for readiness unavailable, ready=false, switch, and wrong setup binding", () => {
    const assistant = message("assistant", "assistant");
    const unavailableSetup: ChatSetupViewModel = {
      ...setup(),
      readiness: { kind: "unavailable", reason: "network" },
    };
    const unavailable = readyState([assistant], unavailableSetup);
    expect(getChatRegenerateAvailability(unavailable, { kind: "idle" }).enabled)
      .toBe(false);

    const notReady = readyState([assistant], setup(false));
    expect(getChatRegenerateAvailability(notReady, { kind: "idle" }).enabled)
      .toBe(false);

    expect(getChatRegenerateAvailability({
      ...readyState([assistant]),
      pendingConversationId: "conv-b",
    }, { kind: "idle" }).enabled).toBe(false);

    const wrongBinding = readyState([assistant], {
      ...setup(),
      conversationId: "conv-b",
    });
    expect(getChatRegenerateAvailability(wrongBinding, { kind: "idle" }).enabled)
      .toBe(false);
  });
});

function readyState(
  messages: readonly Message[],
  chatSetup: ChatSetupViewModel = setup(),
): Extract<ChatWorkspaceControllerState, { status: "ready" }> {
  const conversation = selectedConversation();
  const workspace: ChatWorkspaceSnapshot = {
    setup: chatSetup,
    conversations: [conversation],
    selectedConversationId: conversation.id,
    selectedConversation: conversation,
    history: {
      conversationId: conversation.id,
      messages,
      pageSize: 50,
      oldestCursor: null,
      olderPageStatus: "exhausted",
    },
  };
  return {
    status: "ready",
    workspace,
    pendingConversationId: null,
    switchError: null,
  };
}

function setup(ready = true): ChatSetupViewModel {
  return {
    conversationId: "conv-a",
    conversationTitle: "A",
    modelKey: "model-a",
    modelLabel: "model-a",
    modelKnown: true,
    models: [{
      key: "model-a",
      label: "model-a",
      provider: "safe-provider",
      selected: true,
    }],
    status: ready ? "ready" : "provider-not-configured",
    setupActionRequired: !ready,
    readiness: {
      kind: "available",
      value: {
        ready,
        modelKey: "model-a",
        reason: ready ? "ready" : "provider-not-configured",
        setupActionRequired: !ready,
      },
    },
  };
}

function selectedConversation(): ConversationSummary {
  return {
    id: "conv-a",
    title: "A",
    modelKey: "model-a",
    createdAt: 1,
    updatedAt: 2,
    messageCount: 2,
  };
}

function message(
  id: string,
  roleKind: Message["roleKind"],
  overrides: Partial<Message> = {},
): Message {
  return {
    id,
    conversationId: "conv-a",
    rawRole: roleKind === "hidden-runtime" ? "cam_trigger" : roleKind,
    roleKind,
    content: id,
    createdAt: 1,
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

function sendActive(): ChatSendState {
  return {
    kind: "sending-user",
    executionId: "send",
    conversationId: "conv-a",
    optimisticUser: {
      overlayId: "send:user",
      clientMessageId: "client",
      content: "hello",
      createdAt: 1,
    },
  };
}

function regenerateActive(): ChatSendState {
  return {
    kind: "regenerate-streaming",
    executionId: "regenerate",
    conversationId: "conv-a",
    targetMessageId: "assistant",
    assistant: streamingAssistant(),
    executionError: null,
  };
}

function streamingAssistant(): StreamingAssistantMessage {
  return {
    overlayId: "regenerate:assistant",
    assistantMessageId: null,
    content: "",
    thinking: null,
    simpleThink: null,
    usage: null,
    createdAt: 1,
  };
}
