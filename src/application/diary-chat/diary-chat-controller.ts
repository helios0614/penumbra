import { getDiaryChatEntry, getDiaryMessages } from "@/domain/diary/diary-chat-client";
import { DiaryEntryMissingError, type DiaryChatEntry, type DiaryMessage } from "@/domain/diary/diary-chat-types";
import type { RealtimeEvent } from "@/application/realtime";
import { diaryReadFailure } from "@/application/diary-reader/diary-reader-state";
import { createDiaryChatSend, initialDiarySendState, type DiarySendState } from "./diary-chat-send";
import type { sendDiaryMessage, regenerateDiaryMessage } from "@/domain/diary/diary-chat-send-client";
import { mutateDiaryMessage, DiaryMessageActionError } from "@/domain/diary/diary-chat-actions-client";

export interface DiaryChatState extends DiarySendState {
  readonly entryId: string | null;
  readonly entry: DiaryChatEntry | null;
  readonly messages: readonly DiaryMessage[] | null;
  readonly status: "idle" | "loading" | "ready" | "empty" | "error" | "missing";
  readonly loading: boolean;
  readonly mutation: { readonly kind: "edit" | "delete"; readonly messageId: string } | null;
  readonly error: { readonly source: "entry" | "history" | "deleted"; readonly message: string } | null;
}
export const initialDiaryChatState: DiaryChatState = { ...initialDiarySendState, entryId: null, entry: null, messages: null, status: "idle", loading: false, mutation: null, error: null };

