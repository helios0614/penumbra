import * as client from "@/domain/schedule/schedule-client";
import { getTriggerConfig } from "@/domain/quick-note/quick-note-client";
import { ApiError } from "@/lib/api";
import { validDate, validMinute, type ManagedScheduleKind, type Schedule, type ScheduleInput, type ScheduleList } from "@/domain/schedule";

type Action = "done" | "restore" | "cancel";
export interface ScheduleFeedback { readonly text: string; readonly error: boolean; readonly source: "create" | "action" }
export interface ScheduleIssue { readonly text: string; readonly id?: string; readonly action?: Action }
export interface ScheduleState extends ScheduleList {
  readonly loaded: boolean; readonly loading: boolean; readonly error: string | null;
  readonly pending: string | null; readonly feedback: ScheduleFeedback | null; readonly issue: ScheduleIssue | null;
  readonly zone: string | null; readonly zoneLoading: boolean; readonly zoneError: string | null;
}
export const initialScheduleState: ScheduleState = { items: [], unsupported: 0, loaded: false, loading: false, error: null,
  pending: null, feedback: null, issue: null, zone: null, zoneLoading: false, zoneError: null };
export function scheduleFailure(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "登录已失效，请重新登录后再试。";
    if (error.status === 503) return "服务暂不可用，请稍后重新读取。";
    if (error.status === 422) return "内容或时间未通过后端校验，请检查输入。";
    if (error.status === 403) return "当前会话没有操作权限。";
    if (error.code === "TIMEOUT") return "请求超时。";
    if (error.code === "NETWORK_ERROR") return "无法连接服务，请检查网络。";
  }
  return "操作未完成，请重新读取后核对。";
}
const uncertain = (error: unknown) => !(error instanceof ApiError && [400, 401, 403, 404, 422].includes(error.status));
export function canScheduleAction(item: Schedule, action: Action): boolean {
  if (action === "cancel") return ["reminder", "todo", "alarm", "monitor"].includes(item.kind) && (item.status === "active" || item.kind === "todo" && item.status === "done");
  return item.kind === "todo" && item.status === (action === "done" ? "active" : "done");
}

