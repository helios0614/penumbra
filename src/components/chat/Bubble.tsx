import { useChatRenderTrace } from "./useChatRenderTrace";
import { format } from "date-fns";
import { Bot, CircleHelp, User } from "lucide-react";
import { ChatAttachments } from "@/components/media/ChatAttachments";
import { useAiName } from "@/components/identity/AiNameContext";
import { memo, useMemo, useRef } from "react";
import { readMessageSelection } from "./message-selection";
import { insertableBody } from "./insertable-body";
import { splitAssistantBubbles, splitUserBubbles } from "./bubble-chunks";

import aiAvatarPlaceholder from "@/assets/chat/avatar-ai-placeholder.png";
import userAvatarPlaceholder from "@/assets/chat/avatar-user-placeholder.png";
import type { ChatMessageViewModel } from "./chat-ui-types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { SearchableBubbleSegments } from "./BubbleSegment";
import { MessageActions } from "./MessageActions";
import { GenerationIndicator } from "./GenerationIndicator";
import { AI_BUBBLE_SURFACE, BUBBLE_SURFACE } from "./bubble-surface";
import "./chat.css";
import { SimpleThink, ThinkingBlock } from "./system-command/InlineIndicator";
import { CapabilityMessage } from "./capabilities/CapabilityMessage";
import { ToolResult } from "./capabilities/ToolResult";
import { HeartMarker } from "./capabilities/HeartMarker";

// Temporary visual-only sources. Replace these imports when avatar settings land.
const temporaryAvatarImages = {
  assistant: aiAvatarPlaceholder,
  user: userAvatarPlaceholder,
} as const;

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

function NeutralMessage({
  message,
}: {
  readonly message: Extract<ChatMessageViewModel, { kind: "unknown" }>;
}) {
  return (
    <div
      data-message-id={message.id}
      tabIndex={-1}
      className="mist-glass mx-auto flex w-full max-w-[560px] items-start gap-2 rounded-lg px-3 py-2 text-muted-foreground shadow-sm! sm:px-4"
      role="note"
    >
      <CircleHelp className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium leading-4">
          <span>暂不支持的消息类型</span>
          <code className="max-w-full break-all rounded bg-background/45 px-1.5 py-0.5 font-mono text-muted-strong">
            {message.rawRole}
          </code>
          <span className="font-normal">
            {format(new Date(message.createdAt * 1000), "HH:mm")}
          </span>
        </div>
        <p
          className="mt-0.5 min-h-5 whitespace-pre-wrap break-words text-sm leading-[1.55] text-foreground"
        >
          {message.content}
        </p>
      </div>
    </div>
  );
}

interface BubbleProps {
  readonly showActions?: boolean;
  readonly message: ChatMessageViewModel;
  readonly userName?: string;
  readonly onRegenerate?: () => void;
  readonly regenerateDisabled?: boolean;
  readonly regenerateUnavailableReason?: string | null;
  readonly onInsert?: (text: string) => void;
  readonly onEdit?: () => void;
  readonly onDelete?: () => void;
  readonly onExtract?: () => void;
  readonly editUnavailableReason?: string | null;
}

