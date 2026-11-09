import {
  invalidSettings, parseSettingsCredential, readSettings, settingsRecord, validSettingsKey, writeSettings,
  type SettingsCredential,
} from "@/domain/service-settings/settings-client";

const miniMaxAddress = "https://api.minimax.chat/v1";
export const speechConfigs = {
  minimax: { name: "MiniMax TTS", model: "minimax_tts_model", defaultModel: "MiniMaxAI/MiniMax-User",
    url: "minimax_tts_url", defaultUrl: miniMaxAddress, key: "minimax_tts_key" },
  siliconflow: { name: "SiliconFlow TTS", model: "siliconflow_tts_model", defaultModel: "FunAudioLLM/CosyVoice2-0.5B" },
  elevenlabs: { name: "ElevenLabs TTS", model: "elevenlabs_tts_model", defaultModel: "eleven_multilingual_v2",
    url: "elevenlabs_tts_url", defaultUrl: "https://api.elevenlabs.io", key: "elevenlabs_tts_key" },
  asr: { name: "MiniMax ASR", model: "minimax_asr_model", defaultModel: "MiniMaxAI/Speech-01",
    url: "minimax_asr_url", defaultUrl: miniMaxAddress, key: "minimax_asr_key" },
} as const;

export const ttsProviders = [
  { value: "minimax", label: "MiniMax" },
  { value: "siliconflow", label: "SiliconFlow" },
  { value: "elevenlabs", label: "ElevenLabs" },
] as const;

export type SpeechTarget = keyof typeof speechConfigs;
export type TtsProvider = Exclude<SpeechTarget, "asr">;
export type SpeechKeyTarget = Exclude<SpeechTarget, "siliconflow">;
type Config = (typeof speechConfigs)[SpeechTarget];
type CredentialConfig = (typeof speechConfigs)[SpeechKeyTarget];
type ConfigPatch = Partial<Record<Config["model"] | CredentialConfig["url"], string>>;
export type SpeechPatch = ConfigPatch & { tts_provider?: TtsProvider };
export type SpeechDraft = { model?: string; url?: string };

interface SpeechConfig {
  readonly model: string;
  readonly customAddress: boolean;
  readonly credential: SettingsCredential | null;
}

export interface SpeechSettings {
  readonly provider: TtsProvider;
  readonly configs: Readonly<Record<SpeechTarget, SpeechConfig>>;
  readonly outputFormat: string;
}

export async function readSpeechSettings(signal: AbortSignal, expected: SpeechPatch = {}) {
  const raw = await readSettings(signal);
  const credentials = raw.credentials;
  if (!settingsRecord(credentials)) throw invalidSettings();
  const value = (field: string) => {
    const item = raw[field];
    if (typeof item !== "string") throw invalidSettings();
    return item;
  };
  const config = (fields: Config): SpeechConfig => {
    const model = value(fields.model);
    if (!("url" in fields)) return { model, customAddress: false, credential: null };
    const address = value(fields.url).trim();
    // Even an ordinary-looking path may carry credentials. Never retain the GET URL.
    return { model, customAddress: !!address && address.replace(/\/+$/, "") !== fields.defaultUrl, credential: parseSettingsCredential(credentials[fields.key]) };
  };
  const provider = value("tts_provider");
  const snapshot: SpeechSettings = {
    provider: provider === "siliconflow" || provider === "elevenlabs" ? provider : "minimax",
    configs: { minimax: config(speechConfigs.minimax), siliconflow: config(speechConfigs.siliconflow),
      elevenlabs: config(speechConfigs.elevenlabs), asr: config(speechConfigs.asr) },
    outputFormat: value("elevenlabs_tts_output_format") || "mp3_44100_128",
  };
  return { snapshot, matches: Object.entries(expected).every(([field, input]) => raw[field] === input) };
}

/** Only an explicit replacement can change a stored URL. Blank preserves it. */
export function validSpeechAddress(input: string): boolean {
  if (!/^https:\/\/[^/]/i.test(input) || /[\s\\?#\x00-\x1f\x7f]/u.test(input)) return false;
  try {
    const url = new URL(input);
    return !!url.hostname && !url.username && !url.password && !input.slice(8).split("/")[0].includes("@");
  } catch {
    return false;
  }
}

export function speechPatch(target: SpeechTarget, saved: SpeechConfig, draft: SpeechDraft): ConfigPatch {
  const fields = speechConfigs[target];
  const patch: ConfigPatch = {};
  if (draft.model !== undefined && draft.model.trim() !== saved.model) patch[fields.model] = draft.model.trim();
  const address = draft.url?.trim();
  if ("url" in fields && address && (saved.customAddress || address.replace(/\/+$/, "") !== fields.defaultUrl)) {
    if (!validSpeechAddress(address)) throw invalidSettings();
    patch[fields.url] = address;
  }
  return patch;
}

export function saveSpeechConfig(patch: SpeechPatch, signal: AbortSignal) {
  return writeSettings(patch, signal);
}

export function replaceSpeechKey(target: SpeechKeyTarget, input: string, masked: string, signal: AbortSignal) {
  if (!validSettingsKey(input, masked)) throw invalidSettings();
  return writeSettings({ [speechConfigs[target].key]: input.trim() }, signal);
}
