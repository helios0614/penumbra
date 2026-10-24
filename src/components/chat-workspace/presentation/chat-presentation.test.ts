import { describe, expect, it } from "vitest";

import {
  EMPTY_CONVERSATION_TITLE,
  presentChatConversation,
  presentChatConversations,
  presentChatMessage,
  presentChatMessages,
} from "@/components/chat-workspace/presentation";
import type { ConversationSummary } from "@/domain/conversation";
import type { Message } from "@/domain/message";

describe("chat conversation presentation", () => {
  it("maps only real summary fields plus selected and pending UI state", () => {
    const input = conversation("conv_a", {
      title: "真实会话",
      modelKey: "provider/very-long-model-key",
      updatedAt: 0,
      messageCount: 12,
    });

    const output = presentChatConversation(input, {
      selectedConversationId: "conv_a",
      pendingConversationId: "conv_a",
    });

    expect(output).toEqual({
      id: "conv_a",
      title: "真实会话",
      subtitle: "12 条消息",
      modelKey: "provider/very-long-model-key",
      updatedAt: 0,
      isSelected: true,
      isPending: true,
    });
    expect(output).not.toHaveProperty("preview");
    expect(output).not.toHaveProperty("unread");
    expect(output).not.toHaveProperty("online");
    expect(output).not.toHaveProperty("messageCount");
    expect(output).not.toBe(input);
  });

  it("uses a fixed UI-only fallback for an empty title and null presentation for an empty model", () => {
    const input = conversation("conv_empty", {
      title: "   ",
      modelKey: "",
    });

    const output = presentChatConversation(input, {
      selectedConversationId: null,
    });

    expect(output.title).toBe(EMPTY_CONVERSATION_TITLE);
    expect(output.modelKey).toBeNull();
    expect(input.title).toBe("   ");
    expect(input.modelKey).toBe("");
  });

  it("preserves a long title and backend list order without mutating input", () => {
    const longTitle = "长".repeat(240);
    const input = Object.freeze([
      Object.freeze(conversation("conv_b", { title: longTitle })),
      Object.freeze(conversation("conv_a", { title: "第二项" })),
    ]);

    const output = presentChatConversations(input, {
      selectedConversationId: "conv_a",
      pendingConversationId: "conv_b",
    });

    expect(output.map(({ id }) => id)).toEqual(["conv_b", "conv_a"]);
    expect(output[0]?.title).toBe(longTitle);
    expect(output[0]?.isPending).toBe(true);
    expect(output[1]?.isSelected).toBe(true);
    expect(input.map(({ id }) => id)).toEqual(["conv_b", "conv_a"]);
  });
});

