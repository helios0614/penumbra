/* Real Workspace/Send/UI; synthetic transport only. No backend or remote media. */
import React, { useEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { ChatWorkspaceView } from "/src/components/chat/ChatView.tsx";
import { createChatWorkspaceController } from "/src/components/chat-workspace/chat-workspace-controller.ts";
import { useChatSend } from "/src/components/chat-workspace/useChatSend.ts";
import { ToastProvider } from "/src/components/ui/toast.tsx";
import {
  mainConfigurationWire,
  readinessWire,
  messageWire,
} from "/src/test-fixtures/main-chat-wire.ts";
import { normalizeSearch } from "/src/components/chat/search-highlight.tsx";
import { insertableBody } from "/src/components/chat/insertable-body.ts";
import "/src/index.css";

const requests: string[] = [];
const visual = new URLSearchParams(location.search).get("visual") === "1";
const message = (i: number) =>
  messageWire({
    id: `message-${i}`,
    conv_id: "conv_a",
    created_at: 1792800000 + Math.floor(i / 600),
    role: i % 2 ? "assistant" : "user",
    drift: null,
    thinking: null,
    content:
      i === 2
        ? "很久以前的 **古老关键词** 与 [公开文字](https://example.invalid/PRIVATE_DESTINATION)。\n\n```js\nconst ancient = '古老关键词';\n```"
        : i % 91 === 0
          ? `第 ${i} 条公开关键词消息。`
          : visual
            ? `第 ${i} 条合成聊天：今天把书架和工作记录慢慢整理好，搜索时也希望看见熟悉的上下文。公开关键词帮助我们找到过去的对话，但此刻的阅读位置应该安静地保留。\n\n聊天里的暖色和冷色气泡交错，有较长的正文、日期和不同长度的句子。这些文字只用于检查前景纸面是否清楚，搜索面板下面仍有完整的聊天记录。`
            : `第 ${i} 条合成历史，正文可用于阅读位置验证。`,
  });
const rows = Array.from({ length: 1300 }, (_, i) => message(i));
rows[3] = messageWire({
  id: "message-3",
  conv_id: "conv_a",
  role: "system",
  created_at: 1792800000,
  content: "",
  drift: null,
  thinking: null,
  public_view_version: 1,
  public_display: {
    version: 1,
    kind: "operation",
    capability: "TODO",
    title: "旧系统通知",
    status: "success",
    fields: [{ label: "内容", text: "公开系统关键词，展开后应能阅读。" }],
    notices: [],
  },
});
function segments(row: (typeof rows)[number]) {
  if (row.role === "system")
    return [
      {
        segment_key: "display.field:0",
        text: "公开系统关键词，展开后应能阅读。",
      },
    ];
  return [{ segment_key: "body", text: insertableBody(row.content) }];
}
function wire(row: (typeof rows)[number]) {
  return { ...row, search_segments: segments(row) };
}
function windowPage(start: number, end: number, anchor: string | null = null) {
  return {
    conversation_id: "conv_a",
    anchor_id: anchor,
    messages: rows.slice(start, end).map(wire),
    older_cursor: start > 0 ? `older-${start}` : null,
    newer_cursor: end < rows.length ? `newer-${end}` : null,
    has_older: start > 0,
    has_newer: end < rows.length,
    reaches_latest: end >= rows.length,
    page_status: "ready",
  };
}
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: { "content-type": "application/json" },
  });
