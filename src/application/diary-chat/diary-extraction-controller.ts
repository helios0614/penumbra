import { getDiaryChatEntry, getDiaryMessages } from "@/domain/diary/diary-chat-client";
import type { DiaryMessage } from "@/domain/diary/diary-chat-types";
import { getArchivedDiary, isDiaryDate, type ArchivedDiary } from "@/domain/diary";
import { parseDiaryBody, type DiaryBodyDraft } from "@/domain/diary/diary-body-parser";
import { hasDiaryText } from "@/domain/diary/diary-mappers";
import { updateArchivedDiary, type DiaryUpdate } from "@/domain/diary/diary-write-client";
import { diaryWriteUncertain } from "@/application/diary-reader/diary-actions-state";

export interface DiaryExtraction {
  readonly source: DiaryMessage;
  readonly date: string;
  readonly draft: DiaryBodyDraft;
  readonly submitted: DiaryUpdate | null;
  readonly invalid: boolean;
}
export interface DiaryExtractionState {
  readonly preview: DiaryExtraction | null;
  readonly busy: boolean;
  readonly error: string | null;
  readonly uncertain: boolean;
}
export const initialDiaryExtraction: DiaryExtractionState = { preview: null, busy: false, error: null, uncertain: false };
const sameSource = (a: DiaryMessage, b: DiaryMessage) => a.entryId === b.entryId && a.id === b.id && b.role === "assistant" && a.content === b.content;
const matches = (entry: ArchivedDiary, preview: DiaryExtraction, input: DiaryUpdate) => entry.id === preview.source.entryId && entry.date === preview.date &&
  entry.title === input.title && entry.content === input.content &&
  JSON.stringify(entry.tags) === JSON.stringify(input.tags) && JSON.stringify(entry.keywords) === JSON.stringify(input.keywords) &&
  (input.importance === undefined || entry.importance === input.importance);

