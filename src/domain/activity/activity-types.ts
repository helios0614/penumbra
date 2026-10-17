export interface ActivityEvent {
  readonly timestamp: number;
  readonly time: string;
  readonly date: string;
  readonly device: string;
  readonly app: string;
  readonly title: string;
}

export interface ActivityRecord extends ActivityEvent { readonly key: string }
export type ActivityQuery = { readonly kind: "recent"; readonly hours: number } | { readonly kind: "date"; readonly date: string };
export type ActivityDevice = "all" | "pc" | "phone";
export interface ActivitySummary {
  readonly start: string;
  readonly end: string;
  readonly summary: string;
  readonly count: number;
}
export class ActivityContractError extends Error {
  constructor() { super("活动接口返回的数据不符合契约，请重新读取。"); this.name = "ActivityContractError"; }
}