/** One mounted Entry. Local sends never represent backend task/busy state. */
export function createDiaryChatController(deps: { getEntry: typeof getDiaryChatEntry; getMessages: typeof getDiaryMessages; sendMessage?: typeof sendDiaryMessage; regenerateMessage?: typeof regenerateDiaryMessage; mutateMessage?: typeof mutateDiaryMessage } = { getEntry: getDiaryChatEntry, getMessages: getDiaryMessages }) {
  let state = initialDiaryChatState;
  let disposed = false, sequence = 0, dirty = false, deleted = false;
  let read: AbortController | null = null;
  let mutationEpoch = 0, mutationAbort: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<(value: DiaryChatState) => void>();
  const publish = (patch: Partial<DiaryChatState>) => {
    if (disposed) return;
    state = { ...state, ...patch };
    listeners.forEach(listener => listener(state));
  };
  function cancel() {
    ++sequence; read?.abort(); read = null; clearTimeout(timer); timer = undefined; dirty = false;
  }
  function cancelMutation() { ++mutationEpoch; mutationAbort?.abort(); mutationAbort = null; }
  const send = createDiaryChatSend({ getState: () => state, publish, beforeSend() { cancel(); publish({ loading: false }); }, refresh }, deps.sendMessage, deps.regenerateMessage);
  function queue() {
    if (disposed || deleted || state.mutation || !state.entryId || !dirty || read || timer !== undefined) return;
    // Fixed window: a burst cannot postpone refresh indefinitely.
    timer = setTimeout(() => { timer = undefined; void refresh(); }, 150);
  }
  function invalidate() {
    if (disposed || deleted || !state.entryId) return;
    dirty = true; queue();
  }
  async function refresh() {
    if (disposed || !state.entryId) return;
    const entryId = state.entryId;
    cancel(); deleted = false;
    const current = sequence, readRevision = send.revision(), abort = new AbortController(); read = abort;
    const owns = () => !disposed && sequence === current && state.entryId === entryId;
    publish({ loading: true, error: null, status: state.messages === null ? "loading" : state.status });
    let source: "entry" | "history" = "entry";
    try {
      const entry = await deps.getEntry(entryId, { signal: abort.signal });
      if (!owns()) return;
      publish({ entry }); source = "history";
      const messages = await deps.getMessages(entryId, { signal: abort.signal });
      if (!owns()) return;
      publish({ messages, overlays: send.reconcile(messages, readRevision), status: messages.length ? "ready" : "empty", error: null });
      return messages;
    } catch (error) {
      if (!owns()) return;
      const missing = source === "entry" && error instanceof DiaryEntryMissingError;
      if (missing) { deleted = true; dirty = false; send.cancel(); cancelMutation(); }
      publish({ status: missing ? "missing" : "error", error: { source, message: missing ? error.message : `${source === "history" ? "消息历史" : "日记信息"}读取失败。${diaryReadFailure(error)}` },
        ...(missing ? { entry: null, messages: null, overlays: [], sending: false, mutation: null } : {}) });
    } finally {
      if (owns()) { read = null; publish({ loading: false }); queue(); }
    }
  }
  function target(original: DiaryMessage, role?: string) {
    if (disposed || deleted || !state.entry || original.entryId !== state.entryId || state.sending || state.mutation) throw new DiaryMessageActionError("当前对话不可操作，请等待本次操作结束或刷新核对。");
    const current = state.messages?.find(row => row.id === original.id && row.entryId === original.entryId);
    if (!current || !["user", "assistant"].includes(current.role) || role && current.role !== role || state.overlays.some(row => row.message.id === current.id && row.status !== undefined)) throw new DiaryMessageActionError("消息已不存在或尚未确认保存，请刷新核对。编辑内容已保留。");
    return current;
  }
  async function mutate(original: DiaryMessage, content: string | null) {
    const current = target(original, content === null ? undefined : "user");
    if (content !== null && current.content !== original.content && current.content !== content) throw new DiaryMessageActionError("消息正文已变化，编辑内容已保留。请关闭并刷新核对。");
    const entryId = original.entryId, owner = ++mutationEpoch, abort = new AbortController(); mutationAbort = abort;
    const owns = () => !disposed && owner === mutationEpoch && state.entryId === entryId;
    cancel(); publish({ loading: false, mutation: { kind: content === null ? "delete" : "edit", messageId: original.id } });
    let rejected = false;
    try {
      try { await (deps.mutateMessage ?? mutateDiaryMessage)(entryId, original.id, content, abort.signal); }
      catch { if (!owns()) throw new DiaryMessageActionError("对话已切换，请在原日记中刷新核对。"); rejected = true; }
      // Even an interrupted mutation may already be committed. Never retry it automatically.
      if (!owns()) throw new DiaryMessageActionError("对话已切换，请在原日记中刷新核对。");
      const messages = await refresh();
      if (!owns()) throw new DiaryMessageActionError("对话已切换，请在原日记中刷新核对。");
      if (rejected || !messages) throw new DiaryMessageActionError(content === null ? "删除结果尚未确认，请刷新核对，不会自动重复提交。" : "操作结果尚未确认，请刷新核对。编辑内容已保留，不会自动重复提交。");
      const saved = messages.find(row => row.entryId === entryId && row.id === original.id);
      if (content === null ? !!saved : !saved || saved.role !== "user" || saved.content !== content) throw new DiaryMessageActionError(!saved && content !== null ? "消息已不存在，编辑内容已保留。请关闭并刷新核对。" : "历史读回与操作结果不一致，请刷新核对。编辑内容已保留。");
    } finally { if (owns()) { mutationAbort = null; publish({ mutation: null }); queue(); } }
  }
  return {
    getState: () => state,
    open(entryId: string) {
      if (disposed) return Promise.resolve();
      cancel(); send.cancel(); cancelMutation(); deleted = false;
      publish({ ...initialDiaryChatState, entryId });
      return refresh();
    },
    refresh: () => state.mutation ? Promise.resolve() : refresh(), invalidate,
    edit: (original: DiaryMessage, content: string) => mutate(original, content),
    delete: (original: DiaryMessage) => mutate(original, null),
    regenerate(original: DiaryMessage) {
      target(original, "assistant");
      return send.regenerate(original.id);
    },
    send(content: string) {
      if (disposed || deleted || !state.entry || state.mutation) return Promise.resolve(false);
      return send.send(content);
    },
    handleEvent(event: RealtimeEvent) {
      if (disposed || !("entryId" in event) || event.entryId !== state.entryId) return;
      if (event.type === "diary-entry-deleted") {
        cancel(); send.cancel(); cancelMutation(); deleted = true;
        publish({ status: "missing", loading: false, entry: null, messages: null, overlays: [], sending: false, mutation: null, error: { source: "deleted", message: "这篇日记已被删除，请返回日历。" } });
      } else if (event.type === "diary-message-created" || event.type === "diary-entry-created") invalidate();
    },
    subscribe(listener: (value: DiaryChatState) => void) { if (!disposed) listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { disposed = true; cancel(); send.cancel(); cancelMutation(); listeners.clear(); },
  };
}
export type DiaryChatController = ReturnType<typeof createDiaryChatController>;
