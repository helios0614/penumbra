import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatExecutionEvent } from "@/application/chat-execution";
import { executionReader, pendingExecutionReader } from "@/test-fixtures/chat-execution";
import { createChatExecutionSessions } from "./chat-execution-sessions";
import { createChatSendController, isChatExecutionActive } from "./chat-send-controller";
import type { ChatSendState } from "./chat-send-types";

function barrier<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function fixture(kind: "send" | "regenerate", delayedHeaders = false) {
  let source!: ReadableStreamDefaultController<ChatExecutionEvent>;
  const body = new ReadableStream<ChatExecutionEvent>({ start(controller) { source = controller; } });
  async function* events() {
    const reader = body.getReader();
    try { while (true) { const next = await reader.read(); if (next.done) return; yield next.value; } }
    finally { reader.releaseLock(); }
  }
  const headers = barrier<void>();
  const signals: AbortSignal[] = [];
  const open = vi.fn(async (_owner: string, _input: unknown, options?: { signal?: AbortSignal }) => {
    signals.push(options!.signal!);
    if (delayedHeaders) await headers.promise;
    return { kind: "stream" as const, events: events() };
  });
  const readExecution = vi.fn(pendingExecutionReader);
  const cancelExecution = vi.fn(async (owner: string, id: string) => ({ execution: await pendingExecutionReader(owner, id), cancelAccepted: true }));
  const reconcileHistory = vi.fn(async () => ({ persistedMessageIds: [], regenerateTarget: null }));
  const sessions = createChatExecutionSessions({ createUuid: () => "live-attempt", readExecution, cancelExecution, reconcileHistory,
    openExecution: open, openRegenerateExecution: (owner, _target, input, options) => open(owner, input, options) });
  const controller = sessions.get("A");
  const states: ChatSendState[] = [];
  controller.subscribe(state => states.push(state));
  const start = () => kind === "send" ? controller.send({ conversationId: "A", content: "question" })
    : controller.regenerate({ conversationId: "A", targetMessageId: "target", targetCreatedAt: 1 });
  return { controller, sessions, states, readExecution, cancelExecution, reconcileHistory, open, signals, start,
    headers: () => headers.resolve(), emit: (event: ChatExecutionEvent) => source.enqueue(event), close: () => source.close() };
}

