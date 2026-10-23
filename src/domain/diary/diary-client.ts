import { apiGet, type ApiRequestOptions } from "@/lib/api";
import { isDiaryDate, isDiaryMonth } from "./diary-date";
import { parseArchivedDiary, parseDiaryCalendar } from "./diary-mappers";
import { DiaryContractError } from "./diary-types";

export type DiaryReadOptions = Pick<ApiRequestOptions, "signal" | "timeoutMs">;

export async function getDiaryCalendar(month: string, options?: DiaryReadOptions) {
  if (!isDiaryMonth(month)) throw new DiaryContractError();
  return parseDiaryCalendar(await apiGet<unknown>("/api/diary/reader/calendar", {
    ...options, cache: "no-store", query: { month },
  }), month);
}

export async function getArchivedDiary(entryId: string, date: string, options?: DiaryReadOptions) {
  if (!entryId.trim() || !isDiaryDate(date)) throw new DiaryContractError();
  return parseArchivedDiary(await apiGet<unknown>(`/api/diary/entries/${encodeURIComponent(entryId)}`, {
    ...options, cache: "no-store",
  }), entryId, date);
}
