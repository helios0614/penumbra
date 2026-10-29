import type { ReactNode } from "react";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useReadonlyDialogFrame } from "./useReadonlyDialogFrame";
import "./global-search.css";

/** Shared reading surface for precise message windows and unanchored source rows. */
export function ReadonlyConversationDialog({ open, onClose, description, status, onRetry, children, name = "conversationContext" }: {
  open: boolean; onClose: () => void; description: ReactNode;
  status: "loading" | "ready" | "unavailable" | "empty" | "failed";
  onRetry: () => void; children?: ReactNode; name?: string;
}) {
  const contentRef = useReadonlyDialogFrame(open, onClose, name);
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent ref={contentRef} className="mist-paper conversation-context-dialog max-w-2xl" initialFocus={contentRef}>
      <DialogHeader className="px-4 pb-3 pt-4 sm:px-5 sm:pb-3 sm:pt-4">
        <DialogTitle>原文对话</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogBody className="p-3 sm:p-4">
        {status === "unavailable" ? <p role="status">原文已不可用，可能没有可追溯的来源、已被删除或当前无法读取。</p>
          : status === "empty" ? <p role="status">此来源范围内没有可显示的原文消息。</p>
          : status === "failed" ? <div role="alert"><p>原文读取失败，请稍后重试。</p><Button variant="ghost" className="mt-2" onClick={onRetry}>重新读取</Button></div>
          : status === "ready" ? children : <p role="status">正在读取原文…</p>}
      </DialogBody>
    </DialogContent>
  </Dialog>;
}
