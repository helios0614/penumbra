import { describe, expect, it, vi } from "vitest";
import { createChatSendController, isChatExecutionActive } from "./chat-send-controller";
import { encodeChatExecutionId, type MainChatExecution } from "@/application/chat-execution/chat-execution-status";
import { ApiError } from "@/lib/api";
import { composeVisibleChatMessages } from "@/components/chat-workspace/presentation";

export function execution(overrides: Partial<MainChatExecution> = {}): MainChatExecution {
  return { conversationId: "A", executionId: encodeChatExecutionId("send", "client-1"), kind: "send", requestId: "client-1",
    phase: "preparing", terminal: false, outcome: null, reason: null, cancelRequested: false,
    userMessageId: "user-1", targetMessageId: null, assistantMessageId: null, partialText: "",
    ownerAvailable: true, cancelable: true, ...overrides };
}
function fixture() {
  let status = execution();
  let headers!: (value: never) => void;
  const openExecution = vi.fn(() => new Promise<never>(resolve => { headers = resolve; }));
  const readExecution = vi.fn(async () => status);
  const cancelExecution = vi.fn(async () => ({ execution: status, cancelAccepted: true }));
  const reconcileHistory = vi.fn(async () => ({ persistedMessageIds: ["user-1", "assistant-1"], regenerateTarget: null }));
  let uuid = 0;
  const controller = createChatSendController({ openExecution, readExecution, cancelExecution, reconcileHistory, createUuid: () => `client-${++uuid}` });
  return { controller, openExecution, readExecution, cancelExecution, reconcileHistory, headers: () => headers,
    set: (change: Partial<MainChatExecution>) => { status = { ...status, ...change }; } };
}
describe("S6E2-C authoritative execution gate", () => {
  it("addresses preparing before POST response headers; accepted intent is not terminal", async () => {
    const f = fixture(); void f.controller.send({ conversationId: "A", content: "question" });
    expect(f.controller.getState()).toMatchObject({ executionId: encodeChatExecutionId("send", "client-1") });
    f.set({ cancelRequested: true, cancelable: false }); await f.controller.cancel();
    expect(f.cancelExecution).toHaveBeenCalledWith("A", encodeChatExecutionId("send", "client-1"));
    expect(isChatExecutionActive(f.controller.getState())).toBe(true);
    expect(await f.controller.send({ conversationId: "A", content: "next" })).toBe(false);
    f.set({ terminal: true, phase: "terminal", outcome: "cancelled", partialText: "safe partial" });
    await f.controller.retryFinalization();
    expect(isChatExecutionActive(f.controller.getState())).toBe(false);
    expect(f.controller.getState().stoppedExecutions).toContainEqual(expect.objectContaining({ execution: expect.objectContaining({ partialText: "safe partial" }) }));
    expect(f.openExecution).toHaveBeenCalledOnce(); f.controller.dispose();
  });
  it.each([404, 409, 503, 0])("does not treat cancel %s as terminal or retry POST", async status => {
    const f = fixture(); void f.controller.send({ conversationId: "A", content: "question" });
    f.cancelExecution.mockRejectedValueOnce(new ApiError("synthetic", status));
    await f.controller.cancel();
    expect(isChatExecutionActive(f.controller.getState())).toBe(true);
    expect(f.openExecution).toHaveBeenCalledOnce(); expect(f.controller.getState().controlError).toBeTruthy(); f.controller.dispose();
  });
  it("committed Assistant and nonterminal 200 do not unlock; terminal GET does", async () => {
    const f = fixture(); void f.controller.send({ conversationId: "A", content: "question" });
    f.set({ phase: "finalizing", assistantMessageId: "assistant-1", cancelable: false });
    await f.controller.cancel(); await f.controller.retryFinalization();
    expect(isChatExecutionActive(f.controller.getState())).toBe(true);
    f.set({ terminal: true, phase: "terminal", outcome: "completed" }); await f.controller.retryFinalization();
    expect(isChatExecutionActive(f.controller.getState())).toBe(false); f.controller.dispose();
  });
  it("uses active for discovery, but null never settles a known execution", async () => {
    const readActiveExecution = vi.fn(async () => execution());
    const f = fixture();
    const c = createChatSendController({ readActiveExecution, readExecution: f.readExecution, reconcileHistory: f.reconcileHistory });
    await c.discoverActive("A"); expect(isChatExecutionActive(c.getState())).toBe(true);
    readActiveExecution.mockResolvedValueOnce(null as never); await c.discoverActive("A");
    expect(isChatExecutionActive(c.getState())).toBe(true); c.dispose(); f.controller.dispose();
  });
  it("has no nonterminal release escape hatch", () => {
    expect(fixture().controller).not.toHaveProperty("releaseAfterReview");
  });
  it("unlocks on terminal GET while history is pending; its late history failure cannot reset the next execution", async () => {
    const f = fixture(); void f.controller.send({ conversationId: "A", content: "first" });
    let fail!: (error: Error) => void;
    f.reconcileHistory.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    f.set({ terminal: true, phase: "terminal", outcome: "completed" });
    const read = f.controller.retryFinalization();
    await vi.waitFor(() => expect(f.controller.getState().serverExecution?.terminal).toBe(true));
    void f.controller.send({ conversationId: "A", content: "next" });
    expect(f.openExecution).toHaveBeenCalledTimes(2);
    const nextId = encodeChatExecutionId("send", "client-2");
    fail(new Error("synthetic old history failed")); await read;
    expect(f.controller.getState()).toMatchObject({ executionId: nextId, kind: "sending-user" });
    expect(f.controller.getState().controlError).toBeUndefined(); f.controller.dispose();
  });
  it("shows only the durable cancelled public body while history is still pending", async () => {
    const f = fixture(); void f.controller.send({ conversationId: "A", content: "first" });
    let finish!: (value: { persistedMessageIds: string[]; regenerateTarget: null }) => void;
    f.reconcileHistory.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    f.set({ terminal: true, phase: "terminal", outcome: "cancelled", partialText: "safe stopped body" });
    const read = f.controller.retryFinalization();
    await vi.waitFor(() => expect(f.controller.getState().serverExecution?.terminal).toBe(true));
    expect(composeVisibleChatMessages([], f.controller.getState(), "A")).toMatchObject([{ content: "safe stopped body", executionStatus: "stopped", thinking: null }]);
    finish({ persistedMessageIds: [], regenerateTarget: null }); await read; f.controller.dispose();
  });
});
