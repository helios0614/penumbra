import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readSpeechSettings, replaceSpeechKey, saveSpeechConfig, speechPatch,
} from "./speech-settings";
import { validServiceAddress as validSiliconFlowAddress, validHttpsBaseAddress as validSpeechAddress } from "@/domain/service-settings/service-address";

const signal = new AbortController().signal;
const set = { configured: true, masked: "••••••••1234", secret_ref: "fake-minimax" };
const siliconFlow = { ...set, secret_ref: "fake-siliconflow-tts" };
const unset = { configured: false, masked: "", secret_ref: null };
const fixture = {
  tts_provider: "",
  minimax_tts_url: "https://secret-user:secret-password@fixture.invalid/v1",
  minimax_tts_model: "",
  siliconflow_tts_model: "",
  siliconflow_tts_custom_url: false,
  elevenlabs_tts_url: "https://fixture.invalid/private-path-token",
  elevenlabs_tts_model: "custom/eleven",
  elevenlabs_tts_output_format: "",
  minimax_asr_url: "https://fixture.invalid/v1?private=query-secret",
  minimax_asr_model: "custom/asr",
  credentials: { minimax_tts_key: set, siliconflow_tts_key: siliconFlow, elevenlabs_tts_key: unset, minimax_asr_key: unset },
};
function reply(data: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(data));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());

describe("speech settings projection", () => {
  it("drops all raw historical addresses and uses MiniMax and MP3 fallbacks", async () => {
    const legacySiliconFlowUrl = "https://fixture.invalid/legacy-siliconflow";
    const ttsUrl = "https://fixture.invalid/private-speech-path";
    const fetch = reply({ ...fixture, minimax_tts_key: "raw-key-fixture", embedding_model: "embedding-private",
      siliconflow_tts_url: ttsUrl, siliconflow_url: legacySiliconFlowUrl, embedding_custom_url: true,
      credentials: { ...fixture.credentials, embedding_key: { ...set, secret_ref: "fake-embedding" } },
    });
    const { snapshot } = await readSpeechSettings(signal);
    expect(snapshot.provider).toBe("minimax");
    expect(snapshot.outputFormat).toBe("mp3_44100_128");
    for (const target of ["minimax", "elevenlabs", "asr"] as const) expect(snapshot.configs[target].customAddress).toBe(true);
    for (const privateValue of [fixture.minimax_tts_url, fixture.elevenlabs_tts_url, fixture.minimax_asr_url, ttsUrl,
      legacySiliconFlowUrl, "raw-key-fixture", "embedding-private", "fake-embedding"]) {
      expect(JSON.stringify(snapshot)).not.toContain(privateValue);
    }
    expect(snapshot.configs.minimax.credential).toEqual(set);
    expect(snapshot.configs.elevenlabs.credential).toEqual(unset);
    expect(snapshot.configs.siliconflow).toEqual({ model: "", customAddress: false, credential: siliconFlow });
    expect(fetch.mock.calls).toHaveLength(1);
    expect(String(fetch.mock.calls[0][0])).toMatch(/\/api\/settings$/);
  });

  it("requires the C1 status and credential projections without a legacy fallback", async () => {
    reply({ ...fixture, siliconflow_tts_custom_url: undefined, siliconflow_url: "https://legacy.invalid/v1" });
    await expect(readSpeechSettings(signal)).rejects.toHaveProperty("code", "invalid");
    reply({ ...fixture, credentials: { ...fixture.credentials, siliconflow_tts_key: undefined, siliconflow_key: set } });
    await expect(readSpeechSettings(signal)).rejects.toHaveProperty("code", "invalid");
  });

  it("checks only the projected SiliconFlow address mode and accounts for the normalized default", async () => {
    const custom = { siliconflow_tts_url: "https://relay.invalid/voice/v1/" };
    const reset = { siliconflow_tts_url: "" };
    const explicitDefault = { siliconflow_tts_url: "https://api.siliconflow.cn/v1/" };
    reply({ ...fixture, siliconflow_tts_custom_url: true });
    expect((await readSpeechSettings(signal, custom)).matches).toBe(true);
    expect((await readSpeechSettings(signal, reset)).matches).toBe(false);
    reply(fixture);
    expect((await readSpeechSettings(signal, custom)).matches).toBe(false);
    expect((await readSpeechSettings(signal, reset)).matches).toBe(true);
    expect((await readSpeechSettings(signal, explicitDefault)).matches).toBe(true);
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
    expect(validSiliconFlowAddress(address)).toBe(false);
  });

  it("enforces the C1 port constraints", () => {
    expect(validSiliconFlowAddress("https://relay.invalid:8443/prefix/v1")).toBe(true);
    expect(validSiliconFlowAddress("https://[2001:db8::1]:443/v1")).toBe(true);
    for (const port of ["0", "65536", "test"]) expect(validSiliconFlowAddress(`https://relay.invalid:${port}/v1`)).toBe(false);
  });

  it("uses narrow Session PUT bodies and rejects masked and blank Key inputs", async () => {
    expect(validSpeechAddress("https://relay.invalid/prefix/v1")).toBe(true);
    const fetch = reply({ ok: true });
    await saveSpeechConfig({ tts_provider: "siliconflow" }, signal);
    await saveSpeechConfig({ siliconflow_tts_url: "https://relay.invalid/v1" }, signal);
    await saveSpeechConfig({ siliconflow_tts_url: "" }, signal);
    await saveSpeechConfig({ siliconflow_tts_model: "fixture/speech" }, signal);
    await replaceSpeechKey("minimax", " fake-replacement ", set.masked, signal);
    await replaceSpeechKey("siliconflow", " fake-siliconflow-replacement ", siliconFlow.masked, signal);
    for (const invalid of ["", " ", siliconFlow.masked]) expect(() => replaceSpeechKey("siliconflow", invalid, siliconFlow.masked, signal)).toThrow();
    expect(fetch.mock.calls.map(([, opts]) => [opts?.method, opts?.credentials, opts?.cache, JSON.parse(String(opts?.body))])).toEqual([
      ["PUT", "include", "no-store", { tts_provider: "siliconflow" }],
      ["PUT", "include", "no-store", { siliconflow_tts_url: "https://relay.invalid/v1" }],
      ["PUT", "include", "no-store", { siliconflow_tts_url: "" }],
      ["PUT", "include", "no-store", { siliconflow_tts_model: "fixture/speech" }],
      ["PUT", "include", "no-store", { minimax_tts_key: "fake-replacement" }],
      ["PUT", "include", "no-store", { siliconflow_tts_key: "fake-siliconflow-replacement" }],
    ]);
  });
});
