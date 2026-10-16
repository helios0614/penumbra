import { QuickNoteContractError, type TriggerConfig } from "@/domain/quick-note";

export function parseDateKey(date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== date) throw new QuickNoteContractError("日期无效");
  return ms;
}

export function shiftDate(date: string, days: number): string {
  return new Date(parseDateKey(date) + days * 86_400_000).toISOString().slice(0, 10);
}

function wallParts(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(ms);
  const get = (key: string) => parts.find((part) => part.type === key)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")), minute: Number(get("minute")), second: Number(get("second")) };
}

// Resolve a wall-clock boundary using offsets around that date, not the browser zone.
// Repeated boundaries use their first occurrence; nonexistent boundaries fail explicitly.
export function boundarySeconds(date: string, hour: number, timeZone: string): number {
  const wallMs = parseDateKey(date) + hour * 3_600_000;
  const matches = new Set<number>();
  for (let offsetHours = -36; offsetHours <= 36; offsetHours += 6) {
    const sample = wallMs + offsetHours * 3_600_000;
    const parts = wallParts(sample, timeZone);
    const offset = parseDateKey(parts.date) + (parts.hour * 3600 + parts.minute * 60 + parts.second) * 1000 - sample;
    const candidate = wallMs - offset;
    const result = wallParts(candidate, timeZone);
    if (result.date === date && result.hour === hour && result.minute === 0 && result.second === 0) matches.add(candidate / 1000);
  }
  if (!matches.size) throw new QuickNoteContractError("该日期的业务日界在配置时区中不存在，请检查配置");
  return Math.min(...matches);
}

export function businessDate(config: TriggerConfig, now = Date.now()): string {
  const date = wallParts(now, config.timeZone).date;
  return now / 1000 < boundarySeconds(date, config.dayBoundaryHour, config.timeZone) ? shiftDate(date, -1) : date;
}

export function businessRange(date: string, config: TriggerConfig) {
  return {
    periodFrom: boundarySeconds(date, config.dayBoundaryHour, config.timeZone),
    periodTo: boundarySeconds(shiftDate(date, 1), config.dayBoundaryHour, config.timeZone),
  };
}

export function formatPeriod(start: number, end: number, timeZone: string): string {
  const from = wallParts(start * 1000, timeZone);
  const to = wallParts(end * 1000, timeZone);
  const clock = (value: typeof from) => `${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`;
  return `${from.date} ${clock(from)} — ${to.date !== from.date ? `${to.date}（跨天） ` : ""}${clock(to)}`;
}
