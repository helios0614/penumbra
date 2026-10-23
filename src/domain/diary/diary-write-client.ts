import { apiGet, apiPost, apiRequest } from "@/lib/api";
import { hasDiaryText } from "./diary-mappers";
import { DiaryContractError } from "./diary-types";
import type { DiaryReadOptions } from "./diary-client";

export interface DiaryUpdate {
  readonly status: "done";
  readonly title?: string;
  readonly content?: string;
  readonly tags?: readonly string[];
  readonly keywords?: readonly string[];
  readonly importance?: number;
}
export class DiaryWriteRejectedError extends Error {
  constructor() { super("保存未被服务端接受，输入已保留。"); }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DiaryContractError();
  return value as Record<string, unknown>;
}
export async function updateArchivedDiary(id: string, input: DiaryUpdate, options?: DiaryReadOptions) {
  if (!id.trim() || input.status !== "done" || input.content !== undefined && (!hasDiaryText(input.content) || typeof input.title !== "string") ||
    (input.title !== undefined) !== (input.content !== undefined) ||
    input.importance !== undefined && (!Number.isFinite(input.importance) || input.importance < 0 || input.importance > 1)) throw new DiaryContractError();
  if (input.title !== undefined && typeof input.title !== "string") throw new DiaryContractError();
  for (const values of [input.tags, input.keywords]) if (values !== undefined && (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !value.trim()))) throw new DiaryContractError();
  // Whitelist fields. Title/content travel together for the existing embedding trigger.
  const body: Record<string, unknown> = { status: "done" };
  for (const field of ["title", "content", "tags", "keywords", "importance"] as const) if (input[field] !== undefined) body[field] = input[field];
  const receipt = object(await apiRequest<unknown>(`/api/diary/entries/${encodeURIComponent(id)}`, { ...options, method: "PUT", body }));
  if (receipt.ok === false) throw new DiaryWriteRejectedError();
  if (receipt.ok !== true) throw new DiaryContractError();
  // This receipt does not prove row existence, saved fields or embedding success.
}
export async function getDiaryAutoFeed(options?: DiaryReadOptions): Promise<boolean> {
  const result = object(await apiGet<unknown>("/api/diary/auto-feed-status", { ...options, cache: "no-store" }));
  if (result.ok === false || typeof result.enabled !== "boolean") throw new DiaryContractError();
  return result.enabled;
}
export async function setDiaryAutoFeed(enabled: boolean, options?: DiaryReadOptions): Promise<boolean> {
  if (typeof enabled !== "boolean") throw new DiaryContractError();
  const result = object(await apiPost<unknown>("/api/diary/auto-feed-toggle", { enabled }, options));
  if (result.ok === false) throw new DiaryWriteRejectedError();
  if (result.ok !== true || typeof result.enabled !== "boolean") throw new DiaryContractError();
  return result.enabled;
}
