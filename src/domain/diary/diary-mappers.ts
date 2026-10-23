import { diaryDate, diaryMonthDays, isDiaryDate, isDiaryMonth } from "./diary-date";
import { DiaryContractError, DiaryUnavailableError, type ArchivedDiary, type DiaryCalendar, type DiaryCalendarItem } from "./diary-types";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DiaryContractError();
  return value as Record<string, unknown>;
}

function nullableText(value: unknown): string | null {
  if (value !== null && typeof value !== "string") throw new DiaryContractError();
  return value;
}

/** Match PR0's Python str.strip(), including NEL/control separators and excluding BOM. Never alter saved prose. */
export function hasDiaryText(value: unknown): value is string {
  return typeof value === "string" && /[^\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/u.test(value);
}

export function parseDiaryCalendar(value: unknown, month: string): DiaryCalendar {
  if (!isDiaryMonth(month) || !Array.isArray(value)) throw new DiaryContractError();
  const ids = new Set<string>(), dates = new Set<string>();
  const first = diaryDate(month, 1), last = diaryDate(month, diaryMonthDays(month));
  const items: DiaryCalendarItem[] = value.map((input) => {
    const row = record(input);
    if (typeof row.entry_id !== "string" || !row.entry_id.trim() || typeof row.date !== "string" || row.date < first || row.date > last ||
      typeof row.has_diary_messages !== "boolean" || typeof row.has_saved_content !== "boolean") throw new DiaryContractError();
    const state = row.calendar_state, reason = row.invalid_reason;
    if (state !== "archived" && state !== "pending" && state !== "invalid") throw new DiaryContractError();
    const validDate = isDiaryDate(row.date);
    // Validate the declared read contract; do not infer state from Main Chat, timestamps or feed progress.
    if (state === "invalid") {
      if (reason !== "done_without_content" && reason !== "unknown_entry_status" && reason !== "invalid_business_date") throw new DiaryContractError();
      if ((reason === "invalid_business_date") === validDate) throw new DiaryContractError();
      if (reason === "done_without_content" && (row.entry_status !== "done" || row.has_saved_content)) throw new DiaryContractError();
      if (reason === "unknown_entry_status" && (row.entry_status === "writing" || row.entry_status === "done")) throw new DiaryContractError();
    } else if (reason !== null || !validDate) throw new DiaryContractError();
    if (state === "archived" && (row.entry_status !== "done" || !row.has_saved_content)) throw new DiaryContractError();
    if (state === "pending" && (row.entry_status !== "writing" || (!row.has_saved_content && !row.has_diary_messages))) throw new DiaryContractError();
    if (ids.has(row.entry_id) || dates.has(row.date)) throw new DiaryContractError();
    ids.add(row.entry_id); dates.add(row.date);
    return {
      date: row.date, entryId: row.entry_id, title: nullableText(row.title), entryStatus: nullableText(row.entry_status),
      hasDiaryMessages: row.has_diary_messages, hasSavedContent: row.has_saved_content,
      calendarState: state, invalidReason: reason as DiaryCalendarItem["invalidReason"],
    };
  });
  return { month, items: items.sort((a, b) => a.date.localeCompare(b.date)) };
}

export function parseArchivedDiary(value: unknown, entryId: string, expectedDate: string): ArchivedDiary {
  const row = record(value);
  if (row.ok === false) throw new DiaryUnavailableError();
  if (row.id !== entryId || row.date !== expectedDate || !isDiaryDate(expectedDate)) throw new DiaryContractError();
  if (row.status !== "done" || !hasDiaryText(row.content)) throw new DiaryUnavailableError();
  return { id: entryId, date: expectedDate, title: nullableText(row.title), content: row.content };
}
