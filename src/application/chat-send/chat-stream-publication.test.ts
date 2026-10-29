import { describe, expect, it } from "vitest";
import type { ChatExecutionEvent } from "@/application/chat-execution";
import { createChatSendController } from "./chat-send-controller";
import type { ChatSendState } from "./chat-send-types";

async function stream(events: readonly ChatExecutionEvent[], regenerate = false) {
  let consumed!: () => void, close!: () => void;
  const processed = new Promise<void>(resolve => { consumed = resolve; });
  const end = new Promise<void>(resolve => { close = resolve; });
  const states: ChatSendState[] = [];
  async function* source() { yield* events; consumed(); await end; }
  const controller = createChatSendController({
    createUuid: () => "publication-test",
    openExecution: async () => ({ kind: "stream", events: source() }),
    openRegenerateExecution: async () => ({ kind: "stream", events: source() }),
    reconcileHistory: async () => ({ persistedMessageIds: ["reply"], regenerateTarget: { id: "reply", content: "saved", thinking: null, simpleThink: null } }),
  });
  controller.subscribe(state => states.push(state));
  if (regenerate) await controller.regenerate({ conversationId: "A", targetMessageId: "reply", targetCreatedAt: 1 });
  else await controller.send({ conversationId: "A", content: "input" });
  await processed;
  return { controller, states, close };
}

describe("streaming publication reflects visible state, not internal event count", () => {
  it("skips unknown, empty and hidden-only chunks while retaining split-marker state and repeated text", async () => {
    const run = await stream([
      { type: "start", assistantMessageId: "reply" },
      { type: "unknown", rawType: "future" },
      { type: "camera-offline" },
      { type: "chunk", content: "" },
      { type: "chunk", content: "[MCP:hidden]" },
      { type: "chunk", content: "[THINK" },
      { type: "chunk", content: "ING_START]reason[THINKING_END]" },
      { type: "chunk", content: "same" },
      { type: "chunk", content: "same" },
    ]);
    const updates = run.states.filter(s => s.kind === "streaming");
    expect(updates).toHaveLength(5); // initial, start identity, thinking, two content additions
    expect(run.controller.getState()).toMatchObject({ assistant: { content: "samesame", thinking: "reason" } });
    run.close();
    await expect.poll(() => run.controller.getState().kind).toBe("idle");
    expect(run.states.slice(-2).map(s => s.kind)).toEqual(["finalizing", "idle"]);
    run.controller.dispose();
  });

  it("publishes usage, tool and error changes, but skips identical summaries and repeated tool state", async () => {
    const usage = { promptTokens: 1, completionTokens: 2, totalTokens: 3 };
    const run = await stream([
      { type: "start", assistantMessageId: "reply" },
      { type: "mcp-loading", messageId: "other", tools: "ignored" },
      { type: "mcp-loading", messageId: "reply", tools: "tool" },
      { type: "mcp-loading", messageId: "reply", tools: "tool" },
      { type: "debug-summary", messageId: "reply", modelKey: "model", hasError: false, failureCode: null, usage },
      { type: "debug-summary", messageId: "reply", modelKey: "model", hasError: false, failureCode: null, usage: { ...usage } },
      { type: "failure", messageId: "reply", code: "provider_request_failed", error: "failure detail" },
      { type: "unknown", rawType: "after-failure" },
    ]);
    expect(run.states.filter(s => s.kind === "streaming")).toHaveLength(5);
    expect(run.controller.getState()).toMatchObject({ executionError: { code: "provider-failure", message: "failure detail" }, assistant: { usage, toolPending: true } });
    run.controller.dispose(); run.close();
    const count = run.states.length;
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(run.states).toHaveLength(count);
  });

  it("keeps a nonvisual regenerate receipt for terminal reconciliation", async () => {
    const run = await stream([
      { type: "start", assistantMessageId: "reply" },
      { type: "chunk", content: "saved" },
      { type: "persisted", receipt: { id: "reply", content: "saved", thinking: null, simpleThink: null } },
    ], true);
    expect(run.states.filter(s => s.kind === "regenerate-streaming")).toHaveLength(3);
    run.close();
    await expect.poll(() => run.controller.getState().kind).toBe("idle");
    expect(run.states.slice(-2).map(s => s.kind)).toEqual(["regenerate-finalizing", "idle"]);
    run.controller.dispose();
  });
});
