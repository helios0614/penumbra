import { format, isToday, isYesterday } from "date-fns";
import { zhCN } from "date-fns/locale";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";

import type { ChatMessageViewModel } from "./chat-ui-types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { Bubble } from "./Bubble";
import { ChatAudio } from "@/components/media/ChatAudio";
import { musicIdentity } from "@/components/media/media-identity";
import type { AudioController } from "@/application/chat-media/audio-controller";
import { CapabilityExpansionProvider } from "./capabilities/CapabilityDisclosure";
import { captureChatScrollAnchor, restoreChatScrollAnchor, trackChatScroll, chatJumpOffset, type ChatScrollAnchor, type ChatScrollPin } from "./chat-scroll";
import { Button } from "@/components/ui/button";
import type { OlderPageStatus } from "@/application/message-history";
import type { MessageSearchResult } from "@/domain/message";
import { SearchHighlightContext, highlightSearchText } from "./search-highlight";

export type ReadingBookmark = { anchor: ChatScrollAnchor | null; following: boolean };
export type ChatReadingHandle = { capture(): ReadingBookmark; suspend(): void; resumeFollowing(): void };
export type ChatJump = { token: number; messageId?: string; offset?: number; following?: boolean };

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
  readonly groupKey: string;
  readonly dateKey: string;
  readonly timestamp: number;
  readonly messages: ChatMessageViewModel[];
}

