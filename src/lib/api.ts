/**
 * Minimal API client for the AionsHome backend.
 *
 * Keep request details here so components call domain helpers instead of
 * scattering fetch calls through the UI.
 */

import { resolveHttpUrl, runtimeConfig } from "@/lib/runtime-config";

export const API_BASE_URL = runtimeConfig.apiBaseUrl;
export const UPLOAD_URL = runtimeConfig.uploadUrl;
export const WEBSOCKET_URL = runtimeConfig.websocketUrl;

export const API_BASE_URL_DISPLAY =
  API_BASE_URL || "same-origin";

type JsonBody =
  | Record<string, unknown>
  | unknown[]
  | string
  | number
  | boolean
  | null;

export interface ApiRequestOptions
  extends Omit<RequestInit, "body" | "credentials" | "signal"> {
  body?: BodyInit | JsonBody;
  credentials?: RequestCredentials;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export type ApiErrorCode =
  | "HTTP_ERROR"
  | "NETWORK_ERROR"
  | "ABORTED"
  | "TIMEOUT"
  | "INVALID_RESPONSE";

export class ApiError extends Error {
  readonly status: number;
  readonly data: unknown;
  readonly code: ApiErrorCode;

  constructor(
    message: string,
    status: number,
    data?: unknown,
    code: ApiErrorCode = status > 0 ? "HTTP_ERROR" : "NETWORK_ERROR",
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    this.code = code;
  }
}

export function apiGet<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  return apiRequest<T>(path, { ...options, method: "GET" });
}

export function apiPost<T>(
  path: string,
  body?: ApiRequestOptions["body"],
  options?: ApiRequestOptions,
): Promise<T> {
  return apiRequest<T>(path, { ...options, method: "POST", body });
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const {
    body,
    headers: optionHeaders,
    signal: callerSignal,
    timeoutMs = runtimeConfig.requestTimeoutMs,
    ...init
  } = options;
  const headers = new Headers(optionHeaders);
  const abortContext = createAbortContext(callerSignal, timeoutMs);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  const requestBody = prepareBody(body, headers);

  try {
    const response = await fetch(resolveHttpUrl(API_BASE_URL, path), {
      ...init,
      credentials: init.credentials ?? "include",
      headers,
      body: requestBody,
      signal: abortContext.signal,
    });

    const data = await parseResponseBody(response);

    if (!response.ok) {
      throw createApiError(response, data);
    }

    return data as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (abortContext.abortKind === "timeout") {
      throw new ApiError(
        `Request timed out after ${timeoutMs}ms`,
        0,
        error,
        "TIMEOUT",
      );
    }

    if (abortContext.abortKind === "caller") {
      throw new ApiError(
        "Request aborted",
        0,
        callerSignal?.reason ?? error,
        "ABORTED",
      );
    }

    throw new ApiError(
      error instanceof Error ? error.message : "Network request failed",
      0,
      error,
    );
  } finally {
    abortContext.cleanup();
  }
}

function prepareBody(
  body: ApiRequestOptions["body"],
  headers: Headers,
): BodyInit | undefined {
  if (body === undefined) {
    return undefined;
  }

  if (isBodyInit(body)) {
    return body;
  }

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return JSON.stringify(body);
}

function isBodyInit(body: ApiRequestOptions["body"]): body is BodyInit {
  return (
    typeof body === "string" ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body)
  );
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) {
    return undefined;
  }

  const text = await response.text();
  if (!text.trim()) {
    return undefined;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!isJsonContentType(contentType)) {
    return text;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return text;
    }

    throw new ApiError(
      "API returned invalid JSON",
      response.status,
      text,
      "INVALID_RESPONSE",
    );
  }
}

function createApiError(response: Response, data: unknown): ApiError {
  const message =
    getErrorMessage(data) || `API ${response.status}: ${response.statusText}`;

  return new ApiError(message, response.status, data);
}

function getErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return typeof data === "string" ? data : null;
  }

  const record = data as Record<string, unknown>;
  const message = record.error ?? record.message ?? record.detail;
  return typeof message === "string" ? message : null;
}

function isJsonContentType(contentType: string): boolean {
  return (
    contentType.includes("application/json") || contentType.includes("+json")
  );
}

interface AbortContext {
  readonly signal: AbortSignal;
  readonly abortKind: "caller" | "timeout" | null;
  cleanup(): void;
}

function createAbortContext(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): AbortContext {
  const controller = new AbortController();
  let abortKind: AbortContext["abortKind"] = null;

  const abortFromCaller = () => {
    if (controller.signal.aborted) {
      return;
    }

    abortKind = "caller";
    controller.abort(callerSignal?.reason);
  };

  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  const timeoutId =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? globalThis.setTimeout(() => {
          if (controller.signal.aborted) {
            return;
          }

          abortKind = "timeout";
          controller.abort();
        }, timeoutMs)
      : undefined;

  return {
    signal: controller.signal,
    get abortKind() {
      return abortKind;
    },
    cleanup() {
      if (timeoutId !== undefined) {
        globalThis.clearTimeout(timeoutId);
      }
      callerSignal?.removeEventListener("abort", abortFromCaller);
    },
  };
}
