import { useRef, useEffect, useMemo, memo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bubble } from "./Bubble";
import type { ChatMessage } from "./types";
import { isToday, isYesterday, format } from "date-fns";
import { zhCN } from "date-fns/locale";

// ─── 时间分组标记 ───

function DateSeparator({ timestamp }: { timestamp: number }) {
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
    <div className="flex items-center gap-3 my-2">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs text-muted shrink-0">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ─── 分组逻辑 ───

interface DateGroup {
  dateKey: string;
  timestamp: number;
  messages: ChatMessage[];
}

function groupByDate(messages: ChatMessage[]): DateGroup[] {
  const groups: DateGroup[] = [];
  let currentKey = "";
  let currentGroup: DateGroup | null = null;

  for (const msg of messages) {
    const date = new Date(msg.created_at * 1000);
    const key = format(date, "yyyy-MM-dd");

    if (key !== currentKey) {
      currentGroup = { dateKey: key, timestamp: msg.created_at, messages: [] };
      groups.push(currentGroup);
      currentKey = key;
    }
    currentGroup!.messages.push(msg);
  }

  return groups;
}

// ─── 消息列表 ───

interface BubbleListProps {
  messages: ChatMessage[];
  streamingId?: string | null;
  streamingContent?: string;
  onRegenerate?: (msgId: string) => void;
  onDelete?: (msgId: string) => void;
}

function BubbleListInner({
  messages,
  streamingId,
  streamingContent,
  onRegenerate,
  onDelete,
}: BubbleListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // 新消息自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingContent]);

  const dateGroups = useMemo(() => groupByDate(messages), [messages]);

  if (messages.length === 0) {
    return null;
  }

  return (
    <ScrollArea className="flex-1 min-h-0 w-full overflow-hidden">
      <div className="px-4 py-3 max-w-[720px] mx-auto flex flex-col gap-2">
        {dateGroups.map((group) => (
          <div key={group.dateKey}>
            <DateSeparator timestamp={group.timestamp} />
            <div className="flex flex-col gap-1">
              {group.messages.map((msg) => (
                <Bubble
                  key={msg.id}
                  message={msg}
                  isStreaming={msg.id === streamingId}
                  streamingContent={
                    msg.id === streamingId ? streamingContent : undefined
                  }
                  onRegenerate={
                    onRegenerate
                      ? () => onRegenerate(msg.id)
                      : undefined
                  }
                  onDelete={onDelete ? () => onDelete(msg.id) : undefined}
                />
              ))}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}

export const BubbleList = memo(BubbleListInner);
