import { afterEach, describe, expect, it, vi } from "vitest";
import { readMusicAuthStatus, readMusicCredential, replaceMusicCredential } from "./music-settings-client";

const signal = new AbortController().signal;
const metadata = { configured: true, masked: "••••••••fixture", secret_ref: "signed-music-fixture" };
const checkedAt = "2026-11-10T03:34:56.123456Z";
const authStatus = { mode: "credential", status: "failed", checked_at: checkedAt, error_code: "login_rejected" };

function respond(data: unknown, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(data, { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("Music Settings API", () => {
  it("projects only MUSIC_U metadata and makes a Session no-store request", async () => {
    const fetch = respond({ netease_music_u: "raw-secret", credentials: {
      netease_music_u: { ...metadata, raw: "raw-secret" }, brave_search_key: { configured: false },
    } });
    await expect(readMusicCredential(signal)).resolves.toEqual(metadata);
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/settings$/),
      expect.objectContaining({ method: "GET", credentials: "include", cache: "no-store" }));
  });

  it("sends only a trimmed replacement and rejects blank or masked values", async () => {
    const fetch = respond({ ok: true });
    for (const invalid of ["", "  ", metadata.masked]) {
      expect(() => replaceMusicCredential(invalid, metadata.masked, signal)).toThrow("invalid");
    }
    await replaceMusicCredential(" fake-replacement ", metadata.masked, signal);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/settings$/),
      expect.objectContaining({ method: "PUT", credentials: "include", cache: "no-store", body: '{"netease_music_u":"fake-replacement"}' }));
  });

  it("projects Worker login status without retaining other fields", async () => {
    const fetch = respond({ ...authStatus, secret_ref: "not-a-dto-field", detail: "raw-exception" });
    await expect(readMusicAuthStatus(signal)).resolves.toEqual({
      mode: "credential", status: "failed", checkedAt, errorCode: "login_rejected",
    });
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/music\/auth-status$/),
      expect.objectContaining({ method: "GET", credentials: "include", cache: "no-store" }));
  });

  it("accepts an unverified result with no recorded attempt and drops unknown error codes", async () => {
    respond({ mode: "anonymous", status: "unverified", checked_at: null, error_code: "unsafe-fake-error" });
    await expect(readMusicAuthStatus(signal)).resolves.toEqual({
      mode: "anonymous", status: "unverified", checkedAt: null, errorCode: null,
    });
  });

  it.each([
    null, { ...authStatus, mode: "cookie" }, { ...authStatus, status: "unknown" },
    { ...authStatus, checked_at: "unsafe-date" }, { ...authStatus, checked_at: undefined },
  ])("rejects malformed login status", async data => {
    respond(data);
    await expect(readMusicAuthStatus(signal)).rejects.toHaveProperty("code", "invalid");
  });

  it("does not retain the raw HTTP error body", async () => {
    respond({ detail: "fake-cookie-from-error" }, 503);
    await expect(readMusicAuthStatus(signal)).rejects.toMatchObject({ code: "invalid", message: "invalid" });
  });
});
