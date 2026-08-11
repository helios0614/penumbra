export interface SseDataFrame {
  readonly data: string;
  readonly event?: string;
}

export interface ParseSseStreamOptions {
  readonly signal?: AbortSignal;
}

export class SseFramingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SseFramingError";
  }
}

export class SseDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SseDataError";
  }
}
