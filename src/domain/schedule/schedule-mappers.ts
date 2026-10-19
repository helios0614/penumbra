import { ScheduleContractError, type Schedule, type ScheduleList } from "./schedule-types";
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function parseSchedule(value: unknown): Schedule | null {
  if (!record(value) || typeof value.id !== "string" || !value.id.trim() || typeof value.content !== "string") return null;
  const kind = typeof value.type === "string" && ["reminder", "todo", "alarm", "monitor"].includes(value.type) ? value.type as Schedule["kind"] : "unknown";
  const status = typeof value.status === "string" && ["active", "done", "triggered", "cancelled"].includes(value.status) ? value.status as Schedule["status"] : "unknown";
  return { id: value.id, kind, status, content: value.content, triggerAt: typeof value.trigger_at === "string" ? value.trigger_at : "",
    createdAt: typeof value.created_at === "number" && Number.isFinite(value.created_at) ? value.created_at : null };
}
export function parseScheduleList(value: unknown): ScheduleList {
  if (!Array.isArray(value)) throw new ScheduleContractError();
  const items: Schedule[] = [], ids = new Set<string>(), duplicateIds = new Set<string>();
  let unsupported = 0;
  for (const row of value) {
    const item = parseSchedule(row);
    if (!item) { unsupported++; continue; }
    if (ids.has(item.id)) { duplicateIds.add(item.id); unsupported++; continue; }
    ids.add(item.id); items.push(item);
    if (item.kind === "unknown" || item.status === "unknown") unsupported++;
  }
  // Ambiguous IDs must not offer a destructive operation against an arbitrary row.
  return { items: items.filter((item) => !duplicateIds.has(item.id)), unsupported: unsupported + duplicateIds.size };
}
export function requireScheduleAck(value: unknown): void {
  if (!record(value) || value.ok !== true) throw new ScheduleContractError("后端未确认操作结果");
}
