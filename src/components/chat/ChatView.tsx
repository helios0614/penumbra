import { ArrowLeft, LoaderCircle, Menu, RefreshCw } from "lucide-react";
import { useState } from "react";

import type { ChatWorkspaceControllerState } from "@/components/chat-workspace";
import {
  presentChatConversations,
  presentChatMessages,
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

const READ_ONLY_SENDER_MESSAGE = "发送功能将在下一阶段接入";
const READINESS_UNAVAILABLE_SENDER_MESSAGE =
  "当前仅支持查看历史，发送服务尚未就绪";
const CHAT_HEADER_ACTION_CLASS =
  "rounded-xl border border-border-strong/50 bg-background/25 text-foreground shadow-sm hover:border-primary/30 hover:bg-primary/10 active:bg-primary/15";

export function ChatView({ onBack }: { readonly onBack?: () => void }) {
  const workspace = useChatWorkspace();

  return (
    <ChatWorkspaceView
      state={workspace.state}
      onRetry={workspace.retry}
      onSelectConversation={workspace.selectConversation}
      onRetryConversationSwitch={workspace.retryConversationSwitch}
      onBack={onBack}
    />
  );
}

export interface ChatWorkspaceViewProps {
  readonly state: ChatWorkspaceControllerState;
  readonly onRetry: () => void;
  readonly onSelectConversation: (conversationId: string) => void;
  readonly onRetryConversationSwitch: () => void;
  readonly onBack?: () => void;
}

export function ChatWorkspaceView({
  state,
  onRetry,
  onSelectConversation,
  onRetryConversationSwitch,
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
  const messages = presentChatMessages(workspace.history?.messages ?? []);
  const senderMessage =
    workspace.setup.readiness.kind === "available" &&
    workspace.setup.readiness.value.ready
      ? READ_ONLY_SENDER_MESSAGE
      : READINESS_UNAVAILABLE_SENDER_MESSAGE;

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
            />
          )}

          <Sender
            disabled
            placeholder={senderMessage}
          />
        </div>
      </div>
    </TooltipProvider>
  );
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
