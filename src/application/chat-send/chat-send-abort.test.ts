import { afterEach, describe, expect, it, vi } from "vitest";
import { openSendExecution } from "@/application/chat-execution";
import { readChatSendResult } from "./chat-send-result";
import { createChatExecutionSessions } from "./chat-execution-sessions";
import { createChatSendController } from "./chat-send-controller";

// Keep transport timer/abort assertions scoped to Chat; mailbox ownership is tested separately.
vi.mock("@/application/chat-system-log/request-snapshot-drain", () => ({
  createRequestSnapshotDrain: () => ({ start: () => () => {}, request: () => {}, drain: async () => {}, resume: () => {}, hasDemand: () => false }),
}));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

// Test-only trace: identities, owner, reason and ordering; never request bodies/headers.
function transport() {
  vi.useFakeTimers();
  const trace: { at: number; source: string; owner?: string; stack?: string }[] = [];
  const abort = AbortController.prototype.abort;
  vi.spyOn(AbortController.prototype, "abort").mockImplementation(function (this: AbortController, reason) {
    trace.push({ at: Date.now(), source: "abort", stack: new Error().stack });
    return abort.call(this, reason);
  });
  let source!: ReadableStreamDefaultController<Uint8Array>;
  let headers!: () => void;
  let networkFailure!: () => void;
  let signal!: AbortSignal;
  const body = new ReadableStream<Uint8Array>({
    start(controller) { source = controller; },
    cancel() { trace.push({ at: Date.now(), source: "reader.cancel" }); },
  });
  const fetch = vi.fn<typeof globalThis.fetch>((url, init) => {
    signal = init!.signal!;
    const segments = String(url).split("/");
    trace.push({ at: Date.now(), source: "POST", owner: segments[segments.length - 2] });
    return new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      headers = () => resolve(new Response(body, { headers: { "content-type": "text/event-stream" } }));
      networkFailure = () => reject(new TypeError("synthetic network disconnect"));
    });
  });
  vi.stubGlobal("fetch", fetch);
  return {
    trace, fetch, body, get signal() { return signal; },
    headers: () => headers(), disconnect: () => networkFailure(),
    emit: (value: object) => source.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`)),
    close: () => source.close(),
  };
}
const emptyHistory = async () => ({ persistedMessageIds: [], regenerateTarget: null, assistants: [] });

describe("send abort provenance through the production transport", () => {
  it("reproduces an explicit 30s header abort with the execution caller still alive", async () => {
    const wire = transport(), caller = new AbortController();
    const pending = openSendExecution("synthetic-A", { content: "synthetic" }, { signal: caller.signal, timeoutMs: 30_000 });
    const rejected = expect(pending).rejects.toMatchObject({ code: "TIMEOUT" });
    const began = Date.now();
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(caller.signal.aborted).toBe(false);
    expect(wire.signal.aborted).toBe(true);
    expect(wire.trace.filter(row => row.source === "abort")).toMatchObject([{ at: began + 30_000, stack: expect.stringContaining("api.ts") }]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("distinguishes a 120s delayed-start idle timeout from caller disposal", async () => {
    const wire = transport(), caller = new AbortController();
    const pending = openSendExecution("synthetic-A", { content: "synthetic" }, { signal: caller.signal });
    wire.headers();
    const result = await pending;
    if (result.kind !== "stream") throw new Error("Expected stream");
    const read = (async () => { for await (const _event of result.events) { /* delayed start */ } })();
    const rejected = expect(read).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(119_999);
    expect(wire.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1); await rejected;
    expect(caller.signal.aborted).toBe(false);
    expect(wire.trace.map(row => row.source)).toEqual(["POST", "abort", "reader.cancel"]);
    expect(wire.body.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not abort a slow but active stream", async () => {
    const wire = transport();
    const pending = openSendExecution("synthetic-A", { content: "synthetic" }); wire.headers();
    const result = await pending;
    if (result.kind !== "stream") throw new Error("Expected stream");
    const read = (async () => { for await (const _event of result.events) { /* consume */ } })();
    for (let index = 0; index < 4; index++) {
      await vi.advanceTimersByTimeAsync(90_000);
      wire.emit({ type: index ? "chunk" : "start", id: "reply", content: "synthetic" });
      await vi.advanceTimersByTimeAsync(0);
      expect(wire.signal.aborted).toBe(false);
    }
    wire.close(); await read;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(wire.trace.map(row => row.source)).toEqual(["POST"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("identifies reader cancellation after a protocol error without any controller abort", async () => {
    const wire = transport();
    const sessions = createChatExecutionSessions({ reconcileHistory: emptyHistory, createUuid: () => "synthetic-client" });
    const pending = sessions.get("synthetic-A").send({ conversationId: "synthetic-A", content: "synthetic" });
    wire.headers(); await pending;
    wire.emit({ type: "start", id: "" });
    await vi.advanceTimersByTimeAsync(0);
    expect(sessions.state("synthetic-A")).toMatchObject({ kind: "finalization-uncertain", executionError: { code: "contract" } });
    expect(wire.signal.aborted).toBe(false);
    expect(wire.trace.map(row => row.source)).toEqual(["POST", "reader.cancel"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("identifies real network rejection without an AbortController call", async () => {
    const wire = transport();
    const controller = createChatSendController({ reconcileHistory: emptyHistory });
    const pending = controller.send({ conversationId: "synthetic-A", content: "synthetic" });
    wire.disconnect(); await pending; await vi.advanceTimersByTimeAsync(0);
    expect(controller.getState()).toMatchObject({ kind: "finalization-uncertain", executionError: { code: "network" } });
    expect(wire.trace.map(row => row.source)).toEqual(["POST"]);
    expect(wire.signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("locates explicit controller disposal as a different caller abort path", async () => {
    const wire = transport();
    const controller = createChatSendController({ reconcileHistory: emptyHistory });
    const pending = controller.send({ conversationId: "synthetic-A", content: "synthetic" });
    controller.dispose(); await pending;
    expect(wire.trace.filter(row => row.source === "abort")).toHaveLength(2);
    expect(wire.trace.find(row => row.source === "abort")?.stack).toContain("chat-send-controller.ts");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses the original client_msg_id after timeout, retains unknown until persisted, and never resends", async () => {
    const wire = transport();
    const sendFetch = globalThis.fetch;
    let persisted = false;
    const fetch = vi.fn<typeof globalThis.fetch>((url, init) => {
      if (init?.method === "POST") return sendFetch(url, init);
      wire.trace.push({ at: Date.now(), source: "receipt-GET", owner: "synthetic-A" });
      expect(String(url)).toBe("/api/conversations/synthetic-A/send-results/synthetic-client");
      return Promise.resolve(Response.json({ conv_id: "synthetic-A", client_msg_id: "synthetic-client", user_message_id: "saved-user", assistant_message_id: persisted ? "saved-assistant" : null }));
    });
    vi.stubGlobal("fetch", fetch);
    const sessions = createChatExecutionSessions({ createUuid: () => "synthetic-client", lookupSendResult: readChatSendResult,
      openExecution: (owner, input, options) => openSendExecution(owner, input, { ...options, timeoutMs: 30_000 }),
      reconcileHistory: async () => ({ persistedMessageIds: ["saved-user", ...(persisted ? ["saved-assistant"] : [])], regenerateTarget: null,
        assistants: persisted ? [{ id: "saved-assistant", content: "synthetic", thinking: null, simpleThink: null }] : [] }),
    });
    const pending = sessions.get("synthetic-A").send({ conversationId: "synthetic-A", content: "synthetic" });
    await vi.advanceTimersByTimeAsync(30_000); await pending;
    expect(sessions.state("synthetic-A")).toMatchObject({ kind: "finalization-uncertain", executionError: { code: "timeout" } });
    expect(wire.trace.map(row => row.source)).toEqual(["POST", "abort", "receipt-GET"]);
    expect(await sessions.get("synthetic-A").send({ conversationId: "synthetic-A", content: "synthetic" })).toBe(false);
    expect(sessions.state("synthetic-B")).toEqual({ kind: "idle" });
    persisted = true; await sessions.reconcilePending();
    expect(sessions.state("synthetic-A")).toMatchObject({ kind: "idle", confirmedSend: { conversationId: "synthetic-A", clientMessageId: "synthetic-client" } });
    expect(wire.fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
