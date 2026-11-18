import { executionReader, pendingExecutionReader } from "@/test-fixtures/chat-execution";
import { describe, expect, it, vi } from "vitest";
import { createChatSendController, type ChatSendState } from "./index";
import { mapMessage } from "@/domain/message";
import { messageWire } from "@/test-fixtures/main-chat-wire";
import { composeVisibleChatMessages } from "@/components/chat-workspace/presentation";
import type { ChatExecutionEvent } from "@/application/chat-execution";

const saved = (id: string, content = "server answer") => mapMessage(messageWire({ id, content, thinking: null, drift: null }));
const receipt = (id: string | null) => ({ conversationId: "conv_a", clientMessageId: "client-a", userMessageId: "user-a", assistantMessageId: id });
async function settled(get: () => ChatSendState, kind: ChatSendState["kind"]) {
  await vi.waitFor(() => expect(get().kind).toBe(kind), { interval: 1 });
}
async function* stream(values: ChatExecutionEvent[]) { for (const value of values) yield value; }

describe("streaming recovery without over-defensive locks", () => {
  it("treats a new start as a fresh attempt and drops the previous attempt's error", async () => {
    const row = saved("assistant-b", "second attempt");
    const controller = createChatSendController({ readExecution: executionReader(), createUuid: () => "client-a",
      openExecution: async () => ({ kind: "stream", events: stream([
        { type: "start", assistantMessageId: "assistant-a" },
        { type: "failure", messageId: "assistant-a", code: "provider_request_failed", error: "当前回复生成失败。" },
        { type: "start", assistantMessageId: "assistant-b" },
        { type: "chunk", content: "second attempt" },
      ]) }),
      reconcileHistory: async () => ({ persistedMessageIds: ["user-a", row.id], regenerateTarget: null, assistants: [row] }),
    });
    await controller.send({ conversationId: "conv_a", content: "question" });
    await settled(controller.getState, "idle");
    const visible = composeVisibleChatMessages([row], controller.getState(), "conv_a");
    expect(visible.some(r => r.executionStatus || "error" in r && r.error)).toBe(false);
    controller.dispose();
  });

  it("adopts the receipt's assistant when the streamed ID never reaches history", async () => {
    const row = saved("assistant-b");
    const controller = createChatSendController({ readExecution: executionReader(), createUuid: () => "client-a",
      openExecution: async () => ({ kind: "stream", events: stream([{ type: "start", assistantMessageId: "assistant-a" }]) }),
      lookupSendResult: async () => receipt("assistant-b"),
      reconcileHistory: async () => ({ persistedMessageIds: ["user-a", row.id], regenerateTarget: null, assistants: [row] }),
    });
    await controller.send({ conversationId: "conv_a", content: "question" });
    await settled(controller.getState, "idle");
    expect(composeVisibleChatMessages([row], controller.getState(), "conv_a").map(r => r.id)).toEqual(["assistant-b"]);
    controller.dispose();
  });

  it("keeps an unknown result on explicit 重新核对 after HTTP history was read", async () => {
    const row = saved("assistant-b");
    const controller = createChatSendController({ readExecution: pendingExecutionReader, createUuid: () => "client-a",
      openExecution: async () => ({ kind: "stream", events: stream([{ type: "start", assistantMessageId: "assistant-a" }]) }),
      lookupSendResult: async () => receipt(null),
      reconcileHistory: async () => ({ persistedMessageIds: ["user-a", row.id], regenerateTarget: null, assistants: [row] }),
    });
    await controller.send({ conversationId: "conv_a", content: "question" });
    await settled(controller.getState, "finalization-uncertain");
    await controller.retryFinalization(); // automatic retries keep the protection
    expect(controller.getState().kind).toBe("finalization-uncertain");
    await controller.retryFinalization({ manual: true });
    expect(controller.getState()).toMatchObject({ kind: "finalization-uncertain", executionId: "send.Y2xpZW50LWE" });
    controller.dispose();
  });
});
