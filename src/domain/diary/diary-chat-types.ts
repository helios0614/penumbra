/** Diary owns its message contract; these are not Main conversation messages. */
export interface DiaryMessageDto {
  readonly id: string;
  readonly entry_id: string;
  readonly role: string;
  readonly content: string;
  readonly created_at: number;
  readonly updated_at?: number | null;
  readonly drift?: string | null;
  readonly simple_think?: string | null;
  readonly thinking?: string | null;
}

export interface DiaryChatEntry {
  readonly id: string;
  readonly date: string;
  readonly status: string;
  readonly title: string | null;
}

export interface DiaryMessage {
  readonly id: string;
  readonly entryId: string;
  readonly role: string;
  readonly content: string;
  readonly createdAt: number;
  readonly updatedAt: number | null;
  readonly drift: string | null;
  readonly thinking: string | null;
}

export class DiaryEntryMissingError extends Error {
  constructor() { super("这篇日记已不存在，请返回日历重新读取。"); this.name = "DiaryEntryMissingError"; }
}
