import { afterEach, describe, expect, it, vi } from "vitest";
import { openSendExecution, type ChatExecutionEvent } from "@/application/chat-execution";

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

  it("still bounds response-header waiting, which cannot prove that user persistence failed", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    })));
    const pending = openSendExecution("conv_a", { content: "synthetic" });
    const assertion = expect(pending).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
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
