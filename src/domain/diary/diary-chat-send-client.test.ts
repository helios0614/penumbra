import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDiarySendEvent, sendDiaryMessage } from "./diary-chat-send-client";
import { startDiaryFeed } from "./diary-feed-client";

afterEach(() => vi.unstubAllGlobals());
const dto = { id: "ai", entry_id: "entry/a", role: "assistant", content: "cleaned", created_at: 123, drift: "d", thinking: "t" };
describe("Diary send and feed wire contracts", () => {
  it("reads fragmented UTF-8 SSE through shared transport, posting only MsgCreate content/role", async () => {
    const bytes = new TextEncoder().encode([{ type: "start", entry_id: "entry/a", id: "ai", user_message_id: "user" }, { type: "chunk", content: "中文" },
      { type: "error", content: "private provider config" }, { type: "done", drift: "d", thinking: "t", message: dto }].map(e => `data: ${JSON.stringify(e)}\r\n\r\n`).join(""));
    const fetcher = vi.fn(async () => new Response(new ReadableStream({ start(c) { for (const b of bytes) c.enqueue(new Uint8Array([b])); c.close(); } }), { headers: { "Content-Type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetcher); const result = [];
    for await (const event of sendDiaryMessage("entry/a", "question", new AbortController().signal)) result.push(event);
    expect(result).toMatchObject([{ type: "start", userId: "user", assistantId: "ai", entryId: "entry/a" }, { type: "chunk", content: "中文" }, { type: "error" }, { type: "done", message: { id: "ai", entryId: "entry/a", content: "cleaned", drift: "d", thinking: "t" } }]);
    expect(JSON.stringify(result)).not.toContain("private");
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/diary/entries/entry%2Fa/messages"); expect(init.method).toBe("POST"); expect(JSON.parse(init.body as string)).toEqual({ content: "question", role: "user" });
  });
  it("distinguishes reserved identity, saved receipt and explicit null without accepting cross-Entry/invalid objects", () => {
    expect(parseDiarySendEvent({ type: "done", message: null }, "entry/a")).toMatchObject({ type: "done", message: null });
    for (const input of [{ type: "start", entry_id: "other", id: "ai", user_message_id: "user" }, { type: "done" },
      { type: "done", message: { ...dto, entry_id: "other" } }, { type: "done", message: { ...dto, role: "user" } }, { type: "chunk", content: null }]) {
      expect(() => parseDiarySendEvent(input, "entry/a")).toThrow();
    }
    expect(parseDiarySendEvent({ type: "future" }, "entry/a")).toBeNull();
  });
  it.each([false, true])("history feed explicitly passes replace_existing=%s, without a candidate-list or date-window query", async replace => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true, entry_id: "actual" }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    await expect(startDiaryFeed("2020-01-02", replace, new AbortController().signal)).resolves.toEqual({ kind: "started", entryId: "actual" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/diary/auto-feed/history/2020-01-02?replace_existing=${replace}`); expect(init.method).toBe("POST"); expect(fetcher).toHaveBeenCalledOnce();
  });
  it("preserves exact draft ID, handles done refusal without ID, and rejects malformed success", async () => {
    const responses = [{ ok: false, code: "diary_draft_exists", entry_id: "old" }, { ok: false, message: "该日期已有完成的日记" }, { ok: true }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(responses.shift()), { headers: { "Content-Type": "application/json" } })));
    const send = () => startDiaryFeed("2020-01-02", false, new AbortController().signal);
    await expect(send()).resolves.toEqual({ kind: "draft", entryId: "old" }); await expect(send()).resolves.toEqual({ kind: "refused" }); await expect(send()).rejects.toThrow();
  });
});
