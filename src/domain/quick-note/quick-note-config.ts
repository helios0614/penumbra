import { QuickNoteContractError, type TriggerConfig, type TriggerConfigInput } from "./quick-note-types";

export interface TriggerConfigRow {
  readonly hour: string;
  readonly label: string;
}

export function triggerConfigRows(config: TriggerConfig): readonly TriggerConfigRow[] {
  return config.hours.map((hour) => ({ hour: String(hour), label: config.labels[String(hour)] }));
}

export function validateTriggerConfigInput(input: TriggerConfigInput): void {
  if (input.hours.length < 2) throw new QuickNoteContractError("速记至少需要两个截止小时。");
  if (input.hours.some((hour) => !Number.isInteger(hour) || hour < 0 || hour > 23)) throw new QuickNoteContractError("截止小时必须是 0–23 的整数。");
  if (new Set(input.hours).size !== input.hours.length) throw new QuickNoteContractError("截止小时不能重复，时段名称可以重复。");
  if (input.hours.some((hour, index) => index > 0 && hour < input.hours[index - 1])) throw new QuickNoteContractError("截止小时须按当前行顺序递增，请调整小时；不会自动排序。");
  if (Object.keys(input.labels).length !== input.hours.length || input.hours.some((hour) => typeof input.labels[String(hour)] !== "string")) throw new QuickNoteContractError("截止小时与时段名称必须一一对应。");
}

export function triggerConfigInput(rows: readonly TriggerConfigRow[]): TriggerConfigInput {
  if (rows.some((row) => !/^\d{1,2}$/.test(row.hour))) throw new QuickNoteContractError("截止小时必须是 0–23 的整数。");
  // Build both fields from the same rows, including when cutoff identities change.
  const hours = rows.map((row) => Number(row.hour));
  const labels = Object.fromEntries(rows.map((row, index) => [String(hours[index]), row.label]));
  const input = { hours, labels };
  validateTriggerConfigInput(input);
  return input;
}
