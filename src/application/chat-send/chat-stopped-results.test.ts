import { afterEach, expect, it, vi } from "vitest";
import { createChatSendController, isChatExecutionActive } from "./chat-send-controller";
import { encodeChatExecutionId } from "@/application/chat-execution/chat-execution-status";
import { composeVisibleChatMessages } from "@/components/chat-workspace/presentation";
import { mapMessage } from "@/domain/message";
import { messageWire } from "@/test-fixtures/main-chat-wire";

function stopped(id: string, kind = "send", conv = "A") {
  return { execution: { conv_id:conv, execution_id:encodeChatExecutionId(kind as "send", id), kind, request_id:id,
    phase:"terminal", terminal:true, outcome:"cancelled", reason:"user_cancelled", cancel_requested:true,
    user_message_id:"user", target_message_id:kind === "regenerate" ? "target" : null, assistant_message_id:null,
    partial_text:`safe ${id}`, owner_available:false, cancelable:false }, created_at:Number(id) || 1 };
}
function mockResults(pages: Record<string, unknown>, failing = false) {
  const fetch = vi.fn<typeof globalThis.fetch>(async (path, init) => {
    expect(init?.method ?? "GET").toBe("GET"); expect(init?.cache).toBe("no-store");
    const url = new URL(String(path), "https://fixture.invalid");
    if (url.pathname.endsWith("/active")) return Response.json({execution:null});
    expect(url.pathname).toBe("/api/conversations/A/executions/results");
    const key = url.searchParams.get("before") ?? "first";
    if (failing) return Response.json({detail:{code:"chat_execution_unavailable"}}, {status:503});
    return Response.json(pages[key]);
  });
  vi.stubGlobal("fetch", fetch); return fetch;
}
const controller = () => createChatSendController({ reconcileHistory:async () => ({persistedMessageIds:[],regenerateTarget:null}) });
afterEach(() => vi.unstubAllGlobals());

it("fresh controller recovers all pages, deduplicates execution IDs and keeps durable edits/deletes", async () => {
  const a = stopped("1"), b = stopped("2", "regenerate");
  const fetch = mockResults({first:{results:[b], next_cursor:"older"}, older:{results:[b,a], next_cursor:null}});
  const c = controller(); await c.discoverActive("A"); await c.recoverStoppedResults("A"); await c.recoverStoppedResults("A");
  expect(isChatExecutionActive(c.getState())).toBe(false);
  const history = [mapMessage(messageWire({id:"user",role:"user",conversation_id:"A",content:"edited user"})),
    mapMessage(messageWire({id:"target",conversation_id:"A",content:"edited target",thinking:null,drift:null}))];
  const rows = composeVisibleChatMessages(history,c.getState(),"A");
  expect(rows.map(row => row.id)).toEqual(["user",`${a.execution.execution_id}:stopped`,"target",`${b.execution.execution_id}:stopped`]);
  expect(rows.filter(row => !row.executionStatus).map(row => row.content)).toEqual(["edited user","edited target"]);
  const deleted = composeVisibleChatMessages([],c.getState(),"A");
  expect(deleted.map(row => row.content)).toEqual(["safe 1","safe 2"]);
  expect(deleted.every(row => row.kind === "assistant" && row.executionStatus === "stopped" && row.thinking === null && row.simpleThink === null)).toBe(true);
  expect(composeVisibleChatMessages([],c.getState(),"B")).toEqual([]);
  expect(fetch.mock.calls).toHaveLength(5); c.dispose();
});

it("keeps successful pages on query failure, exposes a light error and retries only on explicit recovery", async () => {
  const fetch = mockResults({first:{results:[stopped("1")],next_cursor:"older"}});
  const c = controller();
  await c.recoverStoppedResults("A");
  expect(c.getState().stoppedExecutions).toHaveLength(1);
  expect(c.getState().resultsError).toBeTruthy();
  expect(isChatExecutionActive(c.getState())).toBe(false);
  const count = fetch.mock.calls.length; await Promise.resolve(); expect(fetch.mock.calls).toHaveLength(count);
  mockResults({first:{results:[],next_cursor:null}});
  await c.recoverStoppedResults("A");
  expect(c.getState().resultsError).toBeUndefined(); expect(c.getState().stoppedExecutions).toHaveLength(1); c.dispose();
});

it("rejects foreign execution facts and repeated cursors without leaking rows or looping", async () => {
  mockResults({first:{results:[stopped("1","send","B")],next_cursor:null}});
  const c = controller(); await c.recoverStoppedResults("A");
  expect(c.getState().stoppedExecutions).toBeUndefined(); expect(c.getState().resultsError).toBeTruthy();
  const fetch = mockResults({first:{results:[stopped("1")],next_cursor:"same"},same:{results:[stopped("1")],next_cursor:"same"}});
  await c.recoverStoppedResults("A"); expect(fetch.mock.calls).toHaveLength(2);
  expect(c.getState().stoppedExecutions).toHaveLength(1); expect(c.getState().resultsError).toBeTruthy(); c.dispose();
});

it("deduplicates B1 unknown overlays by exact execution identity, never by matching message content", async () => {
  const a = stopped("1"), fetch = mockResults({first:{results:[a],next_cursor:null}});
  const c = controller(); await c.recoverStoppedResults("A");
  const state = { ...c.getState(), kind:"finalization-uncertain" as const, executionId:a.execution.execution_id,
    conversationId:"A", optimisticUser:{overlayId:"optimistic-user",clientMessageId:"1",content:"deleted",createdAt:1},
    assistant:{overlayId:"old-overlay",assistantMessageId:null,content:"unsafe stale",createdAt:1,thinking:"private",simpleThink:null,usage:null},
    error:{code:"unknown" as const,message:"unknown",field:null,providerFailure:null},executionError:null,recoveryReadSucceeded:true };
  expect(composeVisibleChatMessages([],state,"A").map(row => row.content)).toEqual(["safe 1"]);
  expect(fetch.mock.calls).toHaveLength(1); c.dispose();
});

it("coalesces overlapping reads and does not apply a late result after disposal", async () => {
  let release!: () => void;
  const held = new Promise<void>(resolve => {release=resolve;});
  const fetch = vi.fn(async () => {await held;return Response.json({results:[stopped("1")],next_cursor:null});});
  vi.stubGlobal("fetch",fetch);
  const c = controller(), a = c.recoverStoppedResults("A"), b = c.recoverStoppedResults("A");
  c.dispose(); release(); await Promise.all([a,b]);
  expect(fetch).toHaveBeenCalledTimes(1); expect(c.getState().stoppedExecutions).toBeUndefined();
});

it("a late nonterminal active response cannot downgrade a stopped result already read from a page", async () => {
  const item = stopped("1");
  mockResults({first:{results:[item],next_cursor:null}});
  let release!: () => void;
  const held = new Promise<void>(resolve => {release=resolve;});
  const { mapMainChatExecution } = await import("@/application/chat-execution/chat-execution-status");
  const stale = mapMainChatExecution({...item.execution,phase:"generating",terminal:false,outcome:null},"A");
  const c = createChatSendController({reconcileHistory:async () => ({persistedMessageIds:[],regenerateTarget:null}),
    readActiveExecution:async () => {await held;return stale;} });
  const active = c.discoverActive("A"); await c.recoverStoppedResults("A"); release(); await active;
  expect(isChatExecutionActive(c.getState())).toBe(false);
  expect(c.getState().serverExecution).toMatchObject({terminal:true,outcome:"cancelled"}); c.dispose();
});
