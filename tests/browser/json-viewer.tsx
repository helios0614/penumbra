import React from "react";
import { createRoot } from "react-dom/client";
import { JsonViewer, type JsonValue } from "/src/components/ui/json-viewer.tsx";
import { ToastProvider } from "/src/components/ui/toast.tsx";
import { TooltipProvider } from "/src/components/ui/tooltip.tsx";
import { BubbleList } from "/src/components/chat/BubbleList.tsx";
import { ChatShell } from "/src/components/chat/ChatShell.tsx";
import { Sender } from "/src/components/chat/Sender.tsx";
import { mapMessageHistory } from "/src/domain/message/message-mappers.ts";
import { presentChatMessages } from "/src/components/chat-workspace/presentation/chat-message-presenter.ts";
import { AI_COLOR_PRESETS } from "/src/lib/theme.ts";
import { chatFixture, deep, largeSource, ordinarySource } from "./json-viewer-fixture";
import "/src/index.css";

const params = new URLSearchParams(location.search), chat = params.get("view") === "chat";
document.documentElement.classList.toggle("dark", params.get("appearance") === "dark");
const header = <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-strong">
  <span>JSON 阅读 · 合成验收</span>
  <a href="?view=shared" className="underline">共享组件</a><a href="?view=chat" className="underline">Main Chat MCP</a>
  <select aria-label="明暗模式" defaultValue={params.get("appearance") ?? "light"} onChange={event => document.documentElement.classList.toggle("dark", event.currentTarget.value === "dark")}>
    <option value="light">浅色</option><option value="dark">深色</option>
  </select>
  <select aria-label="AI 主题色" defaultValue="" onChange={event => {
    if (event.currentTarget.value) document.documentElement.style.setProperty("--color-ai", event.currentTarget.value);
    else document.documentElement.style.removeProperty("--color-ai");
  }}><option value="">默认 AI 色</option>{AI_COLOR_PRESETS.map(item => <option key={item.value} value={item.value}>{item.name}</option>)}<option value="#ffffff">纯白</option><option value="#000000">纯黑</option></select>
  <span>只读；不会请求模型或执行工具</span>
</header>;
const samples = [
  { id: "ordinary", title: "普通 JSON · 原格式与完整复制", rawText: ordinarySource },
  { id: "deep", title: "深层 JSON · 16 层长字段名", data: deep as JsonValue },
  { id: "array", title: "数组与原始值", data: [{ items: [0, false, null, "中文"] }, {}, []] },
  { id: "copy-source", title: "独立原始复制文本", data: { value: 0 }, rawText: '{"value":0}', copyText: ' \n{ "value": 0 }\n ' },
  ...([0, false, null, "合法 JSON 字符串"] as const).map((data, index) => ({ id: `primitive-${index}`, title: `原始值 ${index}`, data })),
  { id: "large", title: "大型 JSON · 600 项，主动加载结构", rawText: largeSource },
  { id: "wide", title: "超宽数组 · 保留完整原文", data: Array(1001).fill(0) },
  { id: "plain", title: "非 JSON 返回", rawText: '普通自然语言中出现 {"示例":1}，不要截取或推测。' },
  { id: "invalid", title: "非法 JSON 安全兜底", rawText: '{"未完成": true, <script>window.__jsonExecuted=true</script>' },
];
createRoot(document.getElementById("root")!).render(<React.StrictMode><ToastProvider><TooltipProvider>
  <main className="flex h-dvh min-h-0 flex-col bg-background">{header}
    {chat ? <ChatShell header={<p className="shrink-0 px-4 py-2 text-xs text-muted-foreground">论坛写入 / Profile / 非 JSON / 混合 block / 大结果 / 混合状态 / 旧 MCP</p>}
      composer={<Sender disabled onSend={() => false} placeholder="合成只读验收" />}>
      <BubbleList timelineKey="json-review" messages={presentChatMessages(mapMessageHistory(chatFixture))} />
    </ChatShell> : <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-4 py-4" role="region" aria-label="共享组件验收" tabIndex={0}>
      <div className="mx-auto max-w-3xl space-y-6">{samples.map(({ id, title, ...props }) => <section key={id} data-case={id} className="min-w-0 border-b border-border pb-6">
        <h2 className="mb-2 text-sm font-medium text-foreground">{title}</h2><JsonViewer {...props} label={title} />
      </section>)}</div>
    </div>}
  </main>
</TooltipProvider></ToastProvider></React.StrictMode>);
