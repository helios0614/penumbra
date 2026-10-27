import { createServer as createHttpServer, type Server } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer as createViteServer } from "vite";
import { createDevProxyConfig } from "../../src/config/dev-proxy-config";
import { openSendExecution } from "../../src/application/chat-execution";

afterEach(() => vi.unstubAllGlobals());
async function listen(server: Server) {
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected local port");
  return `http://127.0.0.1:${address.port}`;
}
async function fixture(run: (origin: string, received: string[]) => Promise<void>, flushHeaders = false) {
  const received: string[] = [], timers: ReturnType<typeof setTimeout>[] = [];
  const upstream = createHttpServer((req, res) => {
    received.push(`${req.method} ${req.url}`); req.resume();
    res.setHeader("content-type", "text/event-stream");
    if (flushHeaders) res.flushHeaders();
    timers.push(setTimeout(() => res.end('data: {"type":"start","id":"synthetic-reply"}\n\ndata: {"type":"chunk","content":"synthetic"}\n\n'), 500));
  });
  const target = await listen(upstream);
  const vite = await createViteServer({ configFile: false, envDir: false, logLevel: "silent", appType: "custom",
    server: { middlewareMode: true, proxy: createDevProxyConfig(target) },
  });
  const server = createHttpServer(vite.middlewares), origin = await listen(server);
  try { await run(origin, received); }
  finally {
    timers.forEach(clearTimeout);
    await vite.close();
    server.closeAllConnections(); upstream.closeAllConnections();
    await Promise.all([new Promise<void>(resolve => server.close(() => resolve())), new Promise<void>(resolve => upstream.close(() => resolve()))]);
  }
}

describe("real HTTP → production Vite proxy → isolated SSE upstream", () => {
  it("forwards POST before headers and has no proxy-imposed header deadline", async () => {
    await fixture(async (origin, received) => {
      const nativeFetch = globalThis.fetch;
      vi.stubGlobal("fetch", (path: string, init: RequestInit) => nativeFetch(new URL(path, origin), init));
      // Millisecond deadlines exercise the same production abort path without a 30s sleep.
      const canceled = openSendExecution("synthetic-A", { content: "synthetic" }, { timeoutMs: 250 });
      await expect(canceled).rejects.toMatchObject({ code: "TIMEOUT" });
      const plain = await nativeFetch(`${origin}/api/conversations/synthetic-legacy/send`, { method: "POST", body: "{}" });
      expect(await plain.text()).toContain("synthetic-reply");
      expect(received).toEqual(["POST /api/conversations/synthetic-A/send", "POST /api/conversations/synthetic-legacy/send"]);
    });
  });

  it("survives proxy-delayed headers and streams a delayed start with the Main header policy", async () => {
    await fixture(async (origin, received) => {
      const nativeFetch = globalThis.fetch;
      let downstream!: AbortSignal;
      vi.stubGlobal("fetch", (path: string, init: RequestInit) => { downstream = init.signal!; return nativeFetch(new URL(path, origin), init); });
      const response = await openSendExecution("synthetic-A", { content: "synthetic" });
      if (response.kind !== "stream") throw new Error("Expected stream");
      const events = [];
      for await (const event of response.events) events.push(event.type);
      expect(events).toEqual(["start", "chunk"]);
      expect(downstream.aborted).toBe(false);
      expect(received).toEqual(["POST /api/conversations/synthetic-A/send"]);
    }, true);
  });
});
