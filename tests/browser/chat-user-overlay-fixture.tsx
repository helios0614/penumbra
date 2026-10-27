// Real ChatView + StrictMode, synthetic HTTP/WS, no real backend or credentials.
import React from "react";
import { createRoot } from "react-dom/client";
import { ChatView } from "/src/components/chat/ChatView.tsx";
import { ToastProvider } from "/src/components/ui/toast.tsx";
import "/src/index.css";
declare const __OVERLAY_VERSION__: string;
const root = createRoot(document.getElementById("root")!);
const nativeFetch = window.fetch.bind(window), realTimeout = window.setTimeout.bind(window), realClear = window.clearTimeout.bind(window);
let clock = 0, timerSequence = 1_000_000, immediateHeaders = false, holdReceipt = false, holdHistory = false;
const timers = new Map<number, { at: number; run: () => void }>();
// Advance only API transport deadlines; React/layout/realtime timers stay real.
window.setTimeout = ((run: () => void, delay: number, ...args: unknown[]) => {
  if (!new Error().stack?.includes("/src/lib/api.ts")) return realTimeout(run, delay, ...args);
  const id = ++timerSequence; timers.set(id, { at: clock + delay, run: () => run(...args) }); return id;
}) as typeof window.setTimeout;
window.clearTimeout = id => { if (!timers.delete(id)) realClear(id); };
const selection = { connection_id: "synthetic", protocol: "openai_chat_completions", model: "synthetic" };
let serial = 1;
const row = (id: string, owner: string, role: string, content: string) => ({ id, conv_id: owner, role, content, created_at: serial++,
  thinking: null, drift: null, attachments: [], mcp_tool_calls: [], cache_region: null, is_carryover: 0 });
