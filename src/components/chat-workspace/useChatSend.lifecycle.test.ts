import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useChatSend } from "./useChatSend";
import { useChatWorkspace } from "./useChatWorkspace";
import { createChatRealtimeCoordinator } from "@/application/chat-realtime";
import { hookSession } from "@/components/chat/test-utils/hook-session";
import { mapMessage, type Message } from "@/domain/message";
import { messageWire } from "@/test-fixtures/main-chat-wire";

vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect", "useSyncExternalStore"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
// Keep transport timer/abort assertions scoped to Chat; mailbox ownership is tested separately.
vi.mock("@/application/chat-system-log/request-snapshot-drain", () => ({
  createRequestSnapshotDrain: () => ({ start: () => () => {}, request: () => {}, drain: async () => {}, resume: () => {}, hasDemand: () => false }),
}));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each(["ordinary send", "history refresh", "remount", "conversation switch"] as const)("checks the user receipt at the right time on %s", async scenario => {
  vi.useFakeTimers();
  vi.stubGlobal("window", new EventTarget());
  const conversationId = `receipt-${scenario.replace(" ", "-")}`;
  const user = mapMessage(messageWire({ conv_id: conversationId, id: "saved-user", role: "user" }));
  const assistant = mapMessage(messageWire({ conv_id: conversationId, id: "saved-assistant" }));
  let history: readonly Message[] = [];
  let selectedConversation = conversationId;
  let requestId = "", executionId = "", committed = false, terminal = false;
  let releaseHeaders!: () => void, relay!: ReadableStreamDefaultController<Uint8Array>;
  let releaseHistory: (() => void) | undefined;
  const receiptStatuses: number[] = [];
  const execution = () => ({
    conv_id: conversationId, execution_id: executionId, kind: "send", request_id: requestId,
    phase: terminal ? "terminal" : "generating", terminal, outcome: terminal ? "completed" : null,
    reason: null, cancel_requested: false, user_message_id: user.id, target_message_id: null,
    assistant_message_id: terminal ? assistant.id : null, partial_text: "", owner_available: !terminal, cancelable: !terminal,
  });
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    const path = String(url);
    if (path.endsWith("/send") && init?.method === "POST") {
      requestId = JSON.parse(String(init.body)).client_msg_id;
      executionId = `send.${btoa(requestId).replace(/=+$/, "")}`;
      await new Promise<void>(resolve => { releaseHeaders = resolve; });
      return new Response(new ReadableStream<Uint8Array>({ start(controller) { relay = controller; } }),
        { headers: { "content-type": "text/event-stream" } });
    }
    if (path.endsWith("/executions/active")) return Response.json({ execution: null });
    if (path.endsWith("/executions/results")) return Response.json({ results: [], next_cursor: null });
    if (path.endsWith(`/send-results/${requestId}`)) {
      receiptStatuses.push(committed ? 200 : 404);
      if (!committed) return Response.json({ detail: { code: "send_result_not_found" } }, { status: 404 });
      return Response.json({ conv_id: conversationId, client_msg_id: requestId, user_message_id: user.id,
        assistant_message_id: null, execution: execution() });
    }
    if (path.endsWith(`/executions/${executionId}`)) return Response.json({ execution: execution() });
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  const reconcileHistory = vi.fn(async (owner: string) => {
    if (scenario === "conversation switch") await new Promise<void>(resolve => { releaseHistory = resolve; });
    if (selectedConversation === owner) history = [user, assistant];
    return { persistedMessageIds: [user.id, assistant.id], regenerateTarget: null, assistants: [assistant] };
  });
  const probe = () => useChatSend(reconcileHistory, selectedConversation, history);
  let hooks = hookSession(probe);
  const render = () => { const current = hooks.render(); hooks.commit(); return current; };
  render();
  await vi.advanceTimersByTimeAsync(0);
  const opening = render().send({ conversationId, content: "question" });
  expect(render().state.kind).toBe("sending-user");
  await vi.advanceTimersByTimeAsync(0);
  expect(receiptStatuses).toEqual([]);

  if (scenario === "history refresh") {
    history = [mapMessage(messageWire({ conv_id: conversationId, id: "older-reply" }))];
    render();
    await vi.advanceTimersByTimeAsync(0);
    expect(receiptStatuses).toEqual([404]);
    expect(render().state.kind).toBe("sending-user");
  }
  committed = true;
  if (scenario === "remount") {
    hooks.dispose();
    hooks = hookSession(probe);
    history = [user];
    render();
    await vi.advanceTimersByTimeAsync(0);
    expect(receiptStatuses).toEqual([200]);
    expect(render().state).toMatchObject({ kind: "sending-user", optimisticUser: { persistedMessageId: user.id } });
  }

  releaseHeaders();
  expect(await opening).toBe(true);
  await vi.advanceTimersByTimeAsync(0);
  const expectedReceipts = scenario === "history refresh" ? [404, 200] : [200];
  expect(receiptStatuses).toEqual(expectedReceipts);
  expect(render().state).toMatchObject({ kind: "streaming", optimisticUser: { persistedMessageId: user.id },
    serverExecution: { terminal: false, assistantMessageId: null } });
  const emit = (event: object) => relay.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
  emit({ type: "start", id: assistant.id });
  emit({ type: "chunk", content: "reply" });
  await vi.advanceTimersByTimeAsync(0);
  expect(render().state).toMatchObject({ kind: "streaming", assistant: { assistantMessageId: assistant.id, content: "reply" } });
  terminal = true;
  relay.close();
  await vi.advanceTimersByTimeAsync(0);
  if (scenario === "conversation switch") {
    expect(render().state).toMatchObject({ kind: "idle", serverExecution: { terminal: true } });
    selectedConversation = "receipt-next-conversation";
    history = [];
    expect(render().state.kind).toBe("idle");
    expect(releaseHistory).toBeTypeOf("function");
    releaseHistory!();
    await vi.advanceTimersByTimeAsync(0);
    const selectedState = render().state;
    expect(selectedState).toMatchObject({ kind: "idle", executionConversationId: selectedConversation });
    expect(selectedState.serverExecution).toBeUndefined();
    expect(history).toEqual([]);
  }
  expect(render().getState(conversationId)).toMatchObject({ kind: "idle", confirmedSend: { conversationId, clientMessageId: requestId },
    serverExecution: { terminal: true, userMessageId: user.id, assistantMessageId: assistant.id } });
  expect(receiptStatuses).toEqual(expectedReceipts);
  expect(reconcileHistory).toHaveBeenCalledOnce();
  expect(fetch.mock.calls.filter(([url, init]) => String(url).endsWith("/send") && init?.method === "POST")).toHaveLength(1);
  hooks.dispose();
});

