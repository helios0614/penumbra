import { useEffect } from "react";
import { isChatTraceEnabled, traceChatMessage } from "@/lib/chat-timeline";
import type { ChatMessageViewModel } from "./chat-ui-types";

export function useChatRenderTrace(message: ChatMessageViewModel) {
  const { id, content, executionStatus } = message;
  useEffect(() => {
    if (!isChatTraceEnabled()) return;
    const detail = { size: content.length, source: executionStatus === undefined ? "history" as const : content.length ? "sse" as const : "waiting" as const };
    traceChatMessage("ui.commit", id, detail);
    // A frame opportunity after DOM commit, not proof of a physical screen paint.
    const frame = requestAnimationFrame(() => traceChatMessage("ui.frame", id, detail));
    return () => cancelAnimationFrame(frame);
  }, [id, content, executionStatus]);
}
