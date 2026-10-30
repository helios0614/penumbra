import { afterEach, describe, expect, it, vi } from "vitest";
import { createDiaryChatRealtime } from "./diary-chat-realtime";
import { mapRealtimeEvent, type RealtimeConnection, type RealtimeEvent } from "@/application/realtime";
import { WebSocketTransportError } from "@/lib/websocket";

function channel() {
  let send!: (value: IteratorResult<RealtimeEvent>) => void;
  const queue: IteratorResult<RealtimeEvent>[] = [];
  let pending = false;
  const put = (value: IteratorResult<RealtimeEvent>) => { if (pending) { pending = false; send(value); } else queue.push(value); };
  const connection: RealtimeConnection = {
    events: { [Symbol.asyncIterator]: () => ({ next: () => queue.length ? Promise.resolve(queue.shift()!) : new Promise(resolve => { pending = true; send = resolve; }) }) },
    closed: Promise.resolve({ code: 1006, reason: "synthetic", wasClean: false, initiatedLocally: false }),
    close: vi.fn(() => put({ done: true, value: undefined })),
  };
  return { connection, emit: (value: RealtimeEvent) => put({ done: false, value }), end: () => put({ done: true, value: undefined }) };
}
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Diary realtime identity boundary", () => {
  it("maps the actual legacy wire into detached Diary identities", () => {
    expect(mapRealtimeEvent({ type: "diary_msg_created", data: { id: "m", entry_id: "e", role: "assistant", content: "dropped", simple_think: "dropped" } })).toEqual({ type: "diary-message-created", entryId: "e", messageId: "m" });
    expect(mapRealtimeEvent({ type: "diary_entry_created", data: { id: "e", date: "2026-10-09", status: "writing", auto_feed_config: "dropped" } })).toEqual({ type: "diary-entry-created", entryId: "e" });
    expect(mapRealtimeEvent({ type: "diary_entry_deleted", data: { id: "e" } })).toEqual({ type: "diary-entry-deleted", entryId: "e" });
    expect(mapRealtimeEvent({ type: "msg_created", data: { id: "m", conv_id: "e" } }).type).toBe("message-created");
    expect(mapRealtimeEvent({ type: "heart_whisper", data: { msg_id: "m" } }).type).toBe("capability-invalidated");
    expect(mapRealtimeEvent({ type: "auto_feed_status_changed", data: { enabled: true } }).type).toBe("unknown");
    expect(() => mapRealtimeEvent({ type: "diary_msg_created", data: { id: "m" } })).toThrow();
  });
  it("reconciles each connection once, reconnects with backoff and stops all work on dispose", async () => {
    vi.useFakeTimers(); const first = channel(), second = channel();
    const open = vi.fn().mockResolvedValueOnce(first.connection).mockResolvedValueOnce(second.connection);
    const controller = { invalidate: vi.fn(), handleEvent: vi.fn() }, state = vi.fn();
    const sync = createDiaryChatRealtime(controller, state, open); await settle();
    expect(controller.invalidate).toHaveBeenCalledTimes(1);
    first.emit({ type: "diary-message-created", entryId: "a", messageId: "m" }); await settle(); expect(controller.handleEvent).toHaveBeenCalledOnce();
    first.end(); await settle(); expect(state).toHaveBeenLastCalledWith("reconnecting");
    await vi.advanceTimersByTimeAsync(999); expect(open).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1); expect(controller.invalidate).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(100_000); expect(controller.invalidate).toHaveBeenCalledTimes(2);
    sync.dispose(); second.emit({ type: "diary-entry-deleted", entryId: "a" }); await settle();
    expect(controller.handleEvent).toHaveBeenCalledOnce(); expect(open.mock.calls[1][0].signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it("closes a connection that opens after unmount", async () => {
    const late = channel(); let resolve!: (value: RealtimeConnection) => void;
    const open = vi.fn(() => new Promise<RealtimeConnection>(yes => { resolve = yes; }));
    const controller = { invalidate: vi.fn(), handleEvent: vi.fn() };
    const sync = createDiaryChatRealtime(controller, vi.fn(), open); sync.dispose(); resolve(late.connection); await settle();
    expect(late.connection.close).toHaveBeenCalledOnce(); expect(controller.invalidate).not.toHaveBeenCalled();
  });
  it("stops automatic reconnect on an authorization close", async () => {
    vi.useFakeTimers(); const open = vi.fn().mockRejectedValue(new WebSocketTransportError("blocked", "CLOSED_BEFORE_OPEN", 1008)), state = vi.fn();
    const sync = createDiaryChatRealtime({ invalidate: vi.fn(), handleEvent: vi.fn() }, state, open); await settle();
    expect(state).toHaveBeenLastCalledWith("blocked"); await vi.advanceTimersByTimeAsync(100_000); expect(open).toHaveBeenCalledOnce(); sync.dispose();
  });
});
