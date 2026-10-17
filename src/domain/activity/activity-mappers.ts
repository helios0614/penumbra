import { ActivityContractError, type ActivityEvent, type ActivityRecord, type ActivitySummary } from "./activity-types";

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ActivityContractError();
  return value as Record<string, unknown>;
}
export function text(value: unknown): string {
  if (typeof value !== "string") throw new ActivityContractError();
  return value;
}
export function timestamp(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 8_640_000_000_000) throw new ActivityContractError();
  return value;
}
export function dateKey(value: unknown): string {
  const date = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new ActivityContractError();
  return date;
}
export function parseActivityEvent(input: unknown): ActivityEvent {
  const row = record(input);
  return { timestamp: timestamp(row.timestamp), time: text(row.time), date: dateKey(row.date), device: text(row.device), app: text(row.app), title: row.title == null ? "" : text(row.title) };
}
export function parseActivityRecords(input: unknown): readonly ActivityRecord[] {
  const rows = record(input).entries;
  if (!Array.isArray(rows)) throw new ActivityContractError();
  // A full server snapshot is authoritative. Keep the multiplicity of identical samples.
  // Occurrence is within an exact value tuple, never the array's position.
  const occurrences = new Map<string, number>();
  return rows.map((row) => {
    const event = parseActivityEvent(row);
    const tuple = JSON.stringify([event.timestamp, event.device, event.app, event.title, event.date, event.time]);
    const occurrence = (occurrences.get(tuple) ?? 0) + 1;
    occurrences.set(tuple, occurrence);
    return { ...event, key: `${tuple}:${occurrence}` };
  }).sort((a, b) => b.timestamp - a.timestamp || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
export function parseActivityDates(input: unknown): readonly string[] {
  const dates = record(input).dates;
  if (!Array.isArray(dates)) throw new ActivityContractError();
  return [...new Set(dates.map(dateKey))].sort().reverse();
}
export function parseActivitySummary(input: unknown): readonly ActivitySummary[] {
  const response = record(input);
  if (response.hours !== 3 || !Array.isArray(response.summaries)) throw new ActivityContractError();
  return response.summaries.map((item) => {
    const row = record(item);
    if (!Number.isSafeInteger(row.count) || Number(row.count) < 0) throw new ActivityContractError();
    return { start: text(row.start), end: text(row.end), summary: text(row.summary), count: row.count as number };
  });
}
export function parseActivityEnabled(input: unknown): boolean {
  const value = record(input).activity_tracking_enabled;
  if (typeof value !== "boolean") throw new ActivityContractError();
  return value;
}
export function parseClearedFiles(input: unknown): number {
  const row = record(input);
  if (row.ok !== true || !Number.isSafeInteger(row.deleted) || Number(row.deleted) < 0) throw new ActivityContractError();
  return row.deleted as number;
}
