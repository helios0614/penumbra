import { apiGet, apiRequest, type ApiRequestOptions } from "@/lib/api";
import { mapMainSelection, type MainSelection } from "./main-configuration";
import { RuntimeContractError } from "./runtime-types";

export type ChatDefaultField = "context_limit" | "temperature";
export type ChatDefaultValue = { readonly value: number; readonly source: "saved" | "backend_default"; readonly defaultValue: number; readonly min: number; readonly max: number };
export type ChatDefaults = { readonly revision: number; readonly protocol: string | null; readonly context_limit: ChatDefaultValue; readonly temperature: ChatDefaultValue | null };
export type ChatDefaultsRead = ChatDefaults & { readonly conversationId: string | null; readonly selection: MainSelection | null };
const endpoint = "/api/main/chat-defaults";
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
function invalid(): never { throw new RuntimeContractError("Invalid Chat defaults contract"); }

export function mapChatDefaults(value: unknown): ChatDefaults {
  if (!record(value) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
      !(value.protocol === null || typeof value.protocol === "string")) return invalid();
  const field = (raw: unknown, context: boolean): ChatDefaultValue => {
    if (!record(raw) || !finite(raw.value) || !finite(raw.default_value) || !finite(raw.min) || !finite(raw.max) ||
        raw.min >= raw.max || raw.value < raw.min || raw.value > raw.max ||
        raw.default_value < raw.min || raw.default_value > raw.max || !["saved", "backend_default"].includes(String(raw.source)) ||
        (context && (!Number.isInteger(raw.value) || raw.min !== 1 || raw.max !== 100))) return invalid();
    return { value: raw.value, defaultValue: raw.default_value, min: raw.min, max: raw.max, source: raw.source as ChatDefaultValue["source"] };
  };
  return { revision: value.revision as number, protocol: value.protocol, context_limit: field(value.context_limit, true),
    temperature: value.temperature === null ? null : field(value.temperature, false) };
}

export async function getChatDefaults(conversationId: string, options?: ApiRequestOptions): Promise<ChatDefaultsRead> {
  const raw = await apiGet<unknown>(endpoint, { ...options, cache: "no-store", query: { conv_id: conversationId } });
  if (!record(raw) || raw.conversation_id !== conversationId) return invalid();
  return { ...mapChatDefaults(raw), conversationId, selection: mapMainSelection(raw.selection) };
}

export async function patchChatDefault(field: ChatDefaultField, value: number | null, protocol: string | null, revision: number): Promise<ChatDefaults> {
  return mapChatDefaults(await apiRequest(endpoint, { method: "PATCH", body: { field, value, protocol, expected_revision: revision } }));
}
