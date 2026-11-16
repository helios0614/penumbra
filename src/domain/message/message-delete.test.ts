import { afterEach, describe, expect, it, vi } from "vitest";
import { mapMessage } from "./message-mappers";
import { deleteMessage } from "./message-delete";
import { messageWire } from "@/test-fixtures/main-chat-wire";

afterEach(() => vi.unstubAllGlobals());
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("single persisted message deletion", () => {
  it.each(["user", "assistant", "system"])("deletes %s by message ID and confirms HTTP absence", async role => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ ok: true })).mockResolvedValueOnce(response({ detail: "message not found" }, 404));
    vi.stubGlobal("fetch", fetch);
    await deleteMessage(mapMessage(messageWire({ role, id: "saved/id" })));
    expect(fetch.mock.calls[0]).toMatchObject(["/api/messages/saved%2Fid", { method: "DELETE", credentials: "include" }]);
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
    expect(fetch.mock.calls[1][0]).toBe("/api/messages/saved%2Fid/public");
  });
  it.each([401, 403, 503])("keeps actual HTTP %s failure", async status => {
    const fetch = vi.fn().mockResolvedValue(response({ detail: "synthetic delete denied" }, status)); vi.stubGlobal("fetch", fetch);
    await expect(deleteMessage(mapMessage(messageWire()))).rejects.toMatchObject({ status, message: "synthetic delete denied" });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([null, {}, { ok: false }])("rejects malformed acknowledgment %j", async ack => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(ack)));
    await expect(deleteMessage(mapMessage(messageWire()))).rejects.toThrow("未确认成功");
  });
  it("rejects false success when message remains", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({ ok: true })).mockResolvedValueOnce(response(messageWire())));
    await expect(deleteMessage(mapMessage(messageWire()))).rejects.toThrow("仍能读到");
  });
  it("does not mistake a forbidden readback for absence", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({ ok: true })).mockResolvedValueOnce(response({ detail: "session expired" }, 403)));
    await expect(deleteMessage(mapMessage(messageWire()))).rejects.toMatchObject({ status: 403, message: "session expired" });
  });
  it("permits idempotent retry after a lost DELETE response", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce(response({ ok: true })).mockResolvedValueOnce(response({ detail: "missing" }, 404)); vi.stubGlobal("fetch", fetch);
    const message = mapMessage(messageWire());
    await expect(deleteMessage(message)).rejects.toThrow("connection lost");
    await deleteMessage(message);
  });
  it.each(["tool", "cam_trigger"])("does not mutate hidden or unsupported %s", async role => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(deleteMessage(mapMessage(messageWire({ role })))).rejects.toThrow("持久化身份");
    expect(fetch).not.toHaveBeenCalled();
  });
});
