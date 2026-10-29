export interface QuickNote {
  readonly id: string;
  readonly periodStart: number;
  readonly periodEnd: number;
  readonly periodLabel: string;
  readonly summary: string;
  readonly output: string;
  readonly createdAt: number;
}

export interface TriggerConfig {
  readonly hours: readonly number[];
  readonly labels: Readonly<Record<string, string>>;
  readonly dayBoundaryHour: number;
  readonly timeZone: string;
}

export interface TriggerConfigInput {
  readonly hours: readonly number[];
  readonly labels: Readonly<Record<string, string>>;
}

export interface QuickNoteQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly periodFrom: number;
  readonly periodTo: number;
}

export interface QuickNotePage {
  readonly items: readonly QuickNote[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly hasMore: boolean;
}

export interface IncompletePeriod {
  readonly key: string;
  readonly date: string;
  readonly periodLabel: string;
  readonly periodStart: number;
  readonly periodEnd: number;
  readonly endHour: number;
  readonly status: "incomplete" | "missing";
}

export interface BackfillInput {
  readonly date: string;
  readonly periodLabel: string;
  readonly endHour: number;
  readonly overwrite: boolean;
}

export interface QuickNoteLog {
  readonly seq: number;
  readonly ts: number;
  readonly level: string;
  readonly message: string;
}

export interface SummarySection {
  readonly title: string;
  readonly text: string;
}

export class QuickNoteContractError extends Error {
  constructor(message = "速记接口返回格式异常") {
    super(message);
    this.name = "QuickNoteContractError";
  }
}
