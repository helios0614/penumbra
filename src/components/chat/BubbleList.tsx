import { useRef, useEffect, useMemo, memo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Bubble } from "./Bubble";
import { SystemCommandGroup } from "./system-command/SystemCommandGroup";
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

// ─── 日期分组 ───

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

// ─── 消息分段：连续 system 消息合并为一组 ───

interface MessageSegment {
  type: "single" | "system-group";
  messages: ChatMessage[];
}

function segmentMessages(messages: ChatMessage[]): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let systemBatch: ChatMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemBatch.push(msg);
    } else {
      // 先把之前累积的系统消息推入
      if (systemBatch.length > 0) {
        segments.push({ type: "system-group", messages: systemBatch });
        systemBatch = [];
      }
      segments.push({ type: "single", messages: [msg] });
    }
  }
  // 尾部系统消息
  if (systemBatch.length > 0) {
    segments.push({ type: "system-group", messages: systemBatch });
  }

  return segments;
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
        {dateGroups.map((group) => {
          const segments = segmentMessages(group.messages);
          return (
            <div key={group.dateKey}>
              <DateSeparator timestamp={group.timestamp} />
              <div className="flex flex-col items-stretch w-full overflow-hidden">
                {segments.map((seg, segIdx) => {
                  if (seg.type === "system-group") {
                    return (
                      <div key={`sys-${seg.messages[0].id}`} className="w-full py-0.5">
                        <SystemCommandGroup messages={seg.messages} />
                      </div>
                    );
                  }
                  // single — 普通消息
                  const msg = seg.messages[0];
                  // 判断是否需要加大间距（角色切换时）
                  const prevSeg = segIdx > 0 ? segments[segIdx - 1] : null;
                  const prevRole = prevSeg?.messages[0]?.role;
                  const isRoleSwitch = prevRole && prevRole !== msg.role;
                  return (
                    <div key={msg.id} className={cn(isRoleSwitch ? "my-3" : "mt-1")}>
                      <Bubble
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
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}

export const BubbleList = memo(BubbleListInner);
