import { apiGet, apiPost, apiRequest, openApiStream, StreamContractError, type ApiRequestOptions } from "@/lib/api";
import { parseSseStream } from "@/lib/sse";
import { parseTriggerConfig, parseQuickNotePage, parseIncomplete, parseQuickNoteLog, requireAcknowledgement } from "./quick-note-mappers";
import { QuickNoteContractError, type QuickNoteQuery, type QuickNote, type BackfillInput } from "./quick-note-types";

const endpoint = "/api/quick-notes";
const path = (id: string) => `${endpoint}/${encodeURIComponent(id)}`;

export async function getTriggerConfig(options?: ApiRequestOptions) {
  return parseTriggerConfig(await apiGet<unknown>(`${endpoint}/trigger-config`, options));
}

export async function listQuickNotes(query: QuickNoteQuery, options?: ApiRequestOptions) {
  if (!Number.isInteger(query.page) || query.page < 1 || !Number.isInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 200 || !Number.isFinite(query.periodFrom) || !Number.isFinite(query.periodTo) || query.periodTo <= query.periodFrom) throw new QuickNoteContractError("速记日期查询无效");
  const result = parseQuickNotePage(await apiGet<unknown>(endpoint, { ...options, query: { page: query.page, page_size: query.pageSize, period_from: query.periodFrom, period_to: query.periodTo } }));
  if (result.page !== query.page || result.pageSize !== query.pageSize) throw new QuickNoteContractError("速记分页响应不匹配");
  return result;
}

// There is no single-record GET. Search the exact saved period across page boundaries.
export async function readQuickNote(note: QuickNote, options?: ApiRequestOptions): Promise<QuickNote | null> {
  for (let page = 1; ; page++) {
    const result = await listQuickNotes({ page, pageSize: 200, periodFrom: note.periodStart, periodTo: note.periodStart + 1 }, options);
    const found = result.items.find((item) => item.id === note.id);
    if (found) return found;
    if (!result.hasMore) return null;
    if (!result.items.length) throw new QuickNoteContractError();
  }
}

export async function getIncomplete(options?: ApiRequestOptions) {
  return parseIncomplete(await apiGet<unknown>(`${endpoint}/incomplete`, options));
}

export async function backfillQuickNote(input: BackfillInput, options?: ApiRequestOptions) {
  requireAcknowledgement(await apiPost<unknown>(`${endpoint}/backfill`, { date: input.date, period_label: input.periodLabel, end_hour: input.endHour, overwrite: input.overwrite }, options), true);
}

export async function rerunQuickNote(id: string, step: "step1" | "step2", options?: ApiRequestOptions) {
  requireAcknowledgement(await apiPost<unknown>(`${path(id)}/re_${step}`, undefined, { timeoutMs: 180_000, ...options }));
}

export async function saveQuickNote(id: string, output: string, options?: ApiRequestOptions) {
  requireAcknowledgement(await apiRequest<unknown>(path(id), { ...options, method: "PUT", body: { output } }));
}

export async function deleteQuickNote(id: string, options?: ApiRequestOptions) {
  requireAcknowledgement(await apiRequest<unknown>(path(id), { ...options, method: "DELETE" }));
}

export async function* streamQuickNoteLogs(signal: AbortSignal, connected: () => void) {
  // Replay the current server buffer on every connection, including after server restarts.
  const response = await openApiStream(`${endpoint}/logs`, { signal, timeoutMs: 0, query: { last_seq: 0 } });
  if (!/^text\/event-stream(?:;|$)/i.test(response.contentType)) {
    await response.body.cancel();
    throw new StreamContractError("运行日志未返回 SSE");
  }
  connected();
  for await (const frame of parseSseStream(response.body, { signal })) {
    yield parseQuickNoteLog(JSON.parse(frame.data));
  }
}
