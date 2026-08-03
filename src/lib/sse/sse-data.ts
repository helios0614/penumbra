import {
  SseDataError,
  type SseDataFrame,
} from "@/lib/sse/sse-types";

/** Parses framing data only; domain event validation belongs to the caller. */
export function parseSseJsonData(frame: SseDataFrame): unknown {
  try {
    return JSON.parse(frame.data) as unknown;
  } catch {
    throw new SseDataError("SSE data is not valid JSON");
  }
}
