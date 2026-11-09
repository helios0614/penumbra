import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readSpeechSettings, replaceSpeechKey, saveSpeechConfig, speechPatch, validSpeechAddress,
} from "./speech-settings";
import { listConnections } from "@/domain/registry/registry-client";

const signal = new AbortController().signal;
const set = { configured: true, masked: "••••••••1234", secret_ref: "fake-minimax" };
const unset = { configured: false, masked: "", secret_ref: null };
const fixture = {
  tts_provider: "",
  minimax_tts_url: "https://secret-user:secret-password@fixture.invalid/v1",
  minimax_tts_model: "",
  siliconflow_tts_model: "",
  elevenlabs_tts_url: "https://fixture.invalid/private-path-token",
  elevenlabs_tts_model: "custom/eleven",
  elevenlabs_tts_output_format: "",
  minimax_asr_url: "https://fixture.invalid/v1?private=query-secret",
  minimax_asr_model: "custom/asr",
  credentials: { minimax_tts_key: set, elevenlabs_tts_key: unset, minimax_asr_key: unset },
};
function reply(data: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(data));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());

describe("speech settings projection", () => {
  it("drops all raw historical addresses and uses MiniMax and MP3 fallbacks", async () => {
    reply({ ...fixture, minimax_tts_key: "raw-key-fixture", embedding_model: "embedding-private" });
    const { snapshot } = await readSpeechSettings(signal);
    expect(snapshot.provider).toBe("minimax");
    expect(snapshot.outputFormat).toBe("mp3_44100_128");
    for (const target of ["minimax", "elevenlabs", "asr"] as const) expect(snapshot.configs[target].customAddress).toBe(true);
    for (const privateValue of [fixture.minimax_tts_url, fixture.elevenlabs_tts_url, fixture.minimax_asr_url, "raw-key-fixture", "embedding-private"]) {
      expect(JSON.stringify(snapshot)).not.toContain(privateValue);
    }
    expect(snapshot.configs.minimax.credential).toEqual(set);
    expect(snapshot.configs.elevenlabs.credential).toEqual(unset);
    expect(snapshot.configs.siliconflow.credential).toBeNull();
  });

  it("compares addressed readback before discarding the raw URL", async () => {
    const address = "https://relay.invalid/voice/v1";
    reply({ ...fixture, minimax_tts_url: address, tts_provider: "elevenlabs" });
    expect((await readSpeechSettings(signal, { minimax_tts_url: address })).matches).toBe(true);
    expect((await readSpeechSettings(signal, { minimax_tts_url: "https://other.invalid/v1" })).matches).toBe(false);
    expect((await readSpeechSettings(signal)).snapshot.provider).toBe("elevenlabs");
    reply({ ...fixture, minimax_tts_url: "https://api.minimax.chat/v1/", tts_provider: "siliconflow" });
    expect((await readSpeechSettings(signal)).snapshot.configs.minimax.customAddress).toBe(false);
    expect((await readSpeechSettings(signal)).snapshot.provider).toBe("siliconflow");
  });

  it("preserves blank URL drafts and isolates only edited fields", async () => {
    reply(fixture);
    const { snapshot } = await readSpeechSettings(signal);
    expect(speechPatch("minimax", snapshot.configs.minimax, { url: "", model: "" })).toEqual({});
    expect(speechPatch("siliconflow", snapshot.configs.siliconflow, { url: "https://wrong.invalid", model: "voice" })).toEqual({ siliconflow_tts_model: "voice" });
    expect(speechPatch("asr", snapshot.configs.asr, { url: " https://new.invalid/v1 ", model: "custom/asr" })).toEqual({
      minimax_asr_url: "https://new.invalid/v1",
    });
    expect(speechPatch("elevenlabs", snapshot.configs.elevenlabs, { model: "" })).toEqual({ elevenlabs_tts_model: "" });
  });

  it.each([
    "http://host.invalid/v1", "https://user:pass@host.invalid", "https://@host.invalid",
    "https://host.invalid/?", "https://host.invalid/#", "https://host.invalid?q=token",
    "https:///host.invalid", "https://host.invalid/\npath", "https://host.invalid\\path",
  ])("rejects unsafe replacement address %s", address => {
    expect(validSpeechAddress(address)).toBe(false);
  });

  it("uses narrow Session PUT bodies and rejects masked and blank Key inputs", async () => {
    expect(validSpeechAddress("https://relay.invalid/prefix/v1")).toBe(true);
    const fetch = reply({ ok: true });
    await saveSpeechConfig({ tts_provider: "siliconflow" }, signal);
    await replaceSpeechKey("minimax", " fake-replacement ", set.masked, signal);
    for (const invalid of ["", " ", set.masked]) expect(() => replaceSpeechKey("minimax", invalid, set.masked, signal)).toThrow();
    expect(fetch.mock.calls.map(([, opts]) => [opts?.method, opts?.credentials, opts?.cache, JSON.parse(String(opts?.body))])).toEqual([
      ["PUT", "include", "no-store", { tts_provider: "siliconflow" }],
      ["PUT", "include", "no-store", { minimax_tts_key: "fake-replacement" }],
    ]);
  });
});

describe("SiliconFlow Connection alias", () => {
  const row = { id: "opaque-connection", name: "unrelated display name", base_url: "https://example.invalid",
    transport: "direct", enabled: false, credential: unset };
  const list = { schema_version: 2, authority_state: "persisted_v2", migration_required: false, diagnostics: [], deferred_usages: [], connections: [row] };

  it("accepts a matching alias, including a disabled Connection", async () => {
    reply({ ...list, profile_aliases: { "legacy:siliconflow": { connection_id: row.id } } });
    expect((await listConnections()).siliconflowConnectionId).toBe(row.id);
  });

  it.each([undefined, { "legacy:siliconflow": { connection_id: "missing" } }, { "legacy:siliconflow": { connection_id: 3 } }])(
    "leaves missing, dangling and invalid aliases unresolved", profile_aliases => {
      reply({ ...list, profile_aliases, connections: [{ ...row, name: "SiliconFlow", id: "connection-legacy-siliconflow" }] });
      return expect(listConnections()).resolves.not.toHaveProperty("siliconflowConnectionId");
    });
});
