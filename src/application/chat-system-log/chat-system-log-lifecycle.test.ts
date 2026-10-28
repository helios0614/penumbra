import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(10_000); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const frame = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;
const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);
async function setup() {
  const client = await import("./chat-system-log-client");
  const { systemLog } = await import("./chat-system-log-store");
  const transport = await import("@/application/chat-execution/chat-execution-client");
  const capture = (id: string, execution_id: string, conversation_id = "a") => ({ id, execution_id, conversation_id, kind: "send", created_at: Date.now() / 1000, model: "m", protocol: "openai", source: "provider", stage: "http_json_before_send", payload_json: '{"messages":[]}', complete: true, limitations: [] });
  return { ...client, ...transport, systemLog, capture };
}

describe("snapshot lifecycle at real HTTP/SSE observation boundaries", () => {
  it("starts at send/regenerate, ends duplicate/error paths, and retains the late continuation", async () => {
    const c = await setup();
    const pending: unknown[] = [];
    const drains: number[] = [];
    let execution = "";
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith("debug/drain")) { drains.push(Date.now()); return json({ records: pending.splice(0) }); }
      execution = new Headers(init?.headers).get("X-Penumbra-Debug-Execution")!;
      pending.push(c.capture(`main-${execution}`, execution));
      return new Response(frame({ type: "start", id: "msg" }) + frame({ type: "chunk", content: "normal reply" }) + frame({ type: "mcp_loading", msg_id: "msg", tools: "synthetic:tool" }), { headers: { "content-type": "text/event-stream" } });
    }));
    const stop = c.observeSystemLogPage(); await advance(60_000); expect(drains).toEqual([]);
    const result = await c.openSendExecution("a", { content: "q", clientMessageId: "synthetic-client" });
    if (result.kind !== "stream") throw new Error("stream expected");
    const events = []; for await (const event of result.events) events.push(event.type);
    expect(events).toEqual(["start", "chunk", "mcp-loading"]);
    stop(); await advance(140_000);
    pending.push(c.capture("late-tool", execution)); await advance(40_000);
    expect(c.systemLog.getState().entries.find(e => e.id === execution)?.requests.map(r => r.id)).toEqual([`main-${execution}`, "late-tool"]);
    await advance(181_000); expect(vi.getTimerCount()).toBe(0);
    const regen = await c.openRegenerateExecution("a", "msg"); for await (const _ of regen.events) { /* consume */ }
    await advance(2000); expect(c.systemLog.getState().entries.filter(e => e.kind === "regenerate")).toHaveLength(1);
    await advance(181_000); expect(vi.getTimerCount()).toBe(0);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).endsWith("debug/drain") ? json({ records: [] }) : json({ ok: true, duplicate: true, msg_id: "user" })));
    expect((await c.openSendExecution("b", { content: "duplicate" })).kind).toBe("duplicate");
    await advance(181_000); expect(vi.getTimerCount()).toBe(0);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).endsWith("debug/drain") ? json({ records: [] }) : json({ error: "temporary" }, 503)));
    await expect(c.openSendExecution("b", { content: "network" })).rejects.toMatchObject({ status: 503 });
    await advance(181_000); expect(vi.getTimerCount()).toBe(0);
  });
  it("archives an in-flight destructive read across A/B, leaving Chat and re-entry exactly once", async () => {
    const c = await setup();
    let receive!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(resolve => { receive = resolve; })); vi.stubGlobal("fetch", fetch);
    const stopA = c.observeSystemLogPage(), a = c.debugExecution("a", "send", "synthetic-a");
    await advance(201);
    const record = c.capture("claimed-a", a.context.executionId);
    stopA(); const stopB = c.observeSystemLogPage(), b = c.debugExecution("b", "regenerate", undefined, "target");
    stopB(); a.finish(); b.finish();
    const flight = c.drainRequestSnapshots();
    expect(fetch).toHaveBeenCalledOnce();
    expect((fetch.mock.calls as unknown as [string, RequestInit][])[0][1].signal?.aborted).toBe(false);
    receive(json({ records: [record, record] })); await flight;
    const reenter = c.observeSystemLogPage(); await advance(0);
    expect(c.systemLog.getState().entries.find(e => e.id === a.context.executionId)?.requests).toHaveLength(1);
    expect(fetch).toHaveBeenCalledOnce(); reenter();
  });
  it("discards an in-flight response only on intentional private-memory clear", async () => {
    const c = await setup(); let receive!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { receive = resolve; })));
    const a = c.debugExecution("a", "send"); await advance(201);
    const record = c.capture("cleared", a.context.executionId); c.systemLog.clear();
    receive(json({ records: [record] })); await advance(0);
    expect(c.systemLog.getState().entries).toEqual([]); a.finish();
  });
  it.each([401, 403, 404, 405])("honors HTTP %s without endless retries", async status => {
    const c = await setup();
    const fetch = vi.fn(async () => json({ error: "unsupported/auth" }, status)); vi.stubGlobal("fetch", fetch);
    const a = c.debugExecution("a", "send"); await advance(201); a.finish(); await advance(600_000);
    expect(fetch).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    if (status === 401) expect(c.systemLog.getState().entries).toEqual([]);
    const b = c.debugExecution("b", "send"); await advance(201); b.finish();
    expect(fetch).toHaveBeenCalledTimes(status === 401 ? 2 : 1);
    if (status === 401) expect(b.headers["X-Penumbra-Debug-Page"]).not.toBe(a.headers["X-Penumbra-Debug-Page"]);
  });
  it.each(["network", 503])("backs off a real drain %s failure without changing the generation signal", async failure => {
    const c = await setup(), times: number[] = [];
    vi.stubGlobal("fetch", vi.fn(async () => {
      times.push(Date.now());
      if (times.length < 4) {
        if (failure === "network") throw new TypeError("synthetic connection failure");
        return json({ error: "temporary" }, 503);
      }
      return json({ records: [] });
    }));
    const a = c.debugExecution("a", "send"); await advance(30_000);
    expect(times.slice(1, 4).map((time, index) => time - times[index])).toEqual([4000, 8000, 16_000]);
    a.finish(); await advance(181_000); expect(vi.getTimerCount()).toBe(0);
  });
  it("coalesces own WS activity but does not restart for an unrelated conversation", async () => {
    const c = await setup(), fetch = vi.fn(async () => json({ records: [] })); vi.stubGlobal("fetch", fetch);
    const a = c.debugExecution("a", "send"); c.observeDebugStream({ type: "start", id: "own" }, a.context);
    a.finish(); await advance(181_000); const count = fetch.mock.calls.length;
    c.observeDebugRealtime({ type: "msg_created", data: { id: "other", conv_id: "b" } });
    await advance(6000); expect(fetch).toHaveBeenCalledTimes(count);
    for (let n = 0; n < 100; n++) c.observeDebugRealtime({ type: "mcp_loading", data: { msg_id: "own" } });
    await advance(201); expect(fetch).toHaveBeenCalledTimes(count + 1);
  });
});