afterEach(() => vi.useRealTimers());
describe("live transport and read-only reconciliation ownership", () => {
  it.each(["send", "regenerate"] as const)("keeps %s preparation, Thinking and silent generation alive through automatic/manual GETs", async kind => {
    vi.useFakeTimers();
    const f = fixture(kind, true);
    const opening = f.start();
    const beforeHeaders = f.controller.getState().kind;
    await f.sessions.reconcilePending();
    expect(f.controller.getState().kind).toBe(beforeHeaders);
    f.headers(); await opening;
    f.emit({ type: "start", assistantMessageId: "target" });
    f.emit({ type: "chunk", content: "[THINKING_START]reason[THINKING_END]" });
    await vi.advanceTimersByTimeAsync(0);
    await f.controller.retryFinalization({ manual: true });
    await vi.advanceTimersByTimeAsync(300_000);
    await f.sessions.reconcilePending();
    expect(f.controller.getState()).toMatchObject({ kind: kind === "send" ? "streaming" : "regenerate-streaming", assistant: { content: "", thinking: "reason" } });
    expect(f.states.some(state => state.kind.includes("finaliz"))).toBe(false);
    expect(f.reconcileHistory).not.toHaveBeenCalled();
    expect(f.signals[0].aborted).toBe(false);
    expect(isChatExecutionActive(f.controller.getState())).toBe(true);
    expect(f.open).toHaveBeenCalledOnce();
    f.controller.dispose(); f.close();
  });

  it.each(["send", "regenerate"] as const)("does not overwrite newer %s SSE output with a delayed generating GET", async kind => {
    const f = fixture(kind); await f.start();
    const read = barrier<Awaited<ReturnType<typeof pendingExecutionReader>>>();
    f.readExecution.mockReturnValueOnce(read.promise);
    const checking = f.sessions.reconcilePending();
    f.emit({ type: "start", assistantMessageId: "target" });
    f.emit({ type: "chunk", content: "new output" });
    await vi.waitFor(() => expect(f.controller.getState()).toMatchObject({ assistant: { content: "new output" } }));
    const state = f.controller.getState();
    read.resolve(await pendingExecutionReader("A", "executionId" in state ? state.executionId : ""));
    await checking;
    expect(f.controller.getState()).toMatchObject({ kind: kind === "send" ? "streaming" : "regenerate-streaming", assistant: { content: "new output" } });
    expect(f.signals[0].aborted).toBe(false);
    f.controller.dispose(); f.close();
  });

  it("keeps a failed background status read local while the original relay remains live", async () => {
    const f = fixture("send"); await f.start();
    f.readExecution.mockRejectedValueOnce(new TypeError("GET unavailable"));
    await f.sessions.reconcilePending();
    expect(f.controller.getState()).toMatchObject({ kind: "streaming" });
    expect(f.controller.getState().controlError).toBeUndefined();
    expect(f.reconcileHistory).not.toHaveBeenCalled();
    f.controller.dispose(); f.close();
  });

  it("retains uncertainty when the relay really ends during an in-flight generating read, and manual GET settles terminal", async () => {
    const f = fixture("regenerate"); await f.start();
    const read = barrier<Awaited<ReturnType<typeof pendingExecutionReader>>>();
    f.readExecution.mockReturnValueOnce(read.promise);
    const checking = f.sessions.reconcilePending();
    f.emit({ type: "start", assistantMessageId: "target" }); f.close();
    await vi.waitFor(() => expect(f.controller.getState()).toMatchObject({ assistant: { assistantMessageId: "target" } }));
    const state = f.controller.getState();
    read.resolve(await pendingExecutionReader("A", "executionId" in state ? state.executionId : ""));
    await checking;
    await vi.waitFor(() => expect(f.controller.getState().kind).toBe("regenerate-finalization-uncertain"));
    expect(isChatExecutionActive(f.controller.getState())).toBe(true);
    f.readExecution.mockImplementation(executionReader());
    await f.controller.retryFinalization({ manual: true });
    expect(f.controller.getState().kind).toBe("idle");
    expect(f.open).toHaveBeenCalledOnce(); f.controller.dispose();
  });

  it("does not let a late nonterminal GET undo a terminal observation or touch another conversation", async () => {
    const f = fixture("send"); await f.start();
    const read = barrier<Awaited<ReturnType<typeof pendingExecutionReader>>>();
    f.readExecution.mockReturnValueOnce(read.promise);
    const checking = f.sessions.reconcilePending();
    const state = f.controller.getState();
    const id = "executionId" in state ? state.executionId : "";
    const terminal = await executionReader({ outcome: "cancelled", partialText: "safe" })("A", id);
    // A concurrent control response supplies independent durable terminal evidence.
    const other = f.sessions.get("B");
    const otherEnd = barrier<void>();
    f.open.mockImplementationOnce(async () => ({ kind: "stream", events: (async function* () { await otherEnd.promise; })() }));
    await other.send({ conversationId: "B", content: "independent" });
    f.cancelExecution.mockResolvedValueOnce({ execution: terminal, cancelAccepted: true });
    const stopping = f.controller.cancel();
    await vi.waitFor(() => expect(f.controller.getState().serverExecution?.terminal).toBe(true));
    expect(f.signals[0].aborted).toBe(true);
    read.resolve(await pendingExecutionReader("A", id)); await Promise.all([checking, stopping]);
    expect(f.controller.getState().serverExecution?.terminal).toBe(true);
    expect(isChatExecutionActive(f.controller.getState())).toBe(false);
    expect(other.getState()).toMatchObject({ kind: "streaming", conversationId: "B" });
    f.controller.dispose(); other.dispose(); otherEnd.resolve(); f.close();
  });

  it("settles EOF delivered at the end of a live status read, without losing the lifecycle transition", async () => {
    const f = fixture("send"); await f.start();
    let closed = false;
    f.controller.subscribe(state => {
      if (!closed && state.serverExecution?.phase === "generating") { closed = true; f.close(); }
    });
    await f.sessions.reconcilePending();
    await vi.waitFor(() => expect(f.controller.getState().kind).toBe("finalization-uncertain"));
    expect(isChatExecutionActive(f.controller.getState())).toBe(true); f.controller.dispose();
  });

  it("keeps intervention pending until overlapping automatic reads finish, then permits a successful manual discovery", async () => {
    const results = barrier<{ results: []; nextCursor: null }>();
    const readActiveExecution = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(null);
    const controller = createChatSendController({ readActiveExecution, readExecutionResults: () => results.promise,
      reconcileHistory: async () => ({ persistedMessageIds: [], regenerateTarget: null }) });
    const recovery = controller.recoverStoppedResults("A");
    await controller.discoverActive("A");
    expect(controller.getState()).toMatchObject({ checking: true, discoveryUnknown: true });
    results.resolve({ results: [], nextCursor: null }); await recovery;
    expect(controller.getState().checking).toBeUndefined();
    expect(controller.getState().discoveryUnknown).toBe(true);
    await controller.retryFinalization({ manual: true });
    expect(controller.getState().discoveryUnknown).toBeUndefined();
    expect(isChatExecutionActive(controller.getState())).toBe(false); controller.dispose();
  });

  it("ignores a discovered execution's late GET failure after its terminal result and a new send", async () => {
    const id = "send.b2xk";
    const live = await pendingExecutionReader("A", id);
    const terminal = await executionReader({ outcome: "cancelled", partialText: "safe" })("A", id);
    let fail!: (error: Error) => void;
    const controller = createChatSendController({ createUuid: () => "new",
      readActiveExecution: async () => live,
      readExecution: () => new Promise((_resolve, reject) => { fail = reject; }),
      readExecutionResults: async () => ({ results: [{ execution: terminal, createdAt: 1 }], nextCursor: null }),
      openExecution: () => new Promise(() => {}),
      reconcileHistory: async () => ({ persistedMessageIds: [], regenerateTarget: null }) });
    await controller.discoverActive("A");
    const checking = controller.retryFinalization();
    await controller.recoverStoppedResults("A");
    void controller.send({ conversationId: "A", content: "new question" });
    fail(new Error("old GET failed")); await checking;
    expect(controller.getState()).toMatchObject({ kind: "sending-user", optimisticUser: { content: "new question" } });
    expect(controller.getState().controlError).toBeUndefined();
    expect(isChatExecutionActive(controller.getState())).toBe(true); controller.dispose();
  });
});
