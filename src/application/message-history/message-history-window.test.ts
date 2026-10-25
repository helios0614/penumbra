import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mapMessage,
  mapMessageWindow,
  readMessageWindow,
  searchConversationMessages,
} from "@/domain/message";
import {
  messageWire,
  mainConfigurationWire,
  readinessWire,
} from "@/test-fixtures/main-chat-wire";
import { messageWindowWire } from "@/test-fixtures/message-window-wire";
import {
  historyFromWindow,
  mergeAdjacentHistory,
  reconcileHistoryWindow,
  loadOlderMessageHistory,
  loadNewerMessageHistory,
} from ".";
import { createChatWorkspaceController } from "@/components/chat-workspace/chat-workspace-controller";
import { getChatRegenerateAvailability } from "@/components/chat-workspace/chat-regenerate-policy";
import { ApiError } from "@/lib/api";
import { reconcileRealtimeEvent } from "@/application/realtime-reconciliation";

afterEach(() => vi.unstubAllGlobals());
const msg = (id: string, content = "body") =>
  messageWire({ id, conv_id: "conv_a", created_at: 100, content });
const page = (ids: string[], older: string | null, newer: string | null) =>
  mapMessageWindow(
    {
      ...messageWindowWire(
        ids.map((id) => msg(id)),
        "conv_a",
        !!older,
      ),
      older_cursor: older,
      newer_cursor: newer,
      has_newer: !!newer,
      reaches_latest: !newer,
    },
    "conv_a",
  );
const json = (v: unknown) =>
  new Response(JSON.stringify(v), {
    headers: { "content-type": "application/json" },
  });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { resolve, promise };
}

