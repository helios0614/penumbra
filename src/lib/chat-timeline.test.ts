import { afterEach, expect, it, vi } from "vitest";

type Trace = { enable(value?: boolean): void; clear(): void; read(): Record<string, unknown>[] };
const identity = { executionId: "execution:synthetic", conversationId: "synthetic" };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
async function setup() {
  const fakeWindow = {} as { __penumbraChatTimeline: Trace };
  vi.stubGlobal("window", fakeWindow);
  const module = await import("./chat-timeline");
  return { ...module, control: fakeWindow.__penumbraChatTimeline };
}
it("is opt-in, bounded, memory-only and copies only timing/identity fields", async () => {
  const t = await setup();
  t.traceChat("ignored", identity); expect(t.control.read()).toEqual([]);
  t.control.enable();
  const enriched = { ...identity, content: "private", prompt: "secret", key: "secret" };
  const signal = new AbortController().signal;
  t.bindChatTrace(signal, enriched); t.aliasChatTrace("assistant", enriched);
  expect(t.chatTraceIdentity(signal)).toEqual(identity);
  t.traceChat("safe", enriched, { size: 10 }); t.traceChatMessage("alias", "assistant");
  expect(JSON.stringify(t.control.read())).not.toMatch(/private|secret|content|prompt|key/);
  for (let i = 0; i < 2100; i++) t.traceChat("bounded", identity, { size: i });
  expect(t.control.read()).toHaveLength(2000);
  const snapshot = t.control.read(); snapshot[0].size = -1;
  expect(t.control.read()[0].size).not.toBe(-1);
  t.control.enable(false); expect(t.control.read()).toEqual([]);
  expect(t.chatTraceIdentity(signal)).toBeUndefined();
});
it("disables the API and all collection in production", async () => {
  vi.stubEnv("DEV", false);
  const t = await setup();
  expect(t.control).toBeUndefined();
  t.traceChat("ignored", identity);
  vi.unstubAllEnvs();
});
