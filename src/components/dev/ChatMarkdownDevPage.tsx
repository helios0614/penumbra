import { useEffect, useMemo, useState } from "react";
import { Bubble } from "@/components/chat/Bubble";
import { splitAssistantBubbles } from "@/components/chat/bubble-chunks";
import { appendAssistantChunk, createStreamingAssistantAccumulator, flushAssistantAccumulator } from "@/application/chat-send/chat-send-accumulator";
import { presentChatMessage } from "@/components/chat-workspace/presentation/chat-message-presenter";
import { mapMessage } from "@/domain/message";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import { markdownCases } from "./chat-markdown-cases";

const emptyStream = () => ({ offset: 0, accumulator: createStreamingAssistantAccumulator("markdown-dev", 50) });
const groups = [...new Set(markdownCases.map(item => item.group))];

/** DEV-only synthetic adapter. Rendering and filtering stay in production modules. */
export default function ChatMarkdownDevPage() {
  const [caseId, setCaseId] = useState(markdownCases[0].id);
  const preset = markdownCases.find(item => item.id === caseId)!;
  const [source, setSource] = useState(preset.content);
  const [width, setWidth] = useState(390);
  const [mode, setMode] = useState("full");
  const [running, setRunning] = useState(false);
  const [stream, setStream] = useState(emptyStream);

  useEffect(() => {
    if (!running || mode !== "stream") return;
    if (stream.offset >= source.length) { setRunning(false); return; }
    const timer = window.setTimeout(() => setStream(previous => {
      const offset = Math.min(source.length, previous.offset + 8);
      return { offset, accumulator: appendAssistantChunk(previous.accumulator, source.slice(previous.offset, offset)) };
    }), 40);
    return () => window.clearTimeout(timer);
  }, [running, mode, stream.offset, source]);

  const historyMessage = useMemo(() => presentChatMessage(mapMessage({
    id: "markdown-dev:assistant", conv_id: "synthetic-markdown", role: "assistant", content: source,
    created_at: 50, thinking: null, drift: null, attachments: [], is_carryover: 0, mcp_tool_calls: [], cache_region: null,
  }))!, [source]);
  const streamed = stream.offset >= source.length ? flushAssistantAccumulator(stream.accumulator) : stream.accumulator;
  const message = mode === "full" ? historyMessage : {
    ...historyMessage, content: streamed.message.content, thinking: streamed.message.thinking, simpleThink: streamed.message.simpleThink,
    ...(stream.offset < source.length ? { executionStatus: "streaming" as const } : {}),
  };
  const count = splitAssistantBubbles(message.content).length;
  const resetStream = () => { setRunning(false); setStream(emptyStream()); };
  const edit = (text: string) => { setSource(text); resetStream(); };

  return <ToastProvider><TooltipProvider>
    <main className="min-h-dvh bg-background py-5 text-sm text-foreground">
      <header className="mx-auto max-w-4xl space-y-2 px-4">
        <h1 className="text-xl font-semibold">Chat Markdown 开发验收</h1>
        <p>仅合成数据 · 真实 Bubble / MarkdownRenderer · 无聊天 API 或登录依赖</p>
        <p className="text-muted-foreground">宽度档位模拟预览容器，不代表移动真机验收。气泡数仅统计正文，不包含生成等待提示。</p>
      </header>
      <section className="mx-auto my-4 max-w-4xl space-y-3 px-4" aria-label="验收控制">
        <label className="flex flex-wrap items-center gap-2">测试案例
          <select aria-label="测试案例" className="min-w-0 max-w-full rounded border bg-background p-2" value={caseId}
            onChange={event => { const next = markdownCases.find(item => item.id === event.target.value)!; setCaseId(next.id); edit(next.content); }}>
            {groups.map(group => <optgroup key={group} label={group}>
              {markdownCases.filter(item => item.group === group).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </optgroup>)}
          </select>
        </label>
        <p data-case-expectation>{preset.expected} 默认完整正文：{preset.bubbles} 泡（编辑后以实际结果为准）。</p>
        {preset.limitation && <p role="note" className="rounded border border-border p-2" data-known-limitation>{preset.limitation}</p>}
        <fieldset className="flex flex-wrap gap-3"><legend>预览容器宽度</legend>
          {[[320, '320px'], [390, '390px'], [768, '桌面 768px']].map(([value, label]) => <label key={value} className="flex items-center gap-1">
            <input type="radio" name="preview-width" checked={width === value} onChange={() => setWidth(Number(value))} />{label}
          </label>)}
        </fieldset>
        <div className="flex flex-wrap items-center gap-2">
          <label>显示模式 <select aria-label="显示模式" className="rounded border bg-background p-2" value={mode} onChange={event => { setMode(event.target.value); resetStream(); }}>
            <option value="full">完整显示</option><option value="stream">模拟流式输出</option>
          </select></label>
          {mode === "stream" && <>
            <Button variant="outline" onClick={() => setRunning(value => !value)} disabled={stream.offset >= source.length}>{running ? '暂停' : '继续 / 开始'}</Button>
            <Button variant="outline" onClick={resetStream}>重置流式</Button>
            <span data-stream-progress>{stream.offset} / {source.length} 字符</span>
          </>}
          <Button variant="outline" onClick={() => edit(preset.content)}>恢复默认文本</Button>
        </div>
        <p>当前正文视觉气泡：<output data-bubble-count>{count}</output>；预览容器目标宽度：{width}px。</p>
        <p className="text-muted-foreground">表格 / 代码可直接横向滑动。流式每 40ms 追加最多 8 个 UTF-16 字符，可暂停后检查当前前缀。</p>
      </section>
      <section aria-label="真实聊天气泡预览" className="w-full overflow-x-auto border-y border-border py-4">
        <div data-markdown-preview style={{ width, boxSizing: 'border-box', padding: 16, marginInline: 'auto' }}>
          <Bubble message={message} />
        </div>
      </section>
      <details className="mx-auto mt-4 max-w-4xl px-4" open>
        <summary className="cursor-pointer">原始 Markdown（可编辑，实时预览）</summary>
        <textarea aria-label="Markdown 原文" value={source} onChange={event => edit(event.target.value)} spellCheck={false}
          className="mt-2 min-h-52 w-full resize-y rounded border border-border bg-background p-3 font-mono text-sm" />
      </details>
    </main>
  </TooltipProvider></ToastProvider>;
}
