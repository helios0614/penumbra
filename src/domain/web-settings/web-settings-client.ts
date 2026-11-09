import {
  clearSettingsSecret, invalidSettings, parseSettingsCredential, readSettings, revealSettingsSecret,
  settingsRecord, validSettingsKey, writeSettings, type SettingsCredential,
} from "@/domain/service-settings/settings-client";

export { SettingsError as WebSettingsError } from "@/domain/service-settings/settings-client";
export const revealBraveKey = revealSettingsSecret;
export const clearBraveKey = clearSettingsSecret;

export interface WebSettings {
  readonly enabled: boolean;
  readonly brave: SettingsCredential;
}

export async function readWebSettings(signal: AbortSignal): Promise<WebSettings> {
  const data = await readSettings(signal);
  if (typeof data.web_access_enabled !== "boolean" || !settingsRecord(data.credentials)) throw invalidSettings();
  return { enabled: data.web_access_enabled, brave: parseSettingsCredential(data.credentials.brave_search_key) };
}

export function saveWebAccess(enabled: boolean, signal: AbortSignal) {
  return writeSettings({ web_access_enabled: enabled }, signal);
}

export function replaceBraveKey(value: string, masked: string, signal: AbortSignal) {
  if (!validSettingsKey(value, masked)) throw invalidSettings();
  return writeSettings({ brave_search_key: value.trim() }, signal);
}
