import { apiPost } from "@/lib/api";
import { isDiaryDate } from "./diary-date";
import { DiaryContractError } from "./diary-types";

export type DiaryFeedResult =
  | { readonly kind: "started"; readonly entryId: string }
  | { readonly kind: "draft"; readonly entryId: string }
  | { readonly kind: "refused" };

export async function startDiaryFeed(date: string, replaceExisting: boolean, signal: AbortSignal): Promise<DiaryFeedResult> {
  if (!isDiaryDate(date)) throw new DiaryContractError();
  const input = await apiPost<unknown>(`/api/diary/auto-feed/history/${encodeURIComponent(date)}`, undefined, {
    signal, query: { replace_existing: replaceExisting },
  });
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DiaryContractError();
  const row = input as Record<string, unknown>;
  if (row.ok === true || row.ok === false && row.code === "diary_draft_exists") {
    if (typeof row.entry_id !== "string" || !row.entry_id.trim()) throw new DiaryContractError();
    return { kind: row.ok ? "started" : "draft", entryId: row.entry_id };
  }
  // The history endpoint's done refusal has no code or Entry ID.
  if (row.ok === false) return { kind: "refused" };
  throw new DiaryContractError();
}
