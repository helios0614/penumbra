import * as client from "@/domain/quick-note";
import { triggerConfigInput, triggerConfigRows, type TriggerConfig, type TriggerConfigRow } from "@/domain/quick-note";
import { ApiError } from "@/lib/api";

export interface QuickNoteConfigState {
  readonly config: TriggerConfig | null;
  readonly draft: readonly TriggerConfigRow[] | null;
  readonly phase: "loading" | "ready" | "saving" | "verifying";
  readonly error: string | null;
  readonly saved: boolean;
  readonly needsReadback: boolean;
}

export const INITIAL_CONFIG_STATE: QuickNoteConfigState = {
  config: null, draft: null, phase: "loading", error: null, saved: false, needsReadback: false,
};

function failure(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return "当前会话无权编辑配置，请检查登录状态。";
    if (error.status === 400 || error.status === 422) return "配置未通过服务端校验，请检查截止小时与名称。";
    if (error.status === 409) return "服务端拒绝保存，请先重新读取配置核对。";
    return "请求失败，请检查连接后重试。";
  }
  return error instanceof Error ? error.message : "配置请求失败，请重试。";
}

export function createQuickNoteConfigController(onRead: (config: TriggerConfig) => void, deps = client) {
  let state = INITIAL_CONFIG_STATE;
  let disposed = false;
  let abort: AbortController | null = null;
  const listeners = new Set<(state: QuickNoteConfigState) => void>();
  const publish = (patch: Partial<QuickNoteConfigState>) => {
    if (disposed) return;
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener(state));
  };
  const busy = () => state.phase !== "ready";

  async function read(verify = false) {
    if (disposed || state.phase === "saving" || state.phase === "verifying" || abort) return;
    const request = new AbortController();
    abort = request;
    publish({ phase: verify ? "verifying" : "loading", error: null });
    try {
      const config = await deps.getTriggerConfig({ signal: request.signal, cache: "no-store" });
      if (disposed) return;
      const rows = triggerConfigRows(config);
      const matches = state.draft && JSON.stringify(rows) === JSON.stringify(state.draft);
      publish({ config, draft: verify && !matches ? state.draft : rows, needsReadback: false, saved: Boolean(verify && matches),
        error: verify && !matches ? "已读取服务端配置，尚未确认草稿已保存；草稿仍保留，请核对后再保存。" : null });
      onRead(config);
    } catch (error) {
      publish({ error: `${verify ? "无法核对保存结果，草稿已保留。" : "无法加载时段配置。"}${failure(error)}` });
    } finally {
      abort = null;
      publish({ phase: "ready" });
    }
  }

  async function save() {
    if (disposed || busy() || !state.draft || state.needsReadback) return;
    let input;
    try { input = triggerConfigInput(state.draft); }
    catch (error) { publish({ error: failure(error), saved: false }); return; }
    const request = new AbortController();
    abort = request;
    publish({ phase: "saving", error: null, saved: false });
    let written = false;
    try {
      await deps.saveTriggerConfig(input, { signal: request.signal });
      written = true;
      if (disposed) return;
      publish({ phase: "verifying", needsReadback: true });
      const config = await deps.getTriggerConfig({ signal: request.signal, cache: "no-store" });
      if (disposed) return;
      publish({ config, draft: triggerConfigRows(config), needsReadback: false, saved: true });
      onRead(config);
    } catch (error) {
      // Network/5xx failures may happen after persistence. Recover with GET, never an automatic PUT.
      const uncertain = written || !(error instanceof ApiError) || error.status === 0 || error.status >= 500 || error.status === 409;
      publish({ needsReadback: uncertain, error: written
        ? `保存请求已成功，但重新读取失败，草稿已保留。${failure(error)}`
        : `${uncertain ? "保存结果暂时无法确认，请先核对服务端配置。" : "保存失败。"}草稿已保留。${failure(error)}` });
    } finally {
      abort = null;
      publish({ phase: "ready" });
    }
  }

  return {
    getState: () => state,
    subscribe(listener: (value: QuickNoteConfigState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load: () => read(), verify: () => read(true), save,
    change(index: number, patch: Partial<TriggerConfigRow>) {
      if (disposed || busy() || !state.draft || state.needsReadback) return;
      publish({ draft: state.draft.map((row, i) => i === index ? { ...row, ...patch } : row), error: null, saved: false });
    },
    dispose() { disposed = true; abort?.abort(); listeners.clear(); },
  };
}

export type QuickNoteConfigController = ReturnType<typeof createQuickNoteConfigController>;
