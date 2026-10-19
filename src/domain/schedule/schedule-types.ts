export type ScheduleKind = "reminder" | "todo" | "alarm" | "monitor";
export type ManagedScheduleKind = Exclude<ScheduleKind, "monitor">;
export type ScheduleStatus = "active" | "done" | "triggered" | "cancelled" | "unknown";
export interface Schedule {
  readonly id: string;
  readonly kind: ScheduleKind | "unknown";
  readonly status: ScheduleStatus;
  readonly content: string;
  readonly triggerAt: string;
  readonly createdAt: number | null;
}
export interface ScheduleList {
  readonly items: readonly Schedule[];
  readonly unsupported: number;
}
export interface ScheduleInput {
  readonly kind: ManagedScheduleKind;
  readonly content: string;
  readonly triggerAt?: string;
}
export class ScheduleContractError extends Error {
  constructor(message = "日程接口返回格式异常") { super(message); this.name = "ScheduleContractError"; }
}
