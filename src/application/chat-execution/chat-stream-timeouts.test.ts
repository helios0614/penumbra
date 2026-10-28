import { afterEach, describe, expect, it, vi } from "vitest";
import { openSendExecution, openRegenerateExecution, type ChatExecutionEvent } from "@/application/chat-execution";

// Keep transport timer/abort assertions scoped to Chat; mailbox ownership is tested separately.
vi.mock("@/application/chat-system-log/request-snapshot-drain", () => ({
  createRequestSnapshotDrain: () => ({ start: () => () => {}, request: () => {}, drain: async () => {}, resume: () => {}, hasDemand: () => false }),
}));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Chat header and stream idle deadlines", () => {
  it("keeps active SSE output alive beyond the original 30 second total deadline", async () => {
    vi.useFakeTimers();
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(controller) { source = controller; } });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await openSendExecution("conv_a", { content: "synthetic" });
    if (result.kind !== "stream") throw new Error("Expected stream");
    const observed: ChatExecutionEvent[] = [];
    const consumption = (async () => { for await (const event of result.events) observed.push(event); })();
    for (let index = 0; index < 5; index += 1) {
      await vi.advanceTimersByTimeAsync(20_000);
      source.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "chunk", content: `part ${index}` })}\n\n`));
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    }
    source.close();
    await consumption;
    expect(observed).toHaveLength(5);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["send", "regenerate"])("keeps %s header waiting alive beyond 30s without losing explicit caller cancellation", async operation => {
    vi.useFakeTimers();
    const caller = new AbortController();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    })));
    const pending = operation === "send"
      ? openSendExecution("conv_a", { content: "synthetic" }, { signal: caller.signal })
      : openRegenerateExecution("conv_a", "synthetic-target", {}, { signal: caller.signal });
    const assertion = expect(pending).rejects.toMatchObject({ code: "ABORTED" });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(vi.getTimerCount()).toBe(0);
    caller.abort();
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts the idle deadline after delayed headers and resets it on comment heartbeats", async () => {
    vi.useFakeTimers();
    let source!: ReadableStreamDefaultController<Uint8Array>, headers!: () => void;
    const body = new ReadableStream<Uint8Array>({ start(controller) { source = controller; } });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(() => new Promise(resolve => {
      headers = () => resolve(new Response(body, { headers: { "content-type": "text/event-stream" } }));
    })));
    const pending = openSendExecution("conv_a", { content: "synthetic" });
    await vi.advanceTimersByTimeAsync(300_000); headers();
    const result = await pending;
    if (result.kind !== "stream") throw new Error("Expected stream");
    const read = (async () => { for await (const _event of result.events) { /* heartbeats are not domain events */ } })();
    for (let index = 0; index < 3; index++) {
      await vi.advanceTimersByTimeAsync(119_000);
      source.enqueue(new TextEncoder().encode(": synthetic heartbeat\n\n"));
      await vi.advanceTimersByTimeAsync(0);
    }
    source.enqueue(new TextEncoder().encode('data: {"type":"start","id":"synthetic"}\n\n'));
    source.close(); await read;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("expires idle reads independently and releases the client reader without claiming backend cancellation", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { headers: { "content-type": "text/event-stream" } })));
    const result = await openSendExecution("conv_a", { content: "synthetic" });
    if (result.kind !== "stream") throw new Error("Expected stream");
    const pending = (async () => { for await (const _event of result.events) { /* wait for EOF */ } })();
    const assertion = expect(pending).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(120_000);
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
