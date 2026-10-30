export const DIARY_CHAT_PARAM = "diaryEntry";

export function diaryChatEntry(search: string): string | null {
  const id = new URLSearchParams(search).get(DIARY_CHAT_PARAM);
  return id?.trim() ? id : null;
}

/** Preserve Diary's path, unrelated query parameters and hash. Never infer IDs from dates. */
export function diaryChatUrl(href: string, entryId: string | null): string {
  const url = new URL(href);
  if (entryId) url.searchParams.set(DIARY_CHAT_PARAM, entryId);
  else url.searchParams.delete(DIARY_CHAT_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}
