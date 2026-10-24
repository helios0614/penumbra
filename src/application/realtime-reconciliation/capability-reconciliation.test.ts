import { afterEach, describe, expect, it, vi } from "vitest";
import { mapRealtimeEvent } from "@/application/realtime/realtime-events";
import { reconcileRealtimeEvent } from "./realtime-reconciliation-service";
import { createMessageHistoryState } from "@/application/message-history/message-history-state";
import { mapMessage } from "@/domain/message";
import { createStreamingAssistantAccumulator, reduceChatExecutionEvent } from "@/application/chat-send/chat-send-accumulator";

const wire = (id: string, role = "user", patch = {}) => ({ id, role, conv_id: "c", content: `body-${id}`, created_at: Number(id) || 1,
  attachments: [], mcp_tool_calls: [], drift: null, thinking: null, is_carryover: 0, cache_region: null, ...patch });
afterEach(() => vi.unstubAllGlobals());
describe("PR4 capability invalidation", () => {
  it("treats WS as invalidation only and updates an older exact anchor without changing history", async () => {
    const initial = createMessageHistoryState("c", [mapMessage(wire("1")), mapMessage(wire("2")), mapMessage(wire("3"))], { pageSize: 2 });
    const event = mapRealtimeEvent({ type: "reaction", data: { target_message_id: "1", source_message_id: "3", conv_id: "c", emoji: "UNTRUSTED_WS_BODY" } });
    const canonical = wire("1", "user", { reaction: { type: "reaction", id: "r", conv_id: "c", target_message_id: "1", source_message_id: "3", emoji: "💙" } });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify(canonical), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const first = await reconcileRealtimeEvent(initial, event);
    const replay = await reconcileRealtimeEvent(first.state, event);
    expect(replay.state.messages.map(m => m.id)).toEqual(["1", "2", "3"]);
    expect(replay.state.oldestCursor).toBe(initial.oldestCursor);
    expect(replay.state.messages[0].capabilities?.reaction?.emoji).toBe("💙");
    expect(replay.state.messages[2].capabilities?.reaction).toBeUndefined();
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/messages/1/public");
    expect(JSON.stringify(replay.state)).not.toContain("UNTRUSTED_WS_BODY");
  });
  it("does not attach a message-less HEART to the last assistant or perform a tool", async () => {
    const initial = createMessageHistoryState("c", [mapMessage(wire("1", "assistant"))]);
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const event = mapRealtimeEvent({ type: "heart_whisper", data: { msg_id: "orphan", content: "PRIVATE" } });
    const result = await reconcileRealtimeEvent(initial, event);
    expect(result.state).toBe(initial);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps loading-only executions unconfirmed and requires the real SSE source", () => {
    let state = createStreamingAssistantAccumulator("overlay", 1);
    state = reduceChatExecutionEvent(state, { type: "start", assistantMessageId: "a" }).accumulator;
    expect(reduceChatExecutionEvent(state, { type: "mcp-loading", messageId: "other", tools: "unknown" }).accumulator.message.toolPending).toBeUndefined();
    const pending = reduceChatExecutionEvent(state, { type: "mcp-loading", messageId: "a", tools: "unknown" }).accumulator.message;
    expect(pending.toolPending).toBe(true);
    expect(pending.content).toBe("");
    expect(pending).not.toHaveProperty("toolResult");
  });
});
