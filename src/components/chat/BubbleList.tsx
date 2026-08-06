import { format, isToday, isYesterday } from "date-fns";
import { zhCN } from "date-fns/locale";
import { memo, useEffect, useMemo, useRef } from "react";

import type { ChatMessageViewModel } from "@/components/chat-workspace/presentation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { Bubble } from "./Bubble";

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
  readonly conversationId: string;
  readonly messages: readonly ChatMessageViewModel[];
}

function BubbleListInner({ conversationId, messages }: BubbleListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMessageId = messages[messages.length - 1]?.id ?? null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [conversationId, lastMessageId, messages.length]);

  const dateGroups = useMemo(() => groupByDate(messages), [messages]);

  return (
    <ScrollArea className="min-h-0 w-full flex-1 overflow-hidden">
      <div className="mx-auto flex max-w-[720px] flex-col gap-2 px-4 py-3">
        {dateGroups.map((group) => (
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
                    <Bubble message={message} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}

export const BubbleList = memo(BubbleListInner);
