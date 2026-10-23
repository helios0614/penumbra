import { afterEach, describe, expect, it, vi } from "vitest";
import { getDiaryAutoFeed, setDiaryAutoFeed, updateArchivedDiary, DiaryWriteRejectedError } from "./diary-write-client";
import { DiaryContractError } from "./diary-types";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());
describe("Diary update and global setting adapters", () => {
  it("sends only editable fields and done, including full title/content for embedding", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ ok: true })); vi.stubGlobal("fetch", fetch);
    await updateArchivedDiary("entry /中文", { status: "done", title: "", content: "原始\n\n正文🦉", tags: [], keywords: ["长关键词"], importance: 0, model: "never", auto_feed_config: "never", date: "never" } as Parameters<typeof updateArchivedDiary>[1]);
    expect(fetch.mock.calls[0][0]).toBe("/api/diary/entries/entry%20%2F%E4%B8%AD%E6%96%87");
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "PUT", credentials: "include" });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ status: "done", title: "", content: "原始\n\n正文🦉", tags: [], keywords: ["长关键词"], importance: 0 });
  });
  it("rejects invalid archived writes before fetch", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    for (const patch of [{ status: "writing" }, { status: "done", content: " \u0085\u001c" }, { status: "done", content: "正文" }, { status: "done", importance: 2 }, { status: "done", tags: [null] }])
      await expect(updateArchivedDiary("entry", patch as Parameters<typeof updateArchivedDiary>[1])).rejects.toThrow(DiaryContractError);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([{}, null, { ok: false }, { ok: "true" }])("does not accept malformed or rejected 200 receipts: %j", async (value) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(value)));
    await expect(updateArchivedDiary("entry", { status: "done", tags: [] })).rejects.toThrow(value && value.ok === false ? DiaryWriteRejectedError : DiaryContractError);
  });
  it("uses real global endpoints and strictly confirmed booleans", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ enabled: false })).mockResolvedValueOnce(json({ ok: true, enabled: true })); vi.stubGlobal("fetch", fetch);
    expect(await getDiaryAutoFeed()).toBe(false); expect(await setDiaryAutoFeed(true)).toBe(true);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/diary/auto-feed-status", "/api/diary/auto-feed-toggle"]);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "GET", cache: "no-store", credentials: "include" });
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: "POST", credentials: "include", body: '{"enabled":true}' });
  });
  it.each([{}, { enabled: "false" }, { enabled: null }, { ok: false, enabled: false }])("keeps unknown or malformed settings unknown: %j", async (value) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(value)));
    await expect(getDiaryAutoFeed()).rejects.toThrow(DiaryContractError);
    await expect(setDiaryAutoFeed(true)).rejects.toThrow();
  });
});
