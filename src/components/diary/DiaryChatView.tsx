import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { ChatShell } from "@/components/chat/ChatShell";
import { BubbleList } from "@/components/chat/BubbleList";
import { Sender } from "@/components/chat/Sender";
import { Button } from "@/components/ui/button";
import { MessageEditDialog } from "@/components/chat/MessageEditDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { DiaryMessage } from "@/domain/diary/diary-chat-types";
import { DiaryMessageActionError } from "@/domain/diary/diary-chat-actions-client";
import { diaryDateLabel } from "@/application/diary-reader/diary-calendar";
import { DiaryModelSelection } from "./DiaryModelSelection";
import { useDiaryChat } from "./useDiaryChat";
import { presentDiaryTimeline } from "./diary-chat-presenter";
import "./diary-chat.css";

export function DiaryChatView({ entryId, onBack }: { readonly entryId: string; readonly onBack: () => void }) {
  const { state, controller, connection } = useDiaryChat(entryId);
  const heading = useRef<HTMLHeadingElement>(null);
  const [editing, setEditing] = useState<DiaryMessage | null>(null);
  const [confirmation, setConfirmation] = useState<{ kind: "delete" | "regenerate"; message: DiaryMessage } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const confirmBusy = useRef(false);
  const [modelPending, setModelPending] = useState(false);
  const modelPendingRef = useRef(false);
  const onModelPending = useCallback((pending: boolean) => { modelPendingRef.current = pending; setModelPending(pending); }, []);
  const mounted = useRef(true);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }); }, [entryId]);
  const messages = useMemo(() => presentDiaryTimeline(entryId, state.messages, state.overlays), [entryId, state.messages, state.overlays]);
  const busy = state.sending || !!state.mutation || modelPending;
  const savedMessage = (id: string) => state.messages?.find(row => row.entryId === entryId && row.id === id);
  const available = (id: string) => {
    const row = savedMessage(id);
    const persisted = !!state.entry && !!row && !state.overlays.some(overlay => overlay.message.id === id);
    return { edit: persisted && !busy && row.role === "user", delete: persisted && !busy && ["user", "assistant"].includes(row.role), regenerate: persisted && !busy && row.role === "assistant" };
  };
  const confirm = (kind: "delete" | "regenerate", id: string) => {
    const message = savedMessage(id);
    if (message && available(id)[kind]) { setActionError(null); setConfirmation({ kind, message }); }
  };
  const safeError = (error: unknown) => error instanceof DiaryMessageActionError ? error.message : "操作结果尚未确认，请刷新核对。编辑内容已保留。";
  const submitConfirmation = async () => {
    if (!confirmation || !controller || confirmBusy.current || modelPendingRef.current) return;
    confirmBusy.current = true; setActionError(null);
    try {
      if (confirmation.kind === "regenerate") {
        setConfirmation(null);
        await controller.regenerate(confirmation.message);
      } else {
        await controller.delete(confirmation.message);
        if (mounted.current) setConfirmation(null);
      }
    } catch (error) { if (mounted.current) setActionError(safeError(error)); }
    finally { confirmBusy.current = false; }
  };
  const targetIndex = state.messages?.findIndex(row => row.id === confirmation?.message.id) ?? -1;
  const laterCount = targetIndex < 0 ? 0 : state.messages!.length - targetIndex - 1;
  return <div className="diary-chat-reading flex min-h-0 w-full flex-1 overflow-hidden"><ChatShell composer={<Sender key={entryId} onSend={content => modelPendingRef.current ? false : controller?.send(content) ?? false}
    toolsLabel="日记模型" tools={<DiaryModelSelection key={entryId} entryId={entryId} disabled={!state.entry || state.sending || !!state.mutation} onPendingChange={onModelPending} />}
    submitDisabled={!state.entry || busy} placeholder="继续这篇日记的对话…"
    statusMessage={state.sending ? "正在接收本次回复…" : undefined} />}
    header={<header className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-3 sm:px-4">
    <Button type="button" variant="ghost" className="min-h-11 shrink-0 gap-1 px-2" onClick={onBack} aria-label="返回日历"><ArrowLeft className="size-4" aria-hidden="true" /><span className="text-xs">日历</span></Button>
    <div className="min-w-0 flex-1">
      <h1 ref={heading} tabIndex={-1} className="text-sm font-semibold outline-none">Diary Chat</h1>
      <p className="text-xs leading-5 text-muted-strong">{state.entry ? <><time dateTime={state.entry.date}>{diaryDateLabel(state.entry.date)}</time><span className="ml-2" aria-label="日记状态">{state.entry.status}</span></> : "日记对话"}</p>
    </div>
    <Button type="button" variant="ghost" className="size-11 shrink-0" aria-label="刷新对话" disabled={!controller || state.loading || !!state.mutation} onClick={() => void controller?.refresh()}><RefreshCw className={state.loading ? "size-4 animate-spin motion-reduce:animate-none" : "size-4"} aria-hidden="true" /></Button>
  </header>} notices={<>
    {state.loading && <p role="status" className="shrink-0 px-4 py-2 text-xs text-muted-strong">{state.messages === null ? "正在读取对话…" : "正在刷新对话…"}</p>}
    {state.error && <div role="alert" className="shrink-0 px-4 py-2 text-sm leading-6"><p>{state.error.message}</p><Button type="button" variant="ghost" size="sm" disabled={state.loading} onClick={() => void controller?.refresh()}>重试读取</Button></div>}
    {state.sendError && <p role="alert" className="shrink-0 px-4 py-2 text-xs leading-5 text-muted-strong">{state.sendError}</p>}
    {actionError && !confirmation && <p role="alert" className="shrink-0 px-4 py-2 text-xs leading-5 text-muted-strong">{actionError}</p>}
    {(connection === "reconnecting" || connection === "blocked") && <p role="status" className="shrink-0 px-4 py-1 text-xs text-muted-strong">实时连接不可用，可手动刷新。</p>}
  </>}>
    {(state.messages !== null || messages.length > 0) && <BubbleList timelineKey={`diary:${entryId}`} messages={messages} actionsForMessage={available}
      onEdit={id => { const message = savedMessage(id); if (message && available(id).edit) setEditing(message); }}
      onDelete={id => confirm("delete", id)} onRegenerate={id => confirm("regenerate", id)} regenerateEnabled={!busy} forceFollowKey={state.submissionKey} />}
    {state.status === "empty" && messages.length === 0 && <p role="status" className="pointer-events-none absolute inset-x-4 top-1/2 text-center text-sm text-muted-strong">暂无消息</p>}
  </ChatShell>
    {editing?.entryId === entryId && controller && <MessageEditDialog key={`${entryId}:${editing.id}`} message={editing} description={null}
      unavailableReason={!state.entry || !savedMessage(editing.id) ? "消息已不存在，编辑内容已保留。请关闭并刷新核对。" : busy ? "正在处理本次消息操作。" : null}
      onSave={(original, content) => controller.edit(original, content)} saveErrorMessage={safeError} onClose={() => setEditing(null)} />}
    {confirmation && <AlertDialog open onOpenChange={(open, details) => { if (!open) { if (confirmBusy.current) details.cancel(); else setConfirmation(null); } }}>
      <AlertDialogContent finalFocus={heading}>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmation.kind === "delete" ? "删除消息" : "重新生成回复"}</AlertDialogTitle>
          <AlertDialogDescription>{confirmation.kind === "delete" ? "删除这条消息？此操作无法撤回。" :
            `重新生成后将替换这条回复，并删除提交时其后的消息（当前 ${laterCount} 条）。此操作无法撤回。`}</AlertDialogDescription>
          {confirmation.kind === "regenerate" && <p className="mt-2 text-xs leading-5 text-muted-strong">回复中的记忆、日程等命令可能再次执行；已执行的操作不会撤回。</p>}
          <p className="mt-3 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-6 text-muted-strong">{confirmation.message.content.length > 240 ? `${confirmation.message.content.slice(0, 240)}…` : confirmation.message.content}</p>
          {actionError && <p role="alert" className="mt-2 text-xs text-destructive-foreground">{actionError}</p>}
        </AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={!!state.mutation} onClick={() => setConfirmation(null)}>取消</AlertDialogCancel>
          <AlertDialogAction variant="destructive" loading={!!state.mutation} disabled={busy} onClick={() => void submitConfirmation()}>{confirmation.kind === "delete" ? "确认删除" : "确认重新生成"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
  </div>;
}