function BubbleInner({
  showActions = true,
  message,
  userName = "你",
  onRegenerate,
  regenerateDisabled = false,
  regenerateUnavailableReason,
  onInsert,
  onEdit,
  onDelete,
  onExtract,
  editUnavailableReason,
}: BubbleProps) {
  const aiName = useAiName();
  const bodyRef = useRef<HTMLDivElement>(null);
  useChatRenderTrace(message);
  const chunks = useMemo(() => message.kind === "user" ? splitUserBubbles(message.content)
    : message.kind === "assistant" ? splitAssistantBubbles(message.content) : [], [message.kind, message.content]);
  const canInsert = message.kind === "assistant" && message.insertable !== false && message.executionStatus === undefined && !!onInsert;
  const insertText = useMemo(() => canInsert ? insertableBody(message.content) : "", [canInsert, message.content]);
  if (message.kind === "system") {
    return <div data-message-id={message.id} tabIndex={-1} className="min-w-0 w-full outline-none">
      <CapabilityMessage record={message.capabilities?.display} identity={message.id} />
    </div>;
  }
  if (message.kind === "unknown") {
    return <NeutralMessage message={message} />;
  }

  const isUser = message.kind === "user";
  const hasBody = chunks.length > 0;
  const time = format(new Date(message.createdAt * 1000), "HH:mm");
  const executionLabel = message.executionStatus === undefined
    ? null
    : !isUser ? (hasBody && message.executionStatus === "finalizing" ? "正在确认保存"
      : hasBody && message.executionStatus === "unconfirmed" ? "结果待确认" : null) : {
        optimistic: "正在发送",
        streaming: "正在生成",
        finalizing: "正在确认",
        unconfirmed: "未确认保存",
      }[message.executionStatus];
  const generationLabel = isUser || message.executionStatus === undefined ? null
    : message.executionStatus === "streaming"
      ? (hasBody ? null : "思考中")
      : message.executionStatus === "finalizing" ? "正在确认保存"
      : message.executionStatus === "unconfirmed" ? "结果待确认" : "正在发送";
  const showEmptyFallback = message.kind === "assistant" && !hasBody && !generationLabel &&
    !message.thinking && !message.simpleThink && !message.error && !message.toolPending &&
    !message.attachments.length && !message.capabilities?.hasHeart && !message.capabilities?.results.length;

  return (
    <div
      data-message-id={message.id}
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
        <span className="text-xs font-medium">{isUser ? userName : aiName}</span>
        <span className="text-xs opacity-60">{time}</span>
        {executionLabel && (
          <span
            className="text-[11px] text-muted-strong"
            role={message.executionStatus === "unconfirmed" ? "alert" : "status"}
          >
            {executionLabel}
          </span>
        )}
        {showActions && message.executionStatus === undefined && (
          <div className="chat-message-actions shrink-0 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
            <MessageActions
              role={message.kind}
              content={message.content}
              onDelete={onDelete}
              onExtract={onExtract}
              onEdit={onEdit}
              editUnavailableReason={editUnavailableReason}
              onRegenerate={message.kind === "assistant" && message.error ? undefined : onRegenerate}
              regenerateDisabled={regenerateDisabled}
              onInsert={insertText ? onInsert : undefined}
              insertContent={insertText}
              getSelectedText={() => readMessageSelection(bodyRef.current)}
              canUseCapturedSelection={() => {
                const selection = bodyRef.current?.ownerDocument.getSelection();
                return !!bodyRef.current?.isConnected && (!selection || selection.isCollapsed || selection.rangeCount === 0);
              }}
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
          ref={bodyRef}
          data-message-body
          className={cn(
            "flex min-w-0 flex-col gap-1",
            isUser ? "items-end" : "items-start gap-0.5",
          )}
        >
          <SearchableBubbleSegments identity={message.id} chunks={chunks}
            kind={message.kind} reaction={message.kind==="user"?message.capabilities?.reaction:null}/>
          {showEmptyFallback && <p data-message-empty data-chat-non-body className="px-1 py-1 text-xs text-muted-foreground">暂无可显示内容</p>}
          {message.kind === "assistant" && message.error && <div className={cn(BUBBLE_SURFACE, AI_BUBBLE_SURFACE, "whitespace-pre-wrap text-sm break-words")} role="alert">{message.error}
            {showActions && message.executionStatus === undefined && (onRegenerate && !regenerateDisabled
              ? <div className="mt-2"><Button size="sm" variant="outline" onClick={onRegenerate} aria-label="重新生成回复">重新生成</Button></div>
              : regenerateUnavailableReason ? <p className="mt-2 text-xs text-muted-foreground">{regenerateUnavailableReason}</p> : null)}
          </div>}
          {generationLabel && !hasBody && !(message.kind === "assistant" && message.error) && <GenerationIndicator label={generationLabel} messageId={message.id}
            rotating={message.executionStatus === "streaming"}
            active={message.executionStatus === "streaming" || message.executionStatus === "finalizing"} />}
        </div>

        {message.attachments.length > 0 && <ChatAttachments attachments={message.attachments} messageId={message.id} kind={message.kind}
          reaction={!hasBody && message.kind === "user" ? message.capabilities?.reaction : null} />}
        {message.capabilities?.results.map(result => <div key={result.id} className="mt-2 min-w-0 w-full">
          <ToolResult record={result} identity={`${message.id}:${result.id}`} />
        </div>)}
        {message.toolPending && <p role="status" className="px-2 py-1 text-[11px] text-muted-foreground">
          {message.executionStatus === "streaming" ? "远程调用中 · 结果待确认" : "远程调用结果待确认"}
        </p>}
        {message.kind === "assistant" && message.capabilities?.hasHeart && <HeartMarker key={`${message.id}:${message.capabilities.heartRevision ?? ""}`} messageId={message.id}
          conversationId={message.capabilities.conversationId} />}
      </div>
    </div>
  );
}

export const Bubble = memo(BubbleInner);
