import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatSendController, type ChatSendState } from "./index";
import { readChatSendResult } from "./chat-send-result";
import { mapMessage } from "@/domain/message";
import { messageWire } from "@/test-fixtures/main-chat-wire";
import { composeVisibleChatMessages } from "@/components/chat-workspace/presentation";
import { ApiError } from "@/lib/api";
import type { ChatExecutionEvent } from "@/application/chat-execution";

afterEach(() => vi.unstubAllGlobals());
const saved = (id: string, content = "server answer") => mapMessage(messageWire({ id, content, thinking: null, drift: null }));
const receipt = (id: string | null) => ({ conversationId: "conv_a", clientMessageId: "client-a", userMessageId: "user-a", assistantMessageId: id });
const failure = "[Anthropic API 错误 503] provider_request_failed\n上游信息：synthetic unavailable\n请求 ID：req-a";
async function settled(get: () => ChatSendState, kind: ChatSendState["kind"]) {
  await vi.waitFor(() => expect(get().kind).toBe(kind), { interval: 1 });
}
async function* stream(values: ChatExecutionEvent[], disconnected = false) {
  for (const value of values) yield value;
  if (disconnected) throw new ApiError("synthetic disconnect", 0, null, "NETWORK_ERROR");
}

describe("PR7-A execution to persisted result reconciliation", () => {
  it("preserves safe streamed diagnostics when persisted failure has only a marker", async () => {
    const row = saved("assistant-a", "partial\n[请求出错: provider_execution_failed]");
    const controller = createChatSendController({ createUuid: () => "client-a",
      openExecution: async () => ({ kind: "stream", events: stream([
        { type: "start", assistantMessageId: row.id },
        { type: "failure", messageId: row.id, code: "provider_execution_failed", error: "当前回复生成失败。\n请求 ID：req-stream-detail" },
      ]) }),
      reconcileHistory: async () => ({ persistedMessageIds: [row.id], regenerateTarget: null, assistants: [row] }),
    });
    await controller.send({ conversationId: "conv_a", content: "question" });
    await settled(controller.getState, "error");
    const visible = composeVisibleChatMessages([row], controller.getState(), "conv_a");
    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({ content: "partial\n", error: expect.stringContaining("req-stream-detail") });
    controller.dispose();
  });

  it("uses a valid regenerate commit receipt over earlier failure and late transport errors", async () => {
    const canonical = saved("target", "committed");
    const controller = createChatSendController({ createUuid: () => "client-a",
      openRegenerateExecution: async () => ({ kind: "stream", events: stream([
        { type: "start", assistantMessageId: "target" },
        { type: "failure", messageId: "target", code: "provider_execution_failed" },
        { type: "persisted", receipt: canonical },
      ], true) }),
      reconcileHistory: async () => ({ persistedMessageIds: [canonical.id], regenerateTarget: canonical, assistants: [canonical] }),
    });
    await controller.regenerate({ conversationId: "conv_a", targetMessageId: "target", targetCreatedAt: 10 });
    await settled(controller.getState, "idle");
    expect(composeVisibleChatMessages([canonical], controller.getState(), "conv_a")).toMatchObject([{ id: "target", content: "committed" }]);
    controller.dispose();
  });

  it.each([524, 408, 502])("confirms HTTP %s with no start only by its receipt and authoritative assistant", async status => {
    let rows = [saved("unrelated")];
    let linked: string | null = null;
    const openExecution = vi.fn(async () => { throw new ApiError("proxy", status); });
    const controller = createChatSendController({ createUuid: () => "client-a", openExecution,
      lookupSendResult: async () => receipt(linked),
      reconcileHistory: async () => ({ persistedMessageIds: ["user-a", ...rows.map(r => r.id)], regenerateTarget: null, assistants: rows }),
    });
    await controller.send({ conversationId: "conv_a", content: "same text", generation: { attachments: ["/uploads/synthetic.png"] } });
    await settled(controller.getState, "finalization-uncertain");
    expect(composeVisibleChatMessages(rows, controller.getState(), "conv_a").some(r => r.executionStatus === "unconfirmed")).toBe(true);
    linked = "assistant-a";
    await controller.retryFinalization(); // receipt alone, missing history, cannot clear
    expect(controller.getState().kind).toBe("finalization-uncertain");
    rows = [...rows, saved("assistant-a")];
    await controller.retryFinalization();
    expect(controller.getState()).toMatchObject({ kind: "idle", confirmedSend: { clientMessageId: "client-a" } });
    const visible = composeVisibleChatMessages(rows, controller.getState(), "conv_a");
    expect(visible.map(r => r.id)).toEqual(["unrelated", "assistant-a"]);
    expect(visible.some(r => r.executionStatus || "error" in r && r.error)).toBe(false);
    expect(openExecution).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it.each([false, true])("keeps partial after disconnect and reconciles persisted failure=%s", async failed => {
    let rows: ReturnType<typeof saved>[] = [];
    const controller = createChatSendController({ createUuid: () => "client-a",
      openExecution: async () => ({ kind: "stream", events: stream([
        { type: "start", assistantMessageId: "assistant-a" },
        { type: "chunk", content: "partial[THINKING_START]separate thinking[THINKING_END][HEART:hidden]" },
      ], true) }),
      reconcileHistory: async () => ({ persistedMessageIds: ["user-a", ...rows.map(r => r.id)], regenerateTarget: null, assistants: rows }),
    });
    await controller.send({ conversationId: "conv_a", content: "question" });
    await settled(controller.getState, "finalization-uncertain");
    const temporary = composeVisibleChatMessages(rows, controller.getState(), "conv_a");
    const partial = temporary[temporary.length - 1];
    expect(partial).toMatchObject({ content: "partial", thinking: "separate thinking", executionStatus: "unconfirmed" });
    expect(JSON.stringify(partial)).not.toContain("hidden");
    rows = [saved("another", "unrelated answer")];
    await controller.retryFinalization();
    expect(controller.getState().kind).toBe("finalization-uncertain");
    rows.push(saved("assistant-a", failed ? `persisted partial\n${failure}` : "complete authoritative answer"));
    await controller.retryFinalization();
    expect(controller.getState().kind).toBe(failed ? "error" : "idle");
    const visible = composeVisibleChatMessages(rows, controller.getState(), "conv_a");
    expect(visible).toHaveLength(2);
    expect(visible.some(r => r.executionStatus)).toBe(false);
    expect(JSON.stringify(visible)).not.toContain("execution:client-a:assistant");
    if (failed) expect(JSON.stringify(visible)).toContain("synthetic unavailable");
    controller.dispose();
  });

  it("does not treat a user or tool ID as the assistant, even if the receipt is bad", async () => {
    const controller = createChatSendController({ createUuid: () => "client-a",
      openExecution: async () => { throw new ApiError("proxy", 524); },
      lookupSendResult: async () => receipt("user-a"),
      reconcileHistory: async () => ({ persistedMessageIds: ["user-a"], regenerateTarget: null, assistants: [] }),
    });
    await controller.send({ conversationId: "conv_a", content: "question" });
    await settled(controller.getState, "finalization-uncertain");
    expect(await controller.send({ conversationId: "conv_a", content: "question" })).toBe(false);
    controller.dispose();
  });

  it("coalesces simultaneous read-only recovery without second generation", async () => {
    let reads = 0;
    let resolve!: () => void;
    const controller = createChatSendController({ createUuid: () => "client-a",
      openExecution: async () => { throw new ApiError("proxy", 524); },
      reconcileHistory: async () => { reads++; if (reads > 1) await new Promise<void>(r => { resolve = r; }); return { persistedMessageIds: [], regenerateTarget: null, assistants: [] }; },
    });
    await controller.send({ conversationId: "conv_a", content: "question" });
    await settled(controller.getState, "finalization-uncertain");
    const first = controller.retryFinalization();
    const second = controller.retryFinalization();
    expect(reads).toBe(2);
    resolve(); await Promise.all([first, second]);
    expect(controller.getState().kind).toBe("finalization-uncertain");
    controller.dispose();
  });

  it.each([false, true])("regenerate retains target and partial, with receipt=%s", async withReceipt => {
    const target = saved("target", "original");
    let canonical = target;
    const events: ChatExecutionEvent[] = [{ type: "start", assistantMessageId: "target" }, { type: "chunk", content: "new partial" }];
    if (withReceipt) events.push({ type: "persisted", receipt: saved("target", "new complete") });
    const controller = createChatSendController({ createUuid: () => "client-a",
      openRegenerateExecution: async () => ({ kind: "stream", events: stream(events, true) }),
      reconcileHistory: async () => ({ persistedMessageIds: [canonical.id], regenerateTarget: canonical, assistants: [canonical] }),
    });
    await controller.regenerate({ conversationId: "conv_a", targetMessageId: "target", targetCreatedAt: 10 });
    await settled(controller.getState, "regenerate-finalization-uncertain");
    const visible = composeVisibleChatMessages([canonical], controller.getState(), "conv_a");
    expect(visible).toHaveLength(2);
    expect(visible[0]).toMatchObject({ id: "target", content: "original" });
    expect(visible[1]).toMatchObject({ content: "new partial", executionStatus: "unconfirmed" });
    canonical = saved("target", "new complete");
    await controller.retryFinalization();
    expect(controller.getState().kind).toBe(withReceipt ? "idle" : "regenerate-finalization-uncertain");
    if (withReceipt) expect(composeVisibleChatMessages([canonical], controller.getState(), "conv_a")).toHaveLength(1);
    controller.dispose();
  });

  it("validates the readonly HTTP receipt identity and projects only IDs", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ conv_id: "conv_a", client_msg_id: "client-a", user_message_id: "user-a", assistant_message_id: null, private_debug: "hidden" }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    expect(await readChatSendResult("conv_a", "client-a")).toEqual(receipt(null));
    expect(fetch.mock.calls[0][1].method).toBe("GET");
    fetch.mockResolvedValue(new Response(JSON.stringify({ conv_id: "other", client_msg_id: "client-a" })));
    await expect(readChatSendResult("conv_a", "client-a")).rejects.toThrow();
  });
});
