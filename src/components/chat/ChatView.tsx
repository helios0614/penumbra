import { ArrowLeft, LoaderCircle, Menu, RefreshCw } from "lucide-react";
import { useState } from "react";

import {
  getChatSenderAvailability,
  getChatRegenerateAvailability,
  useChatRealtime,
  useChatSend,
  type ChatWorkspaceControllerState,
} from "@/components/chat-workspace";
import type { ChatRealtimeState } from "@/application/chat-realtime";
import {
  INITIAL_CHAT_SEND_STATE,
  isChatExecutionActive,
  type ChatSendState,
} from "@/application/chat-send";
import {
  composeVisibleChatMessages,
  presentChatConversations,
} from "@/components/chat-workspace/presentation";
import { useChatWorkspace } from "@/components/chat-workspace/useChatWorkspace";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";

import { BubbleList } from "./BubbleList";
import {
  ChatWorkspaceEmpty,
  ChatWorkspaceError,
  ChatWorkspaceLoading,
} from "./ChatWorkspaceStates";
import { ConversationsList } from "./ConversationsList";
import { Sender } from "./Sender";

const CHAT_HEADER_ACTION_CLASS =
  "rounded-xl border border-border-strong/50 bg-background/25 text-foreground shadow-sm hover:border-primary/30 hover:bg-primary/10 active:bg-primary/15";

export function ChatView({ onBack }: { readonly onBack?: () => void }) {
  const workspace = useChatWorkspace();
  const send = useChatSend(workspace.reloadSelectedConversationHistory);
  const realtime = useChatRealtime(workspace.state, send.state, {
    reconcileEvent: workspace.reconcileSelectedConversationRealtimeEvent,
    reconcileAfterReconnect:
      workspace.reconcileSelectedConversationAfterReconnect,
    refreshConversationList: workspace.refreshConversationList,
  });

  const selectConversation = (conversationId: string) => {
    if (isChatExecutionActive(send.state)) return;
    send.resetError();
    workspace.selectConversation(conversationId);
  };

  const sendMessage = (content: string): Promise<boolean> => {
    if (
      workspace.state.status !== "ready" ||
      workspace.state.workspace.selectedConversation === null
    ) {
      return Promise.resolve(false);
    }
    return send.send({
      conversationId: workspace.state.workspace.selectedConversation.id,
      content,
    });
  };

  const regenerateMessage = (messageId: string): Promise<boolean> => {
    if (workspace.state.status !== "ready") {
      return Promise.resolve(false);
    }
    const availability = getChatRegenerateAvailability(
      workspace.state,
      send.state,
    );
    if (
      !availability.enabled ||
      availability.target === null ||
      availability.target.id !== messageId
    ) {
      return Promise.resolve(false);
    }
    return send.regenerate({
      conversationId: availability.target.conversationId,
      targetMessageId: availability.target.id,
      targetCreatedAt: availability.target.createdAt,
    });
  };

  return (
    <ChatWorkspaceView
      state={workspace.state}
      onRetry={workspace.retry}
      onSelectConversation={selectConversation}
      onRetryConversationSwitch={workspace.retryConversationSwitch}
      onBack={onBack}
      sendState={send.state}
      onSend={sendMessage}
      onRegenerate={regenerateMessage}
      onRetryFinalization={send.retryFinalization}
      realtimeState={realtime}
    />
  );
}

export interface ChatWorkspaceViewProps {
  readonly state: ChatWorkspaceControllerState;
  readonly onRetry: () => void;
  readonly onSelectConversation: (conversationId: string) => void;
  readonly onRetryConversationSwitch: () => void;
  readonly sendState?: ChatSendState;
  readonly onSend?: (content: string) => Promise<boolean>;
  readonly onRegenerate?: (messageId: string) => Promise<boolean>;
  readonly onRetryFinalization?: () => void;
  readonly realtimeState?: ChatRealtimeState;
  readonly onBack?: () => void;
}

