import { ApiError, apiRequest } from "@/lib/api";

export interface BraveCredential {
  readonly configured: boolean;
  readonly masked: string;
  readonly secret_ref: string | null;
}

export interface WebSettings {
  readonly enabled: boolean;
  readonly brave: BraveCredential;
}

type Failure = "auth" | "stale" | "persistence" | "invalid" | "unconfirmed";

export class WebSettingsError extends Error {
  constructor(readonly code: Failure) {
    super(code);
    this.name = "WebSettingsError";
  }
}

const settingsPath = "/api/settings";
const invalid = () => new WebSettingsError("invalid");

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function request(path: string, method: "GET" | "PUT" | "POST", signal: AbortSignal, body?: Record<string, unknown>) {
  try {
    return await apiRequest<unknown>(path, { method, signal, body, cache: "no-store", credentials: "include" });
  } catch (error) {
    // The shared transport's raw response and exception may contain secrets.
    if (error instanceof ApiError) {
      if (error.status === 401 || error.status === 403) throw new WebSettingsError("auth");
      const detail = record(error.data) ? error.data.detail : null;
      if (path.startsWith(settingsPath + "/secrets/") && error.status === 422 &&
          detail === "Secret reference is invalid or stale") throw new WebSettingsError("stale");
      if (error.status === 503 && record(detail) && detail.code === "persistence_failed") {
        throw new WebSettingsError("persistence");
      }
    }
    throw new WebSettingsError("unconfirmed");
  }
}

export async function readWebSettings(signal: AbortSignal): Promise<WebSettings> {
  const data = await request(settingsPath, "GET", signal);
  if (!record(data) || typeof data.web_access_enabled !== "boolean" || !record(data.credentials)) throw invalid();
  const item = data.credentials.brave_search_key;
  if (!record(item) || typeof item.configured !== "boolean" || typeof item.masked !== "string") throw invalid();
  const { configured, masked, secret_ref } = item;
  if (configured ? !masked || typeof secret_ref !== "string" || !secret_ref.trim() : masked !== "" || secret_ref !== null) throw invalid();
  return { enabled: data.web_access_enabled, brave: { configured, masked, secret_ref: secret_ref as string | null } };
}

export function validBraveKey(value: string, masked: string): boolean {
  const key = value.trim();
  return key.length > 0 && key !== masked && !/[•●*]{3,}/u.test(key);
}

async function write(path: string, method: "PUT" | "POST", body: Record<string, unknown>, signal: AbortSignal): Promise<void> {
  const data = await request(path, method, signal, body);
  if (!record(data) || data.ok !== true) throw invalid();
}

export function saveWebAccess(enabled: boolean, signal: AbortSignal) {
  return write(settingsPath, "PUT", { web_access_enabled: enabled }, signal);
}

export function replaceBraveKey(value: string, masked: string, signal: AbortSignal) {
  if (!validBraveKey(value, masked)) throw invalid();
  return write(settingsPath, "PUT", { brave_search_key: value.trim() }, signal);
}

export async function revealBraveKey(secretRef: string, signal: AbortSignal): Promise<string> {
  const data = await request(settingsPath + "/secrets/reveal", "POST", signal, { secret_ref: secretRef });
  if (!record(data) || typeof data.secret !== "string" || !data.secret) throw invalid();
  return data.secret;
}

export function clearBraveKey(secretRef: string, signal: AbortSignal) {
  return write(settingsPath + "/secrets/clear", "POST", { secret_ref: secretRef }, signal);
}
