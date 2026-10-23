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
      editor: moreEdits ? { ...editor, baseline: entry, submitted: null, uncertain: false, conflict: false, busy: null, error: "上次保存已确认；当前新增修改尚未保存。" } : null,
      notice: { text: "日记已保存", description: "已回读核对日记内容；当前接口未提供向量处理结果。" },
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
      publish({ editor: { ...getState().editor!, busy: null, uncertain: true, error: "服务端内容与上次提交不一致，保存结果尚未确认。草稿已保留，请勿重复提交。" } });
    } catch {
      if (!disposed && !abort.signal.aborted) publish({ editor: { ...getState().editor!, busy: null, uncertain: true, error: "无法核对保存结果，记录可能已变化或不可用。草稿已保留，可复制备份后再次核对。" } });
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
        publish({ editor: { ...editor, busy: null, conflict: true, error: "服务端日记已变化，未发送保存请求。草稿已保留；请先备份修改，再返回阅读并刷新核对。" } });
        return false;
      }
      sent = true;
      publish({ editor: { ...getState().editor!, submitted: editor.draft } });
      await deps.updateArchivedDiary(editor.baseline.id, input, { signal: abort.signal, timeoutMs: 60_000 });
      accepted = true;
      const saved = await deps.getArchivedDiary(editor.baseline.id, editor.baseline.date, { signal: abort.signal });
      if (disposed || abort.signal.aborted) return false;
      if (!sameDiaryDraft(diaryDraft(saved), editor.draft)) {
        publish({ editor: { ...getState().editor!, busy: null, uncertain: true, error: "服务端回读与提交内容不一致，未确认保存成功。草稿已保留，请先核对保存结果。" } });
        return false;
      }
      accept(saved, editor.draft); return true;
    } catch (error) {
      if (disposed || abort.signal.aborted) return false;
      const uncertain = sent && (accepted || diaryWriteUncertain(error));
      publish({ editor: { ...getState().editor!, busy: null, uncertain, error: uncertain ? "保存结果暂时未知，草稿已保留。请先核对结果，不要重复提交。" : sent ? "保存失败，输入已保留。请检查连接或登录状态后重试。" : "无法核对服务端日记，未发送保存请求。草稿已保留，请重试。" } });
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
      updateFeed({ enabled, loading: false, uncertain, error: uncertain ? "当前状态已读取，但上次切换结果仍未确认，请稍后再次核对。" : null });
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
        updateFeed({ enabled: confirmed, saving: false, uncertain: false, error: "服务端当前设置与本次切换不一致，未确认切换成功。" }); return false;
      }
      updateFeed({ enabled: confirmed, saving: false, uncertain: false, error: null });
      publish({ notice: { text: confirmed ? "自动投喂记忆已开启" : "自动投喂记忆已关闭" } }); return true;
    } catch (error) {
      if (!disposed && !abort.signal.aborted) {
        const uncertain = accepted || diaryWriteUncertain(error);
        updateFeed({ saving: false, uncertain, error: uncertain ? "切换结果暂时未知，请先核对状态，不要重复切换。" : "切换失败，保留上次确认的设置。" });
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
