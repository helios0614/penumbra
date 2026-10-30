import { afterEach, describe, expect, it, vi } from "vitest";
import { getDiaryChatEntry, getDiaryMessages } from "./diary-chat-client";
import { parseDiaryChatEntry, parseDiaryMessages } from "./diary-chat-mappers";
import { DiaryEntryMissingError } from "./diary-chat-types";

afterEach(() => vi.unstubAllGlobals());
const message = (id: string, created_at = 100) => ({ id, entry_id: "entry/a", role: "user", content: "相同正文", created_at, updated_at: 0, drift: "", thinking: "" });

describe("Diary Chat read contract", () => {
  it("projects only the entry fields used by the page", () => {
    expect(parseDiaryChatEntry({ id: "entry/a", date: "2026-10-09", status: "writing", title: "标题", content: "large saved prose", auto_feed_config: { memories: ["private"] }, auto_feed_status: "finished" }, "entry/a"))
      .toEqual({ id: "entry/a", date: "2026-10-09", status: "writing", title: "标题" });
  });
  it("separates missing entry from an empty history and rejects another entry", () => {
    expect(() => parseDiaryChatEntry({ ok: false, message: "日记不存在" }, "entry/a")).toThrow(DiaryEntryMissingError);
    expect(() => parseDiaryChatEntry({ id: "b", date: "2026-10-09", status: "writing" }, "entry/a")).toThrow();
    expect(parseDiaryMessages([], "entry/a")).toEqual([]);
    expect(() => parseDiaryMessages([{ ...message("m"), entry_id: "b" }], "entry/a")).toThrow();
  });
  it("preserves the complete API sequence, IDs, repeated prose and blank messages", () => {
    const input = [message("id-z", 500), { ...message("id-a", 50), role: "assistant" }, message("id-b", 50), { ...message("blank", 0), content: "" }];
    const mapped = parseDiaryMessages(input, "entry/a");
    expect(mapped.map(m => m.id)).toEqual(["id-z", "id-a", "id-b", "blank"]);
    expect(mapped.map(m => m.content)).toEqual(["相同正文", "相同正文", "相同正文", ""]);
    expect(mapped[0]).toEqual({ id: "id-z", entryId: "entry/a", role: "user", content: "相同正文", createdAt: 500, updatedAt: 0, drift: "", thinking: "" });
    expect(mapped[0]).not.toHaveProperty("conv_id"); expect(mapped[0]).not.toHaveProperty("attachments");
  });
  it("maps canonical drift and physical legacy simple_think without mixing thinking or prose", () => {
    const rows = parseDiaryMessages([
      { ...message("one"), drift: "canonical", simple_think: "legacy", thinking: "separate" },
      { ...message("two"), drift: "", simple_think: "legacy" },
      { ...message("three"), drift: null, thinking: null, updated_at: undefined },
    ], "entry/a");
    expect(rows.map(m => [m.drift, m.thinking, m.updatedAt])).toEqual([["canonical", "separate", 0], ["legacy", "", 0], [null, null, null]]);
  });
  it.each([{ created_at: NaN }, { content: null }, { id: "" }, { thinking: 1 }])("rejects malformed persisted messages: %j", patch => {
    expect(() => parseDiaryMessages([{ ...message("m"), ...patch }], "entry/a")).toThrow();
  });
  it("uses only the two GET endpoints with the real escaped entry ID and cancellation", async () => {
    const abort = new AbortController();
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/messages") ? [message("one")] : { id: "entry/a", date: "2026-10-09", status: "writing", title: "" }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    await getDiaryChatEntry("entry/a", { signal: abort.signal });
    await getDiaryMessages("entry/a", { signal: abort.signal });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/diary/entries/entry%2Fa", "/api/diary/entries/entry%2Fa/messages"]);
    for (const [, init] of fetcher.mock.calls as unknown as [string, RequestInit][]) { expect(init.method).toBe("GET"); expect(init.cache).toBe("no-store"); expect(init.signal).toBeInstanceOf(AbortSignal); }
  });
});
