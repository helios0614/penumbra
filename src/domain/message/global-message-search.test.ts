import { expect, it, vi, afterEach } from "vitest";
import { mapGlobalSearchPage, searchGlobalMessages } from "./global-message-search";
const wire = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiGet: wire.get }));
afterEach(() => wire.get.mockReset());
const payload = () => ({ match_version: 1, range_start: 0, range_end: 2592000, total: null,
  page_status: "complete", has_more: false, next_cursor: null, items: [{
    conversation_id: "c", conversation_title: "会话", message_id: "m", created_at: 1,
    role: "user", public_revision: "rev", snippets: [{ segment_key: "body", text: "😀关键词", match_ranges: [[1,4]] }],
  }] });
it("validates range identity, public fields and pair-key uniqueness", () => {
  const value = payload();
  expect(mapGlobalSearchPage(value).items[0]?.messageId).toBe("m");
  expect(() => mapGlobalSearchPage(value, { start: 1, end: 2592001 })).toThrow();
  expect(() => mapGlobalSearchPage({ ...value, items: [...value.items, ...value.items] })).toThrow();
  expect(mapGlobalSearchPage({ ...value, items: [...value.items, { ...value.items[0], conversation_id: "other" }] }).items).toHaveLength(2);
  expect(() => mapGlobalSearchPage({ ...value, items: [{ ...value.items[0], created_at: 2592000 }] })).toThrow();
  expect(() => mapGlobalSearchPage({ ...value, items: [{ ...value.items[0], snippets: [{ segment_key: "args", text: "private" }] }] })).toThrow();
});
it("uses one global endpoint with server-default bounds initially and exact numeric bounds for continuation", async () => {
  wire.get.mockResolvedValue(payload());
  const controller = new AbortController();
  await searchGlobalMessages("关键词", null, null, { signal: controller.signal });
  expect(wire.get.mock.lastCall![0]).not.toContain("range_start");
  await searchGlobalMessages("关键词", { start: 0, end: 2592000 }, "signed", { signal: controller.signal });
  expect(wire.get.mock.lastCall![0]).toContain("/api/conversations/messages/search?");
  expect(wire.get.mock.lastCall![0]).toContain("range_start=0&range_end=2592000&cursor=signed");
  expect(wire.get.mock.lastCall![1].signal).toBe(controller.signal);
});