function groupByDate(messages: readonly ChatMessageViewModel[]): DateGroup[] {
  const groups: DateGroup[] = [];
  const occurrences = new Map<string, number>();
  let currentKey = "";
  let currentGroup: DateGroup | null = null;

  for (const message of messages) {
    const key = format(new Date(message.createdAt * 1000), "yyyy-MM-dd");

    if (key !== currentKey) {
      const occurrence = occurrences.get(key) ?? 0;
      occurrences.set(key, occurrence + 1);
      currentGroup = {
        groupKey: `${key}:${occurrence}`,
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
  readonly showActions?: boolean;
  readonly readingRef?: MutableRefObject<ChatReadingHandle | null>;
  readonly jump?: ChatJump | null;
  readonly readingMode?: boolean;
  readonly query?: string;
  readonly activeResult?: MessageSearchResult | null;
  readonly activeMessageId?: string | null;
  readonly onUserRead?: () => void;
  readonly onLoadNewer?: () => void;
  readonly hasNewer?: boolean;
  readonly newerPending?: boolean;
  readonly newerError?: string | null;
  readonly onLatest?: () => void;
  readonly audioControllerFactory?: () => AudioController;
  readonly timelineKey: string;
  readonly messages: readonly ChatMessageViewModel[];
  readonly userName?: string;
  readonly forceFollowKey?: string | null;
  readonly regenerateTargetId?: string | null;
  readonly regenerateEnabled?: boolean;
  readonly regenerateUnavailableReason?: string | null;
  readonly onRegenerate?: (messageId: string) => void;
  readonly onInsert?: (text: string) => void;
  readonly onEdit?: (messageId: string) => void;
  readonly editUnavailableReason?: (messageId: string) => string | null;
  readonly onLoadOlder?: () => void;
  readonly olderStatus?: OlderPageStatus;
  readonly olderPending?: boolean;
  readonly olderError?: string | null;
}

interface MessageRowProps {
  readonly showActions: boolean;
  readonly message: ChatMessageViewModel;
  readonly userName?: string;
  readonly query: string;
  readonly active: boolean;
  readonly result?: MessageSearchResult | null;
  readonly onRegenerate?: (id: string) => void;
  readonly regenerateDisabled: boolean;
  readonly regenerateUnavailableReason?: string | null;
  readonly onInsert?: (text: string) => void;
  readonly onEdit?: (id: string) => void;
  readonly editUnavailableReason?: string | null;
}

// Per-row handlers and search values stay stable when another message streams.
const MessageRow = memo(function MessageRow({ message, userName, query, active, result,
  showActions, onRegenerate, regenerateDisabled, regenerateUnavailableReason, onInsert, onEdit, editUnavailableReason }: MessageRowProps) {
  const regenerate = useCallback(() => onRegenerate?.(message.id), [onRegenerate, message.id]);
  const edit = useCallback(() => onEdit?.(message.id), [onEdit, message.id]);
  const search = useMemo(() => ({ query, active, segments: result?.snippets.map(s => s.segmentKey) }), [query, active, result]);
  return <SearchHighlightContext value={search}>
    <Bubble message={message} userName={userName} showActions={showActions} onRegenerate={onRegenerate ? regenerate : undefined}
      regenerateDisabled={regenerateDisabled} regenerateUnavailableReason={regenerateUnavailableReason}
      onInsert={onInsert} onEdit={onEdit ? edit : undefined} editUnavailableReason={editUnavailableReason} />
    {active && result && <div className="chat-search-match mt-2 rounded-lg px-3 py-2 text-xs text-muted-strong" aria-label="当前消息匹配内容">
      {result.snippets.map((s, i) => <p key={i} className="break-words leading-6 [overflow-wrap:anywhere]">{highlightSearchText(s.text, query)}</p>)}
    </div>}
  </SearchHighlightContext>;
});

function BubbleListInner({
  showActions = true,
  readingRef, jump, readingMode=false, query="", activeResult, activeMessageId, onUserRead,
  onLoadNewer, hasNewer=false, newerPending=false, newerError, onLatest,
  audioControllerFactory,
  timelineKey,
  messages,
  userName,
  forceFollowKey = null,
  regenerateTargetId = null,
  regenerateEnabled = false,
  regenerateUnavailableReason,
  onRegenerate,
  onInsert,
  onEdit,
  editUnavailableReason,
  onLoadOlder,
  olderStatus,
  olderPending = false,
  olderError,
}: BubbleListProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const actions = useRef({ onEdit, onInsert, onRegenerate });
  useLayoutEffect(() => { actions.current = { onEdit, onInsert, onRegenerate }; }, [onEdit, onInsert, onRegenerate]);
  const rowActions = useMemo(() => ({
    edit: (id: string) => actions.current.onEdit?.(id),
    insert: (text: string) => actions.current.onInsert?.(text),
    regenerate: (id: string) => actions.current.onRegenerate?.(id),
  }), []);
  const shouldFollowRef = useRef(true);
  const previousTimelineRef = useRef<string | null>(null);
  const previousForceKeyRef = useRef<string | null>(null);
  const anchorRef = useRef<ChatScrollAnchor | null>(null);
  const blockedRef=useRef(readingMode);blockedRef.current=readingMode;
  const userIntentRef=useRef(onUserRead);userIntentRef.current=onUserRead;
  const appliedJump=useRef<number|null>(null);
  const highlightTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const highlighted=useRef<HTMLElement|null>(null);
  const pinRef=useRef<ChatScrollPin|null>(null);
  useLayoutEffect(()=>{
    if(!readingRef)return;
    readingRef.current={capture:()=>{const v=rootRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');return {anchor:v?captureChatScrollAnchor(v):null,following:shouldFollowRef.current};},suspend:()=>{shouldFollowRef.current=false;const v=rootRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');if(v)anchorRef.current=captureChatScrollAnchor(v);},resumeFollowing:()=>{shouldFollowRef.current=true;anchorRef.current=null;}};
    return()=>{readingRef.current=null;};
  },[readingRef]);
  useLayoutEffect(()=>{
    if(readingMode)shouldFollowRef.current=false;
    if(!jump||appliedJump.current===jump.token)return;
    const viewport=rootRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if(!viewport)return;
    const target=jump.messageId?Array.from(viewport.querySelectorAll<HTMLElement>('[data-message-id]')).find(n=>n.dataset.messageId===jump.messageId):null;
    if(jump.messageId&&!target)return;
    appliedJump.current=jump.token;
    pinRef.current=null;
    shouldFollowRef.current=!!jump.following;
    if(jump.following) {viewport.scrollTop=viewport.scrollHeight;anchorRef.current=null;}
    else if(target){viewport.scrollTop+=target.getBoundingClientRect().top-viewport.getBoundingClientRect().top-chatJumpOffset(viewport,jump.offset);anchorRef.current={id:target.dataset.messageId!,offset:target.getBoundingClientRect().top-viewport.getBoundingClientRect().top};pinRef.current={anchor:anchorRef.current,until:Date.now()+2000};target.focus({preventScroll:true});}
    highlighted.current?.removeAttribute("data-search-target");if(highlightTimer.current)clearTimeout(highlightTimer.current);
    if(target){target.dataset.searchTarget="true";highlighted.current=target;highlightTimer.current=setTimeout(()=>{target.removeAttribute("data-search-target");pinRef.current=null;anchorRef.current=captureChatScrollAnchor(viewport);},2000);}
  },[jump,messages,readingMode]);
  useEffect(()=>()=>{if(highlightTimer.current)clearTimeout(highlightTimer.current);},[]);
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
    const cleanup = trackChatScroll(viewport, content, shouldFollowRef, anchorRef,()=>userIntentRef.current?.(),blockedRef,pinRef);
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
    if (!blockedRef.current && (conversationChanged || forced || shouldFollowRef.current)) {
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
          {olderError && onLatest && <Button variant="ghost" size="sm" onClick={onLatest}>回到最新</Button>}
          {olderStatus === "stalled" && <p>历史游标无法继续，请稍后重读。</p>}
          {olderStatus === "exhausted" && <p>已加载接口可返回的历史</p>}
        </div>}
        <ChatAudio scope={timelineKey} createController={audioControllerFactory} identities={messages.flatMap(message => "attachments" in message ? message.attachments.flatMap((a, index) => a.kind === "music" ? [musicIdentity(message.id, index, a)] : []) : [])}>
        <CapabilityExpansionProvider>{dateGroups.map((group) => (
          <div key={group.groupKey}>
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
                    <MessageRow
                      showActions={showActions}
                      message={message}
                      userName={userName}
                      query={query}
                      active={message.id === activeMessageId && !!query}
                      result={message.id === activeMessageId ? activeResult : undefined}
                      onRegenerate={message.id === regenerateTargetId && onRegenerate ? rowActions.regenerate : undefined}
                      regenerateDisabled={!regenerateEnabled}
                      regenerateUnavailableReason={message.id === regenerateTargetId ? regenerateUnavailableReason : "仅最新的普通回复可重新生成。"}
                      onInsert={onInsert ? rowActions.insert : undefined}
                      onEdit={onEdit ? rowActions.edit : undefined}
                      editUnavailableReason={editUnavailableReason?.(message.id)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}</CapabilityExpansionProvider></ChatAudio>
        {hasNewer&&<div className="flex flex-wrap justify-center gap-2 py-2 text-xs text-muted-foreground">
          <Button variant="ghost" size="sm" disabled={newerPending} onClick={onLoadNewer}>{newerPending?"正在加载更新消息…":"加载更新消息"}</Button>
          <Button variant="ghost" size="sm" onClick={onLatest}>回到最新</Button>
          {newerError&&<p role="alert">{newerError}</p>}
        </div>}
        </div>
      </ScrollArea>
    </div>
  );
}

export const BubbleList = memo(BubbleListInner);