export function createScheduleController(kind: ManagedScheduleKind, api = { ...client, getTriggerConfig }) {
  const timed = kind === "alarm" || kind === "monitor", name = kind === "monitor" ? "查岗" : "闹钟";
  let state = { ...initialScheduleState }, disposed = false, scope = 0, again = false;
  const listeners = new Set<(value: ScheduleState) => void>();
  let read: { abort: AbortController; promise: Promise<boolean> } | null = null;
  let mutation: AbortController | null = null, zoneRead: AbortController | null = null;
  const publish = (change: Partial<ScheduleState>) => { if (!disposed) { state = { ...state, ...change }; listeners.forEach((listener) => listener(state)); } };
  const cancelRead = () => { read?.abort.abort(); read = null; publish({ loading: false }); };
  const ownsRead = (abort: AbortController) => read?.abort === abort;
  const refresh = (): Promise<boolean> => {
    if (disposed) return Promise.resolve(false);
    if (state.pending) { again = true; return Promise.resolve(false); }
    if (read) { again = true; return read.promise; }
    const abort = new AbortController();
    publish({ loading: true });
    const promise = (async () => {
      try {
        const snapshot = await (kind === "todo" ? api.listTodos : api.listSchedules)({ signal: abort.signal });
        if (disposed || abort.signal.aborted) return false;
        publish({ ...snapshot, loaded: true, error: null }); return true;
      } catch (error) { if (!abort.signal.aborted) publish({ error: scheduleFailure(error) }); return false; }
      finally {
        if (ownsRead(abort)) { read = null; publish({ loading: false }); if (again) { again = false; void refresh(); } }
      }
    })();
    read = { abort, promise }; return promise;
  };
  const verify = async (id: string, action: Action, signal: AbortSignal): Promise<boolean> => {
    // TODO's convenience endpoint omits cancelled rows. Verification needs the full snapshot.
    const snapshot = await api.listSchedules({ signal });
    if (disposed || signal.aborted) return false;
    publish({ ...snapshot, loaded: true, error: null });
    const item = snapshot.items.find((row) => row.id === id && row.kind === kind);
    const expected = action === "cancel" ? "cancelled" : action === "done" ? "done" : "active";
    if (!item || item.status !== expected) {
      publish({ issue: { id, action, text: !item ? "未找到原记录，无法确认操作结果。请重新核对，不会自动重发。" : `记录状态已变化，尚未核对到预期结果；正在执行的${name}无法撤回。` } });
      return false;
    }
    publish({ issue: null }); return true;
  };
  const success = (text: string, source: ScheduleFeedback["source"], owner: number) => { if (scope === owner) publish({ feedback: { text, error: false, source } }); };
  const finish = () => { mutation = null; publish({ pending: null }); if (again && !disposed) { again = false; void refresh(); } };
  return {
    getState: () => state,
    subscribe(listener: (value: ScheduleState) => void) { listeners.add(listener); listener(state); return () => { listeners.delete(listener); }; },
    refresh,
    changeScope() { scope++; publish({ feedback: null }); },
    acknowledgeIssue() { if (!state.pending) publish({ issue: null, feedback: null }); },
    async loadZone() {
      if (disposed) return;
      zoneRead?.abort(); const abort = new AbortController(); zoneRead = abort;
      publish({ zone: null, zoneError: null, zoneLoading: true });
      try {
        const config = await api.getTriggerConfig({ signal: abort.signal, cache: "no-store" });
        if (!disposed && !abort.signal.aborted) publish({ zone: config.timeZone });
      } catch (error) { if (!abort.signal.aborted) publish({ zoneError: `无法确认服务器时区，暂不能创建${name}。${scheduleFailure(error)}` }); }
      finally { if (zoneRead === abort) { zoneRead = null; publish({ zoneLoading: false }); } }
    },
    async create(content: string, triggerAt?: string): Promise<boolean> {
      if (disposed || state.pending || state.issue) return false;
      const input: ScheduleInput = { kind, content: content.trim(), ...(triggerAt ? { triggerAt } : {}) };
      const invalid = !input.content || timed && (!state.zone || state.zoneLoading || !triggerAt || !validMinute(triggerAt))
        || kind === "reminder" && triggerAt && !validDate(triggerAt) && !validMinute(triggerAt);
      if (invalid) { publish({ feedback: { source: "create", error: true, text: "请检查内容、日期时间及服务器时区。" } }); return false; }
      cancelRead(); const abort = new AbortController(); mutation = abort; const owner = scope;
      publish({ pending: "create", feedback: null });
      try {
        const item = await api.createSchedule(input, { signal: abort.signal });
        if (disposed || abort.signal.aborted) return false;
        publish({ items: [...state.items.filter((row) => row.id !== item.id), item] });
        success(kind === "reminder" ? "记挂已创建" : kind === "todo" ? "待办已添加" : `${name}已创建`, "create", owner);
        again = true; return true;
      } catch (error) {
        if (disposed) return false;
        if (uncertain(error)) publish({ issue: { text: `${scheduleFailure(error)} 创建结果未知，请先刷新并核对列表，避免重复创建。系统不会自动重发。` } });
        else publish({ feedback: { source: "create", error: true, text: scheduleFailure(error) } });
        return false;
      } finally { finish(); }
    },
    async act(id: string, action: Action): Promise<boolean> {
      if (disposed || state.pending || state.issue) return false;
      const item = state.items.find((row) => row.id === id && row.kind === kind);
      if (!item || !canScheduleAction(item, action)) { publish({ feedback: { source: "action", error: true, text: "记录已变化，请刷新后再操作。" } }); return false; }
      cancelRead(); const abort = new AbortController(); mutation = abort; const owner = scope;
      publish({ pending: id, feedback: null });
      try {
        await api.mutateSchedule(id, action, { signal: abort.signal });
        if (disposed || abort.signal.aborted) return false;
        publish({ issue: { id, action, text: "操作已返回，正在重新读取并核对记录状态。" } });
        if (!await verify(id, action, abort.signal)) return false;
        success(action === "done" ? "待办已完成" : action === "restore" ? "待办已恢复" : kind === "monitor" ? "查岗已标记取消" : "已取消", "action", owner); return true;
      } catch (error) {
        if (disposed) return false;
        if (state.issue || uncertain(error)) publish({ issue: { id, action, text: "操作结果尚未核实，请重新读取核对；不会自动重发。" } });
        else publish({ feedback: { source: "action", error: true, text: scheduleFailure(error) } });
        return false;
      } finally { finish(); }
    },
    async checkIssue() {
      if (disposed || state.pending) return;
      const issue = state.issue;
      if (!issue?.id || !issue.action) { await refresh(); return; }
      const abort = new AbortController(); mutation = abort;
      const owner = scope;
      publish({ pending: "verify" });
      try { if (await verify(issue.id, issue.action, abort.signal)) success("已核对记录状态", "action", owner); }
      catch { publish({ issue: { ...issue, text: "仍无法核对操作结果，请稍后重新读取。" } }); }
      finally { finish(); }
    },
    dispose() { disposed = true; scope++; read?.abort.abort(); mutation?.abort(); zoneRead?.abort(); listeners.clear(); },
  };
}
export type ScheduleController = ReturnType<typeof createScheduleController>;
