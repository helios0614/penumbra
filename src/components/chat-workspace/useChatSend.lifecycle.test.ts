import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useChatSend } from "./useChatSend";
import { useChatWorkspace } from "./useChatWorkspace";
import { hookSession } from "@/components/chat/test-utils/hook-session";

vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect", "useSyncExternalStore"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
// Keep transport timer/abort assertions scoped to Chat; mailbox ownership is tested separately.
vi.mock("@/application/chat-system-log/request-snapshot-drain", () => ({
  createRequestSnapshotDrain: () => ({ start: () => () => {}, request: () => {}, drain: async () => {}, resume: () => {}, hasDemand: () => false }),
}));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

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
