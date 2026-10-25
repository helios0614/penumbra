import { apiGet, type ApiRequestOptions } from "@/lib/api";
import { mapMessageHistory } from "./message-mappers";
import { MessageContractError, type Message } from "./message-types";

export type PublicSearchSegment = {
  readonly segmentKey: string;
  readonly text: string;
};
export type SearchSnippet = PublicSearchSegment & {
  readonly matchRanges: readonly (readonly [number, number])[];
};
export type MessageSearchResult = {
  readonly messageId: string;
  readonly createdAt: number;
  readonly role: "user" | "assistant" | "system";
  readonly snippets: readonly SearchSnippet[];
  readonly publicRevision: string;
};
export type MessageSearchPage = {
  readonly conversationId: string;
  readonly items: readonly MessageSearchResult[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  readonly pageStatus: "ready" | "scan_pending" | "complete";
};
export type MessageWindow = {
  readonly conversationId: string;
  readonly anchorId: string | null;
  readonly messages: readonly Message[];
  readonly olderCursor: string | null;
  readonly newerCursor: string | null;
  readonly hasOlder: boolean;
  readonly hasNewer: boolean;
  readonly reachesLatest: boolean;
};
export type MessageWindowQuery = {
  readonly anchorId?: string;
  readonly beforeCursor?: string;
  readonly afterCursor?: string;
  readonly limit?: number;
  readonly beforeLimit?: number;
  readonly afterLimit?: number;
};

const fail = (): never => {
  throw new MessageContractError(
    "Public history response violates its identity or read contract",
  );
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail();
const text = (value: unknown): string =>
  typeof value === "string" ? value : fail();
const cursor = (value: unknown): string | null =>
  value === null ? null : text(value) || fail();
const bool = (value: unknown): boolean =>
  typeof value === "boolean" ? value : fail();
export function mapSearchSegments(
  value: unknown,
): readonly PublicSearchSegment[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return fail();
  return value.map((item) => {
    const r = record(item);
    const key = text(r.segment_key);
    if (
      !/^(body|display\.(title|summary|preview|(field|label|notice):\d+)|tool:\d+\.(server|tool|error|result)|web:\d+\.(query|source:\d+\.(title|domain))|url:\d+\.domain|music:\d+\.(name|artist|album))$/.test(
        key,
      )
    )
      return fail();
    return { segmentKey: key, text: text(r.text) };
  });
}
export function mapMessageWindow(
  value: unknown,
  owner: string,
  anchor?: string,
): MessageWindow {
  const r = record(value);
  if (
    r.conversation_id !== owner ||
    (anchor !== undefined && r.anchor_id !== anchor)
  )
    return fail();
  const messages = mapMessageHistory(r.messages);
  if (
    messages.some(
      (m, i) =>
        m.conversationId !== owner ||
        (i > 0 && m.createdAt < messages[i - 1]!.createdAt),
    ) ||
    new Set(messages.map((m) => m.id)).size !== messages.length ||
    (anchor && !messages.some((m) => m.id === anchor))
  )
    return fail();
  const olderCursor = cursor(r.older_cursor),
    newerCursor = cursor(r.newer_cursor),
    hasOlder = bool(r.has_older),
    hasNewer = bool(r.has_newer),
    reachesLatest = bool(r.reaches_latest);
  if (
    hasOlder !== (olderCursor !== null) ||
    hasNewer !== (newerCursor !== null) ||
    reachesLatest === hasNewer
  )
    return fail();
  return {
    conversationId: owner,
    anchorId: cursor(r.anchor_id),
    messages,
    olderCursor,
    newerCursor,
    hasOlder,
    hasNewer,
    reachesLatest,
  };
}
export async function readMessageWindow(
  owner: string,
  query: MessageWindowQuery = {},
  options?: ApiRequestOptions,
): Promise<MessageWindow> {
  const params = new URLSearchParams();
  if (
    [query.anchorId, query.beforeCursor, query.afterCursor].filter(
      (v) => v !== undefined,
    ).length > 1
  )
    return fail();
  for (const [key, value] of Object.entries({
    anchor_id: query.anchorId,
    before_cursor: query.beforeCursor,
    after_cursor: query.afterCursor,
    limit: query.limit,
    before_limit: query.beforeLimit,
    after_limit: query.afterLimit,
  }))
    if (value !== undefined) params.set(key, String(value));
  return mapMessageWindow(
    await apiGet(
      `/api/conversations/${encodeURIComponent(owner)}/messages/window?${params}`,
      options,
    ),
    owner,
    query.anchorId,
  );
}
export async function searchConversationMessages(
  owner: string,
  q: string,
  nextCursor?: string | null,
  options?: ApiRequestOptions,
): Promise<MessageSearchPage> {
  const params = new URLSearchParams({ q, limit: "20" });
  if (nextCursor) params.set("cursor", nextCursor);
  const r = record(
    await apiGet(
      `/api/conversations/${encodeURIComponent(owner)}/messages/search?${params}`,
      options,
    ),
  );
  if (
    r.conversation_id !== owner ||
    r.match_version !== 1 ||
    !Array.isArray(r.items) ||
    r.total !== null ||
    !["ready", "scan_pending", "complete"].includes(text(r.page_status))
  )
    return fail();
  const items = r.items.map((value) => {
    const item = record(value);
    if (
      !["user", "assistant", "system"].includes(text(item.role)) ||
      typeof item.created_at !== "number" ||
      !Number.isFinite(item.created_at) ||
      !Array.isArray(item.snippets)
    )
      return fail();
    const snippets = item.snippets.map((value) => {
      const s = record(value),
        segment = mapSearchSegments([s])[0]!;
      if (!Array.isArray(s.match_ranges)) return fail();
      const matchRanges = s.match_ranges.map((value) => {
        if (
          !Array.isArray(value) ||
          value.length !== 2 ||
          !value.every(Number.isInteger) ||
          value[0] < 0 ||
          value[1] <= value[0] ||
          value[1] > Array.from(segment.text).length
        )
          return fail();
        return [value[0], value[1]] as const;
      });
      return { ...segment, matchRanges };
    });
    return {
      messageId: text(item.message_id) || fail(),
      createdAt: item.created_at,
      role: item.role as MessageSearchResult["role"],
      snippets,
      publicRevision: text(item.public_revision),
    };
  });
  const next = cursor(r.next_cursor),
    hasMore = bool(r.has_more);
  if (
    hasMore !== (next !== null) ||
    (r.page_status === "complete") === hasMore ||
    new Set(items.map((m) => m.messageId)).size !== items.length
  )
    return fail();
  return {
    conversationId: owner,
    items,
    nextCursor: next,
    hasMore,
    pageStatus: r.page_status as MessageSearchPage["pageStatus"],
  };
}
