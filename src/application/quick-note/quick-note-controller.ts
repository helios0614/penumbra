import * as client from "@/domain/quick-note";
import { normalizeOutput, QuickNoteContractError, type QuickNote, type BackfillInput } from "@/domain/quick-note";
import { businessDate, businessRange, parseDateKey } from "./quick-note-date";
import { INITIAL_QUICK_NOTE_STATE, failureText, sameSavedNote, uncertainFailure, type QuickNoteState } from "./quick-note-state";

export function createQuickNoteController(deps = client, now = () => Date.now()) {
  let state: QuickNoteState = INITIAL_QUICK_NOTE_STATE;
  let disposed = false;
  let feedbackGeneration = 0;
  const listeners = new Set<(value: QuickNoteState) => void>();
  let listSeq = 0, configSeq = 0, candidateSeq = 0;
  let listAbort: AbortController | null = null;
  let configAbort: AbortController | null = null;
  let candidateAbort: AbortController | null = null;
  let writeAbort: AbortController | null = null;
  let activeLoad: { readonly key: string; readonly promise: Promise<boolean | null> } | null = null;
  const publish = (patch: Partial<QuickNoteState>) => {
    if (disposed) return;
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener(state));
  };

  function load(clear = false, fresh = false): Promise<boolean | null> {
    if (disposed || !state.config) return Promise.resolve(null);
    const config = state.config;
    const date = state.date;
    const key = `${date}|${config.timeZone}|${config.dayBoundaryHour}`;
    if (!fresh && activeLoad?.key === key && !listAbort?.signal.aborted) return activeLoad.promise;
    const seq = ++listSeq;
    listAbort?.abort();
    const abort = new AbortController();
    listAbort = abort;
    publish({ status: "loading", error: null, ...(clear ? { data: null } : {}) });
    const promise = (async (): Promise<boolean | null> => {
      try {
        const range = businessRange(date, config);
        const items: QuickNote[] = [];
        const seen = new Set<string>();
        for (let page = 1; ; page++) {
          const data = await deps.listQuickNotes({ ...range, page, pageSize: 10 }, { signal: abort.signal });
          if (disposed || seq !== listSeq) return null;
          const previousSize = items.length;
          for (const item of data.items) {
            if (!seen.has(item.id)) { seen.add(item.id); items.push(item); }
          }
          if (!data.hasMore) {
            // Publish one complete date, never a partial page as a full overview.
            publish({ data: { items }, page: 1, status: "success", error: null, ...(state.notice?.reconcile ? { notice: null } : {}) });
            return true;
          }
          if (items.length === previousSize) throw new QuickNoteContractError("无法完整读取这一天的速记，请重新读取记录。");
        }
      } catch (error) {
        if (disposed || seq !== listSeq) return null;
        publish({ status: "error", error: failureText(error) });
        return false;
      }
    })();
    activeLoad = { key, promise };
    const release = () => { if (activeLoad?.promise === promise) activeLoad = null; };
    void promise.then(release, release);
    return promise;
  }

  async function loadConfig() {
    if (disposed) return;
    feedbackGeneration++;
    const seq = ++configSeq;
    configAbort?.abort();
    configAbort = new AbortController();
    ++listSeq;
    listAbort?.abort();
    publish({ config: null, configLoading: true, configError: null, data: null, status: "idle", error: null, notice: null });
    try {
      const config = await deps.getTriggerConfig({ signal: configAbort.signal });
      if (disposed || seq !== configSeq) return;
      const date = state.date || businessDate(config, now());
      publish({ config, date, configLoading: false });
      await load(true);
    } catch (error) {
      if (!disposed && seq === configSeq) publish({ configLoading: false, configError: `无法读取有效时段配置。${failureText(error)}` });
    }
  }

  async function loadCandidates() {
    if (disposed) return;
    const seq = ++candidateSeq;
    candidateAbort?.abort();
    candidateAbort = new AbortController();
    publish({ candidatesLoading: true, candidatesError: null, candidates: null });
    try {
      const candidates = await deps.getIncomplete({ signal: candidateAbort.signal });
      if (!disposed && seq === candidateSeq) publish({ candidates, candidatesLoading: false });
    } catch (error) {
      if (!disposed && seq === candidateSeq) publish({ candidatesLoading: false, candidatesError: failureText(error) });
    }
  }

  async function mutate(kind: "step1" | "step2" | "delete" | "backfill", target: string, input?: BackfillInput) {
    if (disposed || state.pending) return false;
    if (kind === "backfill" && !input) return false;
    const abort = new AbortController();
    writeAbort = abort;
    const generation = feedbackGeneration;
    publish({ pending: { kind, target }, notice: null });
    try {
      if (kind === "backfill" && input) await deps.backfillQuickNote(input, { signal: abort.signal });
      else if (kind === "delete") await deps.deleteQuickNote(target, { signal: abort.signal });
      else if (kind === "step1" || kind === "step2") await deps.rerunQuickNote(target, kind, { signal: abort.signal });
      if (disposed) return false;
      const text = kind === "backfill" ? "已提交补写请求" : kind === "delete" ? "已删除" : kind === "step1" ? "Step 1 已完成" : "Step 2 已完成";
      const description = kind === "step1" ? "原正文已清空，可继续重跑 Step 2" : undefined;
      const synced = await load(false, true);
      if (generation === feedbackGeneration) publish({ notice: synced === false ? { tone: "error", text: `${text}。${description ? `${description}。` : ""}重新读取失败，请刷新记录核对；无需再次发起操作。`, reconcile: true } : { tone: "info", text, description, toast: kind === "backfill" ? "info" : "success" } });
      return generation === feedbackGeneration && synced !== false;
    } catch (error) {
      if (disposed) return false;
      const text = uncertainFailure(error) ? "操作结果暂时无法确认，已尝试重新读取记录核对。请查看日志与正文，勿重复提交来恢复读取失败。" : failureText(error);
      await load(false, true);
      if (generation === feedbackGeneration) publish({ notice: { tone: "error", text } });
      return false;
    } finally {
      writeAbort = null;
      publish({ pending: null });
    }
  }

  async function saveEditor() {
    if (disposed || state.pending || !state.editor || state.editor.uncertain) return;
    const editor = state.editor;
    const abort = new AbortController();
    writeAbort = abort;
    publish({ pending: { kind: "save", target: editor.baseline.id }, editor: { ...editor, error: null, conflict: null } });
    let sent = false;
    try {
      const latest = await deps.readQuickNote(editor.baseline, { signal: abort.signal });
      if (disposed) return;
      if (!latest || !sameSavedNote(latest, editor.baseline)) {
        publish({ editor: { ...editor, conflict: latest, error: latest ? "服务端内容已变化，草稿已保留。请核对最新正文后决定是否覆盖。" : "记录已删除，草稿已保留，请复制备份。" } });
        return;
      }
      sent = true;
      await deps.saveQuickNote(editor.baseline.id, editor.draft, { signal: abort.signal });
      if (disposed) return;
      publish({ editor: null, notice: { tone: "info", text: "正文已保存", toast: "success" } });
      await load(false, true);
    } catch (error) {
      if (disposed) return;
      publish({ editor: { ...editor, uncertain: sent && uncertainFailure(error), error: sent && uncertainFailure(error) ? "保存结果暂时无法确认，草稿已保留。请先核对服务端正文。" : failureText(error) } });
      if (sent && uncertainFailure(error)) await verifyEditor();
    } finally {
      writeAbort = null;
      publish({ pending: null });
    }
  }

  async function verifyEditor() {
    if (disposed || !state.editor || state.pending && state.pending.kind !== "save") return;
    const editor = state.editor;
    // Share the in-flight write lifetime, or create an abortable read for manual recovery.
    const own = !writeAbort;
    const abort = writeAbort ?? new AbortController();
    if (own) { writeAbort = abort; publish({ pending: { kind: "verify", target: editor.baseline.id } }); }
    try {
      const latest = await deps.readQuickNote(editor.baseline, { signal: abort.signal });
      if (disposed || state.editor?.baseline.id !== editor.baseline.id) return;
      if (latest && normalizeOutput(latest.output) === editor.draft) {
        publish({ editor: null, notice: { tone: "info", text: "已核对，正文已保存", toast: "success" } });
        await load(false, true);
      } else publish({ editor: { ...editor, uncertain: false, conflict: latest && !sameSavedNote(latest, editor.baseline) ? latest : null, error: latest ? "尚未确认草稿已保存，请核对服务端正文。草稿仍保留。" : "记录已删除，草稿已保留，请复制备份。" } });
    } catch {
      publish({ editor: { ...editor, uncertain: true, error: "重新读取失败，无法确认保存结果。草稿已保留，请再次核对。" } });
    } finally {
      if (own) { writeAbort = null; publish({ pending: null }); }
    }
  }

  return {
    getState: () => state,
    subscribe(listener: (value: QuickNoteState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load, loadConfig, loadCandidates, mutate, saveEditor, verifyEditor,
    async applyConfig(config: client.TriggerConfig) {
      if (disposed) return;
      const current = state.config;
      if (current && current.timeZone === config.timeZone && current.dayBoundaryHour === config.dayBoundaryHour && current.hours.length === config.hours.length && current.hours.every((hour, i) => hour === config.hours[i] && current.labels[String(hour)] === config.labels[String(hour)])) return;
      ++configSeq;
      configAbort?.abort();
      ++candidateSeq;
      candidateAbort?.abort();
      publish({ config, configLoading: false, configError: null, candidates: null, candidatesLoading: false, candidatesError: null });
      await load(true, true);
    },
    clearNotice() { feedbackGeneration++; publish({ notice: null }); },
    async selectDate(date: string) {
      if (disposed) return;
      try { parseDateKey(date); } catch (error) { publish({ notice: { tone: "error", text: failureText(error) } }); return; }
      if (date === state.date) return;
      feedbackGeneration++;
      publish({ date, page: 1, notice: null });
      await load(true);
    },
    beginEdit(note: QuickNote) {
      if (!disposed && !state.editor && !state.pending) publish({ notice: null, editor: { baseline: note, draft: normalizeOutput(note.output), error: null, conflict: null, uncertain: false } });
    },
    changeDraft(draft: string) {
      if (state.editor && !state.pending) publish({ editor: { ...state.editor, draft } });
    },
    cancelEdit() { if (!state.pending) publish({ editor: null }); },
    acceptConflict() {
      if (state.editor?.conflict && !state.pending) publish({ editor: { ...state.editor, baseline: state.editor.conflict, conflict: null, error: null } });
    },
    dispose() {
      disposed = true; ++listSeq; ++configSeq; ++candidateSeq;
      listeners.clear(); listAbort?.abort(); configAbort?.abort(); candidateAbort?.abort(); writeAbort?.abort();
    },
  };
}

export type QuickNoteController = ReturnType<typeof createQuickNoteController>;
