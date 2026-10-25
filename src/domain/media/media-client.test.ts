import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadMedia } from "./media-client";
afterEach(() => vi.unstubAllGlobals());
describe("upload transport adapter", () => {
  it("posts real multipart with credentials, signal and no forced JSON content type", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ url: "/uploads/1700000000000.png", type: "image/png", name: "a.png" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    const file = new File(["synthetic"], "a.png", { type: "image/png" }), abort = new AbortController();
    expect(await uploadMedia(file, abort.signal)).toMatchObject({ url: "/uploads/1700000000000.png" });
    const options = (fetcher.mock.calls as unknown as [string, RequestInit][])[0][1];
    expect(options.body).toBeInstanceOf(FormData); expect((options.body as FormData).get("file")).toBeInstanceOf(File);
    expect(options.credentials).toBe("include"); expect(new Headers(options.headers).has("Content-Type")).toBe(false);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it("does not treat legacy HTTP 200 error as successful upload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "不支持" }), { headers: { "Content-Type": "application/json" } })));
    await expect(uploadMedia(new File(["x"], "a.png", { type: "image/png" }), new AbortController().signal)).rejects.toThrow("上传被拒绝");
  });
});