const data: Record<string, ReturnType<typeof row>[]> = { a: [row("a-initial", "a", "assistant", "合成 A")], b: [row("b-initial", "b", "assistant", "合成 B")] };
const receipts = new Map<string, { conv_id: string; client_msg_id: string; user_message_id: string; assistant_message_id: string | null }>();
const requests: { method: string; path: string }[] = [], pendingReceipts: (() => void)[] = [], pendingHistories: (() => void)[] = [];
const executions = new Map<string, { client: string; content: string; userId: string; assistantId: string; source: ReadableStreamDefaultController<Uint8Array>; headers: () => void; signal: AbortSignal; started: boolean }>();
const sockets = new Set<EventTarget>();
class FixtureSocket extends EventTarget {
  static OPEN = 1; static CONNECTING = 0; static CLOSED = 3; readyState = 0;
  constructor() { super(); sockets.add(this); queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event("open")); }); }
  send() {}
  close() { this.readyState = 3; sockets.delete(this); this.dispatchEvent(new CloseEvent("close", { code: 1000, wasClean: true })); }
}
window.WebSocket = FixtureSocket as unknown as typeof WebSocket;
const notify = (owner: string, id = executions.get(owner)?.userId ?? "unrelated") => sockets.forEach(socket => socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "msg_created", data: { id, conv_id: owner } }) })));
const json = (value: unknown, status = 200) => Response.json(value, { status });
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.origin), path = url.pathname, owner = path.split("/")[3];
  if (!path.startsWith("/api/")) return nativeFetch(input, init);
  requests.push({ method: init?.method ?? "GET", path });
  if (init?.signal?.aborted) throw init.signal.reason;
  if (path.endsWith("/send")) {
    const body = JSON.parse(String(init!.body)), client = body.client_msg_id;
    return new Promise((resolve, reject) => {
      let source!: ReadableStreamDefaultController<Uint8Array>;
      const stream = new ReadableStream<Uint8Array>({ start(controller) { source = controller; } });
      const execution = { client, content: body.content, userId: `${owner}-user-${serial}`, assistantId: `${owner}-assistant-${serial}`, source,
        headers: () => resolve(new Response(stream, { headers: { "content-type": "text/event-stream" } })), signal: init!.signal!, started: false };
      executions.set(owner, execution);
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
      if (immediateHeaders) execution.headers();
    });
  }
  if (path.includes("/send-results/")) {
    const client = decodeURIComponent(path.split("/")[5]);
    if (holdReceipt) await new Promise<void>(resolve => pendingReceipts.push(resolve));
    return receipts.has(client) ? json(receipts.get(client)) : json({}, 404);
  }
  if (path === "/api/conversations") return json(["a", "b"].map(id => ({ id, title: `会话 ${id.toUpperCase()}`, model: "synthetic", main_selection: selection, created_at: 1, updated_at: id === "a" ? 3 : 2, message_count: data[id].length })));
  if (path === "/api/main/configuration") return json({ connection_selection: selection, diagnostic: null, allowed_protocols: [selection.protocol], connections: [{ id: "synthetic", name: "synthetic", transport: "direct", enabled: true, credential_configured: true, default_model: "synthetic" }] });
  if (path === "/api/chat/readiness") return json({ ready: true, reason_code: "ready", model_key: "synthetic", setup_action_required: false });
  if (path === "/api/worldbook") return json({ user_name: "合成用户" });
  if (path.endsWith("/messages/window")) {
    const snapshot = structuredClone(data[owner]);
    if (holdHistory && owner === "a") await new Promise<void>((resolve, reject) => {
      pendingHistories.push(resolve); init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
    });
    return json({ conversation_id: owner, anchor_id: null, messages: snapshot, older_cursor: null, newer_cursor: null, has_older: false, has_newer: false, reaches_latest: true });
  }
  return json({}, 404);
};
const mount = () => root.render(<React.StrictMode><ToastProvider><ChatView onBack={() => root.render(null)} /></ToastProvider></React.StrictMode>);
const persist = (owner: string) => {
  const execution = executions.get(owner)!;
  if (!receipts.has(execution.client)) {
    data[owner].push(row(execution.userId, owner, "user", execution.content));
    receipts.set(execution.client, { conv_id: owner, client_msg_id: execution.client, user_message_id: execution.userId, assistant_message_id: null });
  }
  notify(owner);
};
const emit = (owner: string, payload: object) => executions.get(owner)!.source.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`));
const finish = (owner: string) => {
  const execution = executions.get(owner)!; persist(owner); execution.headers();
  if (!execution.started) { emit(owner, { type: "start", id: execution.assistantId }); execution.started = true; }
  emit(owner, { type: "chunk", content: `合成完成 ${owner}` });
  data[owner].push(row(execution.assistantId, owner, "assistant", `合成完成 ${owner}`));
  receipts.get(execution.client)!.assistant_message_id = execution.assistantId; execution.source.close(); notify(owner, execution.assistantId);
};
const check = () => {
  const messages = [...document.querySelectorAll<HTMLElement>("[data-message-id]")];
  const users = messages.filter(node => node.querySelector(".chat-user-meta"));
  const result = { version: __OVERLAY_VERSION__, clock, persistedUsers: Object.fromEntries(Object.entries(data).map(([id, rows]) => [id, rows.filter(row => row.role === "user").length])),
    visibleUserIds: users.map(node => node.dataset.messageId),
    generating: messages.some(node => node.querySelector(".chat-generation[data-active=true]")),
    pendingResult: !!document.querySelector("[data-chat-execution-feedback]"),
    posts: requests.filter(request => request.method === "POST").length, receiptGets: requests.filter(request => request.path.includes("/send-results/")).length,
    sendAborted: [...executions].map(([owner, execution]) => ({ owner, aborted: execution.signal.aborted })) };
  document.getElementById("result")!.textContent = JSON.stringify(result, null, 2);
};
const advance = (duration: number) => { clock += duration; for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.run(); } };
const actions: [string, () => void][] = [
  ["等待响应头", () => { immediateHeaders = false; }], ["立即响应头", () => { immediateHeaders = true; }],
  ["持久化 User A", () => persist("a")], ["持久化 User B", () => persist("b")], ["重新进入 Chat", mount],
  ["前进 20 秒", () => advance(20_000)], ["前进 35 秒", () => advance(35_000)],
  ["完成 Assistant A", () => finish("a")], ["完成 Assistant B", () => finish("b")],
  ["延迟回执", () => { holdReceipt = true; }], ["释放回执", () => { holdReceipt = false; pendingReceipts.splice(0).forEach(resolve => resolve()); }],
  ["延迟 A 历史", () => { holdHistory = true; }], ["释放旧 A 历史", () => { holdHistory = false; pendingHistories.splice(0).forEach(resolve => resolve()); }],
  ["重复乱序 WS", () => { notify("b", "unrelated"); notify("a"); notify("a"); }],
  ["添加独立同文 User A", () => { data.a.push(row(`independent-${serial}`, "a", "user", "synthetic")); notify("a", "independent"); }],
  ["检查断言", check],
];
document.getElementById("controls")!.append(document.createTextNode(`版本：${__OVERLAY_VERSION__}。API 定时器使用可控逻辑时间。`));
actions.forEach(([label, action]) => { const button = document.createElement("button"); button.textContent = label; button.onclick = action; button.style.cssText = "padding:4px;margin:3px;border:1px solid #888"; document.getElementById("controls")!.append(button); });
mount();
