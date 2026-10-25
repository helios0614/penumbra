import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { hookSession } from "./test-utils/hook-session";
import { useChatSearch } from "./useChatSearch";
import type { MessageSearchPage } from "@/domain/message";

vi.mock("react", async (original) => {
  const actual = await original<typeof React>();
  return {
    ...actual,
    ...Object.fromEntries(
      [
        "useState",
        "useRef",
        "useCallback",
        "useId",
        "useEffect",
        "useLayoutEffect",
      ].map((key) => [key, vi.fn(actual[key as keyof typeof actual] as never)]),
    ),
  };
});
const wire = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("@/domain/message", () => ({
  searchConversationMessages: wire.search,
}));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  wire.search.mockReset();
});
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { resolve, promise };
}
const page = (id: string): MessageSearchPage => ({
  conversationId: "A",
  items: [
    {
      messageId: id,
      createdAt: 1,
      role: "user",
      snippets: [{ segmentKey: "body", text: id, matchRanges: [[0, 1]] }],
      publicRevision: id,
    },
  ],
  nextCursor: null,
  hasMore: false,
  pageStatus: "complete",
});

it("debounces IME, ignores unabortable old-query responses and hides previous-owner results synchronously", async () => {
  vi.useFakeTimers();
  const old = deferred<MessageSearchPage>(),
    newer = deferred<MessageSearchPage>();
  wire.search
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(newer.promise);
  let owner = "A";
  const hooks = hookSession(() => useChatSearch(owner));
  let current = hooks.render();
  hooks.commit();
  current.show();
  current = hooks.render();
  hooks.commit();
  current.setComposing(true);
  current.setQuery("中文");
  current = hooks.render();
  hooks.commit();
  await vi.advanceTimersByTimeAsync(500);
  expect(wire.search).not.toHaveBeenCalled();
  current.setComposing(false);
  current = hooks.render();
  hooks.commit();
  await vi.advanceTimersByTimeAsync(249);
  expect(wire.search).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(wire.search).toHaveBeenCalledTimes(1);
  current = hooks.render();
  current.setQuery("new");
  current = hooks.render();
  hooks.commit();
  await vi.advanceTimersByTimeAsync(250);
  expect(wire.search).toHaveBeenCalledTimes(2);
  newer.resolve(page("new"));
  await Promise.resolve();
  await Promise.resolve();
  current = hooks.render();
  expect(current.state.items.map((m) => m.messageId)).toEqual(["new"]);
  old.resolve(page("old"));
  await Promise.resolve();
  current = hooks.render();
  expect(current.state.items.map((m) => m.messageId)).toEqual(["new"]);
  owner = "B";
  current = hooks.render();
  expect(current.state.items).toEqual([]);
  hooks.commit();
  hooks.dispose();
});
it("continues scan-pending empty batches and can stop without reporting final no results", async () => {
  vi.useFakeTimers();
  wire.search.mockResolvedValueOnce({
    ...page("ignored"),
    items: [],
    pageStatus: "scan_pending",
    nextCursor: "next",
    hasMore: true,
  });
  const pending = deferred<MessageSearchPage>();
  wire.search.mockReturnValueOnce(pending.promise);
  const hooks = hookSession(() => useChatSearch("A"));
  let current = hooks.render();
  hooks.commit();
  current.show();
  current = hooks.render();
  hooks.commit();
  current.setQuery("word");
  current = hooks.render();
  hooks.commit();
  await vi.advanceTimersByTimeAsync(250);
  current = hooks.render();
  hooks.commit();
  expect(current.state.status).toBe("scanning");
  await vi.advanceTimersByTimeAsync(120);
  expect(wire.search).toHaveBeenCalledTimes(2);
  current = hooks.render();
  current.stop();
  current = hooks.render();
  expect(current.state.paused).toBe(true);
  expect(current.state.status).toBe("ready");
  pending.resolve(page("late"));
  await Promise.resolve();
  current = hooks.render();
  expect(current.state.items).toEqual([]);
  hooks.dispose();
});
