import type { ArchivedDiary, getArchivedDiary } from "@/domain/diary";
import { getDiaryAutoFeed, setDiaryAutoFeed, updateArchivedDiary } from "@/domain/diary/diary-write-client";
import { diaryDraft, diaryUpdate, diaryWriteUncertain, sameDiaryDraft, type DiaryDraft } from "./diary-actions-state";
import type { DiaryState } from "./diary-reader-state";

export interface DiaryActionDependencies {
  readonly getArchivedDiary: typeof getArchivedDiary;
  readonly updateArchivedDiary: typeof updateArchivedDiary;
  readonly getDiaryAutoFeed: typeof getDiaryAutoFeed;
  readonly setDiaryAutoFeed: typeof setDiaryAutoFeed;
}
export function createDiaryActions(options: {
  readonly deps: DiaryActionDependencies;
  readonly getState: () => DiaryState;
  readonly publish: (patch: Partial<DiaryState>) => void;
  readonly onSaved: (entry: ArchivedDiary) => void;
}) {
  const { deps, getState, publish } = options;
  let disposed = false, write: AbortController | null = null, feedRead: AbortController | null = null, feedWrite: AbortController | null = null;
  let feedSeq = 0, feedTarget: boolean | null = null;
  const updateFeed = (patch: Partial<DiaryState["autoFeed"]>) => publish({ autoFeed: { ...getState().autoFeed, ...patch } });

  function accept(entry: ArchivedDiary, submitted: DiaryDraft) {
    const editor = getState().editor;
    if (!editor || disposed) return;
    options.onSaved(entry);
    const moreEdits = !sameDiaryDraft(editor.draft, submitted);
    publish({
      editor: moreEdits ? { ...editor, baseline: entry, submitted: null, uncertain: false, conflict: false, busy: null, error: "已确认上次保存，新增修改尚未保存。" } : null,
      notice: { text: "日记已保存" },
    });
  }

  async function verifyEdit() {
    const editor = getState().editor;
    if (disposed || !editor?.submitted || editor.busy) return false;
    const abort = new AbortController(); write = abort;
    publish({ editor: { ...editor, busy: "verify", error: null } });
    try {
      const latest = await deps.getArchivedDiary(editor.baseline.id, editor.baseline.date, { signal: abort.signal });
      if (disposed || abort.signal.aborted) return false;
      if (sameDiaryDraft(diaryDraft(latest), editor.submitted)) { accept(latest, editor.submitted); return true; }
      publish({ editor: { ...getState().editor!, busy: null, uncertain: true, error: "保存结果仍未确认，草稿已保留，请勿重复提交。" } });
    } catch {
      if (!disposed && !abort.signal.aborted) publish({ editor: { ...getState().editor!, busy: null, uncertain: true, error: "暂时无法核对保存结果。草稿已保留，请先备份后重试核对。" } });
    } finally { if (write === abort) write = null; }
    return false;
  }

  async function saveEdit() {
    const current = getState().editor;
    if (disposed || !current || current.busy || current.uncertain || current.conflict) return false;
    // Match the existing detail projection at submit time, without trimming while typing.
    const editor = { ...current, draft: { ...current.draft, tags: current.draft.tags.map((value) => value.trim()), keywords: current.draft.keywords.map((value) => value.trim()) } };
    let input;
    try { input = diaryUpdate(editor); } catch (error) {
      publish({ editor: { ...current, error: (error as Error).message } }); return false;
    }
    if (sameDiaryDraft(editor.draft, diaryDraft(editor.baseline))) { publish({ editor: null }); return true; }
    const abort = new AbortController(); write = abort;
    publish({ editor: { ...editor, busy: "save", error: null }, notice: null });
    let sent = false, accepted = false;
    try {
      const latest = await deps.getArchivedDiary(editor.baseline.id, editor.baseline.date, { signal: abort.signal });
      if (disposed || abort.signal.aborted) return false;
      if (!sameDiaryDraft(diaryDraft(latest), diaryDraft(editor.baseline))) {
        publish({ editor: { ...editor, busy: null, conflict: true, error: "日记已被修改，本次未保存。请先备份草稿，再刷新核对。" } });
        return false;
      }
      sent = true;
      publish({ editor: { ...getState().editor!, submitted: editor.draft } });
      await deps.updateArchivedDiary(editor.baseline.id, input, { signal: abort.signal, timeoutMs: 60_000 });
      accepted = true;
      const saved = await deps.getArchivedDiary(editor.baseline.id, editor.baseline.date, { signal: abort.signal });
      if (disposed || abort.signal.aborted) return false;
      if (!sameDiaryDraft(diaryDraft(saved), editor.draft)) {
        publish({ editor: { ...getState().editor!, busy: null, uncertain: true, error: "读回内容不一致，尚未确认保存。草稿已保留，请先核对结果。" } });
        return false;
      }
      accept(saved, editor.draft); return true;
    } catch (error) {
      if (disposed || abort.signal.aborted) return false;
      const uncertain = sent && (accepted || diaryWriteUncertain(error));
      publish({ editor: { ...getState().editor!, busy: null, uncertain, error: uncertain ? "保存结果未知，草稿已保留。请先核对，勿重复提交。" : sent ? "保存失败，草稿已保留，请稍后重试。" : "暂时无法读取日记，本次未保存。草稿已保留，请重试。" } });
      return false;
    } finally { if (write === abort) write = null; }
  }

  async function loadAutoFeed() {
    if (disposed || feedWrite) return false;
    feedRead?.abort(); const abort = new AbortController(), seq = ++feedSeq; feedRead = abort;
    updateFeed({ loading: true, error: null });
    try {
      const enabled = await deps.getDiaryAutoFeed({ signal: abort.signal });
      if (disposed || abort.signal.aborted || seq !== feedSeq) return false;
      const uncertain = getState().autoFeed.uncertain && enabled !== feedTarget;
      updateFeed({ enabled, loading: false, uncertain, error: uncertain ? "上次切换结果仍未确认，请稍后核对。" : null });
      return true;
    } catch {
      if (!disposed && !abort.signal.aborted && seq === feedSeq) updateFeed({ loading: false, error: "无法读取自动投喂设置，请重新读取。" });
      return false;
    } finally { if (feedRead === abort) feedRead = null; }
  }

  async function toggleAutoFeed(enabled: boolean) {
    const current = getState().autoFeed;
    if (disposed || feedWrite || current.loading || current.enabled === null || current.uncertain || current.enabled === enabled) return false;
    ++feedSeq; feedRead?.abort(); feedRead = null;
    const abort = new AbortController(); feedWrite = abort; feedTarget = enabled;
    updateFeed({ saving: true, error: null }); publish({ notice: null });
    let accepted = false;
    try {
      const returned = await deps.setDiaryAutoFeed(enabled, { signal: abort.signal });
      accepted = true;
      const confirmed = await deps.getDiaryAutoFeed({ signal: abort.signal });
      if (disposed || abort.signal.aborted) return false;
      if (returned !== enabled || confirmed !== enabled) {
        updateFeed({ enabled: confirmed, saving: false, uncertain: false, error: "当前设置与本次选择不一致，请核对。" }); return false;
      }
      updateFeed({ enabled: confirmed, saving: false, uncertain: false, error: null });
      publish({ notice: { text: confirmed ? "自动投喂记忆已开启" : "自动投喂记忆已关闭" } }); return true;
    } catch (error) {
      if (!disposed && !abort.signal.aborted) {
        const uncertain = accepted || diaryWriteUncertain(error);
        updateFeed({ saving: false, uncertain, error: uncertain ? "切换结果未知，请先核对，勿重复切换。" : "切换失败，保留上次确认的设置。" });
      }
      return false;
    } finally { if (feedWrite === abort) feedWrite = null; }
  }

  return {
    beginEdit() {
      const { reader, editor } = getState();
      if (disposed || editor || !reader?.entry || reader.loading) return;
      publish({ editor: { baseline: reader.entry, draft: diaryDraft(reader.entry), submitted: null, busy: null, error: null, uncertain: false, conflict: false }, notice: null });
    },
    changeDraft(patch: Partial<DiaryDraft>) {
      const editor = getState().editor;
      if (!disposed && editor && !editor.busy) publish({ editor: { ...editor, draft: { ...editor.draft, ...patch }, error: editor.uncertain ? editor.error : null } });
    },
    cancelEdit() { if (!disposed && !getState().editor?.busy) publish({ editor: null }); },
    saveEdit, verifyEdit, loadAutoFeed, toggleAutoFeed,
    dispose() { disposed = true; ++feedSeq; write?.abort(); feedRead?.abort(); feedWrite?.abort(); },
  };
}
