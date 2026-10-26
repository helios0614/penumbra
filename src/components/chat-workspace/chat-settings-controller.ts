import { ApiError } from "@/lib/api";
import { equalChatDefaultEdit, isThinkingPreference, getChatDefaults, patchChatDefault, type ChatDefaults, type ChatDefaultsRead, type ChatDefaultField, type ChatDefaultEdit } from "@/domain/runtime/chat-defaults";
import { chatSettingsScopeKey, type ChatSettingsScope } from "./chat-request-parameters";

type Drafts = Partial<Record<ChatDefaultField, ChatDefaultEdit>>;
export type ChatSettingsState = {
  readonly scope: ChatSettingsScope | null;
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly data: ChatDefaults | null;
  readonly drafts: Drafts;
  readonly errors: Partial<Record<ChatDefaultField, string>>;
  readonly saving: boolean;
};
export const INITIAL_CHAT_SETTINGS: ChatSettingsState = { scope: null, status: "idle", data: null, drafts: {}, errors: {}, saving: false };
type Dependencies = { load?: typeof getChatDefaults; save?: typeof patchChatDefault; canEdit: (scope: ChatSettingsScope) => boolean };
type Intent = { scope: ChatSettingsScope; field: ChatDefaultField; value: ChatDefaultEdit; version: number };

export function createChatSettingsController(dependencies: Dependencies) {
  const load = dependencies.load ?? getChatDefaults, save = dependencies.save ?? patchChatDefault;
  let state = INITIAL_CHAT_SETTINGS, disposed = false, active = false, readSequence = 0, needsRead = false;
  let readController: AbortController | null = null;
  let inFlight: Intent | null = null;
  const versions: Record<ChatDefaultField, number> = { context_limit: 0, temperature: 0, thinking: 0, float_interval: 0, carryover_count: 0 }, queue = new Map<ChatDefaultField, Intent>();
  const listeners = new Set<(state: ChatSettingsState) => void>();
  const publish = (patch: Partial<ChatSettingsState>) => {
    if (disposed) return;
    state = { ...state, ...patch }; listeners.forEach(listener => listener(state));
  };
  const current = (scope: ChatSettingsScope) => !disposed && state.scope === scope;
  const editable = (scope: ChatSettingsScope) => current(scope) && dependencies.canEdit(scope) && state.data !== null;
  const valid = (field: ChatDefaultField, value: ChatDefaultEdit) => {
    if (field === "thinking") {
      const metadata = state.data?.thinking;
      return !!metadata && metadata.capability.status !== "unsupported" && (value === null ||
        (isThinkingPreference(value) && metadata.capability.allowedEfforts.includes(value.effort)));
    }
    const metadata = state.data?.[field];
    return !!metadata && (value === null || (typeof value === "number" && Number.isFinite(value) && value >= metadata.min && value <= metadata.max &&
      (field === "temperature" || Number.isInteger(value))));
  };
  const reread = async (scope: ChatSettingsScope) => {
    const sequence = ++readSequence;
    readController?.abort(); readController = new AbortController();
    if (!state.data) publish({ status: "loading" });
    try {
      const data: ChatDefaultsRead = await load(scope.conversationId, { signal: readController.signal });
      if (!current(scope) || sequence !== readSequence) return false;
      if (chatSettingsScopeKey(data.selection ? { conversationId: scope.conversationId, selection: data.selection } : null) !== chatSettingsScopeKey(scope)) throw new Error("identity changed");
      if (state.data && data.revision < state.data.revision) return false;
      publish({ data, status: "ready" }); needsRead = false; return true;
    } catch {
      if (current(scope) && sequence === readSequence) publish({ status: state.data ? "ready" : "error" });
      return false;
    }
  };
  const drain = async () => {
    if (active || disposed) return;
    // A refresh started before this write must never publish its older baseline afterwards.
    readSequence++; readController?.abort();
    active = true; publish({ saving: true });
    try {
      while (queue.size && !disposed) {
        const intent = queue.values().next().value as Intent; queue.delete(intent.field);
        if (!editable(intent.scope)) continue;
        inFlight = intent;
        try {
          if (needsRead && !(await reread(intent.scope))) throw new Error("read failed");
          if (!editable(intent.scope)) continue;
          const response = await save(intent.field, intent.value, state.data!.protocol, state.data!.revision);
          if (!current(intent.scope)) continue;
          if (response.protocol !== state.data!.protocol || response.revision < state.data!.revision) throw new Error("invalid readback");
          const expected = intent.value ?? response[intent.field]?.defaultValue;
          if (!equalChatDefaultEdit(response[intent.field]?.value, expected) || response[intent.field]?.source !== (intent.value === null ? "backend_default" : "saved")) throw new Error("unconfirmed write");
          const drafts = { ...state.drafts }, errors = { ...state.errors };
          if (versions[intent.field] === intent.version) { delete drafts[intent.field]; delete errors[intent.field]; }
          publish({ data: response, drafts, errors });
        } catch (error) {
          inFlight = null;
          if (!current(intent.scope)) continue;
          needsRead = true;
          const errors = { ...state.errors, [intent.field]: error instanceof ApiError && error.status === 409
            ? "设置已在其他页面更新，请重试。" : "未确认保存，当前编辑已保留。" };
          for (const [field] of queue) errors[field] = "尚未保存，请重试。";
          queue.clear(); publish({ errors });
          await reread(intent.scope);
          break;
        }
      }
    } finally {
      inFlight = null; active = false; publish({ saving: false });
      // Only new, explicit commits received during reconciliation remain in this queue.
      if (queue.size && !disposed) void drain();
    }
  };
  return {
    getState: () => state,
    isSaving: () => active,
    subscribe(listener: (value: ChatSettingsState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    select(scope: ChatSettingsScope | null) {
      if (chatSettingsScopeKey(scope) === chatSettingsScopeKey(state.scope)) return;
      readSequence++; readController?.abort(); queue.clear(); needsRead = false;
      publish({ ...INITIAL_CHAT_SETTINGS, scope: scope ? { ...scope } : null, saving: active });
    },
    open() { if (state.scope && !active) return reread(state.scope); return Promise.resolve(false); },
    preview(scope: ChatSettingsScope, field: ChatDefaultField, value: ChatDefaultEdit) {
      if (!editable(scope) || !valid(field, value)) return;
      versions[field]++; publish({ drafts: { ...state.drafts, [field]: value } });
    },
    commit(scope: ChatSettingsScope, field: ChatDefaultField, explicit?: ChatDefaultEdit) {
      const value = explicit === undefined ? state.drafts[field] : explicit;
      if (!editable(scope) || value === undefined || !valid(field, value)) return;
      const metadata = state.data![field]!;
      if (inFlight?.scope === scope && inFlight.field === field && equalChatDefaultEdit(inFlight.value, value)) {
        queue.delete(field); inFlight.version = ++versions[field]; return;
      }
      const queued = queue.get(field);
      if (queued && equalChatDefaultEdit(queued.value, value)) { queued.version = ++versions[field]; return; }
      if (!active && !queue.has(field) && !state.errors[field] &&
          ((value === null && metadata.source === "backend_default") || (value !== null && equalChatDefaultEdit(value, metadata.value)))) {
        const drafts = { ...state.drafts }; delete drafts[field]; publish({ drafts }); return;
      }
      versions[field]++;
      publish({ drafts: { ...state.drafts, [field]: value } });
      queue.set(field, { scope, field, value, version: versions[field] });
      void drain();
    },
    dispose() { disposed = true; readSequence++; readController?.abort(); queue.clear(); listeners.clear(); },
  };
}
