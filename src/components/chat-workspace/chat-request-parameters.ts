import type { ChatWorkspaceSnapshot } from "@/application/chat-workspace";

export type ChatRequestParameterDraft = { readonly contextLimit: string; readonly temperature: string };
export type ChatRequestOverrides = { readonly contextLimit?: number; readonly temperature?: number };
export type ChatRequestParameterScope = {
  readonly conversationId: string;
  readonly connectionId: string | null;
  readonly profileId: string | null;
  readonly protocol: string | null;
  readonly model: string;
};
export type ChatRequestParameters = {
  // Object identity is an edit lease: A → B → A must not revive an old form.
  readonly scope: ChatRequestParameterScope | null;
  readonly overrides: ChatRequestOverrides;
  readonly notice: string | null;
};
export type ChatRequestParameterResult = "applied" | "unchanged" | "invalid" | "stale" | "locked";

export const EMPTY_REQUEST_PARAMETERS: ChatRequestParameters = Object.freeze({
  scope: null, overrides: Object.freeze({}), notice: null,
});

/** Protocol contracts from AionHome generation_options.py; never infer from a model name. */
export function temperatureMaximum(protocol: string | null): number | null {
  if (protocol === "anthropic_messages") return 1;
  if (protocol === "openai_chat_completions" || protocol === "gemini_stream_generate_content") return 2;
  return null;
}

export function requestParameterScope(workspace: ChatWorkspaceSnapshot): ChatRequestParameterScope | null {
  const selection = workspace.setup.configuration?.selection;
  if (!selection || !workspace.selectedConversationId || workspace.setup.conversationId !== workspace.selectedConversationId) return null;
  return {
    conversationId: workspace.selectedConversationId,
    connectionId: selection.connectionId ?? null,
    profileId: selection.profileId ?? null,
    protocol: selection.protocol ?? null,
    model: selection.model,
  };
}

export function requestParameterDraft(overrides: ChatRequestOverrides): ChatRequestParameterDraft {
  return { contextLimit: overrides.contextLimit === undefined ? "" : String(overrides.contextLimit),
    temperature: overrides.temperature === undefined ? "" : String(overrides.temperature) };
}

export function equalRequestOverrides(a: ChatRequestOverrides, b: ChatRequestOverrides): boolean {
  return a.contextLimit === b.contextLimit && a.temperature === b.temperature;
}

export function validateRequestParameters(draft: ChatRequestParameterDraft, protocol: string | null) {
  const overrides: { contextLimit?: number; temperature?: number } = {};
  const errors: { contextLimit?: string; temperature?: string } = {};
  const context = draft.contextLimit.trim(), temperature = draft.temperature.trim();
  if (context) {
    const value = Number(context);
    if (!/^\d+$/.test(context) || !Number.isSafeInteger(value) || value < 1 || value > 100) {
      errors.contextLimit = "请输入 1–100 的整数。";
    } else overrides.contextLimit = value;
  }
  if (temperature) {
    const maximum = temperatureMaximum(protocol), value = Number(temperature);
    if (maximum === null) errors.temperature = "当前接口未提供可确认的温度范围，请留空使用后端默认。";
    else if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(temperature) || !Number.isFinite(value) || value < 0 || value > maximum) {
      errors.temperature = `请输入 0–${maximum} 的有限数值。`;
    } else overrides.temperature = value;
  }
  return { overrides, errors, valid: Object.keys(errors).length === 0 };
}

/** Ephemeral state owned by one Workspace controller. No I/O, persistence or defaults injection. */
export function createChatRequestParametersOwner() {
  let state = EMPTY_REQUEST_PARAMETERS;
  let identityKey = "null";
  return {
    sync(identity: ChatRequestParameterScope | null): ChatRequestParameters {
      const key = JSON.stringify(identity);
      if (key !== identityKey) {
        const reset = Object.keys(state.overrides).length > 0 || state.notice !== null;
        identityKey = key;
        state = Object.freeze({ scope: identity ? Object.freeze({ ...identity }) : null,
          overrides: Object.freeze({}),
          notice: reset ? "会话或模型身份已变化，临时参数已恢复后端默认。" : null });
      }
      return state;
    },
    apply(scope: ChatRequestParameterScope, draft: ChatRequestParameterDraft): ChatRequestParameterResult {
      if (state.scope !== scope) return "stale";
      const parsed = validateRequestParameters(draft, scope.protocol);
      if (!parsed.valid) return "invalid";
      if (equalRequestOverrides(state.overrides, parsed.overrides)) return "unchanged";
      state = Object.freeze({ scope, overrides: Object.freeze({ ...parsed.overrides }), notice: null });
      return "applied";
    },
  };
}
