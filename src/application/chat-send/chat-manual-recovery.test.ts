import { describe, expect, it, vi } from "vitest";
import { createChatSendController, isChatExecutionActive, type ChatSendState } from "./index";
import { composeVisibleChatMessages } from "@/components/chat-workspace/presentation";
import { executionReader, pendingExecutionReader } from "@/test-fixtures/chat-execution";
import { mapMessage } from "@/domain/message";
import { messageWire } from "@/test-fixtures/main-chat-wire";

const original = mapMessage(messageWire({ content: "original", thinking: null, drift: null }));
const unknown = (s: ChatSendState) => s.kind === "finalization-uncertain" || s.kind === "regenerate-finalization-uncertain";
function fixture(kind: "send" | "regenerate") {
  let terminal = false, readable = true;
  const readExecution = vi.fn((conv: string, id: string) => (terminal ? executionReader() : pendingExecutionReader)(conv, id));
  const events = async function* () {
    yield { type: "start" as const, assistantMessageId: kind === "send" ? "saved" : original.id, driftEnabled: true };
    yield { type: "chunk" as const, content: "partial[THINKING_START]thinking[THINKING_END][DRIFT:drift]" };
  };
  const openExecution = vi.fn(async () => ({ kind: "stream" as const, events: events() }));
  const openRegenerateExecution = vi.fn(async () => ({ kind: "stream" as const, events: events() }));
  const reconcileHistory = vi.fn(async () => {
    if (!readable) throw new Error("synthetic history failure");
    return { persistedMessageIds: [original.id], regenerateTarget: original, assistants: [] };
  });
  let uuid = 0;
  const controller = createChatSendController({ readExecution, openExecution, openRegenerateExecution, reconcileHistory, createUuid: () => `client-${++uuid}` });
  const start = () => kind === "send" ? controller.send({ conversationId: "conv_a", content: "question" })
    : controller.regenerate({ conversationId: "conv_a", targetMessageId: original.id, targetCreatedAt: original.createdAt });
  return { controller, start, readExecution, reconcileHistory, openExecution, openRegenerateExecution,
    terminal: () => { terminal = true; }, readable: (value: boolean) => { readable = value; } };
}

describe("B1 partial preservation under the S6E2 terminal gate", () => {
  it.each(["send", "regenerate"] as const)("keeps %s partial/Thinking/DRIFT on GET-only review and never releases a live execution", async kind => {
    const f = fixture(kind); await f.start(); await vi.waitFor(() => expect(unknown(f.controller.getState())).toBe(true));
    await f.controller.retryFinalization({ manual: true });
    expect(isChatExecutionActive(f.controller.getState())).toBe(true);
    expect(composeVisibleChatMessages([original], f.controller.getState(), "conv_a")).toContainEqual(expect.objectContaining({ content: "partial", thinking: "thinking", simpleThink: "drift", executionStatus: "unconfirmed" }));
    expect(await f.controller.send({ conversationId: "conv_a", content: "next" })).toBe(false);
    expect(f.controller).not.toHaveProperty("releaseAfterReview");
    f.terminal(); await f.controller.retryFinalization();
    expect(isChatExecutionActive(f.controller.getState())).toBe(false);
    expect(f.openExecution.mock.calls.length + f.openRegenerateExecution.mock.calls.length).toBe(1); f.controller.dispose();
  });
  it.each(["send", "regenerate"] as const)("retains %s partial when this history read fails, without reusing an old read flag", async kind => {
    const f = fixture(kind); await f.start(); await vi.waitFor(() => expect(unknown(f.controller.getState())).toBe(true));
    f.readable(false); await f.controller.retryFinalization();
    expect(f.controller.getState()).toMatchObject({ recoveryReadSucceeded: false, assistant: { content: "partial" } });
    expect(isChatExecutionActive(f.controller.getState())).toBe(true); f.controller.dispose();
  });
  it.each(["send", "regenerate"] as const)("allows generation after authoritative %s terminal even when history is unavailable, retaining only a terminal presentation recovery", async kind => {
    const f = fixture(kind); await f.start(); await vi.waitFor(() => expect(unknown(f.controller.getState())).toBe(true));
    f.terminal(); f.readable(false); await f.controller.retryFinalization();
    expect(isChatExecutionActive(f.controller.getState())).toBe(false);
    expect(f.controller.getState().recoveries).toContainEqual(expect.objectContaining({ serverExecution: expect.objectContaining({ terminal: true }), assistant: expect.objectContaining({ content: "partial" }) }));
    f.readable(true); await f.controller.retryFinalization();
    expect(f.controller.getState().recoveries).toBeUndefined(); f.controller.dispose();
  });
});
