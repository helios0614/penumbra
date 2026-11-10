import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSettingsSecret, revealSettingsSecret } from "@/domain/service-settings/settings-client";
import { defaultEmbeddingUrl, matchesEmbeddingWrite, readEmbeddingSettings, writeEmbeddingSettings } from "./embedding-settings-client";

const signal = new AbortController().signal;
const empty = { configured: false, masked: "", secret_ref: null };
const credential = { configured: true, masked: "••••••••1234", secret_ref: "signed-embedding-fixture" };
const model = "fixture/embedding";
const snapshot = { customAddress: false, model, credential };

function respond(data: unknown, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(data, { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("Embedding Settings API", () => {
  it("projects only C1 fields from a Session no-store GET", async () => {
    const fetch = respond({
      embedding_custom_url: true, embedding_model: model, embedding_url: "https://raw.invalid/token",
      embedding_key: "raw-key", siliconflow_url: "https://legacy.invalid", siliconflow_key: "legacy-key",
      credentials: { embedding_key: { ...credential, raw: "raw-key" }, siliconflow_tts_key: empty },
    });
    await expect(readEmbeddingSettings(signal)).resolves.toEqual({ ...snapshot, customAddress: true });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/\/api\/settings$/),
      expect.objectContaining({ method: "GET", cache: "no-store", credentials: "include" }));
  });

  it.each([undefined, null, "", "  "])("uses the default for an unset model (%s)", async embedding_model => {
    respond({ embedding_custom_url: false, embedding_model, credentials: { embedding_key: empty } });
    await expect(readEmbeddingSettings(signal)).resolves.toEqual({
      customAddress: false, model: "BAAI/bge-large-zh-v1.5", credential: empty,
    });
  });

  it.each([
    { credentials: { embedding_key: empty } },
    { embedding_custom_url: false, credentials: { siliconflow_tts_key: empty } },
    { embedding_custom_url: false, credentials: { embedding_key: { ...credential, secret_ref: "" } } },
    { embedding_custom_url: false, embedding_model: 1024, credentials: { embedding_key: empty } },
  ])("rejects incomplete or invalid C1 metadata", async data => {
    respond(data);
    await expect(readEmbeddingSettings(signal)).rejects.toMatchObject({ code: "invalid" });
  });

  it("writes one independent field or uses the dedicated clear endpoint", async () => {
    const fetch = respond({ ok: true });
    await writeEmbeddingSettings({ kind: "address", value: " https://relay.invalid/v1 " }, snapshot, signal);
    await writeEmbeddingSettings({ kind: "address", value: "" }, snapshot, signal);
    await writeEmbeddingSettings({ kind: "replace", key: " fake-replacement " }, snapshot, signal);
    await writeEmbeddingSettings({ kind: "clear", ref: credential.secret_ref }, snapshot, signal);
    expect(fetch.mock.calls.map(([url, options]) => [new URL(String(url), "http://localhost").pathname, options?.method, JSON.parse(String(options?.body))])).toEqual([
      ["/api/settings", "PUT", { embedding_url: "https://relay.invalid/v1" }],
      ["/api/settings", "PUT", { embedding_url: "" }],
      ["/api/settings", "PUT", { embedding_key: "fake-replacement" }],
      ["/api/settings/secrets/clear", "POST", { secret_ref: credential.secret_ref }],
    ]);
    for (const [, options] of fetch.mock.calls) expect(options).toMatchObject({ cache: "no-store", credentials: "include" });
  });

  it("rejects unsafe addresses, invalid replacement Keys, and mismatched references before transport", () => {
    const fetch = respond({ ok: true });
    for (const value of [" ", "http://relay.invalid/v1", "https://user@relay.invalid", "https://relay.invalid:0", "https://relay.invalid/v1?secret=1"]) {
      expect(() => writeEmbeddingSettings({ kind: "address", value }, snapshot, signal)).toThrow("invalid");
    }
    for (const key of ["", "  ", credential.masked, "***"]) {
      expect(() => writeEmbeddingSettings({ kind: "replace", key }, snapshot, signal)).toThrow("invalid");
    }
    expect(() => writeEmbeddingSettings({ kind: "clear", ref: "wrong-fixture" }, snapshot, signal)).toThrow("invalid");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("checks only address mode and safe credential metadata on readback", () => {
    expect(matchesEmbeddingWrite({ kind: "address", value: defaultEmbeddingUrl + "/" }, snapshot)).toBe(true);
    expect(matchesEmbeddingWrite({ kind: "address", value: "https://relay.invalid" }, snapshot)).toBe(false);
    expect(matchesEmbeddingWrite({ kind: "replace", key: "fake-key-1234" }, snapshot)).toBe(true);
    expect(matchesEmbeddingWrite({ kind: "replace", key: "fake-key-5678" }, snapshot)).toBe(false);
    expect(matchesEmbeddingWrite({ kind: "replace", key: "短" }, { ...snapshot, credential: { ...credential, masked: "••••••••" } })).toBe(true);
    expect(matchesEmbeddingWrite({ kind: "clear", ref: credential.secret_ref }, { ...snapshot, credential: empty })).toBe(true);
  });

  it("uses the ordinary secret contract and classifies invalid or stale references", async () => {
    const fetch = respond({ secret: "synthetic-embedding-key" });
    await expect(revealSettingsSecret(credential.secret_ref, signal)).resolves.toBe("synthetic-embedding-key");
    expect(fetch).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/\/api\/settings\/secrets\/reveal$/),
      expect.objectContaining({ method: "POST", cache: "no-store", credentials: "include", body: JSON.stringify({ secret_ref: credential.secret_ref }) }));
    respond({ detail: "Secret reference is invalid or stale" }, 422);
    await expect(revealSettingsSecret("invalid-fixture", signal)).rejects.toMatchObject({ code: "stale" });
    await expect(clearSettingsSecret("stale-fixture", signal)).rejects.toMatchObject({ code: "stale" });
  });
});
