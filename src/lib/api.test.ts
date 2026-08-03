import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiGet, apiPost } from "@/lib/api";

describe("API transport", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("parses JSON responses and applies the request defaults", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ connected: true }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    );

    await expect(
      apiGet<{ connected: boolean }>("/api/session", { timeoutMs: 0 }),
    ).resolves.toEqual({ connected: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/session",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );
  });

  it("uses the shared query builder without changing an existing query", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await apiGet("/api/items?existing=1", {
      query: { model: "a b", enabled: true, omitted: undefined },
      timeoutMs: 0,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/items?existing=1&model=a+b&enabled=true",
      expect.any(Object),
    );
  });

  it("serializes JSON request bodies without changing explicit headers", async () => {
    fetchMock.mockResolvedValue(
      new Response("", { headers: { "content-type": "text/plain" } }),
    );

    await apiPost("/api/items", { name: "Penumbra" }, { timeoutMs: 0 });

    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.body).toBe(JSON.stringify({ name: "Penumbra" }));
    expect(new Headers(request?.headers).get("content-type")).toBe(
      "application/json",
    );
  });

  it("handles text and empty successful responses", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response("accepted", {
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          headers: { "content-type": "application/json" },
        }),
      );

    await expect(apiGet<string>("/text", { timeoutMs: 0 })).resolves.toBe(
      "accepted",
    );
    await expect(
      apiGet<undefined>("/empty", { timeoutMs: 0 }),
    ).resolves.toBeUndefined();
  });

  it("preserves backend status, data, and error messages for non-2xx responses", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Authentication required" }), {
        status: 401,
        statusText: "Unauthorized",
        headers: { "content-type": "application/problem+json" },
      }),
    );

    const request = apiGet("/api/session", { timeoutMs: 0 });

    await expect(request).rejects.toBeInstanceOf(ApiError);
    await expect(request).rejects.toMatchObject({
      name: "ApiError",
      code: "HTTP_ERROR",
      status: 401,
      message: "Authentication required",
      data: { detail: "Authentication required" },
    });
  });

  it("uses text error bodies for non-2xx responses", async () => {
    fetchMock.mockResolvedValue(
      new Response("Service unavailable", {
        status: 503,
        statusText: "Service Unavailable",
        headers: { "content-type": "text/plain" },
      }),
    );

    await expect(apiGet("/health", { timeoutMs: 0 })).rejects.toMatchObject({
      status: 503,
      message: "Service unavailable",
      data: "Service unavailable",
    });
  });

  it("preserves network failure semantics", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(apiGet("/offline", { timeoutMs: 0 })).rejects.toMatchObject({
      name: "ApiError",
      code: "NETWORK_ERROR",
      status: 0,
      message: "Failed to fetch",
    });
  });

  it("aborts a request when its timeout expires", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_input, init) =>
      rejectWhenAborted(init?.signal),
    );

    const request = apiGet("/slow", { timeoutMs: 25 });
    const assertion = expect(request).rejects.toMatchObject({
      code: "TIMEOUT",
      status: 0,
      message: "Request timed out after 25ms",
    });

    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("forwards caller cancellation and clears the internal timeout", async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    fetchMock.mockImplementation((_input, init) =>
      rejectWhenAborted(init?.signal),
    );

    const request = apiGet("/cancelled", {
      signal: caller.signal,
      timeoutMs: 10_000,
    });
    caller.abort("navigation");

    await expect(request).rejects.toMatchObject({
      code: "ABORTED",
      status: 0,
      data: "navigation",
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});

function rejectWhenAborted(
  signal: AbortSignal | null | undefined,
): Promise<Response> {
  return new Promise((_resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    signal?.addEventListener(
      "abort",
      () => reject(signal.reason ?? new DOMException("Aborted", "AbortError")),
      { once: true },
    );
  });
}
