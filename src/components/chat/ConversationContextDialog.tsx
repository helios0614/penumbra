import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { ReadonlyConversation } from "./ReadonlyConversation";
import { readConversationContext, contextTime, type ConversationContextAnchor,
  type ConversationContext, type ConversationContextReader } from "./conversation-context";
import { ReadonlyConversationDialog } from "./ReadonlyConversationDialog";

type State = { key: string; data?: ConversationContext; error?: "unavailable" | "failed" };
export function ConversationContextDialog({ anchor, onClose, read = readConversationContext, unavailable = false }: {
  anchor: ConversationContextAnchor | null;
  onClose: () => void;
  read?: ConversationContextReader;
  unavailable?: boolean;
}) {
  const [state, setState] = useState<State>({ key: "" });
  const [attempt, retry] = useState(0);
  const sequence = useRef(0);
  const anchorKey = anchor ? JSON.stringify([anchor.conversationId, anchor.messageId]) : "";
  const session = useRef({ anchorKey, version: 0 });
  if (session.current.anchorKey !== anchorKey) session.current = { anchorKey, version: session.current.version + 1 };
  const key = JSON.stringify([anchorKey, session.current.version, attempt]);
  const identity = useRef(key);
  identity.current = key;
  useEffect(() => {
    const generation = ++sequence.current;
    if (!anchor || unavailable) { setState({ key }); return; }
    const controller = new AbortController();
    setState({ key });
    void read(anchor, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted || generation !== sequence.current || key !== identity.current) return;
      if (data.conversationId !== anchor.conversationId || data.messageId !== anchor.messageId ||
        data.messages.some(m => m.conversationId !== anchor.conversationId) ||
        !data.messages.some(m => m.id === anchor.messageId && m.conversationId === anchor.conversationId &&
          ["user", "assistant", "system"].includes(m.roleKind))) {
        setState({ key, error: "unavailable" }); return;
      }
      setState({ key, data });
    }).catch(error => {
      if (controller.signal.aborted || generation !== sequence.current || key !== identity.current) return;
      setState({ key, error: error instanceof ApiError && [401, 403, 404].includes(error.status) ? "unavailable" : "failed" });
    });
    return () => { controller.abort(); sequence.current++; };
  }, [key, attempt, read, unavailable]);
  const visible = state.key === key ? state : { key };
  const target = visible.data?.messages.find(m => m.id === anchor?.messageId);
  return <ReadonlyConversationDialog open={!!anchor} onClose={onClose}
    description={<>{visible.data?.conversationTitle ?? anchor?.conversationTitle ?? "来源会话"}{target && <> · {contextTime(target.createdAt)}</>}</>}
    status={unavailable || visible.error === "unavailable" ? "unavailable" : visible.error ? "failed" : visible.data ? "ready" : "loading"}
    onRetry={() => retry(n => n + 1)}>
    {visible.data && <ReadonlyConversation messages={visible.data.messages} targetId={anchor!.messageId} />}
  </ReadonlyConversationDialog>;
}
