import { ApiError, apiRequest } from "@/lib/api";

export interface SettingsCredential {
  readonly configured: boolean;
  readonly masked: string;
  readonly secret_ref: string | null;
}

type Failure = "auth" | "stale" | "persistence" | "invalid" | "unconfirmed";

export class SettingsError extends Error {
  constructor(readonly code: Failure) {
    super(code);
    this.name = "SettingsError";
  }
}

const settingsPath = "/api/settings";
export const invalidSettings = () => new SettingsError("invalid");

export function settingsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function request(path: string, method: "GET" | "PUT" | "POST", signal: AbortSignal, body?: Record<string, unknown>) {
  try {
    return await apiRequest<unknown>(path, { method, signal, body, cache: "no-store", credentials: "include" });
  } catch (error) {
    // The shared transport's raw response and exception may contain secrets.
    if (error instanceof ApiError) {
      if (error.status === 401 || error.status === 403) throw new SettingsError("auth");
      const detail = settingsRecord(error.data) ? error.data.detail : null;
      if (path.startsWith(settingsPath + "/secrets/") && error.status === 422 &&
          detail === "Secret reference is invalid or stale") throw new SettingsError("stale");
      if (error.status === 503 && settingsRecord(detail) && detail.code === "persistence_failed") {
        throw new SettingsError("persistence");
      }
    }
    throw new SettingsError("unconfirmed");
  }
}

export async function readSettings(signal: AbortSignal) {
  const raw = await request(settingsPath, "GET", signal);
  if (!settingsRecord(raw)) throw invalidSettings();
  return raw;
}

export function parseSettingsCredential(item: unknown): SettingsCredential {
  if (!settingsRecord(item) || typeof item.configured !== "boolean" || typeof item.masked !== "string") throw invalidSettings();
  const { configured, masked, secret_ref } = item;
  if (configured ? !masked || typeof secret_ref !== "string" || !secret_ref.trim() : masked !== "" || secret_ref !== null) throw invalidSettings();
  return { configured, masked, secret_ref: secret_ref as string | null };
}

export function validSettingsKey(value: string, masked: string): boolean {
  const key = value.trim();
  return key.length > 0 && key !== masked && !/[•●*]{3,}/u.test(key);
}

async function write(path: string, method: "PUT" | "POST", body: Record<string, unknown>, signal: AbortSignal): Promise<void> {
  const data = await request(path, method, signal, body);
  if (!settingsRecord(data) || data.ok !== true) throw invalidSettings();
}

export function writeSettings(body: Record<string, unknown>, signal: AbortSignal) {
  return write(settingsPath, "PUT", body, signal);
}

export async function revealSettingsSecret(secretRef: string, signal: AbortSignal): Promise<string> {
  const data = await request(settingsPath + "/secrets/reveal", "POST", signal, { secret_ref: secretRef });
  if (!settingsRecord(data) || typeof data.secret !== "string" || !data.secret) throw invalidSettings();
  return data.secret;
}

export function clearSettingsSecret(secretRef: string, signal: AbortSignal) {
  return write(settingsPath + "/secrets/clear", "POST", { secret_ref: secretRef }, signal);
}
