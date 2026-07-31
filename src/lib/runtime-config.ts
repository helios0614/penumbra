const DEFAULT_UPLOAD_PATH = "/api/upload";
const DEFAULT_WEBSOCKET_PATH = "/ws";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export interface RuntimeEnvironment {
  readonly [key: string]: string | boolean | undefined;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_BASE?: string;
  readonly VITE_UPLOAD_URL?: string;
  readonly VITE_WEBSOCKET_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_API_TIMEOUT_MS?: string;
}

export interface RuntimeConfig {
  readonly apiBaseUrl: string;
  readonly uploadUrl: string;
  readonly websocketUrl: string;
  readonly requestTimeoutMs: number;
}

export function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  return normalized === "/" ? "" : normalized;
}

export function resolveHttpUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.trim();

  if (isAbsoluteHttpUrl(normalizedPath) || normalizedPath.startsWith("//")) {
    return normalizedPath;
  }

  const normalizedBase = normalizeBaseUrl(baseUrl);
  if (!normalizedPath) {
    return normalizedBase;
  }

  const pathWithoutLeadingSlash = normalizedPath.replace(/^\/+/, "");
  if (!normalizedBase) {
    return `/${pathWithoutLeadingSlash}`;
  }

  return `${normalizedBase}/${pathWithoutLeadingSlash}`;
}

export function resolveWebSocketUrl(
  value: string,
  apiBaseUrl = "",
  browserOrigin = "",
): string {
  const normalizedValue = value.trim();

  if (isAbsoluteWebSocketUrl(normalizedValue)) {
    return normalizedValue;
  }

  if (isAbsoluteHttpUrl(normalizedValue)) {
    return replaceHttpProtocol(normalizedValue);
  }

  let resolvedUrl = resolveHttpUrl(apiBaseUrl, normalizedValue);
  if (!isAbsoluteHttpUrl(resolvedUrl) && browserOrigin) {
    resolvedUrl = resolveHttpUrl(browserOrigin, resolvedUrl);
  }

  if (resolvedUrl.startsWith("//")) {
    const secure = browserOrigin.startsWith("https:");
    return `${secure ? "wss:" : "ws:"}${resolvedUrl}`;
  }

  return isAbsoluteHttpUrl(resolvedUrl)
    ? replaceHttpProtocol(resolvedUrl)
    : resolvedUrl;
}

export function createRuntimeConfig(
  environment: RuntimeEnvironment,
  browserOrigin = getBrowserOrigin(),
): RuntimeConfig {
  const apiBaseUrl = normalizeBaseUrl(
    firstNonEmpty(
      environment.VITE_API_BASE_URL,
      environment.VITE_API_BASE,
    ) ?? "",
  );
  const uploadPath =
    firstNonEmpty(environment.VITE_UPLOAD_URL) ?? DEFAULT_UPLOAD_PATH;
  const websocketPath =
    firstNonEmpty(
      environment.VITE_WEBSOCKET_URL,
      environment.VITE_WS_URL,
    ) ?? DEFAULT_WEBSOCKET_PATH;

  return Object.freeze({
    apiBaseUrl,
    uploadUrl: resolveHttpUrl(apiBaseUrl, uploadPath),
    websocketUrl: resolveWebSocketUrl(
      websocketPath,
      apiBaseUrl,
      browserOrigin,
    ),
    requestTimeoutMs: parseTimeout(
      environment.VITE_API_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
    ),
  });
}

export const runtimeConfig = createRuntimeConfig(import.meta.env);

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value?.trim())?.trim();
}

function parseTimeout(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getBrowserOrigin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isAbsoluteWebSocketUrl(value: string): boolean {
  return /^wss?:\/\//i.test(value);
}

function replaceHttpProtocol(value: string): string {
  return value.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
}
