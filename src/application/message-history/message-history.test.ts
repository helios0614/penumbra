import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as messageHistory from "@/application/message-history";
import {
  MessageHistoryContractError,
  createMessageHistoryState,
  loadInitialMessageHistory,
  loadOlderMessageHistory,
  mergeLatestMessagePage,
  mergeOlderMessagePage,
  refreshLatestMessageHistory,
  reloadMessageHistoryFromScratch,
  type MessageHistoryState,
} from "@/application/message-history";
import {
  MessageContractError,
  type Message,
  type MessageRoleKind,
} from "@/domain/message";
import { ApiError } from "@/lib/api";

describe("message history state and pure merges", () => {
  it("creates an immutable oldest-to-newest state with a timestamp cursor", () => {
    const newest = message("newest", 30);
    const oldest = message("oldest", 10);
    const input = [newest, oldest];

    const state = createMessageHistoryState("conv_1", input, { pageSize: 2 });

    expect(state).toEqual({
      conversationId: "conv_1",
      messages: [oldest, newest],
      pageSize: 2,
      oldestCursor: 10,
      olderPageStatus: "maybe-more",
    });
    expect(state.messages).not.toBe(input);
    expect(input).toEqual([newest, oldest]);
  });

  it("keeps createdAt=0 as a valid cursor and exhausts an empty state", () => {
    expect(createMessageHistoryState("conv_1", [message("epoch", 0)])).toMatchObject({
      oldestCursor: 0,
      olderPageStatus: "exhausted",
    });
    expect(createMessageHistoryState("conv_1")).toEqual({
      conversationId: "conv_1",
      messages: [],
      pageSize: 50,
      oldestCursor: null,
      olderPageStatus: "exhausted",
    });
  });

  it("deduplicates an incoming page by ID using its last occurrence payload and position", () => {
    const first = message("duplicate", 10, { content: "first" });
    const middle = message("middle", 10);
    const last = message("duplicate", 10, { content: "last" });

    const state = createMessageHistoryState(
      "conv_1",
      [first, middle, last],
      { pageSize: 3 },
    );

    expect(state.messages).toEqual([middle, last]);
    expect(state.messages[1]).toBe(last);
  });

  it("prepends an older page, replaces overlapping IDs, and only deduplicates by ID", () => {
    const overlapping = message("overlap", 20, { content: "existing" });
    const sameContentA = message("same-a", 10, { content: "same" });
    const state = historyState([overlapping, message("new", 30)], 3);
    const incomingReplacement = message("overlap", 20, { content: "incoming" });
    const sameContentB = message("same-b", 15, { content: "same" });
    const incoming = [sameContentA, sameContentB, incomingReplacement];
    const beforeState = [...state.messages];
    const beforeIncoming = [...incoming];

    const result = mergeOlderMessagePage(state, incoming);

    expect(result.messages.map(({ id }) => id)).toEqual([
      "same-a",
      "same-b",
      "overlap",
      "new",
    ]);
    expect(result.messages[2]).toBe(incomingReplacement);
    expect(result.messages).not.toBe(state.messages);
    expect(state.messages).toEqual(beforeState);
    expect(incoming).toEqual(beforeIncoming);
    expect(result).toMatchObject({
      oldestCursor: 10,
      olderPageStatus: "maybe-more",
    });
  });

  it("uses the last incoming duplicate payload and its stable page position for older merge", () => {
    const state = historyState([message("existing", 30)], 3);
    const firstDuplicate = message("duplicate", 10, { content: "first" });
    const between = message("between", 15);
    const lastDuplicate = message("duplicate", 20, { content: "last" });

    const result = mergeOlderMessagePage(state, [
      firstDuplicate,
      between,
      lastDuplicate,
    ]);

    expect(result.messages.map(({ id }) => id)).toEqual([
      "between",
      "duplicate",
      "existing",
    ]);
    expect(result.messages[1]).toBe(lastDuplicate);
  });

  it("preserves unknown roles and stable incoming-before-existing order at equal timestamps", () => {
    const existingA = message("existing-a", 10);
    const existingB = message("existing-b", 10);
    const state = historyState([existingA, existingB], 2);
    const unknown = message("unknown", 5, {
      rawRole: "future_role",
      roleKind: "unknown",
    });
    const incomingA = message("incoming-a", 10);
    const incomingB = message("incoming-b", 10);

    const result = mergeOlderMessagePage(
      state,
      [unknown, incomingA, incomingB],
    );

    expect(result.messages.map(({ id }) => id)).toEqual([
      "unknown",
      "incoming-a",
      "incoming-b",
      "existing-a",
      "existing-b",
    ]);
    expect(result.messages[0]).toMatchObject({
      rawRole: "future_role",
      roleKind: "unknown",
    });
  });

  it("marks an empty older page exhausted and a short progressing page exhausted", () => {
    const state = historyState([message("existing", 20)], 3);

    const empty = mergeOlderMessagePage(state, []);
    const short = mergeOlderMessagePage(state, [message("older", 10)]);

    expect(empty.olderPageStatus).toBe("exhausted");
    expect(empty.messages).not.toBe(state.messages);
    expect(short).toMatchObject({
      oldestCursor: 10,
      olderPageStatus: "exhausted",
    });
  });

  it("keeps maybe-more only for a full older page whose cursor strictly advances", () => {
    const state = historyState([message("existing", 30)], 2);
    const result = mergeOlderMessagePage(state, [
      message("older-a", 10),
      message("older-b", 20),
    ]);

    expect(result).toMatchObject({
      oldestCursor: 10,
      olderPageStatus: "maybe-more",
    });
  });

  it("stalls when a successful older page adds no ID", () => {
    const state = historyState([
      message("oldest", 10, { content: "old" }),
      message("newest", 20),
    ], 2);
    const replacement = message("oldest", 10, { content: "updated" });

    const result = mergeOlderMessagePage(state, [replacement, state.messages[1]!]);

    expect(result.olderPageStatus).toBe("stalled");
    expect(result.messages[0]).toBe(replacement);
  });

  it("stalls when new IDs do not move the oldest timestamp before the request cursor", () => {
    const state = historyState([message("oldest", 10)], 1);
    const sameBoundary = message("different-id", 10);

    const result = mergeOlderMessagePage(state, [sameBoundary]);

    expect(result.messages.map(({ id }) => id)).toEqual([
      "different-id",
      "oldest",
    ]);
    expect(result.oldestCursor).toBe(10);
    expect(result.olderPageStatus).toBe("stalled");
  });

  it("refreshes matching IDs, adds new IDs, retains omissions, and preserves older status", () => {
    const oldest = message("oldest", 1);
    const omitted = message("omitted", 10);
    const changing = message("changing", 20, { content: "old" });
    const state = historyState(
      [oldest, omitted, changing],
      2,
      "stalled",
    );
    const replacement = message("changing", 25, { content: "updated" });
    const added = message("added", 30);

    const result = mergeLatestMessagePage(state, [replacement, added]);

    expect(result.messages.map(({ id }) => id)).toEqual([
      "oldest",
      "omitted",
      "changing",
      "added",
    ]);
    expect(result.messages[2]).toBe(replacement);
    expect(result.messages[0]).toBe(oldest);
    expect(result).toMatchObject({
      oldestCursor: 1,
      olderPageStatus: "stalled",
    });
    expect(state.messages[2]).toBe(changing);
    expect(result.messages).not.toBe(state.messages);
  });

  it("does not clear history for an empty latest page", () => {
    const state = historyState([message("persisted", 10)], 2, "maybe-more");

    const result = mergeLatestMessagePage(state, []);

    expect(result.messages).toEqual(state.messages);
    expect(result.messages).not.toBe(state.messages);
    expect(result.olderPageStatus).toBe("maybe-more");
  });

  it("keeps latest-page insertion order stable for equal timestamps without sorting by ID", () => {
    const state = historyState([message("z-existing", 10)], 2);
    const first = message("z-new", 10);
    const second = message("a-new", 10);

    const result = mergeLatestMessagePage(state, [first, second]);

    expect(result.messages.map(({ id }) => id)).toEqual([
      "z-existing",
      "z-new",
      "a-new",
    ]);
  });

  it("rejects conversation and cursor mismatches with safe application errors", () => {
    const fakeSecret = "fake-message-secret";
    const endpoint = "https://private.example/messages";
    const state = historyState([
      message("existing", 10, { content: fakeSecret }),
    ], 2);
    const unsafeIncoming = message("incoming", 5, {
      content: endpoint,
      conversationId: "conv_2",
    });

    const errors = [
      captureError(() => mergeLatestMessagePage(state, [], {
        conversationId: "conv_2",
      })),
      captureError(() => mergeOlderMessagePage(state, [unsafeIncoming])),
      captureError(() => mergeOlderMessagePage(state, [], {
        requestedBefore: 9,
      })),
    ];

    for (const error of errors) {
      expect(error).toBeInstanceOf(MessageHistoryContractError);
      expect(String(error)).not.toContain(fakeSecret);
      expect(String(error)).not.toContain(endpoint);
      expect(String(error)).not.toContain("conv_2");
    }
  });

  it.each([0, 501, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid page size %s with an application error",
    (pageSize) => {
      expect(() => createMessageHistoryState("conv_1", [], { pageSize }))
        .toThrow(MessageHistoryContractError);
    },
  );

  it("exports only the history application surface", () => {
    expect(Object.keys(messageHistory).sort()).toEqual([
      "DEFAULT_MESSAGE_HISTORY_PAGE_SIZE",
      "MessageHistoryContractError",
      "createMessageHistoryState",
      "loadInitialMessageHistory",
      "loadOlderMessageHistory",
      "mergeLatestMessagePage",
      "mergeOlderMessagePage",
      "refreshLatestMessageHistory",
      "reloadMessageHistoryFromScratch",
    ]);
    expect(messageHistory).not.toHaveProperty("apiGet");
    expect(messageHistory).not.toHaveProperty("listConversationMessages");
    expect(messageHistory).not.toHaveProperty("MessageDto");
  });
});

describe("message history application services", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("loads one latest page in oldest-to-newest order with the requested page size", async () => {
    fetchMock.mockResolvedValue(json([
      wireMessage("older", 10),
      wireMessage("newer", 20),
    ]));

    const state = await loadInitialMessageHistory("conv_1", {
      pageSize: 2,
      request: { timeoutMs: 0, headers: { "x-history": "initial" } },
    });

    expect(state.messages.map(({ id }) => id)).toEqual(["older", "newer"]);
    expect(state).toMatchObject({
      conversationId: "conv_1",
      pageSize: 2,
      oldestCursor: 10,
      olderPageStatus: "maybe-more",
    });
    expect(requestPaths()).toEqual([
      "/api/conversations/conv_1/messages?limit=2&public_view=true",
    ]);
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("x-history"))
      .toBe("initial");
  });

  it("marks empty and short initial pages exhausted without probing again", async () => {
    fetchMock
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json([wireMessage("only", 0)]));

    const empty = await loadInitialMessageHistory("conv_1", {
      pageSize: 2,
      request: { timeoutMs: 0 },
    });
    const short = await loadInitialMessageHistory("conv_1", {
      pageSize: 2,
      request: { timeoutMs: 0 },
    });

    expect(empty).toMatchObject({
      messages: [],
      oldestCursor: null,
      olderPageStatus: "exhausted",
    });
    expect(short).toMatchObject({
      oldestCursor: 0,
      olderPageStatus: "exhausted",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("passes AbortSignal and preserves the transport ApiError", async () => {
    fetchMock.mockImplementation((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      }));
    const caller = new AbortController();

    const pending = loadInitialMessageHistory("conv_1", {
      request: { signal: caller.signal, timeoutMs: 0 },
    });
    caller.abort("stop history");
    const error = await pending.catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(MessageHistoryContractError);
    expect(error).toMatchObject({ code: "ABORTED" });
  });

  it("preserves HTTP ApiError and MessageContractError without wrapping", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ detail: "failed" }, 500))
      .mockResolvedValueOnce(json({ messages: [] }));

    const transportError = await loadInitialMessageHistory("conv_1", {
      request: { timeoutMs: 0 },
    }).catch((reason: unknown) => reason);
    const domainError = await loadInitialMessageHistory("conv_1", {
      request: { timeoutMs: 0 },
    }).catch((reason: unknown) => reason);

    expect(transportError).toBeInstanceOf(ApiError);
    expect(transportError).not.toBeInstanceOf(MessageHistoryContractError);
    expect(domainError).toBeInstanceOf(MessageContractError);
    expect(domainError).not.toBeInstanceOf(MessageHistoryContractError);
  });

  it("rejects an invalid page size before any HTTP request", async () => {
    const error = await loadInitialMessageHistory("conv_1", {
      pageSize: 0,
      request: { timeoutMs: 0 },
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(MessageHistoryContractError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid conversation ID before any HTTP request", async () => {
    const error = await loadInitialMessageHistory("", {
      request: { timeoutMs: 0 },
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(MessageHistoryContractError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads older messages with limit and before, then exhausts a short page", async () => {
    fetchMock.mockResolvedValue(json([wireMessage("older", 10)]));
    const state = historyState([message("existing", 20)], 2);

    const result = await loadOlderMessageHistory(state, {
      request: { timeoutMs: 0 },
    });

    expect(requestPaths()).toEqual([
      "/api/conversations/conv_1/messages?limit=2&before=20&public_view=true",
    ]);
    expect(result.messages.map(({ id }) => id)).toEqual(["older", "existing"]);
    expect(result).toMatchObject({
      oldestCursor: 10,
      olderPageStatus: "exhausted",
    });
  });

  it("does not request older pages after exhausted or stalled", async () => {
    const exhausted = historyState([message("a", 10)], 2, "exhausted");
    const stalled = historyState([message("b", 10)], 2, "stalled");

    await expect(loadOlderMessageHistory(exhausted)).resolves.toBe(exhausted);
    await expect(loadOlderMessageHistory(stalled)).resolves.toBe(stalled);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("turns a null cursor into exhausted without requesting", async () => {
    const state: MessageHistoryState = {
      conversationId: "conv_1",
      messages: [],
      pageSize: 2,
      oldestCursor: null,
      olderPageStatus: "maybe-more",
    };

    const result = await loadOlderMessageHistory(state);

    expect(result).not.toBe(state);
    expect(result.messages).not.toBe(state.messages);
    expect(result.olderPageStatus).toBe("exhausted");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends before=0 instead of dropping the epoch cursor", async () => {
    fetchMock.mockResolvedValue(json([]));
    const state = historyState([message("epoch", 0)], 1);

    const result = await loadOlderMessageHistory(state, {
      request: { timeoutMs: 0 },
    });

    expect(requestPaths()).toEqual([
      "/api/conversations/conv_1/messages?limit=1&before=0&public_view=true",
    ]);
    expect(result.olderPageStatus).toBe("exhausted");
  });

  it("refreshes only the latest window and never treats omissions as deletes", async () => {
    const oldest = message("oldest", 1);
    const omitted = message("omitted", 10);
    const updating = message("updating", 20, { content: "old" });
    const state = historyState([oldest, omitted, updating], 2, "stalled");
    fetchMock.mockResolvedValue(json([
      wireMessage("updating", 20, { content: "updated" }),
      wireMessage("new", 30),
    ]));

    const result = await refreshLatestMessageHistory(state, {
      request: { timeoutMs: 0 },
    });

    expect(requestPaths()).toEqual([
      "/api/conversations/conv_1/messages?limit=2&public_view=true",
    ]);
    expect(result.messages.map(({ id }) => id)).toEqual([
      "oldest",
      "omitted",
      "updating",
      "new",
    ]);
    expect(result.messages[2]?.content).toBe("updated");
    expect(result.olderPageStatus).toBe("stalled");
  });

  it("keeps all loaded history when the latest window is empty", async () => {
    const state = historyState([
      message("old", 1),
      message("current", 2),
    ], 2, "maybe-more");
    fetchMock.mockResolvedValue(json([]));

    const result = await refreshLatestMessageHistory(state, {
      request: { timeoutMs: 0 },
    });

    expect(result.messages).toEqual(state.messages);
    expect(result.messages).not.toBe(state.messages);
    expect(result.olderPageStatus).toBe("maybe-more");
  });

  it("reloads from scratch, preserves state page size, and discards old pages", async () => {
    const state = historyState([
      message("old-page", 1),
      message("old-latest", 2),
    ], 2, "stalled");
    fetchMock.mockResolvedValue(json([
      wireMessage("fresh-a", 100),
      wireMessage("fresh-b", 200),
    ]));

    const result = await reloadMessageHistoryFromScratch(state, {
      request: { timeoutMs: 0 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestPaths()).toEqual([
      "/api/conversations/conv_1/messages?limit=2&public_view=true",
    ]);
    expect(result.messages.map(({ id }) => id)).toEqual(["fresh-a", "fresh-b"]);
    expect(result).toMatchObject({
      conversationId: "conv_1",
      pageSize: 2,
      oldestCursor: 100,
      olderPageStatus: "maybe-more",
    });
  });

  it("allows reload to explicitly replace page size and accepts a conversation ID", async () => {
    fetchMock
      .mockResolvedValueOnce(json([wireMessage("one", 1)]))
      .mockResolvedValueOnce(json([]));
    const state = historyState([message("old", 0)], 2);

    const overridden = await reloadMessageHistoryFromScratch(state, {
      pageSize: 1,
      request: { timeoutMs: 0 },
    });
    const byId = await reloadMessageHistoryFromScratch("conv_1", {
      request: { timeoutMs: 0 },
    });

    expect(overridden.pageSize).toBe(1);
    expect(byId.pageSize).toBe(50);
    expect(requestPaths()).toEqual([
      "/api/conversations/conv_1/messages?limit=1&public_view=true",
      "/api/conversations/conv_1/messages?limit=50&public_view=true",
    ]);
  });

  it("only calls message history and no settings, conversation-list, send, or realtime endpoint", async () => {
    fetchMock.mockResolvedValue(json([]));

    await loadInitialMessageHistory("conv_1", {
      request: { timeoutMs: 0 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const paths = requestPaths().join(" ");
    expect(paths).toContain("/api/conversations/conv_1/messages?limit=50&public_view=true");
    expect(paths).not.toMatch(
      /settings|readiness|send|regenerate|message_count|\/ws|websocket/,
    );
  });

  function requestPaths(): string[] {
    return fetchMock.mock.calls.map(([path]) => String(path));
  }
});

function historyState(
  messages: readonly Message[],
  pageSize: number,
  olderPageStatus: MessageHistoryState["olderPageStatus"] = "maybe-more",
): MessageHistoryState {
  return createMessageHistoryState("conv_1", messages, {
    pageSize,
    olderPageStatus,
  });
}

function message(
  id: string,
  createdAt: number,
  overrides: Partial<Message> = {},
): Message {
  return {
    id,
    conversationId: "conv_1",
    rawRole: "user",
    roleKind: "user" as MessageRoleKind,
    content: id,
    createdAt,
    simpleThink: null,
    thinking: null,
    isCarryover: false,
    attachments: [],
    mcpToolCalls: [],
    cacheRegion: null,
    voice: null,
    ...overrides,
  };
}

function wireMessage(
  id: string,
  createdAt: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    conv_id: "conv_1",
    role: "user",
    content: id,
    created_at: createdAt,
    simple_think: null,
    thinking: null,
    is_carryover: 0,
    attachments: [],
    mcp_tool_calls: [],
    cache_region: null,
    ...overrides,
  };
}

function captureError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected function to throw");
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
