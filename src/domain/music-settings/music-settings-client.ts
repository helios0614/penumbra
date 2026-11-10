import { apiGet } from "@/lib/api";
import {
  invalidSettings, parseSettingsCredential, readSettings, settingsRecord, validSettingsKey, writeSettings,
} from "@/domain/service-settings/settings-client";

export interface MusicAuthStatus {
  readonly mode: "credential" | "anonymous";
  readonly status: "unverified" | "success" | "failed";
  readonly checkedAt: string | null;
  readonly errorCode: "login_failed" | "login_rejected" | "login_not_confirmed" | null;
}

export async function readMusicCredential(signal: AbortSignal) {
  const { credentials } = await readSettings(signal);
  if (!settingsRecord(credentials)) throw invalidSettings();
  return parseSettingsCredential(credentials.netease_music_u);
}

export function replaceMusicCredential(value: string, masked: string, signal: AbortSignal) {
  if (!validSettingsKey(value, masked)) throw invalidSettings();
  return writeSettings({ netease_music_u: value.trim() }, signal);
}

export async function readMusicAuthStatus(signal: AbortSignal): Promise<MusicAuthStatus> {
  let raw: unknown;
  try {
    raw = await apiGet<unknown>("/api/music/auth-status", { signal, cache: "no-store", credentials: "include" });
  } catch {
    // Keep the transport's raw response and exception out of page state.
    throw invalidSettings();
  }
  if (!settingsRecord(raw)) throw invalidSettings();
  const { mode, status, checked_at: checkedAt, error_code: errorCode } = raw;
  if ((mode !== "credential" && mode !== "anonymous") ||
      (status !== "unverified" && status !== "success" && status !== "failed")) throw invalidSettings();
  if (checkedAt !== null && (typeof checkedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(checkedAt) ||
      !Number.isFinite(Date.parse(checkedAt)))) throw invalidSettings();
  return {
    mode, status, checkedAt,
    errorCode: errorCode === "login_failed" || errorCode === "login_rejected" || errorCode === "login_not_confirmed" ? errorCode : null,
  };
}
