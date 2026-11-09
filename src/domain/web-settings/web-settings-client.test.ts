import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearBraveKey, readWebSettings, replaceBraveKey, revealBraveKey, saveWebAccess, WebSettingsError,
} from "./web-settings-client";

const signal = new AbortController().signal;
const brave = { configured: true, masked: "••••••••abcd", secret_ref: "synthetic-ref" };
const secret = "synthetic-secret-abcd";

afterEach(() => vi.unstubAllGlobals());

function reply(data: unknown, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => Response.json(data, { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("ordinary Web Settings", () => {
  it.each([false, true])("projects only Web fields with enabled=%s and makes no reveal request", async enabled => {
    const fetch = reply({
      web_access_enabled: enabled,
      credentials: { brave_search_key: { ...brave, key: secret }, another: secret },
      brave_search_key: secret,
    });
    expect(await readWebSettings(signal)).toEqual({ enabled, brave });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/\/api\/settings$/),
      expect.objectContaining({ method: "GET", credentials: "include", cache: "no-store", body: undefined }));
  });

  it("distinguishes a safe unconfigured credential from an invalid read", async () => {
    const absent = { configured: false, masked: "", secret_ref: null };
    reply({ web_access_enabled: false, credentials: { brave_search_key: absent } });
    expect((await readWebSettings(signal)).brave).toEqual(absent);
    reply({ credentials: { brave_search_key: absent } });
    await expect(readWebSettings(signal)).rejects.toMatchObject({ code: "invalid" });
    reply({ web_access_enabled: false, credentials: { brave_search_key: { ...brave, secret_ref: null } } });
    await expect(readWebSettings(signal)).rejects.toMatchObject({ code: "invalid" });
  });

  it("writes the independent boolean, replacement and explicit clear DTOs", async () => {
    const fetch = reply({ ok: true });
    await saveWebAccess(false, signal);
    await replaceBraveKey(" " + secret + " ", brave.masked, signal);
    await clearBraveKey(brave.secret_ref, signal);
    expect(fetch.mock.calls.map(([url, options]) => [
      new URL(String(url), "https://fixture.invalid").pathname,
      options?.method, options?.credentials, options?.cache, JSON.parse(String(options?.body)),
    ])).toEqual([
      ["/api/settings", "PUT", "include", "no-store", { web_access_enabled: false }],
      ["/api/settings", "PUT", "include", "no-store", { brave_search_key: secret }],
      ["/api/settings/secrets/clear", "POST", "include", "no-store", { secret_ref: brave.secret_ref }],
    ]);
    reply({ ok: false });
    await expect(clearBraveKey(brave.secret_ref, signal)).rejects.toMatchObject({ code: "invalid" });
  });

  it("rejects blank or masked replacement before contacting Settings", () => {
    const fetch = reply({ ok: true });
    for (const input of ["", "  ", brave.masked, "****abcd"]) {
      expect(() => replaceBraveKey(input, brave.masked, signal)).toThrow(WebSettingsError);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reveals only by ref and recognizes only the ordinary 422 stale response", async () => {
    const fetch = reply({ secret });
    expect(await revealBraveKey(brave.secret_ref, signal)).toBe(secret);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/\/api\/settings\/secrets\/reveal$/),
      expect.objectContaining({ method: "POST", credentials: "include", cache: "no-store", body: JSON.stringify({ secret_ref: brave.secret_ref }) }));
    reply({ detail: "Secret reference is invalid or stale" }, 422);
    await expect(revealBraveKey(brave.secret_ref, signal)).rejects.toMatchObject({ code: "stale" });
    await expect(clearBraveKey(brave.secret_ref, signal)).rejects.toMatchObject({ code: "stale" });
    reply({ detail: { code: "stale_secret_ref" } }, 409);
    await expect(clearBraveKey(brave.secret_ref, signal)).rejects.toMatchObject({ code: "unconfirmed" });
  });

  it("discards raw server and network errors and distinguishes a known persistence failure", async () => {
    reply({ detail: { code: "persistence_failed", input: secret } }, 503);
    await expect(clearBraveKey(brave.secret_ref, signal)).rejects.toMatchObject({ code: "persistence", message: "persistence" });
    reply({ detail: secret }, 500);
    await expect(replaceBraveKey(secret, brave.masked, signal)).rejects.toMatchObject({ code: "unconfirmed", message: "unconfirmed" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error(secret); }));
    const failure = await revealBraveKey(brave.secret_ref, signal).catch(error => error);
    expect(failure).toMatchObject({ code: "unconfirmed", message: "unconfirmed" });
    expect(failure).not.toHaveProperty("data");
    expect(failure).not.toHaveProperty("cause");
  });
});
