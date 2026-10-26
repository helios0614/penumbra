import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { hookSession } from "./test-utils/hook-session";
import { useGlobalChatSearch } from "./useGlobalChatSearch";
import type { GlobalMessageSearchPage } from "@/domain/message/global-message-search";

vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect"]
    .map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
const wire = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("@/domain/message/global-message-search", async original => ({
  ...await original<object>(), searchGlobalMessages: wire.search,
}));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); wire.search.mockReset(); });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
const page = (id = "a", status: GlobalMessageSearchPage["pageStatus"] = "complete", start = 2592000): GlobalMessageSearchPage => ({
  range: { start, end: start + 2592000 }, nextCursor: status === "complete" ? null : "cursor", pageStatus: status,
  items: id ? [{ conversationId: "c", conversationTitle: "title", messageId: id, createdAt: start + 1, role: "user",
    publicRevision: "rev", snippets: [{ segmentKey: "body", text: id, matchRanges: [[0, 1]] }] }] : [],
});
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

it("debounces IME, cancels old keywords, ignores late responses and releases requests on close", async () => {
  vi.useFakeTimers(); vi.setSystemTime(5184000000);
  const old = deferred<GlobalMessageSearchPage>(), next = deferred<GlobalMessageSearchPage>();
  wire.search.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  const h = hookSession(useGlobalChatSearch);
  let s = h.render(); h.commit();
  s.setComposing(true); s.setQuery("中文"); s = h.render(); h.commit();
  await vi.advanceTimersByTimeAsync(500); expect(wire.search).not.toHaveBeenCalled();
  s.setComposing(false); s = h.render(); h.commit();
  await vi.advanceTimersByTimeAsync(250); expect(wire.search).toHaveBeenCalledTimes(1);
  s.setQuery("new"); s = h.render(); h.commit();
  expect(s.state.items).toEqual([]);
  expect(wire.search.mock.calls[0]![3].signal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(250);
  next.resolve(page("new")); await flush();
  expect(h.render().state.items[0]?.messageId).toBe("new");
  old.resolve(page("old")); await flush();
  expect(h.render().state.items[0]?.messageId).toBe("new");
  s = h.render(); s.setQuery("pending"); h.render(); h.commit();
  wire.search.mockReturnValue(new Promise(() => {}));
  await vi.advanceTimersByTimeAsync(250); h.dispose();
  expect(wire.search.mock.lastCall![3].signal.aborted).toBe(true);
});

it("never auto-continues pending scans and advances older ranges only after complete, with pair-key dedup", async () => {
  vi.useFakeTimers(); vi.setSystemTime(5184000000);
  wire.search.mockResolvedValueOnce(page("", "scan_pending"))
    .mockResolvedValueOnce(page("a", "ready"))
    .mockResolvedValueOnce({ ...page("a"), items: [...page("a").items, { ...page("a").items[0]!, conversationId: "other" }] })
    .mockResolvedValueOnce(page("old", "complete", 0));
  const h = hookSession(useGlobalChatSearch);
  let s = h.render(); h.commit(); s.setQuery("q"); s = h.render(); h.commit();
  await vi.advanceTimersByTimeAsync(250); s = h.render(); h.commit();
  expect(s.state.status).toBe("scan_pending");
  await vi.advanceTimersByTimeAsync(10000); expect(wire.search).toHaveBeenCalledTimes(1);
  await s.proceed(); s = h.render(); await s.proceed(); s = h.render();
  expect(s.state.items).toHaveLength(2);
  expect(wire.search.mock.calls[1]!.slice(1,3)).toEqual([{ start: 2592000, end: 5184000 }, "cursor"]);
  await s.proceed(); s = h.render();
  expect(wire.search.mock.lastCall!.slice(1,3)).toEqual([{ start: 0, end: 2592000 }, null]);
  expect(s.state.items).toHaveLength(3); expect(s.state.latest).toBe(5184000); expect(s.state.completedStart).toBe(0);
  h.dispose();
});

it("retains valid results and exact retry plan on error or stop, without accepting late stopped results", async () => {
  vi.useFakeTimers(); vi.setSystemTime(5184000000);
  const late = deferred<GlobalMessageSearchPage>();
  wire.search.mockResolvedValueOnce(page("a", "ready")).mockRejectedValueOnce(Error("network"))
    .mockReturnValueOnce(late.promise).mockResolvedValueOnce(page("b"));
  const h = hookSession(useGlobalChatSearch);
  let s = h.render(); h.commit(); s.setQuery("q"); s = h.render(); h.commit();
  await vi.advanceTimersByTimeAsync(250); s = h.render(); await s.proceed(); s = h.render();
  expect(s.state.status).toBe("error"); expect(s.state.items).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(10000);
  const pending = s.proceed(); s = h.render(); s.stop(); s = h.render();
  expect(s.state.status).toBe("paused");
  late.resolve(page("late")); await pending;
  expect(h.render().state.items[0]?.messageId).toBe("a");
  s = h.render(); await s.proceed();
  expect(wire.search.mock.calls[1]!.slice(1,3)).toEqual(wire.search.mock.lastCall!.slice(1,3));
  expect(h.render().state.items.map(i => i.messageId)).toEqual(["a", "b"]);
  h.dispose();
});

it("keeps the original numeric upper bound when the first request is stopped before any response", async () => {
  vi.useFakeTimers(); vi.setSystemTime(5184000000);
  const pending = deferred<GlobalMessageSearchPage>();
  wire.search.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(page("a"));
  const h = hookSession(useGlobalChatSearch);
  let s = h.render(); h.commit(); s.setQuery("q"); h.render(); h.commit();
  await vi.advanceTimersByTimeAsync(250); s = h.render(); s.stop(); h.render();
  await vi.advanceTimersByTimeAsync(60000); s = h.render(); await s.proceed();
  expect(wire.search.mock.calls[0]![1]).toEqual({ start: 2592000, end: 5184000 });
  expect(wire.search.mock.lastCall![1]).toEqual(wire.search.mock.calls[0]![1]);
  pending.resolve(page("late")); await flush();
  expect(h.render().state.items.map(i => i.messageId)).toEqual(["a"]);
  h.dispose();
});
