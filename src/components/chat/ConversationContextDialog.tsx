import { useEffect, useRef, useState } from "react";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { ReadonlyConversation } from "./ReadonlyConversation";
import { readConversationContext, contextTime, type ConversationContextAnchor,
  type ConversationContext, type ConversationContextReader } from "./conversation-context";
import { useReadonlyDialogFrame } from "./useReadonlyDialogFrame";
import "./global-search.css";

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
  const contentRef = useReadonlyDialogFrame(!!anchor, onClose, "conversationContext");
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
  return <Dialog open={!!anchor} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent ref={contentRef} className="mist-paper conversation-context-dialog max-w-2xl" initialFocus={contentRef}>
      <DialogHeader className="px-4 pb-3 pt-4 sm:px-5 sm:pb-3 sm:pt-4">
        <DialogTitle>原文对话</DialogTitle>
        <DialogDescription>{visible.data?.conversationTitle ?? anchor?.conversationTitle ?? "来源会话"}{target && <> · {contextTime(target.createdAt)}</>}</DialogDescription>
      </DialogHeader>
      <DialogBody className="p-3 sm:p-4">
        {unavailable || visible.error === "unavailable"
          ? <p role="status">原文已不可用，可能已被删除或当前无法读取。</p>
          : visible.error ? <div role="alert"><p>原文读取失败，请稍后重试。</p><Button variant="ghost" className="mt-2" onClick={() => retry(n => n + 1)}>重新读取</Button></div>
          : visible.data ? <ReadonlyConversation messages={visible.data.messages} targetId={anchor!.messageId} />
          : <p role="status">正在读取原文…</p>}
      </DialogBody>
    </DialogContent>
  </Dialog>;
}