const original = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
    location.href,
  );
  if (url.origin !== location.origin) throw Error("合成验收禁止远端请求");
  if (!url.pathname.startsWith("/api/")) {
    if (url.pathname.startsWith("/tests/browser/"))
      return original(input, init);
    throw Error("合成验收禁止其他请求");
  }
  requests.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
  if (url.pathname === "/api/conversations")
    return json([
      {
        id: "conv_a",
        title: "PR6 合成历史 · 1300 条消息",
        model: "legacy",
        created_at: 1,
        updated_at: 2,
        message_count: rows.length,
      },
    ]);
  if (url.pathname === "/api/main/configuration")
    return json(mainConfigurationWire());
  if (url.pathname === "/api/chat/readiness") return json(readinessWire());
  if (url.pathname.endsWith("/messages/window")) {
    const anchor = url.searchParams.get("anchor_id");
    if (anchor) {
      const i = rows.findIndex((m) => m.id === anchor);
      if (i < 0) return json({ detail: { code: "history_not_found" } }, 404);
      return json(
        windowPage(Math.max(0, i - 25), Math.min(rows.length, i + 26), anchor),
      );
    }
    const older = url.searchParams.get("before_cursor"),
      newer = url.searchParams.get("after_cursor"),
      limit = Number(url.searchParams.get("limit") ?? 50);
    if (older) {
      const end = Number(older.split("-")[1]);
      return json(windowPage(Math.max(0, end - limit), end));
    }
    if (newer) {
      const start = Number(newer.split("-")[1]);
      return json(windowPage(start, Math.min(rows.length, start + limit)));
    }
    return json(windowPage(Math.max(0, rows.length - limit), rows.length));
  }
  if (url.pathname.endsWith("/messages/search")) {
    const q = normalizeSearch(url.searchParams.get("q") ?? "");
    if (q === "slow") await new Promise((resolve) => setTimeout(resolve, 700));
    const matches = rows
      .slice()
      .reverse()
      .flatMap((row) => {
        const snippets = segments(row)
          .filter((s) => normalizeSearch(s.text).includes(q))
          .map((s) => ({ ...s, match_ranges: [[0, 1]] }));
        return snippets.length
          ? [
              {
                message_id: row.id,
                created_at: row.created_at,
                role: row.role,
                snippets,
                public_revision: row.content,
              },
            ]
          : [];
      });
    const start = Number(url.searchParams.get("cursor") ?? 0),
      end = Math.min(matches.length, start + 20);
    return json({
      conversation_id: "conv_a",
      match_version: 1,
      items: matches.slice(start, end),
      next_cursor: end < matches.length ? String(end) : null,
      has_more: end < matches.length,
      page_status: end < matches.length ? "ready" : "complete",
      total: null,
    });
  }
  if (url.pathname.endsWith("/send")) {
    const body = JSON.parse(String(init?.body));
    const now = 1792800010;
    rows.push(
      messageWire({
        id: "generated-user",
        conv_id: "conv_a",
        role: "user",
        content: body.content,
        created_at: now,
        drift: null,
        thinking: null,
      }),
    );
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream({
        start(controller) {
          const emit = (event: string, data: object) =>
            controller.enqueue(
              encoder.encode(
                `event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`,
              ),
            );
          emit("start", { id: "generated-assistant" });
          emit("chunk", { content: "合成正在生成的公开回复" });
          setTimeout(() => {
            rows.push(
              messageWire({
                id: "generated-assistant",
                conv_id: "conv_a",
                content: "合成正在生成的公开回复",
                created_at: now + 1,
                drift: null,
                thinking: null,
              }),
            );
            controller.close();
          }, 1500);
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
  }
  if (url.pathname === "/api/settings/user")
    return json({ user_name: "合成用户" });
  throw Error(`未实现合成请求 ${url.pathname}`);
};
const workspace = createChatWorkspaceController();
function Fixture() {
  const state = useSyncExternalStore(
    workspace.subscribe,
    workspace.getState,
    workspace.getState,
  );
  const send = useChatSend(workspace.reloadSelectedConversationHistory);
  useEffect(() => {
    void workspace.load();
    return () => workspace.dispose();
  }, []);
  (window as unknown as { pr6: unknown }).pr6 = {
    requests,
    rows,
    workspace,
    send,
    generate: () =>
      send.send({ conversationId: "conv_a", content: "请生成合成回复" }),
    deleteTarget: async () => {
      const i = rows.findIndex((m) => m.id === "message-2");
      if (i >= 0) rows.splice(i, 1);
      await workspace.reconcileSelectedConversationRealtimeEvent({
        type: "message-deleted",
        conversationId: "conv_a",
        messageId: "message-2",
      });
    },
  };
  return (
    <main
      className="flex h-dvh min-h-0 flex-col bg-background text-foreground"
      style={
        visual
          ? {
              background:
                "linear-gradient(135deg, var(--color-amber-subtle), var(--color-background) 50%, var(--color-ai-subtle))",
            }
          : undefined
      }
    >
      <div className="shrink-0 border-b border-border px-3 py-1 text-[11px] text-muted-foreground">
        PR6 合成验收 · 1300 条 · 无真实后端{" "}
        <button
          className="ml-3 underline"
          onClick={() =>
            void send.send({
              conversationId: "conv_a",
              content: "请生成合成回复",
            })
          }
        >
          模拟生成
        </button>
      </div>
      <ChatWorkspaceView
        state={state}
        onRetry={() => void workspace.load()}
        onSelectConversation={(id) => void workspace.selectConversation(id)}
        onRetryConversationSwitch={() => {}}
        onLoadOlderHistory={workspace.loadOlderHistory}
        onLoadNewerHistory={workspace.loadNewerHistory}
        onNavigateHistory={workspace.navigateHistory}
        onBack={() => {
          document.body.dataset.fixtureBack = "true";
        }}
        sendState={send.state}
        onSend={(content) => send.send({ conversationId: "conv_a", content })}
        onRetryFinalization={send.retryFinalization}
      />
    </main>
  );
}
document.documentElement.classList.toggle(
  "dark",
  new URLSearchParams(location.search).get("dark") === "1",
);
createRoot(document.getElementById("root")!).render(
  <ToastProvider>
    <Fixture />
  </ToastProvider>,
);
