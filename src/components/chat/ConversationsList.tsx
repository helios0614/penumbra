import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { LoaderCircle, MessageCircle } from "lucide-react";

import type { ChatConversationItemViewModel } from "@/components/chat-workspace/presentation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface ConversationsListProps {
  readonly conversations: readonly ChatConversationItemViewModel[];
  readonly onSelect: (id: string) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

export function ConversationsList({
  conversations,
  onSelect,
  disabled = false,
  className,
}: ConversationsListProps) {
  return (
    <div
      className={cn(
        "mist-solid flex h-full flex-col overflow-hidden border-r border-border shadow-none",
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border p-3">
        <span className="text-sm font-semibold text-foreground">会话</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {conversations.length}
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-0.5 p-2">
          {conversations.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageCircle className="mb-2 size-8 opacity-40" aria-hidden="true" />
              <p className="text-xs">暂无会话</p>
            </div>
          )}

          {conversations.map((conversation) => {
            const timeAgo = conversation.updatedAt === null
              ? null
              : formatDistanceToNow(new Date(conversation.updatedAt * 1000), {
                  locale: zhCN,
                  addSuffix: true,
                });

            return (
              <button
                key={conversation.id}
                type="button"
                disabled={disabled || conversation.isPending}
                aria-current={conversation.isSelected ? "page" : undefined}
                aria-label={
                  disabled
                    ? `当前无法切换到${conversation.title}`
                    : conversation.isPending
                    ? `正在切换到${conversation.title}`
                    : `打开会话${conversation.title}`
                }
                onClick={() => onSelect(conversation.id)}
                className={cn(
                  "group relative flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left",
                  "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-65",
                  conversation.isSelected
                    ? "bg-surface-secondary"
                    : "hover:bg-surface-secondary/50",
                  conversation.isPending && "bg-surface-secondary/50",
                )}
              >
                {conversation.isSelected && (
                  <span
                    className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                )}

                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-sm font-medium",
                      conversation.isSelected
                        ? "text-foreground"
                        : "text-foreground/80",
                    )}
                  >
                    {conversation.title}
                  </span>
                  <span className="mt-0.5 flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs text-muted-foreground">
                      {conversation.subtitle}
                    </span>
                    {timeAgo && (
                      <span className="shrink-0 text-xs text-muted-foreground/70">
                        {timeAgo}
                      </span>
                    )}
                  </span>
                  {conversation.isPending && (
                    <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-strong" role="status">
                      <LoaderCircle
                        className="size-3 animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                      正在切换
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
