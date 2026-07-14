import { memo } from "react";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { MessageActions } from "./MessageActions";
import { SimpleThink, ThinkingBlock } from "./system-command/InlineIndicator";
import { getMusicAttachments } from "./system-command/message-capabilities";
import { MusicResultCard } from "./system-command/ResultCard";
import { SystemMessageLine } from "./system-command/SystemMessageLine";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Bot, User } from "lucide-react";
import type { ChatMessage } from "./types";
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

// ─── 消息头像 ───

interface MessageAvatarProps {
  isUser: boolean;
  hasHeartWhisper?: boolean;
}

function MessageAvatar({ isUser, hasHeartWhisper }: MessageAvatarProps) {
  const avatar = (
    <Avatar size="sm">
      <AvatarFallback className={cn(isUser ? "bg-primary-subtle" : "bg-ai-subtle")}>
        {isUser ? (
          <User className="size-3.5 text-muted-foreground" />
        ) : (
          <Bot className="size-3.5 text-ai" />
        )}
      </AvatarFallback>
    </Avatar>
  );

  if (isUser || !hasHeartWhisper) return avatar;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="img"
            aria-label="这条回复包含心声"
            className="relative inline-flex shrink-0"
          />
        }
      >
        {avatar}
        <span
          aria-hidden="true"
          className={cn(
            "absolute bottom-0 right-0 size-2.5 rounded-full",
            "bg-ai ring-2 ring-[var(--mist-solid-surface)]",
            "animate-in fade-in-0 zoom-in-50 duration-500 motion-reduce:animate-none",
          )}
        />
      </TooltipTrigger>
      <TooltipContent>这条回复包含心声</TooltipContent>
    </Tooltip>
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
        "relative rounded-md px-4 py-2 text-[14px] leading-[1.6] break-words overflow-wrap-anywhere overflow-hidden min-w-0 max-w-full backdrop-blur-md",
        isUser
          ? "bg-primary/10 text-primary-ink shadow-sm border border-primary/20"
          : "bg-ai/10 text-ai shadow-sm border border-ai/20",
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

// ─── 单条消息气泡 ───

interface BubbleProps {
  message: ChatMessage;
  hasHeartWhisper?: boolean;
  isStreaming?: boolean;
  streamingContent?: string;
  onRegenerate?: () => void;
  onDelete?: () => void;
}

function BubbleInner({
  message,
  hasHeartWhisper,
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
    return <SystemMessageLine content={message.content} />;
  }

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
  const musicAttachments = getMusicAttachments(message);

  return (
    <div
      tabIndex={-1}
      className={cn(
        "flex flex-col max-w-full w-full group outline-none",
        isUser ? "items-end" : "items-start",
      )}
    >
      {/* 头部信息 */}
      <div className={cn(
        "flex items-center gap-1.5 mb-1",
        isUser ? "flex-row-reverse" : "flex-row",
      )}>
        <MessageAvatar isUser={isUser} hasHeartWhisper={hasHeartWhisper} />
        <span className={cn("text-xs font-medium", isUser ? "text-primary" : "text-ai")}>
          {isUser ? "你" : "Aion"}
        </span>
        <span className={cn("text-xs", isUser ? "text-primary/60" : "text-ai/60")}>{timeStr}</span>

        {/* 操作按钮 — hover 显示 */}
        <div
          className={cn(
            "flex items-center gap-0.5 shrink-0",
            "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150",
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

      {/* 气泡内容区 — 限宽 85% */}
      <div className="max-w-[85%]">
        {/* 扩展思考 */}
        {isAssistant && message.thinking && !isStreaming && (
          <ThinkingBlock content={message.thinking} className="mb-1.5 w-full" />
        )}

        {/* AI 随想 */}
        {isAssistant && message.simple_think && !isStreaming && (
          <SimpleThink content={message.simple_think} className="mb-1.5" />
        )}

        {/* 气泡列表 */}
        {isLoading ? (
          <div className="mist-solid w-full rounded-lg px-4 py-3">
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

        {isAssistant && !isStreaming && musicAttachments.length > 0 && (
          <div className="mt-1.5 flex flex-col items-start gap-1.5">
            {musicAttachments.map((attachment) => (
              <MusicResultCard
                key={`${attachment.id}:${attachment.name}`}
                attachment={attachment}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

export const Bubble = memo(BubbleInner);
