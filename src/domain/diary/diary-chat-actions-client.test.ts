import { afterEach, describe, expect, it, vi } from "vitest";
import { mutateDiaryMessage } from "./diary-chat-actions-client";
import { parseDiaryRegenerateEvent, regenerateDiaryMessage } from "./diary-chat-send-client";

afterEach(() => vi.unstubAllGlobals());
describe("Diary message action wire contracts", () => {
  it.each([null, "\n exact draft  \n"])("calls the scoped legacy mutation with %s", async content => {
    const fetcher = vi.fn(async () => Response.json({ ok: true })); vi.stubGlobal("fetch", fetcher);
    await mutateDiaryMessage("entry/a", "msg/b", content, new AbortController().signal);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/diary/entries/entry%2Fa/messages/msg%2Fb"); expect(init.method).toBe(content === null ? "DELETE" : "PUT");
    expect(init.body ? JSON.parse(init.body as string) : null).toEqual(content === null ? null : { content }); expect(fetcher).toHaveBeenCalledOnce();
  });
  it("rejects a false mutation acknowledgement", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false })));
    await expect(mutateDiaryMessage("a", "b", "draft", new AbortController().signal)).rejects.toThrow();
  });
  it("uses Diary regenerate with no Main context overrides and parses exact snapshot IDs", async () => {
    const frames = [{ type: "start", entry_id: "entry/a", id: "new", replaced_message_ids: ["old", "later"] }, { type: "chunk", content: "中文" },
      { type: "done", message: { entry_id: "entry/a", id: "new", role: "assistant", content: "clean", created_at: 1 } }];
    const bytes = new TextEncoder().encode(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(""));
    const fetcher = vi.fn(async () => new Response(new ReadableStream({ start(c) { for (const b of bytes) c.enqueue(new Uint8Array([b])); c.close(); } }), { headers: { "Content-Type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetcher); const events = [];
    for await (const event of regenerateDiaryMessage("entry/a", "msg/b", new AbortController().signal)) events.push(event);
    expect(events[0]).toEqual({ type: "start", entryId: "entry/a", assistantId: "new", replacedIds: ["old", "later"] }); expect(events[1]).toEqual({ type: "chunk", content: "中文" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/diary/entries/entry%2Fa/messages/msg%2Fb/regenerate"); expect(init.method).toBe("POST"); expect(init.body).toBeUndefined();
  });
  it("rejects wrong Entry, missing/invalid replacement identity and cross-Entry receipts", () => {
    for (const input of [{ type: "start", entry_id: "b", id: "new", replaced_message_ids: ["old"] }, { type: "start", entry_id: "a", id: "new", replaced_message_ids: [] },
      { type: "start", entry_id: "a", id: "new", replaced_message_ids: ["new"] }, { type: "start", entry_id: "a", id: "new", user_message_id: "user" },
      { type: "done", message: { entry_id: "b", id: "new", role: "assistant", content: "x", created_at: 1 } }]) expect(() => parseDiaryRegenerateEvent(input, "a")).toThrow();
  });
});
