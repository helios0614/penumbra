import { apiGet, type ApiRequestOptions } from "@/lib/api";
import { mapMessageSearchItem, type MessageSearchResult } from "./message-window";
import { MessageContractError } from "./message-types";

export const GLOBAL_SEARCH_RANGE_SECONDS = 30 * 24 * 60 * 60;
export type SearchTimeRange = { readonly start: number; readonly end: number };
export type GlobalMessageSearchResult = MessageSearchResult & {
  readonly conversationId: string;
  readonly conversationTitle: string;
};
export type GlobalMessageSearchPage = {
  readonly range: SearchTimeRange;
  readonly items: readonly GlobalMessageSearchResult[];
  readonly nextCursor: string | null;
  readonly pageStatus: "ready" | "scan_pending" | "complete";
};
export const globalResultKey = (item: { conversationId: string; messageId: string }) =>
  JSON.stringify([item.conversationId, item.messageId]);

export async function searchGlobalMessages(q: string, range?: SearchTimeRange | null,
  cursor?: string | null, options?: ApiRequestOptions): Promise<GlobalMessageSearchPage> {
  const params = new URLSearchParams({ q, limit: "20" });
  if (range) { params.set("range_start", String(range.start)); params.set("range_end", String(range.end)); }
  if (cursor) params.set("cursor", cursor);
  const value = await apiGet<unknown>(`/api/conversations/messages/search?${params}`, options);
  return mapGlobalSearchPage(value, range);
}

export function mapGlobalSearchPage(value: unknown, expected?: SearchTimeRange | null): GlobalMessageSearchPage {
  const fail = (): never => { throw new MessageContractError("Invalid global public search response"); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const r = value as Record<string, unknown>;
  if (r.match_version !== 1 || r.total !== null || !Array.isArray(r.items) ||
    typeof r.range_start !== "number" || typeof r.range_end !== "number" ||
    !Number.isFinite(r.range_start) || !Number.isFinite(r.range_end) ||
    Math.abs(r.range_end - r.range_start - GLOBAL_SEARCH_RANGE_SECONDS) > .000001 ||
    (expected && (expected.start !== r.range_start || expected.end !== r.range_end)) ||
    !["ready", "scan_pending", "complete"].includes(String(r.page_status))) return fail();
  const range = { start: r.range_start, end: r.range_end };
  const items = r.items.map((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
    const item = value as Record<string, unknown>;
    if (typeof item.conversation_id !== "string" || !item.conversation_id ||
      typeof item.conversation_title !== "string") return fail();
    const result = mapMessageSearchItem(item);
    if (result.createdAt < range.start || result.createdAt >= range.end) return fail();
    return { ...result, conversationId: item.conversation_id, conversationTitle: item.conversation_title };
  });
  const next = r.next_cursor;
  if (!(next === null || typeof next === "string" && next.length > 0) ||
    r.has_more !== (next !== null) || (r.page_status === "complete") === r.has_more ||
    new Set(items.map(globalResultKey)).size !== items.length) return fail();
  return { range, items, nextCursor: next, pageStatus: r.page_status as GlobalMessageSearchPage["pageStatus"] };
}
