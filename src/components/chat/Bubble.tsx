import { format } from "date-fns";
import { Bot, CircleHelp, Info, Paperclip, User } from "lucide-react";
import { memo } from "react";

import aiAvatarPlaceholder from "@/assets/chat/avatar-ai-placeholder.png";
import userAvatarPlaceholder from "@/assets/chat/avatar-user-placeholder.png";
import type { ChatMessageViewModel } from "@/components/chat-workspace/presentation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

import { MarkdownRenderer } from "./MarkdownRenderer";
import { MessageActions } from "./MessageActions";
import { SimpleThink, ThinkingBlock } from "./system-command/InlineIndicator";

// Temporary visual-only sources. Replace these imports when avatar settings land.
const temporaryAvatarImages = {
  assistant: aiAvatarPlaceholder,
  user: userAvatarPlaceholder,
} as const;

function splitIntoChunks(content: string): string[] {
  // TODO(markdown-chunking): 当前逻辑只跟踪 ``` fence，并在 Markdown 解析前按空行拆分。
  // 改进时需同时保留“一段一个气泡”的 UI；本轮仅记录技术债，不调整现有分块行为。
  if (!content) return [""];

  const parts: string[] = [];
  let current = "";
  let fenceOpen = false;

  for (const line of content.split("\n")) {
    if (/^```/.test(line)) {
      fenceOpen = !fenceOpen;
    }

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

  // 过滤掉只会渲染为空的内容（如单独的 ---）
  // 这些内容在 MarkdownRenderer 中会被渲染为空，但外层 BubbleSegment 仍会占据空间
  const filteredParts = parts.filter(chunk => {
    const trimmed = chunk.trim();
    // 单独的 thematic break 或只包含空格的 chunk
    if (trimmed === "---" || trimmed === "***" || trimmed === "___" || trimmed === "") {
      return false;
    }
    return true;
  });

  return filteredParts.length > 0 ? filteredParts : [""];
}

function MessageAvatar({ kind }: { kind: "user" | "assistant" }) {
  const isUser = kind === "user";

  return (
    <Avatar
      size="sm"
      className="size-7 overflow-hidden bg-transparent shadow-none after:border-border/55 after:mix-blend-normal sm:size-8 dark:after:mix-blend-normal"
    >
      <AvatarImage
        src={temporaryAvatarImages[kind]}
        alt=""
        className="object-cover"
      />
      <AvatarFallback className="bg-surface-secondary/45">
        {isUser ? (
          <User className="size-3.5 text-muted-foreground" aria-hidden="true" />
        ) : (
          <Bot className="size-3.5 text-ai" aria-hidden="true" />
        )}
      </AvatarFallback>
    </Avatar>
  );
}

function BubbleSegment({
  kind,
  content,
}: {
  readonly kind: "user" | "assistant";
  readonly content: string;
}) {
  const isUser = kind === "user";

  return (
    <div
      className={cn(
        "relative min-h-9 min-w-0 max-w-full overflow-hidden rounded-md border px-4 py-2",
        "overflow-wrap-anywhere break-words text-[14px] leading-[1.6]",
        isUser
          ? "border-primary/20 bg-primary/10 text-primary shadow-sm backdrop-blur-md"
          : "border-ai/10 bg-ai/[0.06] text-ai shadow-none backdrop-blur-[2px]",
      )}
    >
      {isUser ? (
        <span className="whitespace-pre-wrap">{content}</span>
      ) : (
        <MarkdownRenderer content={content} />
      )}
    </div>
  );
}

function NeutralMessage({
  message,
}: {
  readonly message: Extract<ChatMessageViewModel, { kind: "system" | "unknown" }>;
}) {
  const isUnknown = message.kind === "unknown";
  const Icon = isUnknown ? CircleHelp : Info;

  return (
    <div
      className={cn(
        "flex items-start gap-2 text-muted-foreground",
        isUnknown
          ? "mist-glass mx-auto w-full max-w-[560px] rounded-lg px-3 py-2 shadow-sm! sm:px-4"
          : "-my-1 mx-auto w-fit max-w-full rounded-sm border-l border-border/35 bg-surface-secondary/25 px-2 py-1.5 shadow-none sm:max-w-[560px]",
      )}
      role="note"
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium leading-4">
          <span>{isUnknown ? "暂不支持的消息类型" : "系统消息"}</span>
          {isUnknown && (
            <code className="max-w-full break-all rounded bg-background/45 px-1.5 py-0.5 font-mono text-muted-strong">
              {message.rawRole}
            </code>
          )}
          <span className="font-normal">
            {format(new Date(message.createdAt * 1000), "HH:mm")}
          </span>
        </div>
        <p
          className={cn(
            "mt-0.5 min-h-5 whitespace-pre-wrap break-words leading-[1.55]",
            isUnknown ? "text-sm text-foreground" : "text-[13px] text-foreground/80",
          )}
        >
          {message.content}
        </p>
      </div>
    </div>
  );
}

interface BubbleProps {
  readonly message: ChatMessageViewModel;
  readonly onRegenerate?: () => void;
  readonly regenerateDisabled?: boolean;
}

function BubbleInner({
  message,
  onRegenerate,
  regenerateDisabled = false,
}: BubbleProps) {
  if (message.kind === "system" || message.kind === "unknown") {
    return <NeutralMessage message={message} />;
  }

  const isUser = message.kind === "user";
  const chunks = splitIntoChunks(message.content);
  const time = format(new Date(message.createdAt * 1000), "HH:mm");
  const executionLabel = message.executionStatus === undefined
    ? null
    : {
        optimistic: "正在发送",
        streaming: "正在生成",
        finalizing: "正在确认",
        unconfirmed: "未确认保存",
      }[message.executionStatus];

  return (
    <div
      tabIndex={-1}
      className={cn(
        "group flex w-full max-w-full flex-col outline-none",
        isUser ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "mb-1 flex items-center gap-1.5",
          isUser ? "chat-user-meta flex-row-reverse" : "chat-ai-meta flex-row",
        )}
      >
        <MessageAvatar kind={message.kind} />
        <span className="text-xs font-medium">{isUser ? "你" : "知远"}</span>
        <span className="text-xs opacity-60">{time}</span>
        {executionLabel && (
          <span
            className="text-[11px] text-muted-strong"
            role={message.executionStatus === "unconfirmed" ? "alert" : "status"}
          >
            {executionLabel}
          </span>
        )}
        {message.executionStatus === undefined && (
          <div className="shrink-0 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
            <MessageActions
              role={message.kind}
              content={message.content}
              onRegenerate={onRegenerate}
              regenerateDisabled={regenerateDisabled}
            />
          </div>
        )}
      </div>

      <div className="min-w-0 max-w-[85%]">
        {message.kind === "assistant" && message.thinking && (
          <ThinkingBlock content={message.thinking} className="mb-1.5 w-full" />
        )}

        {message.kind === "assistant" && message.simpleThink && (
          <SimpleThink content={message.simpleThink} className="mb-1.5" />
        )}

        <div
          className={cn(
            "flex min-w-0 flex-col gap-1",
            isUser ? "items-end" : "items-start gap-0.5",
          )}
        >
          {chunks.map((chunk, index) => (
            <BubbleSegment
              key={`${message.id}:${index}`}
              kind={message.kind}
              content={chunk}
            />
          ))}
        </div>

        {message.attachments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label="消息附件">
            {message.attachments.map((attachment, index) => (
              <span
                key={`${message.id}:attachment:${index}`}
                className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/80 bg-surface-secondary/70 px-2 py-1 text-[11px] text-muted-strong"
              >
                <Paperclip className="size-3 shrink-0" aria-hidden="true" />
                {attachment.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const Bubble = memo(BubbleInner);