describe("PR6 public windows and authority", () => {
  it("uses opaque two-key cursors and server order at equal timestamps in both directions", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(
      json({
        ...messageWindowWire([msg("_10"), msg("_2")], "conv_a", true),
        older_cursor: "old2",
        newer_cursor: "new2",
        has_newer: true,
        reaches_latest: false,
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const initial = historyFromWindow(page(["tail"], "old", "new"));
    const old = await loadOlderMessageHistory(initial);
    expect(old.messages.map((m) => m.id)).toEqual(["_10", "_2", "tail"]);
    expect(old.olderPageStatus).toBe("maybe-more");
    expect(old.oldestCursor).toBe(100);
    expect(String(fetch.mock.calls[0][0])).toContain("before_cursor=old");
    fetch.mockResolvedValueOnce(
      json({
        ...messageWindowWire([msg("last")], "conv_a"),
        older_cursor: "unused",
        has_older: true,
      }),
    );
    const next = await loadNewerMessageHistory(old);
    expect(next.messages.map((m) => m.id)).toEqual([
      "_10",
      "_2",
      "tail",
      "last",
    ]);
    expect(next.window?.reachesLatest).toBe(true);
  });
  it("keeps tied earlier IDs during overlapping tail refresh and never fills a gap by array union", () => {
    const current = historyFromWindow(page(["a", "b", "c"], "old", null));
    const updated = historyFromWindow(page(["b", "c", "d"], "middle", null));
    expect(
      reconcileHistoryWindow(current, updated).messages.map((m) => m.id),
    ).toEqual(["a", "b", "c", "d"]);
    const gap = reconcileHistoryWindow(
      current,
      historyFromWindow(page(["far"], "far-old", null)),
    );
    expect(gap.messages.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(gap.window?.reachesLatest).toBe(false);
    expect(gap.hasNewMessages).toBe(true);
  });
  it("rejects cross-conversation, missing anchors, malformed cursors and private search segments", async () => {
    expect(() =>
      mapMessageWindow({ ...messageWindowWire([msg("a")], "conv_a") }, "other"),
    ).toThrow();
    expect(() =>
      mapMessageWindow(
        { ...messageWindowWire([msg("a")], "conv_a"), anchor_id: "a" },
        "conv_a",
        "missing",
      ),
    ).toThrow();
    expect(() =>
      mapMessage({
        ...msg("a"),
        search_segments: [{ segment_key: "args.password", text: "private" }],
      }),
    ).toThrow();
    const fetch = vi.fn().mockResolvedValue(
      json({
        conversation_id: "other",
        match_version: 1,
        items: [],
        next_cursor: null,
        has_more: false,
        page_status: "complete",
        total: null,
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(
      searchConversationMessages("conv_a", "keyword"),
    ).rejects.toThrow();
    await expect(
      readMessageWindow("conv_a", { anchorId: "a", beforeCursor: "cursor" }),
    ).rejects.toThrow();
  });
  it("deduplicates overlapping adjacent message IDs without lexicographic sorting", () => {
    const old = historyFromWindow(page(["_2", "tail"], "old", null));
    expect(
      mergeAdjacentHistory(
        old,
        page(["_10", "_2"], null, "new"),
        "older",
      ).messages.map((m) => m.id),
    ).toEqual(["_10", "_2", "tail"]);
  });
  it("does not cancel final HTTP persistence confirmation when search navigates, or overwrite the new read window", async () => {
    const tail = historyFromWindow(
      page(["user", "assistant"], "tail-old", null),
    );
    const latest = deferred<typeof tail>(),
      around = deferred<typeof tail>();
    let confirmationSignal: AbortSignal | undefined;
    const fetch = vi.fn(async (input: unknown) => {
      const path = String(input);
      if (path === "/api/conversations")
        return json([
          {
            id: "conv_a",
            title: "A",
            model: "legacy",
            created_at: 1,
            updated_at: 2,
            message_count: 2,
          },
        ]);
      if (path.startsWith("/api/main/configuration"))
        return json(mainConfigurationWire());
      if (path.startsWith("/api/chat/readiness")) return json(readinessWire());
      return json({
        ...messageWindowWire([msg("user"), msg("assistant")], "conv_a", true),
        older_cursor: "tail-old",
      });
    });
    vi.stubGlobal("fetch", fetch);
    const controller = createChatWorkspaceController(
      {},
      {
        reloadHistory: async (_h, o) => {
          confirmationSignal = o?.request?.signal;
          return latest.promise;
        },
        loadAroundHistory: () => around.promise,
      },
    );
    await controller.load();
    const confirming = controller.reloadSelectedConversationHistory(
      "conv_a",
      "assistant",
    );
    const navigating = controller.navigateHistory("conv_a", "ancient");
    around.resolve(
      historyFromWindow(page(["ancient"], "ancient-old", "ancient-new")),
    );
    await navigating;
    expect(confirmationSignal?.aborted).toBe(false);
    latest.resolve(tail);
    const receipt = await confirming;
    expect(receipt.persistedMessageIds).toContain("assistant");
    const state = controller.getState();
    expect(state).toMatchObject({
      workspace: { history: { messages: [{ id: "ancient" }] } },
    });
    expect(
      getChatRegenerateAvailability(state, { kind: "idle" }).target,
    ).toBeNull();
    controller.dispose();
  });
  it("discards an earlier unabortable navigation and retains a failed target's existing window", async () => {
    const a = deferred<ReturnType<typeof historyFromWindow>>(),
      b = deferred<ReturnType<typeof historyFromWindow>>();
    const fetch = vi.fn(async (input: unknown) => {
      const path = String(input);
      if (path === "/api/conversations")
        return json([
          {
            id: "conv_a",
            title: "A",
            model: "legacy",
            created_at: 1,
            updated_at: 2,
            message_count: 2,
          },
        ]);
      if (path.startsWith("/api/main/configuration"))
        return json(mainConfigurationWire());
      if (path.startsWith("/api/chat/readiness")) return json(readinessWire());
      return json(messageWindowWire([msg("tail")], "conv_a"));
    });
    vi.stubGlobal("fetch", fetch);
    const c = createChatWorkspaceController(
      {},
      {
        loadAroundHistory: (_owner, id) => (id === "a" ? a.promise : b.promise),
      },
    );
    await c.load();
    const first = c.navigateHistory("conv_a", "a").catch(() => null);
    const second = c.navigateHistory("conv_a", "b");
    b.resolve(historyFromWindow(page(["b"], null, "new")));
    await second;
    a.resolve(historyFromWindow(page(["a"], null, "new")));
    await first;
    expect(c.getState()).toMatchObject({
      workspace: { history: { messages: [{ id: "b" }] } },
    });
    c.dispose();
  });
});

function syntheticBootstrap() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const path = String(input);
      if (path === "/api/conversations")
        return json([
          {
            id: "conv_a",
            title: "A",
            model: "legacy",
            created_at: 1,
            updated_at: 2,
            message_count: 2,
          },
        ]);
      if (path.startsWith("/api/main/configuration"))
        return json(mainConfigurationWire());
      if (path.startsWith("/api/chat/readiness")) return json(readinessWire());
      return json({
        ...messageWindowWire([msg("tail")], "conv_a", true),
        older_cursor: "original-boundary",
      });
    }),
  );
}
it("does not resurrect a target deleted while an unabortable around request is in flight", async () => {
  syntheticBootstrap();
  const result = deferred<ReturnType<typeof historyFromWindow>>();
  const c = createChatWorkspaceController(
    {},
    { loadAroundHistory: () => result.promise },
  );
  await c.load();
  const navigating = c
    .navigateHistory("conv_a", "deleted")
    .catch((error) => error);
  await c.reconcileSelectedConversationRealtimeEvent({
    type: "message-deleted",
    conversationId: "conv_a",
    messageId: "deleted",
  });
  result.resolve(historyFromWindow(page(["deleted"], "old", "new")));
  expect(await navigating).toBeInstanceOf(Error);
  expect(c.getState()).toMatchObject({
    workspace: { history: { messages: [{ id: "tail" }] } },
  });
  c.dispose();
});
it("recovers a stale paging cursor through a real remaining message ID on explicit retry", async () => {
  syntheticBootstrap();
  const around = vi.fn(async () =>
    historyFromWindow(page(["tail"], null, null)),
  );
  const c = createChatWorkspaceController(
    {},
    {
      loadOlderHistory: async () => {
        throw new ApiError("safe", 409, { detail: { code: "cursor_stale" } });
      },
      loadAroundHistory: around,
    },
  );
  await c.load();
  await c.loadOlderHistory();
  expect(c.getState()).toMatchObject({
    olderHistoryError: { code: "cursor-stale" },
    workspace: { history: { messages: [{ id: "tail" }] } },
  });
  await c.loadOlderHistory();
  expect(around).toHaveBeenCalledWith("conv_a", "tail", expect.anything());
  expect(c.getState()).toMatchObject({
    olderHistoryError: null,
    workspace: { history: { olderPageStatus: "exhausted" } },
  });
  c.dispose();
});
it("keeps a newer user navigation when a reconnect window finishes late", async () => {
  syntheticBootstrap();
  const reconnect = deferred<ReturnType<typeof historyFromWindow>>();
  const c = createChatWorkspaceController(
    {},
    {
      loadAroundHistory: async (_owner, id) =>
        historyFromWindow(page([id], "old", "new")),
      reconcileAfterReconnect: async () =>
        ({ state: await reconnect.promise }) as never,
    },
  );
  await c.load();
  await c.navigateHistory("conv_a", "old-anchor");
  const refreshing = c.reconcileSelectedConversationAfterReconnect("conv_a");
  await c.navigateHistory("conv_a", "new-anchor");
  reconnect.resolve(historyFromWindow(page(["old-anchor"], "old", "new")));
  await refreshing;
  expect(c.getState()).toMatchObject({
    workspace: { history: { messages: [{ id: "new-anchor" }] } },
  });
  c.dispose();
});
it("refreshes capability search text with its public window while preserving body authority", async () => {
  const initial = historyFromWindow(page(["target"], null, "new"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      json({
        ...messageWindowWire(
          [
            {
              ...msg("target", "changed body"),
              search_segments: [
                { segment_key: "display.summary", text: "updated safe result" },
              ],
            },
          ],
          "conv_a",
        ),
        anchor_id: "target",
      }),
    ),
  );
  const result = await reconcileRealtimeEvent(initial, {
    type: "capability-invalidated",
    messageId: "target",
    conversationId: "conv_a",
  });
  expect(result.state.messages[0]?.content).toBe("body");
  expect(result.state.messages[0]?.searchSegments).toEqual([
    { segmentKey: "display.summary", text: "updated safe result" },
  ]);
  expect(result.state.window).toEqual(initial.window);
});
