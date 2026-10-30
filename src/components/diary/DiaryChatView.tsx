import { useLayoutEffect, useMemo, useRef } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { ChatShell } from "@/components/chat/ChatShell";
import { BubbleList } from "@/components/chat/BubbleList";
import { Sender } from "@/components/chat/Sender";
import { Button } from "@/components/ui/button";
import { diaryDateLabel } from "@/application/diary-reader/diary-calendar";
import { useDiaryChat } from "./useDiaryChat";
import { presentDiaryTimeline } from "./diary-chat-presenter";
import "./diary-chat.css";

export function DiaryChatView({ entryId, onBack }: { readonly entryId: string; readonly onBack: () => void }) {
  const { state, controller, connection } = useDiaryChat(entryId);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }); }, [entryId]);
  const messages = useMemo(() => presentDiaryTimeline(entryId, state.messages, state.overlays), [entryId, state.messages, state.overlays]);
  return <div className="diary-chat-reading flex min-h-0 w-full flex-1 overflow-hidden"><ChatShell composer={<Sender key={entryId} onSend={content => controller?.send(content) ?? false}
    submitDisabled={!state.entry || state.sending} placeholder="继续这篇日记的对话…"
    statusMessage={state.sending ? "正在接收本次回复…" : undefined} />}
    header={<header className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-3 sm:px-4">
    <Button type="button" variant="ghost" className="min-h-11 shrink-0 gap-1 px-2" onClick={onBack} aria-label="返回日历"><ArrowLeft className="size-4" aria-hidden="true" /><span className="text-xs">日历</span></Button>
    <div className="min-w-0 flex-1">
      <h1 ref={heading} tabIndex={-1} className="text-sm font-semibold outline-none">Diary Chat</h1>
      <p className="text-xs leading-5 text-muted-strong">{state.entry ? <><time dateTime={state.entry.date}>{diaryDateLabel(state.entry.date)}</time><span className="ml-2" aria-label="日记状态">{state.entry.status}</span></> : "日记对话"}</p>
    </div>
    <Button type="button" variant="ghost" className="size-11 shrink-0" aria-label="刷新对话" disabled={!controller || state.loading} onClick={() => void controller?.refresh()}><RefreshCw className={state.loading ? "size-4 animate-spin motion-reduce:animate-none" : "size-4"} aria-hidden="true" /></Button>
  </header>} notices={<>
    {state.loading && <p role="status" className="shrink-0 px-4 py-2 text-xs text-muted-strong">{state.messages === null ? "正在读取对话…" : "正在刷新对话…"}</p>}
    {state.error && <div role="alert" className="shrink-0 px-4 py-2 text-sm leading-6"><p>{state.error.message}</p><Button type="button" variant="ghost" size="sm" disabled={state.loading} onClick={() => void controller?.refresh()}>重试读取</Button></div>}
    {state.sendError && <p role="alert" className="shrink-0 px-4 py-2 text-xs leading-5 text-muted-strong">{state.sendError}</p>}
    {(connection === "reconnecting" || connection === "blocked") && <p role="status" className="shrink-0 px-4 py-1 text-xs text-muted-strong">实时连接不可用，可手动刷新。</p>}
  </>}>
    {(state.messages !== null || messages.length > 0) && <BubbleList timelineKey={`diary:${entryId}`} messages={messages} showActions={false} forceFollowKey={state.submissionKey} />}
    {state.status === "empty" && messages.length === 0 && <p role="status" className="pointer-events-none absolute inset-x-4 top-1/2 text-center text-sm text-muted-strong">暂无消息</p>}
  </ChatShell></div>;
}