it("keeps the send caller and fetch alive across history/list refresh, rerenders, A/B, and cleanup/remount", async () => {
  vi.useFakeTimers(); vi.stubGlobal("window", new EventTarget());
  const signals: AbortSignal[] = [], streams = new Map<string, ReadableStreamDefaultController<Uint8Array>>();
  const canceledGets: string[] = [], pendingGets: (() => void)[] = [];
  let holdList = false;
  const selection = { connection_id: "synthetic", protocol: "openai_chat_completions", model: "synthetic" };
  const rows = ["lifecycle-A", "lifecycle-B"].map(id => ({ id, title: id, model: "synthetic", main_selection: selection, created_at: 1, updated_at: 1, message_count: 0 }));
  const fetch = vi.fn<typeof globalThis.fetch>(async (path, init) => {
    const url = new URL(String(path), "http://synthetic.test"), owner = url.pathname.split("/")[3];
    if (init?.method === "POST") {
      signals.push(init.signal!);
      return new Response(new ReadableStream<Uint8Array>({ start(controller) { streams.set(owner, controller); } }), { headers: { "content-type": "text/event-stream" } });
    }
    if (url.pathname.endsWith("/executions/results")) return Response.json({results:[],next_cursor:null});
    if (url.pathname.endsWith("/executions/active")) return Response.json({ execution: null });
    if (url.pathname === "/api/conversations") {
      if (holdList) await new Promise<void>((resolve, reject) => {
        pendingGets.push(resolve);
        init?.signal?.addEventListener("abort", () => { canceledGets.push("conversations"); reject(init.signal!.reason); }, { once: true });
      });
      return Response.json(rows);
    }
    if (url.pathname === "/api/main/configuration") return Response.json({ connection_selection: selection, selection: null, diagnostic: null,
      allowed_protocols: [selection.protocol], connections: [{ id: "synthetic", name: "synthetic", enabled: true, credential_configured: true, transport: "direct", default_model: "synthetic" }] });
    if (url.pathname === "/api/chat/readiness") return Response.json({ ready: true, reason_code: "ready", model_key: "synthetic", setup_action_required: false });
    if (url.pathname.endsWith("/messages/window")) return Response.json({ conversation_id: owner, anchor_id: null, messages: [], older_cursor: null, newer_cursor: null, has_older: false, has_newer: false, reaches_latest: true });
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  const probe = () => {
    const workspace = useChatWorkspace({ preferredConversationId: "lifecycle-A" });
    const send = useChatSend(workspace.reloadSelectedConversationHistory, workspace.state.status === "ready" ? workspace.state.workspace.selectedConversationId : null);
    return { workspace, send };
  };
  let hooks = hookSession(probe);
  const render = () => { const result = hooks.render(); hooks.commit(); return result; };
  render(); await vi.advanceTimersByTimeAsync(0);
  let current = render();
  expect(current.workspace.state.status).toBe("ready");
  await vi.advanceTimersByTimeAsync(0); current = render();
  await current.send.send({ conversationId: "lifecycle-A", content: "synthetic" });
  const assertLive = () => expect(signals.map(signal => signal.aborted)).toEqual(signals.map(() => false));
  for (let index = 0; index < 5; index++) { current = render(); assertLive(); }
  await current.workspace.reloadSelectedConversationHistory("lifecycle-A"); render(); assertLive();
  holdList = true;
  const stale = current.workspace.refreshConversationList().catch(() => undefined);
  const latest = current.workspace.refreshConversationList();
  holdList = false; pendingGets.forEach(resolve => resolve());
  await Promise.all([stale, latest]); current = render();
  expect(canceledGets).toEqual(["conversations"]); assertLive();
  current.workspace.selectConversation("lifecycle-B"); await vi.advanceTimersByTimeAsync(0); current = render();
  expect(current.send.state.kind).toBe("idle");
  await vi.advanceTimersByTimeAsync(0); current = render();
  await current.send.send({ conversationId: "lifecycle-B", content: "synthetic" }); assertLive();
  // Same cleanup path used by home navigation / unmount / StrictMode effect replay.
  hooks.dispose(); assertLive();
  hooks = hookSession(probe); render(); await vi.advanceTimersByTimeAsync(0); current = render();
  expect(current.send.state.kind).toBe("streaming"); assertLive();
  current.workspace.selectConversation("lifecycle-B"); await vi.advanceTimersByTimeAsync(0); current = render();
  expect(current.send.state.kind).toBe("streaming"); assertLive();
  expect(fetch.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(2);
  streams.forEach(stream => stream.close()); await vi.advanceTimersByTimeAsync(0);
  expect(current.send.getState("lifecycle-A").kind).toBe("finalization-uncertain");
  expect(current.send.getState("lifecycle-B").kind).toBe("finalization-uncertain");
  assertLive(); hooks.dispose();
  expect(vi.getTimerCount()).toBe(0);
});

it("reads paginated stopped results on entry/remount and GET-only focus/manual recovery", async () => {
  vi.stubGlobal("window", new EventTarget());
  const conv = "refresh-stopped-lifecycle";
  const fact = { conv_id:conv,execution_id:"send.cmVxdWVzdA",kind:"send",request_id:"request",phase:"terminal",terminal:true,
    outcome:"cancelled",reason:"user_cancelled",cancel_requested:true,user_message_id:"deleted-user",target_message_id:null,
    assistant_message_id:null,partial_text:"persisted safe partial",owner_available:false,cancelable:false };
  const fetch = vi.fn<typeof globalThis.fetch>(async (path, init) => {
    expect(init?.method ?? "GET").toBe("GET");
    if (String(path).includes("/executions/results")) return Response.json({results:[{execution:fact,created_at:1}],next_cursor:null});
    if (String(path).endsWith("/executions/active")) return Response.json({execution:null});
    throw new Error(`Unexpected read ${path}`);
  });
  vi.stubGlobal("fetch",fetch);
  const reconcileHistory = async () => ({persistedMessageIds:[],regenerateTarget:null});
  const hooks = hookSession(() => useChatSend(reconcileHistory,conv));
  hooks.render(); hooks.commit();
  await vi.waitFor(() => expect(hooks.render().state.stoppedExecutions).toHaveLength(1));
  await hooks.render().retryFinalization({manual:true});
  window.dispatchEvent(new Event("focus"));
  await vi.waitFor(() => expect(fetch.mock.calls.filter(([path]) => String(path).includes("/executions/results"))).toHaveLength(3));
  expect(hooks.render().state.stoppedExecutions).toHaveLength(1);
  expect(hooks.render().isExecutionActive()).toBe(false); hooks.dispose();
});

it.each(["send", "regenerate"] as const)("keeps %s waiting for headers/start/Thinking through automatic reads without any user review", async kind => {
  vi.useFakeTimers(); vi.stubGlobal("window", new EventTarget());
  const conv = `live-auto-${kind}`;
  let releaseHeaders!: () => void, relay!: ReadableStreamDefaultController<Uint8Array>, signal!: AbortSignal;
  let executionId = "", requestId = "", terminal = false;
  let releaseRead: (() => void) | undefined, holdRead = false;
  const fact = () => ({ conv_id: conv, execution_id: executionId, kind, request_id: requestId,
    phase: terminal ? "terminal" : "generating", terminal, outcome: terminal ? "completed" : null, reason: null,
    cancel_requested: false, user_message_id: kind === "send" ? "saved-user" : null,
    target_message_id: kind === "regenerate" ? "target" : null, assistant_message_id: terminal ? "target" : null,
    partial_text: "", owner_available: !terminal, cancelable: !terminal });
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    const path = String(url);
    if (path.includes("/debug/")) return Response.json({}, { status: 403 });
    if (!path.includes(`/conversations/${conv}/`)) return Response.json({}, { status: 404 });
    if (init?.method === "POST") {
      requestId = kind === "send" ? JSON.parse(String(init.body)).client_msg_id : new Headers(init.headers).get("X-Chat-Execution-Id")!;
      executionId = `${kind}.${btoa(requestId).replace(/=+$/, "")}`;
      signal = init.signal!;
      await new Promise<void>(resolve => { releaseHeaders = resolve; });
      return new Response(new ReadableStream<Uint8Array>({ start(controller) { relay = controller; } }), { headers: { "content-type": "text/event-stream" } });
    }
    if (path.endsWith("/executions/active")) return Response.json({ execution: null });
    if (path.includes("/executions/results")) return Response.json({ results: [], next_cursor: null });
    if (path.includes("/send-results/")) return Response.json({ conv_id: conv, client_msg_id: requestId,
      user_message_id: "saved-user", assistant_message_id: null, execution: fact() });
    if (path.includes("/executions/")) {
      const snapshot = fact();
      if (holdRead) await new Promise<void>(resolve => { releaseRead = resolve; });
      return Response.json({ execution: snapshot });
    }
    throw new Error(`Unexpected route ${path}`);
  });
  vi.stubGlobal("fetch", fetch);
  const reconcileHistory = vi.fn(async () => ({ persistedMessageIds: [], regenerateTarget: null }));
  const hooks = hookSession(() => useChatSend(reconcileHistory, conv));
  hooks.render(); hooks.commit(); await vi.advanceTimersByTimeAsync(0);
  const current = hooks.render();
  const opening = kind === "send" ? current.send({ conversationId: conv, content: "question" })
    : current.regenerate({ conversationId: conv, targetMessageId: "target", targetCreatedAt: 1 });
  await vi.advanceTimersByTimeAsync(300_000);
  // The real WS message notification path refreshes lists even before SSE start.
  // It must not turn that automatic refresh into settlement or manual intervention.
  const realtime = createChatRealtimeCoordinator({
    getContext: () => ({ workspaceAvailable: true, authenticated: true, selectedConversationId: conv,
      execution: { kind: "active", executionKind: kind, conversationId: conv, userMessageId: "saved-user",
        targetMessageId: kind === "regenerate" ? "target" : null, assistantMessageId: null } }),
    reconcileEvent: async () => {}, reconcileAfterReconnect: async () => {},
    refreshConversationList: current.reconcilePending,
  });
  await realtime.handleEvent({ type: "message-created", conversationId: conv, messageId: "saved-user" });
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch.mock.calls.some(([url]) => String(url).includes(`/executions/${executionId}`))).toBe(true);
  expect(current.getState().kind).toBe(kind === "send" ? "sending-user" : "regenerate-streaming");
  releaseHeaders(); await opening; await vi.advanceTimersByTimeAsync(0);
  await current.reconcilePending(); // SSE connected, before start or first model output.
  expect(current.getState().kind).toBe(kind === "send" ? "streaming" : "regenerate-streaming");
  const emit = (value: object) => relay.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`));
  await vi.advanceTimersByTimeAsync(119_000);
  emit({ type: "start", id: "target" });
  emit({ type: "chunk", content: "[THINKING_START]reason[THINKING_END]" });
  await vi.advanceTimersByTimeAsync(0);
  for (const event of ["focus", "online"]) {
    window.dispatchEvent(new Event(event)); await vi.advanceTimersByTimeAsync(0);
    expect(current.getState()).toMatchObject({ kind: kind === "send" ? "streaming" : "regenerate-streaming", assistant: { thinking: "reason", content: "" } });
  }
  await vi.advanceTimersByTimeAsync(119_000);
  holdRead = true;
  const checking = current.reconcilePending(); await vi.advanceTimersByTimeAsync(0);
  emit({ type: "chunk", content: "first body" }); await vi.advanceTimersByTimeAsync(0);
  holdRead = false; releaseRead!(); await checking;
  expect(current.getState()).toMatchObject({ kind: kind === "send" ? "streaming" : "regenerate-streaming", assistant: { content: "first body" } });
  expect(signal.aborted).toBe(false);
  expect(reconcileHistory).not.toHaveBeenCalled();
  // A genuine idle timeout ends only the local reader. A running server stays locked.
  await vi.advanceTimersByTimeAsync(120_000);
  expect(current.getState().kind).toContain("finalization-uncertain");
  expect(current.isExecutionActive()).toBe(true);
  terminal = true; await current.retryFinalization({ manual: true });
  expect(current.isExecutionActive()).toBe(false);
  expect(fetch.mock.calls.filter(([url, init]) => init?.method === "POST" && !String(url).includes("/debug/"))).toHaveLength(1);
  hooks.dispose();
});
