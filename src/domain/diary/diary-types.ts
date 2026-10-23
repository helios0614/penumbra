export type DiaryCalendarState = "archived" | "pending" | "invalid";
export type DiaryInvalidReason = "done_without_content" | "unknown_entry_status" | "invalid_business_date";

export interface DiaryCalendarItem {
  readonly date: string;
  readonly entryId: string;
  readonly title: string | null;
  readonly entryStatus: string | null;
  readonly hasDiaryMessages: boolean;
  readonly hasSavedContent: boolean;
  readonly calendarState: DiaryCalendarState;
  readonly invalidReason: DiaryInvalidReason | null;
}

export interface DiaryCalendar {
  readonly month: string;
  readonly items: readonly DiaryCalendarItem[];
}

export interface ArchivedDiary {
  readonly id: string;
  readonly date: string;
  readonly title: string | null;
  readonly content: string;
  readonly importance: number | null;
  readonly tags: readonly string[];
  readonly keywords: readonly string[];
}

export class DiaryContractError extends Error {
  constructor() {
    super("日记读取结果不符合约定，请重新读取。");
    this.name = "DiaryContractError";
  }
}

export class DiaryUnavailableError extends Error {
  constructor() {
    super("这篇日记已不存在，或尚无有效的归档正文。请返回日历重新读取。");
    this.name = "DiaryUnavailableError";
  }
}
