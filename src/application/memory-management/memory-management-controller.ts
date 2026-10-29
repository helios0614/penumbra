import { allowsMemorySourceActions, checkMemorySource, deleteAndRequeueMemory, deleteMemory, digestMemories, editMemory, readMemoryTask, resummarizeMemory, type MemoryEditInput, type MemoryRequeueTask } from "@/domain/memory";
import type { MemoryListController } from "@/application/memory-list";
import { INITIAL_MEMORY_MANAGEMENT_STATE, type MemoryAction, type MemoryManagementState, type MemorySourceRead } from "./memory-management-types";
import { memoryManagementError, MEMORY_SOURCE_REASONS } from "./memory-management-service";

const defaults = { checkMemorySource, deleteAndRequeueMemory, deleteMemory, digestMemories, editMemory, readMemoryTask, resummarizeMemory };
export type MemoryManagementApi = typeof defaults;
export function createMemoryManagementController(list: MemoryListController, api: MemoryManagementApi = defaults) {
  let state = INITIAL_MEMORY_MANAGEMENT_STATE;
  let disposed = false;
  const listeners = new Set<(s: MemoryManagementState) => void>();
  const reads = new Map<string, AbortController>();
  const publish = (patch: Partial<MemoryManagementState>) => {
    if (disposed) return;
    state = { ...state, ...patch }; listeners.forEach(listener => listener(state));
  };
  const putSource = (id: string, value: MemorySourceRead) => publish({ sources: { ...state.sources, [id]: value } });
  const addTask = (task: MemoryRequeueTask) => publish({ tasks: [...state.tasks.filter(row => row.task.id !== task.id), { task, reading: false, error: null }] });
  const checkSource = async (id: string) => {
    if (disposed || state.digestPending || state.actionPending) return;
    const memory = list.getState().data?.items.find(item => item.id === id);
    if (memory && !allowsMemorySourceActions(memory)) {
      reads.get(`source:${id}`)?.abort(); reads.delete(`source:${id}`);
      const sources = { ...state.sources }; delete sources[id]; publish({ sources });
      return;
    }
    reads.get(`source:${id}`)?.abort();
    const controller = new AbortController(); reads.set(`source:${id}`, controller);
    putSource(id, { status: "loading" });
    try {
      const value = await api.checkMemorySource(id, { signal: controller.signal });
      if (!controller.signal.aborted && !disposed) putSource(id, { status: "ready", value });
    } catch (error) {
      if (!controller.signal.aborted && !disposed) putSource(id, { status: "error", error: memoryManagementError(error) });
    } finally { if (reads.get(`source:${id}`) === controller) reads.delete(`source:${id}`); }
  };
  // A write can change provenance/representation for more than the target row.
  // Cancel old reads before it starts; only recheck sources the user has opened.
  const invalidateSources = () => {
    const ids = Object.keys(state.sources);
    ids.forEach(id => { reads.get(`source:${id}`)?.abort(); reads.delete(`source:${id}`); });
    publish({ sources: Object.fromEntries(ids.map(id => [id, { status: "loading" as const }])) });
    return ids;
  };
  const refreshSources = (ids: readonly string[]) => { ids.forEach(id => { void checkSource(id); }); };
  const refreshTask = async (id: string, replace = false) => {
    if (disposed || reads.has(`task:${id}`) && !replace) return;
    if (replace) reads.get(`task:${id}`)?.abort();
    const controller = new AbortController(); reads.set(`task:${id}`, controller);
    const update = (patch: Partial<MemoryManagementState["tasks"][number]>) => publish({ tasks: state.tasks.map(row => row.task.id === id ? { ...row, ...patch } : row) });
    update({ reading: true, error: null });
    try {
      const task = await api.readMemoryTask(id, { signal: controller.signal });
      if (disposed || controller.signal.aborted) return;
      const previous = state.tasks.find(row => row.task.id === id)?.task;
      if (previous && (previous.deletedMemoryId !== task.deletedMemoryId || previous.state === "completed" && task.state !== "completed")) throw new Error("Task identity/state mismatch");
      update({ task, reading: false, error: null });
      if (task.state === "completed" && previous?.state !== "completed") await list.load();
    } catch (error) {
      if (!disposed && !controller.signal.aborted) update({ reading: false, error: memoryManagementError(error) });
    } finally { if (reads.get(`task:${id}`) === controller) reads.delete(`task:${id}`); }
  };
  return {
    getState: () => state,
    subscribe(listener: (s: MemoryManagementState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    open(action: MemoryAction) {
      if (disposed || state.actionPending || state.digestPending) return;
      if ((action.kind === "resummarize" || action.kind === "requeue") && !allowsMemorySourceActions(action.memory)) return;
      publish({ action, actionError: null });
      if (action.kind === "requeue") void checkSource(action.memory.id);
    },
    close() {
      if (state.actionPending) return;
      const id = state.action?.memory.id;
      if (id) { reads.get(`source:${id}`)?.abort(); reads.delete(`source:${id}`); }
      publish({ action: null, actionError: null });
    },
    checkSource,
    async submit(input?: MemoryEditInput): Promise<boolean> {
      const action = state.action;
      if (!action || state.actionPending || state.digestPending || disposed) return false;
      if ((action.kind === "resummarize" || action.kind === "requeue") && !allowsMemorySourceActions(action.memory)) return false;
      const id = action.memory.id;
      const source = state.sources[id];
      if (action.kind === "requeue" && !(source?.status === "ready" && source.value.supported)) return false;
      if (action.kind === "edit" && !input) return false;
      publish({ actionPending: true, actionError: null });
      const sourceIds = invalidateSources();
      let success = false;
      try {
        const task = await list.runWrite(id, async options => {
          if (action.kind === "edit") await api.editMemory(id, input!, options);
          else if (action.kind === "delete") await api.deleteMemory(id, options);
          else if (action.kind === "resummarize") await api.resummarizeMemory(id, options);
          else return api.deleteAndRequeueMemory(id, options);
        }, "请求已完成，但记忆列表暂时无法刷新。请重新读取列表。");
        if (disposed) return false;
        if (task) { addTask(task); void refreshTask(task.id, true); }
        success = true;
        if (action.kind === "delete" || action.kind === "requeue") {
          const sources = { ...state.sources }; delete sources[id]; publish({ sources });
        }
        publish({ action: null, actionError: null });
        return true;
      } catch (error) {
        if (!disposed) {
          const safe = memoryManagementError(error);
          publish({ actionError: safe });
          if (action.kind === "requeue") {
            if (MEMORY_SOURCE_REASONS[safe.code]) putSource(id, { status: "ready", value: { supported: false, reason: safe.code } });
            else if (!safe.uncertain) putSource(id, { status: "error", error: safe });
            else if (source) putSource(id, source); // Same-ID retry can recover a committed task receipt.
          }
        }
        return false;
      } finally {
        publish({ actionPending: false });
        // Preserve the combined endpoint's authoritative conflict or uncertain receipt.
        refreshSources(sourceIds.filter(sourceId => sourceId !== id || action.kind !== "requeue" && !(success && action.kind === "delete")));
      }
    },
    async digest() {
      if (disposed || state.digestPending || state.actionPending || list.getState().isCreating || list.getState().pendingMemoryIds.length) return;
      publish({ digestPending: true, digestError: null, digestResult: null });
      const sourceIds = invalidateSources();
      try {
        const result = await list.runWrite("__memory_digest__", api.digestMemories, "总结请求已结束，但列表暂时无法同步，请重新读取列表核对。");
        publish({ digestResult: result });
      } catch (error) { publish({ digestError: memoryManagementError(error) }); }
      finally {
        publish({ digestPending: false });
        // Status reads must not hold the write lock after the digest/reconcile ends.
        refreshSources(sourceIds);
        if (!disposed) state.tasks.filter(row => row.task.state === "pending").forEach(row => { void refreshTask(row.task.id, true); });
      }
    },
    refreshTask,
    dispose() { disposed = true; reads.forEach(controller => controller.abort()); reads.clear(); listeners.clear(); },
  };
}
export type MemoryManagementController = ReturnType<typeof createMemoryManagementController>;
