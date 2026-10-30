import { getDiaryChatEntry, getDiaryMessages } from "@/domain/diary/diary-chat-client";
import { DiaryEntryMissingError, type DiaryChatEntry, type DiaryMessage } from "@/domain/diary/diary-chat-types";
import type { RealtimeEvent } from "@/application/realtime";
import { diaryReadFailure } from "@/application/diary-reader/diary-reader-state";

export interface DiaryChatState {
  readonly entryId: string | null;
  readonly entry: DiaryChatEntry | null;
  readonly messages: readonly DiaryMessage[] | null;
  readonly status: "idle" | "loading" | "ready" | "empty" | "error" | "missing";
  readonly loading: boolean;
  readonly error: { readonly source: "entry" | "history" | "deleted"; readonly message: string } | null;
}
export const initialDiaryChatState: DiaryChatState = { entryId: null, entry: null, messages: null, status: "idle", loading: false, error: null };

/** One mounted reading session; no generation, optimistic messages or task state. */
export function createDiaryChatController(deps = { getEntry: getDiaryChatEntry, getMessages: getDiaryMessages }) {
  let state = initialDiaryChatState;
  let disposed = false, sequence = 0, dirty = false, deleted = false;
  let read: AbortController | null = null;
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
  function queue() {
    if (disposed || deleted || !state.entryId || !dirty || read || timer !== undefined) return;
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
    const current = sequence, abort = new AbortController(); read = abort;
    const owns = () => !disposed && sequence === current && state.entryId === entryId;
    publish({ loading: true, error: null, status: state.messages === null ? "loading" : state.status });
    let source: "entry" | "history" = "entry";
    try {
      const entry = await deps.getEntry(entryId, { signal: abort.signal });
      if (!owns()) return;
      publish({ entry }); source = "history";
      const messages = await deps.getMessages(entryId, { signal: abort.signal });
      if (!owns()) return;
      publish({ messages, status: messages.length ? "ready" : "empty", error: null });
    } catch (error) {
      if (!owns()) return;
      const missing = source === "entry" && error instanceof DiaryEntryMissingError;
      if (missing) { deleted = true; dirty = false; }
      publish({ status: missing ? "missing" : "error", error: { source, message: missing ? error.message : `${source === "history" ? "消息历史" : "日记信息"}读取失败。${diaryReadFailure(error)}` },
        ...(missing ? { entry: null, messages: null } : {}) });
    } finally {
      if (owns()) { read = null; publish({ loading: false }); queue(); }
    }
  }
  return {
    getState: () => state,
    open(entryId: string) {
      if (disposed) return Promise.resolve();
      cancel(); deleted = false;
      publish({ ...initialDiaryChatState, entryId });
      return refresh();
    },
    refresh, invalidate,
    handleEvent(event: RealtimeEvent) {
      if (disposed || !("entryId" in event) || event.entryId !== state.entryId) return;
      if (event.type === "diary-entry-deleted") {
        cancel(); deleted = true;
        publish({ status: "missing", loading: false, entry: null, messages: null, error: { source: "deleted", message: "这篇日记已被删除，请返回日历。" } });
      } else if (event.type === "diary-message-created" || event.type === "diary-entry-created") invalidate();
    },
    subscribe(listener: (value: DiaryChatState) => void) { if (!disposed) listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { disposed = true; cancel(); listeners.clear(); },
  };
}
export type DiaryChatController = ReturnType<typeof createDiaryChatController>;
