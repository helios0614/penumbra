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

export type ApiQuery = Readonly<
  Record<string, string | number | boolean | null | undefined>
> | URLSearchParams;

export interface ApiRequestOptions
  extends Omit<RequestInit, "body" | "credentials" | "signal"> {
  body?: BodyInit | JsonBody;
  credentials?: RequestCredentials;
  query?: ApiQuery;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ApiStreamResponse {
  readonly contentType: string;
  readonly body: ReadableStream<Uint8Array>;
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

export class StreamContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StreamContractError";
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
  const request = await requestApiResponse(path, options, "application/json");

  try {
    const data = await parseResponseBody(request.response);

    if (!request.response.ok) {
      throw createApiError(request.response, data);
    }

    return data as T;
  } catch (error) {
    throw request.toApiError(error);
  } finally {
    request.cleanup();
  }
}

/**
 * Opens a successful streaming API response without exposing the raw Response.
 * The caller can inspect contentType before choosing an SSE or JSON body mapper.
 */
export async function openApiStream(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiStreamResponse> {
  const request = await requestApiResponse(
    path,
    options,
    "text/event-stream, application/json",
  );

  try {
    if (!request.response.ok) {
      const data = await parseResponseBody(request.response);
      throw createApiError(request.response, data);
    }

    if (!request.response.body) {
      throw new StreamContractError("API streaming response has no body");
    }

    return Object.freeze({
      contentType: request.response.headers.get("content-type") ?? "",
      body: createManagedApiBody(request.response.body, request),
    });
  } catch (error) {
    request.cleanup();

    if (error instanceof StreamContractError) {
      throw error;
    }

    throw request.toApiError(error);
  }
}

interface ApiResponseRequest {
  readonly response: Response;
  readonly signal: AbortSignal;
  toApiError(error: unknown): ApiError;
  cleanup(): void;
}

async function requestApiResponse(
  path: string,
  options: ApiRequestOptions,
  defaultAccept: string,
): Promise<ApiResponseRequest> {
  const {
    body,
    headers: optionHeaders,
    query,
    signal: callerSignal,
    timeoutMs = runtimeConfig.requestTimeoutMs,
    ...init
  } = options;
  const headers = new Headers(optionHeaders);
  const abortContext = createAbortContext(callerSignal, timeoutMs);

  if (!headers.has("Accept")) {
    headers.set("Accept", defaultAccept);
  }

  const requestBody = prepareBody(body, headers);

  try {
    const response = await fetch(resolveRequestUrl(path, query), {
      ...init,
      credentials: init.credentials ?? "include",
      headers,
      body: requestBody,
      signal: abortContext.signal,
    });

    let cleanedUp = false;

    return {
      response,
      signal: abortContext.signal,
      toApiError(error) {
        return normalizeApiError(
          error,
          abortContext,
          callerSignal,
          timeoutMs,
        );
      },
      cleanup() {
        if (cleanedUp) {
          return;
        }

        cleanedUp = true;
        abortContext.cleanup();
      },
    };
  } catch (error) {
    abortContext.cleanup();
    throw normalizeApiError(error, abortContext, callerSignal, timeoutMs);
  }
}

function resolveRequestUrl(path: string, query: ApiQuery | undefined): string {
  const resolvedUrl = resolveHttpUrl(API_BASE_URL, path);
  if (!query) {
    return resolvedUrl;
  }

  const params = new URLSearchParams();
  if (query instanceof URLSearchParams) {
    query.forEach((value, key) => params.append(key, value));
  } else {
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined) {
        params.append(key, String(value));
      }
    }
  }

  const queryString = params.toString();
  if (!queryString) {
    return resolvedUrl;
  }

  const hashIndex = resolvedUrl.indexOf("#");
  const urlWithoutHash =
    hashIndex >= 0 ? resolvedUrl.slice(0, hashIndex) : resolvedUrl;
  const hash = hashIndex >= 0 ? resolvedUrl.slice(hashIndex) : "";
  const separator = urlWithoutHash.includes("?")
    ? urlWithoutHash.endsWith("?") || urlWithoutHash.endsWith("&")
      ? ""
      : "&"
    : "?";

  return `${urlWithoutHash}${separator}${queryString}${hash}`;
}

function normalizeApiError(
  error: unknown,
  abortContext: AbortContext,
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (abortContext.abortKind === "timeout") {
    return new ApiError(
      `Request timed out after ${timeoutMs}ms`,
      0,
      error,
      "TIMEOUT",
    );
  }

  if (abortContext.abortKind === "caller") {
    return new ApiError(
      "Request aborted",
      0,
      callerSignal?.reason ?? error,
      "ABORTED",
    );
  }

  return new ApiError(
    error instanceof Error ? error.message : "Network request failed",
    0,
    error,
  );
}

function createManagedApiBody(
  source: ReadableStream<Uint8Array>,
  request: ApiResponseRequest,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let streamController: ReadableStreamDefaultController<Uint8Array> | null =
    null;
  let settled = false;

  const finish = () => {
    request.signal.removeEventListener("abort", abortReading);
    request.cleanup();
    reader.releaseLock();
  };

  const abortReading = () => {
    if (settled) {
      return;
    }

    settled = true;
    streamController?.error(request.toApiError(request.signal.reason));
    const cancellation = reader.cancel(
      new DOMException("API stream reading aborted", "AbortError"),
    );
    void cancellation.then(finish, finish);
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      request.signal.addEventListener("abort", abortReading, { once: true });
      if (request.signal.aborted) {
        abortReading();
      }
    },
    async pull(controller) {
      if (settled) {
        return;
      }

      try {
        const result = await reader.read();
        if (settled) {
          return;
        }

        if (result.done) {
          settled = true;
          controller.close();
          finish();
          return;
        }

        controller.enqueue(result.value);
      } catch (error) {
        if (settled) {
          return;
        }

        settled = true;
        controller.error(request.toApiError(error));
        finish();
      }
    },
    async cancel(reason) {
      if (settled) {
        return;
      }

      settled = true;
      try {
        await reader.cancel(reason);
      } finally {
        finish();
      }
    },
  });
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
