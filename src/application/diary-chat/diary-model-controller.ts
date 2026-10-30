import { getDiaryModelConfiguration, saveDiaryModelConfiguration, type DiaryModelConfiguration, type DiaryModelSelection } from "@/domain/diary/diary-model-client";
import { ApiError } from "@/lib/api";

export type DiaryModelDraft = { connectionId: string; protocol: string; model: string };
export interface DiaryModelState {
  readonly entryId: string | null; readonly configuration: DiaryModelConfiguration | null;
  readonly draft: DiaryModelDraft; readonly dirty: boolean; readonly loading: boolean; readonly pending: boolean;
  readonly notice: string | null; readonly uncertain: boolean;
}
const draftOf = (config: DiaryModelConfiguration | null): DiaryModelDraft => ({ connectionId: config?.display.selection?.connectionId ?? "", protocol: config?.display.selection?.protocol ?? "", model: config?.display.selection?.model ?? "" });
const same = (a: DiaryModelDraft, b: DiaryModelDraft) => a.connectionId === b.connectionId && a.protocol === b.protocol && a.model.trim() === b.model.trim();
export const initialDiaryModelState: DiaryModelState = { entryId: null, configuration: null, draft: draftOf(null), dirty: false, loading: false, pending: false, notice: null, uncertain: false };

/** One Entry's explicit-save editor. Reads and writes cannot outlive their owner. */
export function createDiaryModelController(deps = { get: getDiaryModelConfiguration, save: saveDiaryModelConfiguration }) {
  let state = initialDiaryModelState, disposed = false, epoch = 0;
  let request: AbortController | null = null;
  const listeners = new Set<(state: DiaryModelState) => void>();
  const publish = (patch: Partial<DiaryModelState>) => { if (!disposed) { state = { ...state, ...patch }; listeners.forEach(fn => fn(state)); } };
  const cancelRequest = () => { ++epoch; request?.abort(); request = null; };
  async function refresh() {
    if (disposed || !state.entryId || state.pending) return;
    cancelRequest(); const owner = epoch, entryId = state.entryId, abort = new AbortController(); request = abort;
    publish({ loading: true, notice: null });
    const owns = () => !disposed && epoch === owner && state.entryId === entryId;
    try {
      const configuration = await deps.get(entryId, { signal: abort.signal });
      if (!owns()) return;
      const confirmed = draftOf(configuration), matches = configuration.independent && same(state.draft, confirmed);
      publish({ configuration, uncertain: false, ...(!state.dirty || matches ? { draft: confirmed, dirty: false } : {}), notice: state.dirty && !matches ? "已刷新当前配置，修改尚未保存。" : null });
    } catch { if (owns()) publish({ notice: "模型配置读取失败，请刷新状态后重试。" }); }
    finally { if (owns()) { request = null; publish({ loading: false }); } }
  }
  return {
    getState: () => state,
    open(entryId: string) { cancelRequest(); publish({ ...initialDiaryModelState, entryId }); return refresh(); },
    refresh,
    change(patch: Partial<DiaryModelDraft>) {
      if (disposed || state.pending || state.loading || !state.configuration) return null;
      const draft = { ...state.draft, ...patch }; publish({ draft, dirty: true, notice: null }); return draft;
    },
    cancel() { if (!disposed && !state.pending) publish({ draft: draftOf(state.configuration), dirty: false, notice: state.uncertain ? "修改已取消；上次保存结果仍待核对，请刷新状态。" : null }); },
    async save() {
      if (disposed || !state.entryId || !state.configuration || state.pending || state.loading || (!state.dirty && state.configuration.independent)) return;
      const selection: DiaryModelSelection = { ...state.draft, model: state.draft.model.trim() };
      if (!selection.connectionId || !selection.protocol || !selection.model) return;
      cancelRequest(); const owner = epoch, entryId = state.entryId, abort = new AbortController(); request = abort;
      const owns = () => !disposed && epoch === owner && state.entryId === entryId;
      publish({ pending: true, notice: null });
      try {
        const configuration = await deps.save(entryId, selection, { signal: abort.signal });
        if (owns()) publish({ configuration, draft: draftOf(configuration), dirty: false, uncertain: false, notice: "已保存当前日记的模型。" });
      } catch (error) {
        if (owns()) {
          const rejected = error instanceof ApiError && error.code === "HTTP_ERROR" && error.status >= 400 && error.status < 500 && error.status !== 408;
          publish({ uncertain: !rejected, notice: rejected ? "未能保存模型，请检查连接、接口格式和模型名称。修改已保留。" : "模型保存结果待核对，请刷新状态。修改已保留，勿重复提交。" });
        }
      } finally { if (owns()) { request = null; publish({ pending: false }); } }
    },
    subscribe(fn: (state: DiaryModelState) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    dispose() { disposed = true; cancelRequest(); listeners.clear(); },
  };
}