export function ChatWorkspaceView({
  state,
  onRetry,
  onSelectConversation,
  onRetryConversationSwitch,
  sendState = INITIAL_CHAT_SEND_STATE,
  onSend,
  onRegenerate,
  onRetryFinalization,
  realtimeState = { kind: "idle" },
  onBack,
}: ChatWorkspaceViewProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  if (state.status === "idle" || state.status === "loading") {
    return (
      <TooltipProvider delay={300}>
        <ChatWorkspaceLoading onBack={onBack} />
      </TooltipProvider>
    );
  }

  if (state.status === "error") {
    return (
      <TooltipProvider delay={300}>
        <ChatWorkspaceError error={state.error} onRetry={onRetry} onBack={onBack} />
      </TooltipProvider>
    );
  }

  const { workspace, pendingConversationId, switchError } = state;
  const conversations = presentChatConversations(workspace.conversations, {
    selectedConversationId: workspace.selectedConversationId,
    pendingConversationId,
  });
  const selectedConversation = conversations.find(({ isSelected }) => isSelected) ?? null;
  const messages = composeVisibleChatMessages(
    workspace.history?.messages ?? [],
    sendState,
    workspace.selectedConversationId ?? "",
  );
  const sender = getChatSenderAvailability(state, sendState);
  const executionNoticeVisible = executionNoticeError(sendState) !== null;
  const regenerate = getChatRegenerateAvailability(state, sendState);
  const executionActive = isChatExecutionActive(sendState);
  const forceFollowKey = sendState.kind === "sending-user" ||
    sendState.kind === "streaming" ||
    sendState.kind === "finalizing" ||
    sendState.kind === "finalization-uncertain"
    ? sendState.executionId
    : null;

  const selectConversation = (conversationId: string) => {
    onSelectConversation(conversationId);
    setSheetOpen(false);
  };

  return (
    <TooltipProvider delay={300}>
      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        <ConversationsList
          conversations={conversations}
          onSelect={selectConversation}
          disabled={executionActive}
          className="hidden w-[280px] shrink-0 md:flex"
        />

        <div className="relative flex w-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/10 px-3 text-foreground backdrop-blur-xl sm:px-4">
            {onBack && (
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className={CHAT_HEADER_ACTION_CLASS}
                onClick={onBack}
                aria-label="返回桌面"
                title="返回桌面"
              >
                <ArrowLeft className="size-4.5" aria-hidden="true" />
              </Button>
            )}

            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    className={`${CHAT_HEADER_ACTION_CLASS} md:hidden`}
                    aria-label="会话列表"
                    title="会话列表"
                  />
                }
              >
                <Menu className="size-4.5" aria-hidden="true" />
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0">
                <SheetTitle className="sr-only">会话列表</SheetTitle>
                <ConversationsList
                  conversations={conversations}
                  onSelect={selectConversation}
                  disabled={executionActive}
                  className="h-full w-full border-r-0"
                />
              </SheetContent>
            </Sheet>

            <HeaderCopy title={selectedConversation?.title ?? "Penumbra"} />
            {pendingConversationId && (
              <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" role="status">
                <LoaderCircle
                  className="size-3.5 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">正在切换会话</span>
              </span>
            )}
          </header>

          {switchError && (
            <div
              className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-destructive/5 px-4 py-2 text-xs text-muted-strong"
              role="alert"
            >
              <span className="min-w-0 flex-1">{switchError.message}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRetryConversationSwitch}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                重试切换
              </Button>
            </div>
          )}

          <ChatExecutionNotice
            state={sendState}
            onRetryFinalization={onRetryFinalization}
          />

          <ChatRealtimeNotice state={realtimeState} />

          {workspace.conversations.length === 0 ? (
            <ChatWorkspaceEmpty kind="conversations" />
          ) : workspace.selectedConversation === null || workspace.history === null ? (
            <ChatWorkspaceEmpty kind="selection" />
          ) : messages.length === 0 ? (
            <ChatWorkspaceEmpty kind="history" />
          ) : (
            <BubbleList
              conversationId={workspace.selectedConversation.id}
              messages={messages}
              forceFollowKey={forceFollowKey}
              regenerateTargetId={regenerate.target?.id ?? null}
              regenerateEnabled={regenerate.enabled && onRegenerate !== undefined}
              onRegenerate={onRegenerate === undefined
                ? undefined
                : (messageId) => {
                    void onRegenerate(messageId);
                  }}
            />
          )}

          <Sender
            disabled={!sender.enabled || onSend === undefined}
            placeholder={executionNoticeVisible
              ? "输入消息…"
              : sender.placeholder}
            statusMessage={executionNoticeVisible
              ? undefined
              : sender.statusMessage ?? undefined}
            onSend={onSend}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

function ChatRealtimeNotice({
  state,
}: {
  readonly state: ChatRealtimeState;
}) {
  if (state.kind !== "unavailable" && state.kind !== "reconnecting") {
    return null;
  }

  return (
    <div
      className="shrink-0 border-b border-border bg-muted/30 px-4 py-1.5 text-xs text-muted-foreground"
      role="status"
    >
      {state.kind === "reconnecting"
        ? "实时连接正在恢复，历史记录与发送仍可使用。"
        : "实时连接暂时不可用，历史记录与发送仍可使用。"}
    </div>
  );
}

function ChatExecutionNotice({
  state,
  onRetryFinalization,
}: {
  readonly state: ChatSendState;
  readonly onRetryFinalization?: () => void;
}) {
  const error = executionNoticeError(state);
  if (error === null) return null;

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-destructive/5 px-4 py-2 text-xs text-muted-strong"
      role="alert"
    >
      <span className="min-w-0 flex-1">{error.message}</span>
      {(state.kind === "finalization-uncertain" ||
        state.kind === "regenerate-finalization-uncertain") &&
        onRetryFinalization && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetryFinalization}
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          重新加载历史
        </Button>
      )}
    </div>
  );
}

function executionNoticeError(state: ChatSendState) {
  switch (state.kind) {
    case "error":
    case "finalization-uncertain":
    case "regenerate-finalization-uncertain":
      return state.error;
    case "streaming":
    case "finalizing":
    case "regenerate-streaming":
    case "regenerate-finalizing":
      return state.executionError;
    case "idle":
    case "sending-user":
      return null;
  }
}

function HeaderCopy({
  title,
}: {
  readonly title: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-semibold text-foreground">{title}</p>
    </div>
  );
}
