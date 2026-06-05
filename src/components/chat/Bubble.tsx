import { memo, useRef, useEffect, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { MessageActions } from "./MessageActions";
import { SystemCommand } from "./system-command/SystemCommand";
import { SimpleThink, ThinkingBlock } from "./system-command/InlineIndicator";
import {
  parseSystemMessage,
  extractMcpToolCalls,
} from "./system-command/parse-system-message";
import type { ChatMessage } from "./types";
import type { McpToolCall } from "./system-command/types";
import { format } from "date-fns";

/**
 * 流式状态下剥离未闭合的 Markdown 结构，避免 DOM 跳变。
 */
function stripIncompleteMarkdown(src: string): string {
  let s = src;

  // 未闭合的代码块：奇数个 ``` → 截断
  const fences = s.match(/^```/gm);
  if (fences && fences.length % 2 !== 0) {
    const lastFenceIdx = s.lastIndexOf("```");
    const afterFence = s.slice(lastFenceIdx + 3);
    const langMatch = afterFence.match(/^[^\n]*/);
    const textAfter = langMatch
      ? afterFence.slice(langMatch[0].length).trimStart()
      : afterFence;
    s = s.slice(0, lastFenceIdx) + (textAfter ? "\n" + textAfter : "");
  }

  // 未闭合的表格行
  const lines = s.split("\n");
  let lastTableLine = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*\|/.test(lines[i])) {
      lastTableLine = i;
    } else if (lastTableLine >= 0) {
      break;
    }
  }
  if (lastTableLine >= 0) {
    const pipeCount = (lines[lastTableLine].match(/\|/g) ?? []).length;
    if (pipeCount < 2) {
      lines.splice(lastTableLine);
      s = lines.join("\n");
    }
  }

  // 尾部悬挂的列表标记
  s = s.replace(/\n[-*+]\s*$/, "");
  s = s.replace(/\n\d+\.\s*$/, "");

  return s;
}

/**
 * 按 \n\n 拆分消息为多个气泡段落。
 * 代码块内部的 \n\n 不拆（通过 fence 计数判断）。
 */
