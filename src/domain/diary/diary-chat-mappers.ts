import { isDiaryDate } from "./diary-date";
import { DiaryContractError } from "./diary-types";
import { DiaryEntryMissingError, type DiaryChatEntry, type DiaryMessage } from "./diary-chat-types";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DiaryContractError();
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new DiaryContractError();
  return value;
}
function text(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new DiaryContractError();
  return value;
}
function timestamp(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || !Number.isFinite(new Date(value * 1000).getTime())) throw new DiaryContractError();
  return value;
}

export function parseDiaryChatEntry(input: unknown, entryId: string): DiaryChatEntry {
  const row = record(input);
  // Legacy GET returns HTTP 200 for an absent entry.
  if (row.ok === false) throw new DiaryEntryMissingError();
  if (id(row.id) !== entryId || !isDiaryDate(row.date as string)) throw new DiaryContractError();
  return { id: entryId, date: row.date as string, status: id(row.status), title: text(row.title) };
}

export function parseDiaryMessages(input: unknown, entryId: string): readonly DiaryMessage[] {
  if (!Array.isArray(input)) throw new DiaryContractError();
  // The response sequence is authoritative, including equal timestamps and prose.
  return input.map((value) => {
    const row = record(value);
    if (id(row.entry_id) !== entryId || typeof row.content !== "string") throw new DiaryContractError();
    const drift = text(row.drift), legacyDrift = text(row.simple_think);
    return {
      id: id(row.id), entryId, role: id(row.role), content: row.content,
      createdAt: timestamp(row.created_at), updatedAt: row.updated_at == null ? null : timestamp(row.updated_at),
      drift: drift || legacyDrift || drift, thinking: text(row.thinking),
    };
  });
}
