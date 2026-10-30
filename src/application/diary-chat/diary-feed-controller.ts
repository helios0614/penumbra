import { startDiaryFeed } from "@/domain/diary/diary-feed-client";
import { isDiaryDate } from "@/domain/diary/diary-date";

export interface DiaryFeedNotice {
  readonly kind: "started" | "draft" | "refused" | "uncertain";
  readonly entryId?: string;
  readonly text: string;
}
export interface DiaryFeedState {
  readonly busyDate: string | null;
  readonly notices: Readonly<Record<string, DiaryFeedNotice>>;
}
export const initialDiaryFeedState: DiaryFeedState = { busyDate: null, notices: {} };

/** Page-local POST guard and dated receipts, never a global auto-feed task registry. */
export function createDiaryFeedController(refreshIndex: () => Promise<unknown>, start = startDiaryFeed) {
  let state = initialDiaryFeedState, disposed = false;
  let request: AbortController | null = null;
  const listeners = new Set<(state: DiaryFeedState) => void>();
  const publish = (patch: Partial<DiaryFeedState>) => {
    if (disposed) return;
    state = { ...state, ...patch }; listeners.forEach(listener => listener(state));
  };
  async function launch(date: string, replace: boolean, expectedDraft?: string) {
    if (disposed || request || !isDiaryDate(date)) return;
    if (replace && (state.notices[date]?.kind !== "draft" || state.notices[date]?.entryId !== expectedDraft)) return;
    const abort = new AbortController(); request = abort;
    publish({ busyDate: date });
    let notice: DiaryFeedNotice;
    try {
      const result = await start(date, replace, abort.signal);
      if (disposed) return;
      notice = result.kind === "started" ? { ...result, text: "已开始投喂，可稍后查看对话中的已保存消息。" }
        : result.kind === "draft" ? { ...result, text: "这一天已有草稿，可以继续原日记，或确认替换后重新投喂。" }
        : { kind: "refused", text: "未启动投喂：这一天可能已有归档日记，或没有可投喂的记忆。请查看日历记录。" };
    } catch {
      if (disposed) return;
      notice = { kind: "uncertain", text: "启动结果待核对。请先刷新日历，若已有记录可进入对话；不要直接再次投喂，以免重复创建。" };
    } finally {
      request = null;
      publish({ busyDate: null });
    }
    if (disposed) return;
    publish({ notices: { ...state.notices, [date]: notice } });
    // One read even after an unknown POST result. No POST retry or permanent polling.
    try { await refreshIndex(); } catch { /* The calendar owns its read error and manual retry. */ }
  }
  return {
    getState: () => state,
    start: (date: string) => launch(date, false),
    replaceConfirmed: (date: string, draftId: string) => launch(date, true, draftId),
    subscribe(listener: (value: DiaryFeedState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { disposed = true; request?.abort(); listeners.clear(); },
  };
}
export type DiaryFeedController = ReturnType<typeof createDiaryFeedController>;
