import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openSendExecution, openRegenerateExecution } from "@/application/chat-execution/chat-execution-client";
import { parseRealtimeMessageData } from "@/application/realtime/realtime-client";
import { debugExecution, drainRequestSnapshots, observeSystemLogPage } from "./chat-system-log-client";
import { systemLog } from "./chat-system-log-store";
import * as projection from "./chat-system-log-projection";
const sse = (...events: object[]) => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
beforeEach(() => systemLog.clear());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("optional log observation at transport boundaries", () => {
  it("does not let malformed or failed diagnostic projection break the real stream", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sse({ type: "start", id: "a" }, { type: "chunk", content: "real reply" }, { type: "debug", msg_id: "a", has_error: false, usage: "malformed", recalled_memories: { invalid: true }, model: { secret: "PRIVATE" } })));
    vi.spyOn(projection, "projectDiagnostic").mockImplementation(() => { throw new Error("synthetic projection failure"); });
    const result = await openSendExecution("conversation", { content: "question", clientMessageId: "synthetic-client" });
    if (result.kind !== "stream") throw new Error("stream expected");
    const events = []; for await (const event of result.events) events.push(event);
    expect(events.map(event => event.type)).toEqual(["start", "chunk", "debug-summary"]);
    expect(events[events.length - 1]).toMatchObject({ hasError: false, usage: null });
  });
  it("keeps canonical POST body/options and creates distinct HTTP identities for a reused target", async () => {
    const fetch = vi.fn(async () => sse({ type: "start", id: "target" })); vi.stubGlobal("fetch", fetch);
    await openRegenerateExecution("conversation", "target"); await openRegenerateExecution("conversation", "target");
    expect(fetch).toHaveBeenCalledTimes(2);
    const requests = fetch.mock.calls as unknown as [string, RequestInit][];
    expect(requests.map(([, init]) => init.body)).toEqual([undefined, undefined]);
    const headers = requests.map(([, init]) => new Headers(init.headers));
    expect(headers[0].get("X-Penumbra-Debug-Execution")).not.toBe(headers[1].get("X-Penumbra-Debug-Execution"));
    expect(headers[0].get("X-Penumbra-Debug-Page")).toMatch(/^[a-f0-9]{32}$/);
  });
  it("does not turn a non-ASCII client identity into an invalid debug HTTP header", () => {
    const debug = debugExecution("conversation", "send", "合成客户端身份");
    expect(() => new Headers(debug.headers)).not.toThrow();
    expect(debug.context.executionId).toMatch(/^send:[A-Za-z0-9._-]+$/);
  });
  it("keeps private request/Prompt fields out of the ordinary WebSocket projection", () => {
    expect(parseRealtimeMessageData(JSON.stringify({ type: "debug", data: { msg_id: "a", has_error: true, payload_json: "PRIVATE_WIRE", prompt_messages: [{ content: "PRIVATE_PROMPT" }], usage: "bad" } }))).toEqual({ type: "unknown", rawType: "debug" });
    const state = JSON.stringify(systemLog.getState());
    expect(state).not.toContain("PRIVATE_WIRE"); expect(state).not.toContain("PRIVATE_PROMPT");
  });
  it("clears private page memory on an authentication rejection without changing generation", async () => {
    debugExecution("conversation", "send", "synthetic-client");
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":"未登录"}', { status: 401, headers: { "content-type": "application/json" } })));
    const stop = observeSystemLogPage();
    try {
      await vi.waitFor(() => expect(systemLog.getState().entries).toHaveLength(0));
      await drainRequestSnapshots();
    } finally { stop(); }
  });
});