function splitIntoChunks(content: string): string[] {
  if (!content) return [];

  const parts: string[] = [];
  let current = "";
  let fenceOpen = false;

  for (const line of content.split("\n")) {
    // 跟踪代码块开关
    if (/^```/.test(line)) {
      fenceOpen = !fenceOpen;
    }

    // 空行 + 非代码块内 = 拆分点
    if (line === "" && !fenceOpen) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += (current ? "\n" : "") + line;
  }

  if (current) parts.push(current);
  return parts;
}

// ─── 加载骨架 ───

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-1.5 py-1">
      <div className="h-3.5 w-24 bg-muted/40 rounded animate-pulse" />
      <div className="h-3.5 w-40 bg-muted/40 rounded animate-pulse [animation-delay:150ms]" />
      <div className="h-3.5 w-16 bg-muted/40 rounded animate-pulse [animation-delay:300ms]" />
    </div>
  );
}

// ─── 流式光标 ───

function StreamingCursor() {
  return (
    <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />
  );
}

// ─── 单个气泡段落 ───

interface BubbleSegmentProps {
  isUser: boolean;
  isAssistant: boolean;
  content: string;
  isStreaming: boolean;
  showCursor: boolean;
}

function BubbleSegment({
  isUser,
  isAssistant,
  content,
  isStreaming,
  showCursor,
}: BubbleSegmentProps) {
  return (
    <div
      className={cn(
        "relative rounded-md px-4 py-2.5 text-[15px] leading-[1.6] break-words overflow-hidden w-fit",
        isUser
          ? "bg-primary text-primary-foreground"
          : "bg-ai-subtle/40 shadow-sm border border-ai/10",
      )}
    >
      {isAssistant ? (
        <>
          <MarkdownRenderer content={content} />
          {showCursor && isStreaming && <StreamingCursor />}
        </>
      ) : (
        <span className="whitespace-pre-wrap">{content}</span>
      )}
    </div>
  );
}

// ─── 系统消息（独立组件，避免 hooks 条件调用） ───

interface SystemBubbleProps {
  message: ChatMessage;
}

function SystemBubble({ message }: SystemBubbleProps) {
  const commandData = useMemo(
    () => parseSystemMessage(message.content),
    [message.content],
  );
  const mcpCalls = useMemo(() => {
    if (message.mcp_tool_calls?.length) {
      return message.mcp_tool_calls as McpToolCall[];
    }
    return extractMcpToolCalls(message.content);
  }, [message.mcp_tool_calls, message.content]);

  if (commandData) {
    return (
      <div className="flex justify-center my-2">
        <SystemCommand
          data={commandData}
          toolCalls={mcpCalls.length > 0 ? mcpCalls : undefined}
        />
      </div>
    );
  }

  return (
    <div className="flex justify-center my-2">
      <span className="text-xs text-muted-foreground bg-surface-secondary px-3 py-1 rounded-full">
        {message.content}
      </span>
    </div>
  );
}

// ─── 单条消息气泡 ───

interface BubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  streamingContent?: string;
  onRegenerate?: () => void;
  onDelete?: () => void;
}

function BubbleInner({
  message,
  isStreaming,
  streamingContent,
  onRegenerate,
  onDelete,
}: BubbleProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isSystem = message.role === "system";

  // 系统消息走独立组件
  if (isSystem) {
    return <SystemBubble message={message} />;
  }

  // 流式过程中锁定宽度（flex-1），流式结束后恢复自适应
  const wasStreamingRef = useRef(false);
  const [lockWidth, setLockWidth] = useState(false);

  useEffect(() => {
    if (isStreaming) {
      wasStreamingRef.current = true;
      setLockWidth(true);
    } else if (wasStreamingRef.current) {
      // 流式刚结束，延迟一帧解除锁定，让浏览器完成最终布局
      const id = requestAnimationFrame(() => setLockWidth(false));
      return () => cancelAnimationFrame(id);
    }
  }, [isStreaming]);

  const rawContent =
    isStreaming && streamingContent != null
      ? streamingContent
      : message.content;

  // 流式状态下剥离未闭合 Markdown
  const displayContent =
    isStreaming && rawContent ? stripIncompleteMarkdown(rawContent) : rawContent;

  const isLoading = isStreaming && !streamingContent;
  const timeStr = format(new Date(message.created_at * 1000), "HH:mm");

  // 按 \n\n 拆分为多个气泡
  const chunks = isLoading ? [] : splitIntoChunks(displayContent);

  return (
    <div
      className={cn(
        "flex gap-2 max-w-full w-full group",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* 气泡体 — 流式中锁定宽度，结束后自适应 */}
      <div
        className={cn(
          "min-w-0 max-w-[85%] sm:max-w-[75%]",
          lockWidth
            ? "flex flex-col flex-1"
            : "flex flex-col",
          isUser ? "items-end" : "items-start",
        )}
      >
        {/* 角色 + 时间 */}
        <div
          className={cn(
            "flex items-center gap-2 mb-1",
            isUser ? "flex-row-reverse" : "flex-row",
          )}
        >
          <span className={cn("text-xs font-medium", isUser ? "text-foreground" : "text-ai")}>
            {isUser ? "你" : "Aion"}
          </span>
          <span className="text-xs text-muted">{timeStr}</span>
        </div>

        {/* AI 随想 — 气泡上方 */}
        {isAssistant && message.simple_think && !isStreaming && (
          <SimpleThink content={message.simple_think} className="mb-1.5" />
        )}

        {/* 气泡列表 */}
        {isLoading ? (
          <div className="w-full rounded-lg bg-surface shadow-sm border border-border px-4 py-3">
            <LoadingSkeleton />
          </div>
        ) : (
          <div className="flex flex-col gap-1 items-start">
            {chunks.map((chunk, i) => (
              <BubbleSegment
                key={i}
                isUser={isUser}
                isAssistant={isAssistant}
                content={chunk}
                isStreaming={!!isStreaming}
                showCursor={i === chunks.length - 1}
              />
            ))}
          </div>
        )}

        {/* 扩展思考 — 气泡下方，可折叠 */}
        {isAssistant && message.thinking && !isStreaming && (
          <ThinkingBlock content={message.thinking} className="mt-2 w-full" />
        )}

        {/* 操作栏 — hover 显示 */}
        <div
          className={cn(
            "flex items-center gap-0.5 mt-1",
            "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
            isUser ? "flex-row-reverse" : "flex-row",
          )}
        >
          <MessageActions
            role={message.role}
            content={message.content}
            onRegenerate={isAssistant ? onRegenerate : undefined}
            onDelete={onDelete}
          />
        </div>
      </div>
    </div>
  );
}

export const Bubble = memo(BubbleInner);