describe("chat message presentation", () => {
  it("maps user and assistant persistent fields without retaining capability payloads", () => {
    const attachment = Object.freeze({
      apiKey: "fake-api-key",
      endpoint: "https://fake-endpoint.example",
    });
    const user = Object.freeze(message({
      id: "user_1",
      roleKind: "user",
      rawRole: "user",
      content: "hello",
      attachments: Object.freeze([attachment]),
    }));
    const assistant = Object.freeze(message({
      id: "assistant_1",
      roleKind: "assistant",
      rawRole: "assistant",
      content: "world",
      simpleThink: "simple",
      thinking: "thinking",
      attachments: Object.freeze(["/uploads/example.png"]),
    }));

    const userOutput = presentChatMessage(user);
    const assistantOutput = presentChatMessage(assistant);

    expect(userOutput).toEqual({
      kind: "user",
      id: "user_1",
      content: "hello",
      createdAt: 10,
      attachments: [{ kind: "unsupported", label: "附件暂不支持" }],
    });
    expect(assistantOutput).toEqual({
      kind: "assistant",
      id: "assistant_1",
      content: "world",
      createdAt: 10,
      thinking: "thinking",
      simpleThink: "simple",
      attachments: [{ kind: "unsupported", label: "附件暂不支持" }],
    });
    expect(JSON.stringify([userOutput, assistantOutput])).not.toContain("fake-api-key");
    expect(JSON.stringify([userOutput, assistantOutput])).not.toContain("fake-endpoint");
    expect(userOutput).not.toBe(user);
    expect(userOutput && "attachments" in userOutput && userOutput.attachments).not.toBe(user.attachments);
  });

  it("keeps system distinct and hides all hidden-runtime roles", () => {
    const system = presentChatMessage(message({
      roleKind: "system",
      rawRole: "system",
      content: "系统事件",
    }));

    expect(system).toEqual({
      kind: "system",
      id: "msg_1",
      content: "",
      createdAt: 10,
    });

    for (const rawRole of ["cam_trigger", "cam_user", "cam_log"]) {
      expect(presentChatMessage(message({
        roleKind: "hidden-runtime",
        rawRole,
      }))).toBeNull();
    }
  });

  it.each([
    "provider_request_failed",
    "provider_execution_failed",
  ])("projects persisted %s assistant failures to safe copy", (marker) => {
    const rawContent = `[private provider 429] ${marker}`;
    const input = message({
      roleKind: "assistant",
      rawRole: "assistant",
      content: rawContent,
    });

    const output = presentChatMessage(input);

    expect(output).toMatchObject({
      kind: "assistant",
      content: "",
      error: "当前回复生成失败。",
    });
    expect(JSON.stringify(output)).not.toMatch(/private|429|provider_/);
    expect(input.content).toBe(rawContent);
  });

  it("preserves a safe unknown role and never projects it as assistant", () => {
    const output = presentChatMessage(message({
      roleKind: "unknown",
      rawRole: "future_role.v2",
      content: "untrusted text",
    }));

    expect(output).toEqual({
      kind: "unknown",
      id: "msg_1",
      rawRole: "future_role.v2",
      content: "untrusted text",
      createdAt: 10,
    });
    expect(output?.kind).not.toBe("assistant");
  });

  it("redacts unsafe role labels while keeping unknown content as plain presentation text", () => {
    const fakeAuthorization = "Bearer fake-authorization";
    const output = presentChatMessage(message({
      roleKind: "unknown",
      rawRole: fakeAuthorization,
      content: "<script>not executed</script>",
    }));

    expect(output).toMatchObject({
      kind: "unknown",
      rawRole: "unknown",
      content: "<script>not executed</script>",
    });
    expect(JSON.stringify(output)).not.toContain(fakeAuthorization);
  });

  it("preserves createdAt=0, empty content, and long content", () => {
    const longContent = "文".repeat(20_000);
    const output = presentChatMessages([
      message({ id: "epoch", createdAt: 0, content: "" }),
      message({ id: "long", content: longContent }),
    ]);

    expect(output[0]).toMatchObject({ id: "epoch", createdAt: 0, content: "" });
    expect(output[1]?.content).toBe(longContent);
  });

  it("drops extra/raw/debug fields and does not mutate or retain the domain object", () => {
    const forbidden = [
      "fake-cookie",
      "fake-authorization",
      "fake-debug-payload",
      "https://internal-target.example",
    ];
    const input = Object.freeze({
      ...message(),
      cookie: forbidden[0],
      authorization: forbidden[1],
      debugPayload: forbidden[2],
      endpoint: forbidden[3],
    }) as Message;
    const before = { ...input };

    const output = presentChatMessage(input);

    expect(input).toEqual(before);
    expect(output).not.toBe(input);
    forbidden.forEach((value) => expect(JSON.stringify(output)).not.toContain(value));
    expect(output).not.toHaveProperty("mcpToolCalls");
    expect(output).not.toHaveProperty("voice");
    expect(output).not.toHaveProperty("cacheRegion");
  });
});

function conversation(
  id: string,
  overrides: Partial<ConversationSummary> = {},
): ConversationSummary {
  return {
    id,
    title: `Conversation ${id}`,
    modelKey: "model-a",
    createdAt: 1,
    updatedAt: 2,
    messageCount: 0,
    ...overrides,
  };
}

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg_1",
    conversationId: "conv_a",
    rawRole: "user",
    roleKind: "user",
    content: "content",
    createdAt: 10,
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
