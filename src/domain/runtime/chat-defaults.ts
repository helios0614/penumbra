import { apiGet, apiRequest, type ApiRequestOptions } from "@/lib/api";
import { mapMainSelection, type MainSelection } from "./main-configuration";
import { RuntimeContractError } from "./runtime-types";

export const THINKING_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingEffort = typeof THINKING_EFFORTS[number];
export type ThinkingPreference = { readonly enabled: boolean; readonly effort: ThinkingEffort };
export type ChatDefaultField = "context_limit" | "temperature" | "thinking" | "float_interval" | "carryover_count";
export type NumericChatDefaultField = Exclude<ChatDefaultField, "thinking">;
export type ChatDefaultEdit = number | ThinkingPreference | null;
export type ChatDefaultValue = { readonly value: number; readonly source: "saved" | "backend_default"; readonly defaultValue: number; readonly min: number; readonly max: number };
export type ThinkingDefault = { readonly value: ThinkingPreference; readonly source: ChatDefaultValue["source"]; readonly defaultValue: ThinkingPreference;
  readonly capability: { readonly status: "supported" | "unsupported" | "unknown"; readonly reason: string; readonly allowedEfforts: readonly ThinkingEffort[] } };
export type ChatDefaults = { readonly revision: number; readonly protocol: string | null; readonly context_limit: ChatDefaultValue; readonly temperature: ChatDefaultValue | null;
  readonly thinking: ThinkingDefault; readonly float_interval: ChatDefaultValue; readonly carryover_count: ChatDefaultValue };
export type ChatDefaultsRead = ChatDefaults & { readonly conversationId: string | null; readonly selection: MainSelection | null };
const endpoint = "/api/main/chat-defaults";
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
function invalid(): never { throw new RuntimeContractError("Invalid Chat defaults contract"); }
export const isThinkingPreference = (value: unknown): value is ThinkingPreference => record(value) && Object.keys(value).length === 2 &&
  typeof value.enabled === "boolean" && THINKING_EFFORTS.includes(value.effort as ThinkingEffort);
export const equalChatDefaultEdit = (a: ChatDefaultEdit | undefined, b: ChatDefaultEdit | undefined) =>
  a === b || (isThinkingPreference(a) && isThinkingPreference(b) && a.enabled === b.enabled && a.effort === b.effort);

export function mapChatDefaults(value: unknown): ChatDefaults {
  if (!record(value) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
      !(value.protocol === null || typeof value.protocol === "string")) return invalid();
  const field = (raw: unknown, integerRange?: readonly [number, number]): ChatDefaultValue => {
    if (!record(raw) || !finite(raw.value) || !finite(raw.default_value) || !finite(raw.min) || !finite(raw.max) ||
        raw.min >= raw.max || raw.value < raw.min || raw.value > raw.max ||
        raw.default_value < raw.min || raw.default_value > raw.max || !["saved", "backend_default"].includes(String(raw.source)) ||
        (integerRange && (!Number.isInteger(raw.value) || !Number.isInteger(raw.default_value) || raw.min !== integerRange[0] || raw.max !== integerRange[1]))) return invalid();
    return { value: raw.value, defaultValue: raw.default_value, min: raw.min, max: raw.max, source: raw.source as ChatDefaultValue["source"] };
  };
  const thinking = value.thinking;
  if (!record(thinking) || !isThinkingPreference(thinking.value) || !isThinkingPreference(thinking.default_value) ||
      !["saved", "backend_default"].includes(String(thinking.source)) || !record(thinking.capability)) return invalid();
  const capability = thinking.capability;
  if (!["supported", "unsupported", "unknown"].includes(String(capability.status)) || typeof capability.reason !== "string" ||
      !Array.isArray(capability.allowed_efforts) || capability.allowed_efforts.some(e => !THINKING_EFFORTS.includes(e)) ||
      new Set(capability.allowed_efforts).size !== capability.allowed_efforts.length ||
      (capability.status === "unsupported" ? capability.allowed_efforts.length !== 0 || thinking.value.enabled : capability.allowed_efforts.length === 0)) return invalid();
  return { revision: value.revision as number, protocol: value.protocol, context_limit: field(value.context_limit, [1, 100]),
    temperature: value.temperature === null ? null : field(value.temperature), float_interval: field(value.float_interval, [1, 15]), carryover_count: field(value.carryover_count, [0, 50]),
    thinking: { value: { ...thinking.value }, defaultValue: { ...thinking.default_value }, source: thinking.source as ThinkingDefault["source"],
      capability: { status: capability.status as ThinkingDefault["capability"]["status"], reason: capability.reason, allowedEfforts: [...capability.allowed_efforts] } } };
}

export async function getChatDefaults(conversationId: string, options?: ApiRequestOptions): Promise<ChatDefaultsRead> {
  const raw = await apiGet<unknown>(endpoint, { ...options, cache: "no-store", query: { conv_id: conversationId } });
  if (!record(raw) || raw.conversation_id !== conversationId) return invalid();
  return { ...mapChatDefaults(raw), conversationId, selection: mapMainSelection(raw.selection) };
}

export async function patchChatDefault(field: ChatDefaultField, value: ChatDefaultEdit, protocol: string | null, revision: number): Promise<ChatDefaults> {
  return mapChatDefaults(await apiRequest(endpoint, { method: "PATCH", body: { field, value, protocol, expected_revision: revision } }));
}
