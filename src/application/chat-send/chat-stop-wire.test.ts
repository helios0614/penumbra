import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatSendController, isChatExecutionActive } from "./chat-send-controller";
import { encodeChatExecutionId, type MainChatExecution } from "@/application/chat-execution/chat-execution-status";
import { composeVisibleChatMessages } from "@/components/chat-workspace/presentation";
import { getChatComposerAction } from "@/components/chat-workspace/chat-sender-policy";
import { mapMessage } from "@/domain/message";
import { messageWire } from "@/test-fixtures/main-chat-wire";

const attempt = "12345678-1234-4234-8234-123456789abc";
function wireFact(kind: "send" | "regenerate" = "send", conv = "A") {
  return { conv_id: conv, execution_id: encodeChatExecutionId(kind, attempt), kind, request_id: attempt,
    phase: "preparing", terminal: false, outcome: null as MainChatExecution["outcome"], reason: null as string | null,
    cancel_requested: false, user_message_id: kind === "send" ? "user" : null, target_message_id: kind === "regenerate" ? "target" : null,
    assistant_message_id: null as string | null, partial_text: "", owner_available: true, cancelable: true };
}
function server(kind: "send" | "regenerate" = "send", conv = "A") {
  const fact = wireFact(kind, conv), calls: { method: string; path: string; headers: Headers }[] = [];
  let relay!: ReadableStreamDefaultController<Uint8Array>;
  let dropCancel = false, cancelStatus = 202;
  let cancelBarrier: Promise<void> | undefined;
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    const path = String(url), method = init?.method ?? "GET";
    calls.push({ method, path, headers: new Headers(init?.headers) });
    if (path.includes("/api/chat/debug/drain")) return Response.json({}, { status: 403 });
    if (path.endsWith("/cancel")) {
      if (cancelStatus === 404 || cancelStatus === 503) return Response.json({ detail: { code: "chat_execution_not_found" } }, { status: cancelStatus });
      if (cancelStatus === 409) return Response.json({ detail: { code: "chat_execution_owner_unavailable", execution: { ...fact, owner_available: false, cancelable: false } } }, { status: 409 });
      if (cancelStatus === 202) { fact.cancel_requested = true; fact.cancelable = false; }
      if (dropCancel) throw new TypeError("synthetic response lost after acceptance");
      const response = Response.json({ execution: { ...fact }, cancel_accepted: cancelStatus === 202 }, { status: cancelStatus });
      await cancelBarrier;
      return response;
    }
    if (method === "POST") return new Response(new ReadableStream<Uint8Array>({ start(controller) { relay = controller; } }), { headers: { "content-type": "text/event-stream" } });
    if (path.endsWith("/executions/active")) return Response.json({ execution: fact.terminal ? null : fact });
    if (path.includes("/executions/results")) return Response.json({ results: fact.terminal && fact.outcome === "cancelled" && fact.partial_text ? [{ execution: fact, created_at: 1 }] : [], next_cursor: null });
    if (path.includes("/executions/")) return Response.json({ execution: fact });
    if (path.includes("/send-results/")) return Response.json({ conv_id: conv, client_msg_id: attempt, user_message_id: "user", assistant_message_id: fact.assistant_message_id, execution: fact });
    throw new Error(`Unexpected mock route: ${method} ${path}`);
  });
  vi.stubGlobal("fetch", fetch);
  return { fact, calls, fetch,
    chunk: (content: string) => relay.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "chunk", content })}\n\n`)),
    start: () => relay.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "start", id: kind === "send" ? "assistant" : "target", drift_enabled: true })}\n\n`)),
    disconnect: () => relay.error(new TypeError("synthetic relay lost")), close: () => relay.close(),
    dropCancel: () => { dropCancel = true; }, cancelStatus: (status: number) => { cancelStatus = status; },
    holdCancel: () => { let release!: () => void; cancelBarrier = new Promise<void>(resolve => { release = resolve; }); return release; },
    terminal: (outcome: MainChatExecution["outcome"] = "cancelled") => Object.assign(fact, { terminal: true, phase: "terminal", outcome, reason: outcome === "cancelled" ? "user_cancelled" : null, owner_available: false, cancelable: false }),
  };
}
afterEach(() => vi.unstubAllGlobals());
describe("S6E2-C real adapters → controller → presentation (Mock HTTP only)", () => {
  it.each(["unchanged", "edited", "deleted"] as const)("restores only current regenerate authority after Stop: %s", async mutation => {
    const s = server("regenerate");
    const target = mapMessage(messageWire({ id: "target", conversation_id: "A", content: "original", thinking: null, drift: null }));
    let history = [target];
    const c = createChatSendController({ createUuid: () => attempt,
      reconcileHistory: async () => ({ persistedMessageIds: history.map(row => row.id), regenerateTarget: history[0] ?? null, assistants: history }) });
    await c.regenerate({ conversationId: "A", targetMessageId: "target", targetCreatedAt: 1 });
    s.start(); s.chunk("safe body");
    await vi.waitFor(() => expect(c.getState()).toMatchObject({ assistant: { content: "safe body" } }));
    expect(composeVisibleChatMessages(history, c.getState(), "A").some(row => row.id === target.id)).toBe(false);
    if (mutation === "edited") history = [{ ...target, content: "edited authority" }];
    if (mutation === "deleted") history = [];
    await c.cancel(); s.fact.partial_text = "safe stopped body"; s.terminal(); await c.retryFinalization();
    const visible = composeVisibleChatMessages(history, c.getState(), "A");
    if (mutation === "deleted") expect(visible.some(row => row.id === target.id)).toBe(false);
    else {
      const restored = visible.find(row => row.id === target.id)!;
      expect(restored.content).toBe(mutation === "edited" ? "edited authority" : "original");
      expect(restored).not.toHaveProperty("executionStatus"); // retains normal persisted-message actions
    }
    expect(visible.filter(row => row.executionStatus === "stopped")).toMatchObject([{ content: "safe stopped body" }]);
    expect(target.content).toBe("original");
    expect(s.calls.filter(call => call.method === "POST" && !call.path.endsWith("/cancel") && !call.path.includes("/debug/"))).toHaveLength(1);
    c.dispose();
  });
  it.each(["send", "regenerate"] as const)("carries the exact %s identity and settles only durable cancellation", async kind => {
    const s = server(kind), target = mapMessage(messageWire({ id: "target", conversation_id: "A", content: "original", thinking: null, drift: null }));
    let history = [target];
    const controller = createChatSendController({ createUuid: () => attempt,
      reconcileHistory: async () => ({ persistedMessageIds: history.map(m => m.id), regenerateTarget: history[0], assistants: history }) });
    if (kind === "send") await controller.send({ conversationId: "A", content: "question" });
    else await controller.regenerate({ conversationId: "A", targetMessageId: "target", targetCreatedAt: 1 });
    const post = s.calls.find(c => c.method === "POST")!;
    if (kind === "regenerate") expect(post.headers.get("X-Chat-Execution-Id")).toBe(attempt);
    expect(controller.getState()).toMatchObject({ executionId: s.fact.execution_id });
    s.start(); s.chunk("safe body[THINKING_START]private[THINKING_END][TODO:unfinished");
    await vi.waitFor(() => expect(JSON.stringify(controller.getState())).toContain("safe body"));
    // Editing/deleting the target never lets this stream replace the durable body.
    history = [{ ...target, content: "edited" }];
    const during = composeVisibleChatMessages(history, controller.getState(), "A");
    if (kind === "send") expect(during[0].content).toBe("edited");
    else expect(during.some(row => row.id === "target")).toBe(false);
    expect(history[0].content).toBe("edited");
    history = []; expect(composeVisibleChatMessages(history, controller.getState(), "A").some(m => m.id === "target")).toBe(false);
    s.disconnect(); await vi.waitFor(() => expect(controller.getState().kind).toContain("uncertain"));
    await controller.cancel(); expect(getChatComposerAction(controller.getState())).toBe("stopping");
    expect(isChatExecutionActive(controller.getState())).toBe(true);
    s.fact.partial_text = "safe body"; s.terminal();
    await controller.retryFinalization();
    expect(getChatComposerAction(controller.getState())).toBe("send");
    const visible = composeVisibleChatMessages(history, controller.getState(), "A");
    expect(visible).toMatchObject([{ content: "safe body", thinking: null, simpleThink: null, executionStatus: "stopped" }]);
    expect(JSON.stringify(visible)).not.toMatch(/private|TODO|unfinished/);
    expect(s.calls.filter(c => c.method === "POST" && !c.path.endsWith("/cancel") && !c.path.includes("/debug/"))).toHaveLength(1);
    controller.dispose();
  });
  it.each([200, 202, 404, 409, 503])("HTTP %s never fabricates terminal evidence", async code => {
    const s = server(); s.cancelStatus(code);
    if (code === 200) { s.fact.phase = "finalizing"; s.fact.cancelable = false; }
    const c = createChatSendController({ createUuid: () => attempt, reconcileHistory: async () => ({ persistedMessageIds: [], regenerateTarget: null }) });
    await c.send({ conversationId: "A", content: "question" }); await c.cancel();
    expect(isChatExecutionActive(c.getState())).toBe(true);
    expect(await c.regenerate({ conversationId: "A", targetMessageId: "target", targetCreatedAt: 1 })).toBe(false);
    c.dispose();
  });
  it("recovers an accepted cancel whose HTTP response was lost, by GET alone", async () => {
    const s = server(); s.dropCancel();
    const c = createChatSendController({ createUuid: () => attempt, reconcileHistory: async () => ({ persistedMessageIds: [], regenerateTarget: null }) });
    await c.send({ conversationId: "A", content: "question" }); await c.cancel();
    expect(isChatExecutionActive(c.getState())).toBe(true);
    s.terminal(); const before = s.calls.length; await c.retryFinalization();
    expect(isChatExecutionActive(c.getState())).toBe(false);
    expect(s.calls.slice(before).every(call => call.method === "GET")).toBe(true);
    expect(composeVisibleChatMessages([], c.getState(), "A")).toEqual([]); c.dispose();
  });
  it("discovers active after refresh and rediscovers terminal partial after losing every in-memory ID", async () => {
    const s = server();
    const c = createChatSendController({ reconcileHistory: async () => ({ persistedMessageIds: [], regenerateTarget: null }) });
    await c.discoverActive("A"); expect(getChatComposerAction(c.getState())).toBe("stop");
    await c.cancel(); s.fact.partial_text = "persisted partial"; s.terminal(); await c.retryFinalization();
    expect(composeVisibleChatMessages([], c.getState(), "A")[0].content).toBe("persisted partial");
    const fresh = createChatSendController({ reconcileHistory: async () => ({ persistedMessageIds: [], regenerateTarget: null }) });
    await fresh.discoverActive("A"); await fresh.recoverStoppedResults("A");
    expect(composeVisibleChatMessages([], fresh.getState(), "A")).toMatchObject([{content:"persisted partial",executionStatus:"stopped"}]);
    expect(s.calls.filter(c => c.method === "POST")).toHaveLength(1); c.dispose(); fresh.dispose();
  });
  it("settles only the matching local execution when a results page proves cancellation", async () => {
    const s = server();
    const c = createChatSendController({createUuid:() => attempt,reconcileHistory:async () => ({persistedMessageIds:[],regenerateTarget:null})});
    await c.send({conversationId:"A",content:"question"});
    s.fact.partial_text = "durable stopped result"; s.terminal();
    await c.recoverStoppedResults("A");
    await vi.waitFor(() => expect(c.getState().kind).toBe("idle"));
    expect(isChatExecutionActive(c.getState())).toBe(false);
    expect(composeVisibleChatMessages([],c.getState(),"A")).toMatchObject([{content:"durable stopped result",executionStatus:"stopped"}]);
    expect(s.calls.filter(call => call.method === "POST")).toHaveLength(1);
    expect(s.fetch.mock.calls.find(([,init]) => init?.method === "POST")?.[1]?.signal?.aborted).toBe(true);
    c.dispose();
  });
  it("ignores an older 202 that arrives after precise GET confirmed terminal", async () => {
    const s = server(), release = s.holdCancel();
    const c = createChatSendController({ reconcileHistory: async () => ({ persistedMessageIds: [], regenerateTarget: null }) });
    await c.discoverActive("A"); const pending = c.cancel();
    await vi.waitFor(() => expect(s.calls.some(call => call.path.endsWith("/cancel"))).toBe(true));
    s.terminal(); await c.retryFinalization(); release(); await pending;
    expect(c.getState().serverExecution).toMatchObject({ terminal: true, outcome: "cancelled" });
    expect(getChatComposerAction(c.getState())).toBe("send"); c.dispose();
  });
  it("stops A independently, keeps B's relay alive and guards repeated Stop", async () => {
    const a = server("send", "A"), b = server("send", "B");
    vi.stubGlobal("fetch", (url: RequestInfo | URL, init?: RequestInit) => String(url).includes("/A/") ? a.fetch(url, init) : b.fetch(url, init));
    const deps = { createUuid: () => attempt, reconcileHistory: async () => ({ persistedMessageIds: [], regenerateTarget: null }) };
    const ca = createChatSendController(deps), cb = createChatSendController(deps);
    await ca.send({ conversationId: "A", content: "A" }); await cb.send({ conversationId: "B", content: "B" });
    await ca.cancel(); await ca.cancel();
    expect(a.calls.filter(call => call.path.endsWith("/cancel"))).toHaveLength(1);
    a.terminal(); a.close(); await vi.waitFor(() => expect(isChatExecutionActive(ca.getState())).toBe(false));
    expect(isChatExecutionActive(cb.getState())).toBe(true);
    expect(b.calls.some(call => call.path.endsWith("/cancel"))).toBe(false);
    const signal = b.fetch.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.signal;
    expect(signal?.aborted).toBe(false); ca.dispose(); cb.dispose();
  });
  it("places a stopped result at its durable identity, ahead of later messages without reviving deleted anchors", async () => {
    const s = server(); s.fact.partial_text = "old partial";
    const c = createChatSendController({ reconcileHistory: async () => ({ persistedMessageIds: [], regenerateTarget: null }) });
    await c.discoverActive("A"); s.terminal(); await c.retryFinalization();
    const rows = [mapMessage(messageWire({ id: "user", role: "user", content: "original" })),
      mapMessage(messageWire({ id: "next", role: "user", content: "next question" }))];
    expect(composeVisibleChatMessages(rows, c.getState(), "A").map(row => row.id)).toEqual(["user", `${s.fact.execution_id}:stopped`, "next"]);
    expect(composeVisibleChatMessages(rows.slice(1), c.getState(), "A").some(row => row.id === "user")).toBe(false); c.dispose();
  });
});