/** One independent preview, one explicit write and one readback. No model/task lifecycle. */
export function createDiaryExtractionController(onSaved: (entry: ArchivedDiary) => void, deps = { getDiaryChatEntry, getDiaryMessages, getArchivedDiary, updateArchivedDiary }) {
  let state = initialDiaryExtraction, disposed = false, epoch = 0;
  let request: AbortController | null = null;
  const listeners = new Set<(value: DiaryExtractionState) => void>();
  const publish = (patch: Partial<DiaryExtractionState>) => { if (!disposed) { state = { ...state, ...patch }; listeners.forEach(listener => listener(state)); } };
  const invalidate = () => {
    if (state.preview) publish({ preview: { ...state.preview, invalid: true }, error: "来源消息已删除或变化，请取消预览后重新提取。" });
  };
  function open(source: DiaryMessage, date: string) {
    if (disposed || state.busy || state.preview || source.role !== "assistant" || !isDiaryDate(date)) return false;
    const draft = parseDiaryBody(source.content);
    if (!draft) { publish({ error: "无法提取：未找到有效的【正文】结构。" }); return false; }
    publish({ preview: { source, date, draft, submitted: null, invalid: false }, error: null, uncertain: false }); return true;
  }
  async function quickExtract(entryId: string, date: string) {
    if (disposed || state.busy || state.preview) return false;
    const owner = ++epoch, abort = new AbortController(); request = abort;
    const owns = () => !disposed && epoch === owner && !abort.signal.aborted;
    publish({ busy: true, error: null });
    try {
      const entry = await deps.getDiaryChatEntry(entryId, { signal: abort.signal });
      if (!owns()) return false;
      if (entry.id !== entryId || entry.date !== date) throw new Error();
      const rows = await deps.getDiaryMessages(entryId, { signal: abort.signal });
      if (!owns()) return false;
      const source = [...rows].reverse().find(row => row.entryId === entryId && row.role === "assistant" && parseDiaryBody(row.content));
      publish({ busy: false });
      if (source) return open(source, date);
      publish({ error: "暂未找到可提取正文的 AI 消息。" });
    } catch { if (owns()) publish({ error: "暂时无法读取对话，请稍后再试。" }); }
    finally { if (owns()) { request = null; publish({ busy: false }); } }
    return false;
  }
  async function save(verifyOnly = false) {
    const preview = state.preview;
    if (disposed || !preview || state.busy || !verifyOnly && (state.uncertain || preview.invalid)) return false;
    const draft = preview.draft;
    if (!verifyOnly && (!hasDiaryText(draft.content) || draft.importance !== null && (!Number.isFinite(draft.importance) || draft.importance < 0 || draft.importance > 1))) {
      publish({ error: "请填写有效正文，重要度需在 0 到 1 之间。" }); return false;
    }
    const input: DiaryUpdate | null = verifyOnly ? preview.submitted : {
      status: "done", title: draft.title, content: draft.content,
      tags: [...new Set(draft.tags.map(word => word.trim()).filter(Boolean))],
      keywords: [...new Set(draft.keywords.map(word => word.trim()).filter(Boolean))],
      ...(draft.importance === null ? {} : { importance: draft.importance }),
    };
    if (!input) return false;
    const owner = ++epoch, abort = new AbortController(); request = abort;
    const owns = () => !disposed && owner === epoch && !abort.signal.aborted;
    let sent = false, accepted = false;
    publish({ busy: true, error: null });
    try {
      if (!verifyOnly) {
        const entry = await deps.getDiaryChatEntry(preview.source.entryId, { signal: abort.signal });
        if (!owns()) return false;
        if (entry.id !== preview.source.entryId || entry.date !== preview.date) { invalidate(); return false; }
        const messages = await deps.getDiaryMessages(entry.id, { signal: abort.signal });
        if (!owns()) return false;
        if (state.preview?.invalid || !messages.some(row => sameSource(preview.source, row))) { invalidate(); return false; }
        sent = true; publish({ preview: { ...preview, submitted: input } });
        await deps.updateArchivedDiary(entry.id, input, { signal: abort.signal, timeoutMs: 60_000 }); accepted = true;
      }
      const saved = await deps.getArchivedDiary(preview.source.entryId, preview.date, { signal: abort.signal });
      if (!owns()) return false;
      if (!matches(saved, preview, input)) {
        publish({ uncertain: true, error: "读回内容不一致，草稿已保留，请先核对结果。" }); return false;
      }
      publish({ preview: null, uncertain: false, error: null }); onSaved(saved); return true;
    } catch (error) {
      if (owns()) {
        const uncertain = verifyOnly || sent && (accepted || diaryWriteUncertain(error));
        publish({ uncertain, error: uncertain ? "保存结果尚未确认，草稿已保留，请先核对结果。" : "保存失败，草稿已保留，请重试。" });
      }
    } finally { if (owns()) { request = null; publish({ busy: false }); } }
    return false;
  }
  return {
    getState: () => state, open, quickExtract, save: () => save(), verify: () => save(true),
    observe(entryId: string, messages: readonly DiaryMessage[] | null, exists = true) {
      const preview = state.preview;
      if (preview && (!exists || preview.source.entryId !== entryId || messages !== null && !messages.some(row => sameSource(preview.source, row)))) invalidate();
    },
    change(patch: Partial<DiaryBodyDraft>) { if (state.preview && !state.busy && !state.uncertain && !state.preview.invalid) publish({ preview: { ...state.preview, draft: { ...state.preview.draft, ...patch } }, error: null }); },
    cancel() { if (!state.busy) publish({ ...initialDiaryExtraction }); },
    reset() { ++epoch; request?.abort(); request = null; publish({ ...initialDiaryExtraction }); },
    subscribe(listener: (value: DiaryExtractionState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { disposed = true; ++epoch; request?.abort(); listeners.clear(); },
  };
}
export type DiaryExtractionController = ReturnType<typeof createDiaryExtractionController>;
