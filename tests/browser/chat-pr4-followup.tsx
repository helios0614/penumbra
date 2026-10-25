/* Synthetic read-only fixture. No backend, command execution, or private user data. */
import React from "react";
import { createRoot } from "react-dom/client";
import { BubbleList } from "/src/components/chat/BubbleList.tsx";
import { mapMessageHistory } from "/src/domain/message/message-mappers.ts";
import { presentChatMessages } from "/src/components/chat-workspace/presentation/chat-message-presenter.ts";
import { TooltipProvider } from "/src/components/ui/tooltip.tsx";
import { ToastProvider } from "/src/components/ui/toast.tsx";
import { ChatShell } from "/src/components/chat/ChatShell.tsx";
import { Sender } from "/src/components/chat/Sender.tsx";
import { polishFixture } from "./chat-pr4-polish-fixture";
import fixture from "./chat-pr4-followup-fixture.json";
import matrix from "./chat-pr4-legacy-matrix.json";
import { AI_COLOR_PRESETS, normalizeThemeColor } from "/src/lib/theme.ts";
import "/src/index.css";

const params = new URLSearchParams(location.search);
const mode = params.get("mode") ?? "paired";
const previewAi = (value: string) => {
  document.documentElement.style.removeProperty("--color-ai");
  document.documentElement.style.removeProperty("--ai-theme-color");
  if (value === "theme") document.documentElement.style.setProperty("--color-ai", "var(--color-theme)");
  else if (normalizeThemeColor(value)) document.documentElement.style.setProperty("--ai-theme-color", value);
};
document.documentElement.classList.toggle("dark", params.get("appearance") === "dark");
previewAi(params.get("ai") ?? "");
const longRow = { ...matrix.cases[0].raw, id:"long-legacy", public_display:null, content:"旧长正文 <script>不可执行</script>\n".repeat(20000) };
const messages = presentChatMessages(mapMessageHistory(mode === "polish" ? polishFixture() : mode === "long" ? [longRow] : mode === "matrix" ? matrix.cases.map(test=>test.paired) : mode === "old" ? fixture.old : fixture.paired));
createRoot(document.getElementById("root")!).render(<React.StrictMode><ToastProvider><TooltipProvider>
  <main className="flex h-dvh min-h-0 flex-col bg-background">
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 text-sm">
      <span>PR4-B 合成验收 · {mode}</span>
      {mode === "polish" && <>
        <select aria-label="合成页面 AI 主题色" defaultValue={params.get("ai") ?? ""} onChange={event => previewAi(event.currentTarget.value)}>
          <option value="">默认 AI 色</option><option value="theme">回退默认主题色</option>
          {AI_COLOR_PRESETS.map(preset => <option key={preset.value} value={preset.value}>{preset.name}</option>)}
          <option value="#FFFFFF">自定义纯白</option><option value="#000000">自定义纯黑</option>
        </select>
        <select aria-label="合成页面明暗模式" defaultValue={params.get("appearance") ?? "light"} onChange={event => document.documentElement.classList.toggle("dark", event.currentTarget.value === "dark")}>
          <option value="light">浅色</option><option value="dark">深色</option>
        </select>
        <a href="?mode=polish&keyboard=1" className="underline">手机键盘检查</a>
      </>}
      <nav className="ml-auto flex flex-wrap gap-3">
        <a href="?mode=paired" className="underline">配套</a><a href="?mode=old" className="underline">旧版本</a>
        <a href="?mode=matrix" className="underline">兼容矩阵</a><a href="?mode=legacy" className="underline">旧前端对照</a>
        <a href="?mode=long" className="underline">超长原文</a>
        <a href="?mode=polish" className="underline">系统通知与 MCP 精修</a>
      </nav>
    </header>
    {mode === "legacy" ? <iframe title="旧前端同组合成历史（禁用脚本）" sandbox="" className="min-h-0 w-full flex-1 border-0"
      srcDoc={`<!doctype html><meta charset="utf-8"><body><p>旧前端实际 renderMessages 输出 · 23 条可读记录</p>${matrix.cases.map(test=>test.legacyHtml).join("")}</body>`} />
      : mode === "polish" ? <ChatShell header={<div className="shrink-0 px-4 py-2 text-xs text-muted-foreground">合成验收 · 本页不会调用模型或工具</div>}
          composer={<Sender disabled={params.get("keyboard") !== "1"} onSend={() => false} placeholder="合成预览，不发送消息" />}>
          <BubbleList timelineKey={mode} messages={messages} />
        </ChatShell> : <BubbleList timelineKey={mode} messages={messages} />}
  </main>
</TooltipProvider></ToastProvider></React.StrictMode>);
