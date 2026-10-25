import { format, isToday, isYesterday } from "date-fns";
import { zhCN } from "date-fns/locale";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";

import type { ChatMessageViewModel } from "./chat-ui-types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { Bubble } from "./Bubble";
import { CapabilityExpansionProvider } from "./capabilities/CapabilityDisclosure";
import { captureChatScrollAnchor, restoreChatScrollAnchor, trackChatScroll, type ChatScrollAnchor } from "./chat-scroll";
import { Button } from "@/components/ui/button";
import type { OlderPageStatus } from "@/application/message-history";

function DateSeparator({ timestamp }: { readonly timestamp: number }) {
  const date = new Date(timestamp * 1000);
  let label: string;

  if (isToday(date)) {
    label = "今天";
  } else if (isYesterday(date)) {
    label = "昨天";
  } else {
    label = format(date, "M月d日 EEEE", { locale: zhCN });
  }

  return (
    <div className="my-2 flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="shrink-0 text-xs text-muted-foreground/70">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

interface DateGroup {
  readonly dateKey: string;
  readonly timestamp: number;
  readonly messages: ChatMessageViewModel[];
}

function groupByDate(messages: readonly ChatMessageViewModel[]): DateGroup[] {
  const groups: DateGroup[] = [];
  let currentKey = "";
  let currentGroup: DateGroup | null = null;

  for (const message of messages) {
    const key = format(new Date(message.createdAt * 1000), "yyyy-MM-dd");

    if (key !== currentKey) {
      currentGroup = {
        dateKey: key,
        timestamp: message.createdAt,
        messages: [],
      };
      groups.push(currentGroup);
      currentKey = key;
    }
    currentGroup!.messages.push(message);
  }

  return groups;
}

interface BubbleListProps {
  readonly timelineKey: string;
  readonly messages: readonly ChatMessageViewModel[];
  readonly userName?: string;
  readonly forceFollowKey?: string | null;
  readonly regenerateTargetId?: string | null;
  readonly regenerateEnabled?: boolean;
  readonly onRegenerate?: (messageId: string) => void;
  readonly onInsert?: (text: string) => void;
  readonly onLoadOlder?: () => void;
  readonly olderStatus?: OlderPageStatus;
  readonly olderPending?: boolean;
  readonly olderError?: string | null;
}

function BubbleListInner({
  timelineKey,
  messages,
  userName,
  forceFollowKey = null,
  regenerateTargetId = null,
  regenerateEnabled = false,
  onRegenerate,
  onInsert,
  onLoadOlder,
  olderStatus,
  olderPending = false,
  olderError,
}: BubbleListProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const shouldFollowRef = useRef(true);
  const previousTimelineRef = useRef<string | null>(null);
  const previousForceKeyRef = useRef<string | null>(null);
  const anchorRef = useRef<ChatScrollAnchor | null>(null);
  const loadRef = useRef(onLoadOlder);
  loadRef.current = onLoadOlder;
  const olderRef = useRef({ olderStatus, olderPending, olderError });
  olderRef.current = { olderStatus, olderPending, olderError };
  const lastMessageId = messages[messages.length - 1]?.id ?? null;
  const lastMessage = messages[messages.length - 1];
  const tailRevision = lastMessage === undefined
    ? ""
    : `${lastMessage.content.length}:${lastMessage.kind === "assistant"
      ? `${lastMessage.thinking?.length ?? 0}:${lastMessage.simpleThink?.length ?? 0}`
      : "0:0"}`;

  useEffect(() => {
    const viewport = rootRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    const content = rootRef.current?.querySelector<HTMLElement>("[data-chat-message-content]");
    if (!viewport || !content) return;
    anchorRef.current = null;
    const cleanup = trackChatScroll(viewport, content, shouldFollowRef, anchorRef);
    const loadOnScroll = () => {
      if (viewport.scrollTop < 80 && !shouldFollowRef.current && olderRef.current.olderStatus === "maybe-more" && !olderRef.current.olderPending && !olderRef.current.olderError) loadRef.current?.();
    };
    viewport.addEventListener("scroll", loadOnScroll, { passive: true });
    return () => { cleanup(); viewport.removeEventListener("scroll", loadOnScroll); };
  }, [timelineKey]);

  useLayoutEffect(() => {
    if (previousTimelineRef.current !== timelineKey || shouldFollowRef.current) return;
    const viewport = rootRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (viewport) restoreChatScrollAnchor(viewport, anchorRef.current);
  }, [messages, timelineKey, olderPending, olderError]);

  useEffect(() => {
    const conversationChanged = previousTimelineRef.current !== timelineKey;
    const forced = forceFollowKey !== null &&
      previousForceKeyRef.current !== forceFollowKey;
    if (conversationChanged || forced || shouldFollowRef.current) {
      const viewport = rootRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
      shouldFollowRef.current = true;
    }
    previousTimelineRef.current = timelineKey;
    previousForceKeyRef.current = forceFollowKey;
  }, [timelineKey, forceFollowKey, lastMessageId, messages.length, tailRevision]);

  const dateGroups = useMemo(() => groupByDate(messages), [messages]);

  return (
    <div ref={rootRef} className="chat-message-scroll min-h-0 w-full flex-1 overflow-hidden">
      <ScrollArea className="h-full w-full overflow-hidden">
        <div data-chat-message-content className="mx-auto flex max-w-[720px] flex-col gap-2 px-4 py-3">
        {onLoadOlder && <div className="flex flex-col items-center gap-1 py-1 text-xs text-muted-foreground" aria-live="polite">
          {olderStatus === "maybe-more" && <Button variant="ghost" size="sm" disabled={olderPending} onClick={() => {
            const viewport = rootRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
            if (viewport) { shouldFollowRef.current = false; anchorRef.current = captureChatScrollAnchor(viewport); }
            onLoadOlder();
          }}>{olderPending ? "正在加载更早消息…" : olderError ? "重试加载更早消息" : "加载更早消息"}</Button>}
          {olderError && <p role="alert">{olderError}</p>}
          {olderStatus === "stalled" && <p>历史游标无法继续，请稍后重读。</p>}
          {olderStatus === "exhausted" && <p>已加载接口可返回的历史</p>}
        </div>}
        <CapabilityExpansionProvider>{dateGroups.map((group) => (
          <div key={group.dateKey}>
            <DateSeparator timestamp={group.timestamp} />
            <div className="flex w-full flex-col items-stretch overflow-hidden">
              {group.messages.map((message, index) => {
                const previous = group.messages[index - 1];
                const isRoleSwitch = previous && previous.kind !== message.kind;

                return (
                  <div
                    key={message.id}
                    className={cn(isRoleSwitch ? "my-3" : "mt-1")}
                  >
                    <Bubble
                      message={message}
                      userName={userName}
                      onRegenerate={
                        message.id === regenerateTargetId && onRegenerate
                          ? () => onRegenerate(message.id)
                          : undefined
                      }
                      regenerateDisabled={!regenerateEnabled}
                      onInsert={onInsert}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}</CapabilityExpansionProvider>
        </div>
      </ScrollArea>
    </div>
  );
}

export const BubbleList = memo(BubbleListInner);
