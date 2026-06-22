/**
 * Minimal API client for the AionsHome backend.
 *
 * Keep request details here so components call domain helpers instead of
 * scattering fetch calls through the UI.
 */

const envApiBase =
  import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_BASE ?? "";

export const API_BASE_URL = normalizeBaseUrl(envApiBase);

export const API_BASE_URL_DISPLAY =
  API_BASE_URL || "same-origin /api (dev proxy: http://localhost:8080)";

type JsonBody = Record<string, unknown> | unknown[] | string | number | boolean | null;

export interface ApiRequestOptions
  extends Omit<RequestInit, "body" | "credentials"> {
  body?: BodyInit | JsonBody;
  credentials?: RequestCredentials;
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
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
  const { body, headers: optionHeaders, ...init } = options;
  const headers = new Headers(optionHeaders);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  const requestBody = prepareBody(body, headers);

  try {
    const response = await fetch(buildApiUrl(path), {
      ...init,
      credentials: init.credentials ?? "include",
      headers,
      body: requestBody,
    });

    if (!response.ok) {
      throw await createApiError(response);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as T;
    }

    return (await response.text()) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      error instanceof Error ? error.message : "Network request failed",
      0,
      error,
    );
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function buildApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
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

async function createApiError(response: Response): Promise<ApiError> {
  const contentType = response.headers.get("content-type") ?? "";
  let data: unknown = undefined;

  try {
    data = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
  } catch {
    data = undefined;
  }

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
