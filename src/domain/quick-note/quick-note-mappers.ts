import { QuickNoteContractError, type TriggerConfig, type QuickNote, type QuickNotePage, type IncompletePeriod, type QuickNoteLog, type SummarySection } from "./quick-note-types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const hour = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 23;
const timestamp = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 8.64e12;
const positive = (value: unknown): value is number => Number.isInteger(value) && Number(value) > 0;

export function parseTriggerConfig(value: unknown): TriggerConfig {
  if (!isRecord(value) || value.date_contract_error !== null || !Array.isArray(value.hours) || value.hours.length < 2 || !value.hours.every(hour) || !isRecord(value.labels) || !hour(value.day_boundary_hour) || typeof value.time_zone !== "string") {
    throw new QuickNoteContractError("时段配置或日期契约不可用，请重新读取配置");
  }
  const hours = [...value.hours];
  if (new Set(hours).size !== hours.length || Math.min(...hours) !== value.day_boundary_hour || Object.keys(value.labels).length !== hours.length) throw new QuickNoteContractError("时段配置与日界不一致");
  const labels: Record<string, string> = {};
  for (const h of hours) {
    const label = value.labels[String(h)];
    if (typeof label !== "string") throw new QuickNoteContractError("时段名称配置不可用");
    labels[String(h)] = label;
  }
  try { new Intl.DateTimeFormat("en", { timeZone: value.time_zone }).format(); }
  catch { throw new QuickNoteContractError("业务时区配置不可用"); }
  return { hours, labels, dayBoundaryHour: value.day_boundary_hour, timeZone: value.time_zone };
}

export function parseQuickNote(value: unknown): QuickNote {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id || !timestamp(value.period_start) || !timestamp(value.period_end) || value.period_end <= value.period_start || typeof value.period_label !== "string" || !timestamp(value.created_at) || (value.summary != null && typeof value.summary !== "string") || (value.output != null && typeof value.output !== "string")) throw new QuickNoteContractError();
  return { id: value.id, periodStart: value.period_start, periodEnd: value.period_end, periodLabel: value.period_label, summary: value.summary ?? "", output: value.output ?? "", createdAt: value.created_at };
}

export function parseQuickNotePage(value: unknown): QuickNotePage {
  if (!isRecord(value) || !Array.isArray(value.items) || !positive(value.page) || !positive(value.page_size) || value.page_size > 200 || !Number.isInteger(value.total) || Number(value.total) < 0 || typeof value.has_more !== "boolean") throw new QuickNoteContractError();
  return { items: value.items.map(parseQuickNote), page: value.page, pageSize: value.page_size, total: Number(value.total), hasMore: value.has_more };
}

export function parseIncomplete(value: unknown): readonly IncompletePeriod[] {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new QuickNoteContractError();
  return value.items.map((item) => {
    if (!isRecord(item) || typeof item.key !== "string" || typeof item.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || typeof item.period_label !== "string" || !timestamp(item.period_start) || !timestamp(item.period_end) || !hour(item.end_hour) || (item.status !== "incomplete" && item.status !== "missing")) throw new QuickNoteContractError();
    return { key: item.key, date: item.date, periodLabel: item.period_label, periodStart: item.period_start, periodEnd: item.period_end, endHour: item.end_hour, status: item.status };
  });
}

export function parseQuickNoteLog(value: unknown): QuickNoteLog {
  if (!isRecord(value) || !positive(value.seq) || !timestamp(value.ts) || typeof value.level !== "string" || typeof value.msg !== "string") throw new QuickNoteContractError("运行日志格式异常");
  return { seq: value.seq, ts: value.ts, level: value.level, message: value.msg };
}

export function requireAcknowledgement(value: unknown, accepted = false): void {
  if (!isRecord(value) || value.ok !== true || (accepted && value.accepted !== true)) throw new QuickNoteContractError("操作结果暂时无法确认");
}

export function normalizeOutput(value: string): string {
  return value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/\r\n?/g, "\n");
}

// Render all saved Step 1 fields, including unknown/legacy structures, as escaped text.
export function normalizeSummary(raw: string): readonly SummarySection[] {
  if (!raw.trim()) return [];
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { return [{ title: "原始摘要（非 JSON）", text: normalizeOutput(raw) }]; }
  try {
    if (!isRecord(value)) return [{ title: "辅助摘要", text: summaryText(value) }];
    return Object.entries(value).map(([title, content]) => ({ title, text: summaryText(content) }));
  } catch {
    return [{ title: "原始摘要", text: normalizeOutput(raw) }];
  }
}

function summaryText(value: unknown): string {
  if (typeof value === "string") return normalizeOutput(value);
  if (Array.isArray(value)) return value.map(summaryText).join("\n\n");
  if (isRecord(value)) return Object.entries(value).map(([key, item]) => `${key}：${summaryText(item)}`).join("\n");
  return value === null ? "null" : String(value);
}
