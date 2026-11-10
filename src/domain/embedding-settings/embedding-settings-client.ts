import { isCustomServiceAddress, validServiceAddress } from "@/domain/service-settings/service-address";
import {
  clearSettingsSecret, invalidSettings, parseSettingsCredential, readSettings, settingsRecord, validSettingsKey, writeSettings,
  type SettingsCredential,
} from "@/domain/service-settings/settings-client";

export const defaultEmbeddingUrl = "https://api.siliconflow.cn/v1";
const defaultEmbeddingModel = "BAAI/bge-large-zh-v1.5";

export interface EmbeddingSettings {
  readonly customAddress: boolean;
  readonly model: string;
  readonly credential: SettingsCredential;
}

export type EmbeddingWrite = { kind: "address"; value: string } | { kind: "replace"; key: string } | { kind: "clear"; ref: string };

export async function readEmbeddingSettings(signal: AbortSignal): Promise<EmbeddingSettings> {
  const { embedding_custom_url: customAddress, embedding_model: model, credentials } = await readSettings(signal);
  if (typeof customAddress !== "boolean" || !settingsRecord(credentials)) throw invalidSettings();
  if (model != null && typeof model !== "string") throw invalidSettings();
  return {
    customAddress,
    model: model?.trim() ? model : defaultEmbeddingModel,
    credential: parseSettingsCredential(credentials.embedding_key),
  };
}

export function writeEmbeddingSettings(change: EmbeddingWrite, current: EmbeddingSettings, signal: AbortSignal) {
  switch (change.kind) {
    case "address": {
      const address = change.value.trim();
      if (change.value !== "" && !validServiceAddress(address)) throw invalidSettings();
      return writeSettings({ embedding_url: address }, signal);
    }
    case "replace":
      if (!validSettingsKey(change.key, current.credential.masked)) throw invalidSettings();
      return writeSettings({ embedding_key: change.key.trim() }, signal);
    case "clear":
      if (!change.ref || change.ref !== current.credential.secret_ref) throw invalidSettings();
      return clearSettingsSecret(change.ref, signal);
  }
}

export function matchesEmbeddingWrite(change: EmbeddingWrite, observed: EmbeddingSettings): boolean {
  if (change.kind === "address") {
    return observed.customAddress === isCustomServiceAddress(change.value, defaultEmbeddingUrl);
  }
  if (change.kind === "clear") return !observed.credential.configured;
  // Compare only the C1 public mask. Short keys have no visible suffix.
  const chars = Array.from(change.key.trim());
  const masked = "••••••••" + (chars.length >= 12 ? chars.slice(-4).join("") : "");
  return observed.credential.configured && observed.credential.masked === masked;
}
