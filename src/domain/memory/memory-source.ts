import { apiGet, type ApiRequestOptions } from "@/lib/api";
import { MEMORIES_ENDPOINT } from "./memory-client";
import { MemoryContractError } from "./memory-types";

/** Reading rows have no message/conversation IDs. Never use their position as an anchor. */
export type MemorySourceMessage = {
  readonly role: "user" | "assistant" | "system";
  readonly name: string;
  readonly content: string;
  readonly createdAt: number;
};
export type MemoryOriginalSource =
  | { readonly available: false }
  | { readonly available: true; readonly messages: readonly MemorySourceMessage[] };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function invalid(): never { throw new MemoryContractError("Invalid memory original source response"); }
export function mapMemoryOriginalSource(payload: unknown): MemoryOriginalSource {
  if (!record(payload)) return invalid();
  if (payload.ok === false && typeof payload.message === "string") return { available: false };
  if (payload.ok !== true || !Array.isArray(payload.messages)) return invalid();
  return { available: true, messages: payload.messages.map(row => {
    if (!record(row) || !["user", "assistant", "system"].includes(row.role as string) ||
      typeof row.name !== "string" || typeof row.content !== "string" || typeof row.created_at !== "number" ||
      !Number.isFinite(row.created_at) || !Number.isFinite(new Date(row.created_at * 1000).getTime())) return invalid();
    return { role: row.role as MemorySourceMessage["role"], name: row.name, content: row.content, createdAt: row.created_at };
  }) };
}
export async function readMemoryOriginalSource(id: string, options?: ApiRequestOptions) {
  return mapMemoryOriginalSource(await apiGet<unknown>(`${MEMORIES_ENDPOINT}/${encodeURIComponent(id)}/source`, options));
}
