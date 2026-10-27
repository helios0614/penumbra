/* Test-only, real ChatView/StrictMode. All business HTTP/WS is synthetic.
 * Trace contains only fixture IDs, owner, reason names, timestamps and callsites.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { ChatView } from "/src/components/chat/ChatView.tsx";
import { ToastProvider } from "/src/components/ui/toast.tsx";
import { loadChatWorkspace } from "/src/application/chat-workspace";
import "/src/index.css";

const root = createRoot(document.getElementById("root")!);
const nativeFetch = window.fetch.bind(window), began = performance.now();
const trace: object[] = [], streams = new Map<string, { source: ReadableStreamDefaultController<Uint8Array>; signal: AbortSignal; client: string }>();
const row = (id: string, owner: string, role: string, content: string) => ({ id, conv_id: owner, role, content, created_at: Date.now() / 1000, thinking: null, drift: null, attachments: [], is_carryover: 0, mcp_tool_calls: [], cache_region: null });
const messages = { a: [row("a-initial", "a", "assistant", "合成会话 A")], b: [row("b-initial", "b", "assistant", "合成会话 B")] };
const record = (event: object) => {
  trace.push({ ms: Math.round(performance.now() - began), ...event });
  document.getElementById("trace")!.textContent = JSON.stringify(trace, null, 2);
};
const abort = AbortController.prototype.abort;
AbortController.prototype.abort = function (reason?: unknown) {
  const execution = [...streams].find(([, value]) => value.signal === this.signal);
  record({ kind: "abort", sendOwner: execution?.[0] ?? null, reason: reason instanceof Error ? reason.name : typeof reason,
    callsite: new Error().stack?.split("\n").slice(2, 5).join("\n") });
  return abort.call(this, reason);
};
const selection = { connection_id: "synthetic", protocol: "openai_chat_completions", model: "synthetic" };
let holdList = false;
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.origin), owner = url.pathname.split("/")[3] as keyof typeof messages;
  if (!url.pathname.startsWith("/api/")) return nativeFetch(input, init);
  if (url.pathname.endsWith("/send")) {
    const client = JSON.parse(String(init?.body)).client_msg_id;
    record({ kind: "POST", owner, client });
    init!.signal!.addEventListener("abort", () => record({ kind: "send-signal-aborted", owner, client }), { once: true });
    return new Response(new ReadableStream<Uint8Array>({
      start(source) { streams.set(owner, { source, signal: init!.signal!, client }); },
      cancel(reason) { record({ kind: "send-reader-cancel", owner, reason: reason instanceof Error ? reason.name : typeof reason }); },
    }), { headers: { "content-type": "text/event-stream" } });
  }
  record({ kind: "GET", path: url.pathname, owner });
  if (url.pathname === "/api/conversations") {
    if (holdList) await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 500);
      init?.signal?.addEventListener("abort", () => { clearTimeout(timer); record({ kind: "stale-GET-cancel", path: url.pathname }); reject(init.signal!.reason); }, { once: true });
    });
    return Response.json(["a", "b"].map(id => ({ id, title: `会话 ${id.toUpperCase()}`, model: "synthetic", main_selection: selection, created_at: 1, updated_at: id === "a" ? 3 : 2, message_count: 1 })));
  }
  if (url.pathname === "/api/main/configuration") return Response.json({ connection_selection: selection, diagnostic: null, allowed_protocols: [selection.protocol],
    connections: [{ id: "synthetic", name: "synthetic", transport: "direct", enabled: true, default_model: "synthetic", credential_configured: true }] });
  if (url.pathname === "/api/chat/readiness") return Response.json({ ready: true, model_key: "synthetic", reason_code: "ready", setup_action_required: false });
  if (url.pathname === "/api/worldbook") return Response.json({ user_name: "合成用户" });
  if (url.pathname.endsWith("/messages/window")) return Response.json({ conversation_id: owner, anchor_id: null, messages: messages[owner],
    older_cursor: null, newer_cursor: null, has_older: false, has_newer: false, reaches_latest: true });
  return Response.json({}, { status: 404 });
};
const sockets = new Set<EventTarget>();
class FixtureSocket extends EventTarget {
  static OPEN = 1; static CONNECTING = 0; static CLOSED = 3;
  readyState = 0;
  constructor() { super(); sockets.add(this); queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event("open")); }); }
  send() { /* No commands in this fixture. */ }
  close() { this.readyState = 3; sockets.delete(this); this.dispatchEvent(new CloseEvent("close", { code: 1000, wasClean: true })); }
}
window.WebSocket = FixtureSocket as unknown as typeof WebSocket;
const notify = (type: string, owner = "a") => sockets.forEach(socket => socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type, data: { id: "fixture-dirty", conv_id: owner } }) })));
const mount = () => root.render(<React.StrictMode><ToastProvider><ChatView onBack={() => { record({ kind: "home-unmount" }); root.render(null); }} /></ToastProvider></React.StrictMode>);
const emit = (owner: string, payload: object) => streams.get(owner)!.source.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`));
const complete = (owner: keyof typeof messages) => {
  emit(owner, { type: "start", id: `${owner}-reply` }); emit(owner, { type: "chunk", content: `合成完成 ${owner}` });
  messages[owner].push(row(`${owner}-user`, owner, "user", "synthetic"), row(`${owner}-reply`, owner, "assistant", `合成完成 ${owner}`));
  streams.get(owner)!.source.close(); record({ kind: "SSE-EOF", owner });
};
const controls: [string, () => void][] = [
  ["StrictMode rerender", mount], ["重新进入聊天", mount],
  ["History refetch A", () => notify("msg_created")],
  ["并发刷新列表", () => { holdList = true; notify("conv_updated"); notify("conv_updated"); setTimeout(() => { holdList = false; }, 600); }],
  ["完成 A", () => complete("a")], ["完成 B", () => complete("b")],
  ["检查 send signals", () => record({ kind: "check", sends: [...streams].map(([owner, value]) => ({ owner, client: value.client, aborted: value.signal.aborted })), posts: trace.filter((item: { kind?: string }) => item.kind === "POST").length })],
];
controls.forEach(([label, action]) => { const button = document.createElement("button"); button.textContent = label; button.onclick = action; button.style.cssText = "padding:6px;margin:4px;border:1px solid #888"; document.getElementById("controls")!.append(button); });
void loadChatWorkspace().then(() => mount(), error => record({ kind: "fixture-validation-error", error: String(error) }));
