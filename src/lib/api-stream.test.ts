import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  StreamContractError,
  openApiStream,
} from "@/lib/api";
import { parseSseStream } from "@/lib/sse";

describe("streaming API transport", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("shares URL, query, body, header, and cookie request setup", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(
      streamResponse([encode("data: ready\n\n")], "text/event-stream; charset=utf-8"),
    );

    const response = await openApiStream("/api/events?existing=1", {
      method: "POST",
      query: { model: "a b", fast: true, omitted: null },
      body: { prompt: "hello" },
      timeoutMs: 10_000,
    });

    expect(response.contentType).toBe("text/event-stream; charset=utf-8");
    await expect(readAllText(response.body)).resolves.toBe("data: ready\n\n");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/events?existing=1&model=a+b&fast=true",
      expect.objectContaining({
        body: JSON.stringify({ prompt: "hello" }),
        credentials: "include",
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    );
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("accept")).toBe("text/event-stream, application/json");
    expect(headers.get("content-type")).toBe("application/json");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves content type so callers can choose a body mapper", async () => {
    fetchMock.mockResolvedValue(
      streamResponse([encode('{"result":"ordinary-json"}')], "application/json"),
    );

    const response = await openApiStream("/generic", { timeoutMs: 0 });

    expect(response.contentType).toBe("application/json");
    await expect(readAllText(response.body)).resolves.toBe(
      '{"result":"ordinary-json"}',
    );
  });

  it("keeps non-2xx responses as ApiError", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Authentication required" }), {
        status: 401,
        statusText: "Unauthorized",
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      openApiStream("/events", { timeoutMs: 0 }),
    ).rejects.toMatchObject({
      name: "ApiError",
      code: "HTTP_ERROR",
      status: 401,
      message: "Authentication required",
    });
  });

  it("keeps network failures as ApiError", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(
      openApiStream("/events", { timeoutMs: 0 }),
    ).rejects.toMatchObject({
      name: "ApiError",
      code: "NETWORK_ERROR",
      status: 0,
      message: "Failed to fetch",
    });
  });

  it("rejects a successful streaming response without a body", async () => {
    fetchMock.mockResolvedValue(new Response(null));

    await expect(
      openApiStream("/events", { timeoutMs: 0 }),
    ).rejects.toBeInstanceOf(StreamContractError);
  });

  it("keeps the timeout active until body consumption completes", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const source = pendingStream(cancel);
    fetchMock.mockResolvedValue(new Response(source));

    const response = await openApiStream("/events", { timeoutMs: 25 });
    const reading = readAllText(response.body);
    const assertion = expect(reading).rejects.toMatchObject({
      name: "ApiError",
      code: "TIMEOUT",
      status: 0,
      message: "Request timed out after 25ms",
    });

    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(source.locked).toBe(false);
  });

  it("propagates caller abort while cleaning the body reader and timer", async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    const cancel = vi.fn();
    const source = pendingStream(cancel);
    fetchMock.mockResolvedValue(new Response(source));

    const response = await openApiStream("/events", {
      signal: caller.signal,
      timeoutMs: 10_000,
    });
    const reading = readAllText(response.body);
    caller.abort("navigation");

    await expect(reading).rejects.toMatchObject({
      name: "ApiError",
      code: "ABORTED",
      status: 0,
      data: "navigation",
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(source.locked).toBe(false);
  });

  it("cancels the HTTP body when an SSE consumer stops early", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode("data: first\n\n"));
        controller.enqueue(encode("data: second\n\n"));
      },
      cancel,
    });
    fetchMock.mockResolvedValue(new Response(source));

    const response = await openApiStream("/events", { timeoutMs: 10_000 });
    for await (const frame of parseSseStream(response.body)) {
      expect(frame).toEqual({ data: "first" });
      break;
    }

    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(source.locked).toBe(false);
  });

  it("maps body read failures to the shared network ApiError", async () => {
    const source = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error("body read failed");
      },
    });
    fetchMock.mockResolvedValue(new Response(source));

    const response = await openApiStream("/events", { timeoutMs: 0 });
    const error = await readAllText(response.body).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: "NETWORK_ERROR",
      status: 0,
      message: "body read failed",
    });
    expect(source.locked).toBe(false);
  });
});

function streamResponse(
  chunks: Uint8Array[],
  contentType: string,
): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    }),
    { headers: { "content-type": contentType } },
  );
}

function pendingStream(
  cancel: (reason?: unknown) => void,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({ cancel });
}

async function readAllText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        return result + decoder.decode();
      }
      result += decoder.decode(next.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
