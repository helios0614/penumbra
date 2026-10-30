import { apiGet, ApiError } from "@/lib/api";
import type { DiaryReadOptions } from "./diary-client";
import { DiaryContractError } from "./diary-types";
import { DiaryEntryMissingError } from "./diary-chat-types";
import { parseDiaryChatEntry, parseDiaryMessages } from "./diary-chat-mappers";

function entryPath(entryId: string) {
  if (!entryId.trim()) throw new DiaryContractError();
  return `/api/diary/entries/${encodeURIComponent(entryId)}`;
}
export async function getDiaryChatEntry(entryId: string, options?: DiaryReadOptions) {
  try {
    return parseDiaryChatEntry(await apiGet<unknown>(entryPath(entryId), { ...options, cache: "no-store" }), entryId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) throw new DiaryEntryMissingError();
    throw error;
  }
}
export async function getDiaryMessages(entryId: string, options?: DiaryReadOptions) {
  return parseDiaryMessages(await apiGet<unknown>(`${entryPath(entryId)}/messages`, { ...options, cache: "no-store" }), entryId);
}
