import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { mapMemoryOriginalSource, MemoryContractError, readMemoryOriginalSource } from "./index";
const row = { role: "user", name: "合成用户", content: "原始文字\n保留换行", created_at: 1.5 };
afterEach(() => vi.unstubAllGlobals());
it("keeps actual ordered rows including system events, without manufacturing anchors from metadata", () => {
  const result = mapMemoryOriginalSource({ ok: true, messages: [row, { ...row, role: "system", name: "事件" }, { ...row, role: "assistant" }] });
  expect(result).toEqual({ available: true, messages: ["user", "system", "assistant"].map((role, index) => ({ role, name: index === 1 ? "事件" : row.name, content: row.content, createdAt: 1.5 })) });
  expect(mapMemoryOriginalSource({ ok: true, messages: [] })).toEqual({ available: true, messages: [] });
  expect(mapMemoryOriginalSource({ ok: false, message: "该记忆没有可追溯的原文" })).toEqual({ available: false });
});
it.each([{}, { ok: true }, { ok: true, messages: [null] }, ...["tool", "hidden-runtime"].map(role => ({ ok: true, messages: [{ ...row, role }] })), ...["1", NaN, 1e100].map(created_at => ({ ok: true, messages: [{ ...row, created_at }] }))])("rejects malformed or unsupported reading rows: %j", payload => {
  expect(() => mapMemoryOriginalSource(payload)).toThrow(MemoryContractError);
});
it("uses only authenticated encoded /source GET and propagates failures and cancellation", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, messages: [row] }), { headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetch); const controller = new AbortController();
  await readMemoryOriginalSource("m/a", { signal: controller.signal });
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(new URL(url, "https://fixture.test").pathname).toBe("/api/memories/m%2Fa/source");
  expect(init).toMatchObject({ method: "GET", credentials: "include" }); expect(init.body).toBeUndefined();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
  await expect(readMemoryOriginalSource("m")).rejects.toBeInstanceOf(ApiError);
  controller.abort(); await expect(readMemoryOriginalSource("m", { signal: controller.signal })).rejects.toBeDefined();
});
