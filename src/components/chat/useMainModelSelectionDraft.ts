import { useEffect, useRef, useState } from "react";
import type { ChatSetupViewModel } from "@/application/chat-setup";
import type { MainSelection } from "@/domain/runtime";
import { ApiError } from "@/lib/api";
import { mainDiagnosticMessage } from "@/components/chat-workspace/chat-sender-policy";

export type ModelDraft = { connectionId: string; protocol: string; model: string };
type Selection = Extract<MainSelection, { connectionId: string }>;
type Options = {
  setup: ChatSetupViewModel;
  disabled: boolean;
  configurationPending?: boolean;
  onSave?: (conversationId: string, selection: MainSelection) => Promise<void>;
  onRefresh?: () => Promise<void>;
  onPendingChange?: (pending: boolean) => void;
};
const draftOf = (selection: MainSelection | null | undefined): ModelDraft => ({
  connectionId: selection?.connectionId ?? "", protocol: selection?.protocol ?? "", model: selection?.model ?? "",
});
const same = (a: ModelDraft, b: ModelDraft) => a.connectionId === b.connectionId && a.protocol === b.protocol && a.model.trim() === b.model.trim();

/** Serializes UI edit intents through the existing PUT + readback callback.
 * Never cancels/retries a mutation to guess its result or validates connection protocols. */
export function useMainModelSelectionDraft(options: Options) {
  const [draft, setDraft] = useState(() => draftOf(options.setup.configuration?.selection));
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const latest = useRef(options); latest.current = options;
  const draftRef = useRef(draft);
  const confirmed = useRef(draftOf(options.setup.configuration?.selection));
  const dirtyRef = useRef(false);
  const active = useRef(false);
  const refreshing = useRef(false);
  const alive = useRef(true);
  const queued = useRef<Selection | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; queued.current = null; latest.current.onPendingChange?.(false); };
  }, []);
  const selectionKey = JSON.stringify(options.setup.configuration?.selection);
  useEffect(() => {
    const saved = draftOf(latest.current.setup.configuration?.selection);
    confirmed.current = saved;
    if (!active.current && !dirtyRef.current) { draftRef.current = saved; setDraft(saved); }
  }, [selectionKey, pending]);

  const blocked = () => latest.current.disabled || refreshing.current || (!!latest.current.configurationPending && !active.current);
  const complete = (value: ModelDraft) => !!value.connectionId && !!value.protocol.trim() && !!value.model.trim();
  const change = (patch: Partial<ModelDraft>) => {
    if (blocked()) return null;
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next; setDraft(next); setDirty(true); dirtyRef.current = true;
    queued.current = null; setNotice(null);
    return next;
  };
  const drain = async () => {
    if (active.current || !alive.current) return;
    active.current = true; setPending(true); latest.current.onPendingChange?.(true);
    try {
      while (queued.current && alive.current) {
        const selection = queued.current; queued.current = null;
        if (same(selection, confirmed.current)) {
          if (same(draftRef.current, selection)) { dirtyRef.current = false; setDirty(false); setNotice("已切换并确认模型状态。"); }
          continue;
        }
        const { setup, onSave } = latest.current;
        if (!onSave || !setup.conversationId || latest.current.disabled) break;
        await onSave(setup.conversationId, selection);
        if (!alive.current) return;
        confirmed.current = selection;
        if (!queued.current && same(draftRef.current, selection)) {
          dirtyRef.current = false; setDirty(false); setNotice("已切换并确认模型状态。");
        }
      }
    } catch (error) {
      if (alive.current) {
        queued.current = null; dirtyRef.current = true; setDirty(true);
        setNotice(modelSaveErrorMessage(error));
      }
    } finally {
      active.current = false;
      if (alive.current) { setPending(false); latest.current.onPendingChange?.(false); }
    }
  };
  const commit = (value = draftRef.current) => {
    if (blocked() || !latest.current.onSave || !latest.current.setup.conversationId || !complete(value)) return;
    if (!active.current && same(value, confirmed.current)) { dirtyRef.current = false; setDirty(false); return; }
    queued.current = { ...value, model: value.model.trim() };
    void drain();
  };
  const refresh = async () => {
    if (active.current || blocked() || !latest.current.onRefresh) return;
    active.current = true; refreshing.current = true; setPending(true); latest.current.onPendingChange?.(true); setNotice(null);
    try {
      await latest.current.onRefresh();
      if (alive.current) setNotice("已刷新状态，请核对当前生效模型。");
    } catch { if (alive.current) setNotice("暂时无法刷新状态，请稍后再试。"); }
    finally {
      active.current = false; refreshing.current = false;
      if (alive.current) { setPending(false); latest.current.onPendingChange?.(false); }
    }
  };
  return { draft, change, commit, pending, notice, dirty, refresh, locked: blocked(), complete: complete(draft) };
}

export function modelSaveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return "切换模型需要重新登录或授权。编辑内容已保留。";
    const data = error.data as { code?: unknown; detail?: unknown } | null;
    const detail = data?.detail;
    const code = data?.code ?? (detail && typeof detail === "object" ? (detail as { code?: unknown }).code : detail);
    if (typeof code === "string" && ["incompatible_protocol", "invalid_main_selection", "missing_profile", "disabled_profile", "literal_model_required"].includes(code)) {
      return `${mainDiagnosticMessage(code)}编辑内容已保留，请核对或刷新状态。`;
    }
    if (error.status >= 400 && error.status < 500) return "服务未接受这组模型选择，请核对连接、接口格式和模型名称。编辑内容已保留。";
  }
  return "未能确认模型切换结果，编辑内容已保留。请刷新状态后核对或重试。";
}
