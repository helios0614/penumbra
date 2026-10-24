import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { readMessageHeart } from "@/domain/message/heart-client";
import { CapabilityDetails } from "./CapabilityDetails";

export function HeartMarker({ messageId, conversationId }: { messageId: string; conversationId: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ kind: "loading" | "error" | "ready"; content: readonly string[] }>({ kind: "loading", content: [] });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setState({ kind: "loading", content: [] });
    void readMessageHeart(messageId, conversationId, { signal: controller.signal }).then(content => {
      if (!controller.signal.aborted) setState({ kind: "ready", content });
    }, () => { if (!controller.signal.aborted) setState({ kind: "error", content: [] }); });
    return () => controller.abort();
  }, [open, messageId, conversationId, attempt]);
  return <div className="min-w-0 max-w-full">
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="查看心声"
      className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] text-muted-foreground outline-none hover:bg-ai/5 focus-visible:ring-2 focus-visible:ring-ring/40">
      <Heart aria-hidden="true" className="size-3" />心声
    </button>
    {open && <div className="mist-solid mt-1 min-w-0 rounded-xl p-3">
      {state.kind === "loading" ? <p className="text-xs text-muted-foreground" role="status">正在读取心声…</p>
        : state.kind === "error" ? <div className="text-xs text-muted-strong" role="alert">心声读取失败。<button type="button" className="min-h-9 px-2 underline" onClick={() => setAttempt(attempt + 1)}>重新读取</button></div>
        : state.content.length ? <CapabilityDetails fields={state.content.map(text => ({ label: "心声", text }))} />
        : <p className="text-xs text-muted-foreground">这条消息的心声已不可用。</p>}
    </div>}
  </div>;
}
