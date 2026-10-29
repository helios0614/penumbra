import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { readMemoryOriginalSource, type MemoryOriginalSource, type MemorySourceMessage } from "@/domain/memory";
import { ReadonlyConversationDialog } from "@/components/chat/ReadonlyConversationDialog";
import { ReadonlyMessageBubble } from "@/components/chat/ReadonlyMessageBubble";
import { contextTime } from "@/components/chat/conversation-context";
import type { ApiRequestOptions } from "@/lib/api";

type Reader = (id: string, options?: ApiRequestOptions) => Promise<MemoryOriginalSource>;
type State = { key: string; data?: MemoryOriginalSource; error?: "unavailable" | "failed" };
export function MemorySourceDialog({ memoryId, onClose, read = readMemoryOriginalSource }: {
  memoryId: string; onClose: () => void; read?: Reader;
}) {
  const [state, setState] = useState<State>({ key: "" });
  const [attempt, retry] = useState(0);
  const key = JSON.stringify([memoryId, attempt]);
  const identity = useRef(key); identity.current = key;
  const sequence = useRef(0);
  useEffect(() => {
    const generation = ++sequence.current;
    const controller = new AbortController();
    setState({ key });
    void read(memoryId, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted && generation === sequence.current && key === identity.current) setState({ key, data });
    }).catch(error => {
      if (!controller.signal.aborted && generation === sequence.current && key === identity.current)
        setState({ key, error: error instanceof ApiError && [401, 403, 404].includes(error.status) ? "unavailable" : "failed" });
    });
    return () => { controller.abort(); sequence.current++; };
  }, [key, memoryId, read]);
  const visible = state.key === key ? state : { key };
  const messages = visible.data?.available ? visible.data.messages : undefined;
  return <ReadonlyConversationDialog open onClose={onClose} name="memorySource" description="记忆来源 · 时间范围内的聊天记录"
    status={visible.error ?? (visible.data?.available === false ? "unavailable" : messages ? messages.length ? "ready" : "empty" : "loading")}
    onRetry={() => retry(n => n + 1)}>
    {messages && <MemorySourceMessages messages={messages} />}
  </ReadonlyConversationDialog>;
}

export function MemorySourceMessages({ messages }: { messages: readonly MemorySourceMessage[] }) {
  return <ol className="space-y-2" aria-label="原文对话消息">
    {messages.map((message, index) => <ReadonlyMessageBubble key={index} role={message.role} name={message.name} createdAt={message.createdAt}>
      {message.role === "system" ? <section className="context-event min-w-0 [overflow-wrap:anywhere]" data-context-event>
        <div className="flex flex-wrap gap-x-2 text-[11px] leading-5 text-muted-foreground">
          <span className="font-medium text-muted-strong">{message.name || "系统消息"}</span>
          <time dateTime={new Date(message.createdAt * 1000).toISOString()}>{contextTime(message.createdAt)}</time>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-[13px] leading-[1.7]">{message.content}</p>
      </section> : <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.content}</p>}
    </ReadonlyMessageBubble>)}
  </ol>;
}
