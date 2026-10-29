import { afterEach, describe, expect, it, vi } from "vitest";
import { mapMessage } from "./message-mappers";
import { editMessageContent } from "./message-edit";
import { messageWire } from "@/test-fixtures/main-chat-wire";

afterEach(() => vi.unstubAllGlobals());
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("legacy whole-message text edit contract", () => {
  it.each(["user", "assistant"])("saves %s exact source with only content and verifies persisted identity", async role => {
    const original = messageWire({ role, id: "saved/id", content: "\n  first\n\nsecond  \n" });
    const content = "\n  **edited**\n\nlast  \n";
    const saved = { ...original, content };
    const fetch = vi.fn().mockResolvedValueOnce(response(original)).mockResolvedValueOnce(response({ ok: true })).mockResolvedValueOnce(response(saved));
    vi.stubGlobal("fetch", fetch);
    const result = await editMessageContent(mapMessage(original), content);
    expect(result).toEqual(mapMessage(saved));
    expect(result.thinking).toBe(original.thinking);
    expect(result.simpleThink).toBe(original.drift);
    const [path, request] = fetch.mock.calls[1];
    expect(path).toBe("/api/messages/saved%2Fid");
    expect(request).toMatchObject({ method: "PUT", credentials: "include" });
    expect(JSON.parse(request.body)).toEqual({ content });
    expect(fetch.mock.calls[2][0]).toBe("/api/messages/saved%2Fid/public");
  });
  it.each(["", " \n  "])("can persist exact empty/whitespace content %j", async content => {
    const original = messageWire();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(original)).mockResolvedValueOnce(response({ ok: true })).mockResolvedValueOnce(response({ ...original, content })));
    expect((await editMessageContent(mapMessage(original), content)).content).toBe(content);
  });
  it.each([401, 403, 404, 503])("does not report HTTP %s as saved", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(messageWire())).mockResolvedValueOnce(response({ error: "synthetic" }, status)));
    await expect(editMessageContent(mapMessage(messageWire()), "edited")).rejects.toMatchObject({ status });
  });
  it.each([{ content: "changed externally" }, { conv_id: "other" }, { id: "other" }, { role: "system" }])("rejects stale text or wrong preflight identity %j", async patch => {
    const fetch = vi.fn().mockResolvedValue(response(messageWire(patch))); vi.stubGlobal("fetch", fetch);
    await expect(editMessageContent(mapMessage(messageWire()), "edited")).rejects.toThrow();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([{ content: "not saved" }, { conv_id: "other" }, { id: "other" }, { role: "system" }])("rejects false acknowledgment/readback %j", async patch => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(messageWire())).mockResolvedValueOnce(response({ ok: true })).mockResolvedValueOnce(response(messageWire({ content: "edited", ...patch }))));
    await expect(editMessageContent(mapMessage(messageWire()), "edited")).rejects.toThrow();
  });
  it("treats an already persisted retry as success without a second PUT", async () => {
    const fetch = vi.fn().mockResolvedValue(response(messageWire({ content: "edited" }))); vi.stubGlobal("fetch", fetch);
    expect((await editMessageContent(mapMessage(messageWire()), "edited")).content).toBe("edited");
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([{}, { ok: false }, null])("rejects invalid PUT acknowledgment %j", async ack => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(messageWire())).mockResolvedValueOnce(response(ack)));
    await expect(editMessageContent(mapMessage(messageWire()), "edited")).rejects.toThrow("尚未确认保存");
  });
  it.each(["system", "tool", "cam_trigger"])("never mutates noneditable role %s", async role => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(editMessageContent(mapMessage(messageWire({ role })), "edited")).rejects.toThrow("持久化身份");
    expect(fetch).not.toHaveBeenCalled();
  });
});
