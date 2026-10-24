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
import "/src/index.css";

const mode = new URLSearchParams(location.search).get("mode") ?? "paired";
const longRow = { ...matrix.cases[0].raw, id:"long-legacy", public_display:null, content:"旧长正文 <script>不可执行</script>\n".repeat(20000) };
const messages = presentChatMessages(mapMessageHistory(mode === "polish" ? polishFixture() : mode === "long" ? [longRow] : mode === "matrix" ? matrix.cases.map(test=>test.paired) : mode === "old" ? fixture.old : fixture.paired));
createRoot(document.getElementById("root")!).render(<React.StrictMode><ToastProvider><TooltipProvider>
  <main className="flex h-dvh min-h-0 flex-col bg-background">
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 text-sm">
      <span>PR4-B 合成验收 · {mode}</span>
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
          composer={<Sender disabled placeholder="合成预览，不发送消息" />}>
          <BubbleList timelineKey={mode} messages={messages} />
        </ChatShell> : <BubbleList timelineKey={mode} messages={messages} />}
  </main>
</TooltipProvider></ToastProvider></React.StrictMode>);
