import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatSendController, type ChatSendController } from "./chat-send-controller";
import { createChatExecutionSessions } from "./chat-execution-sessions";
import { composeVisibleChatMessages } from "@/components/chat-workspace/presentation";
import { mapMessage } from "@/domain/message";
import { messageWire } from "@/test-fixtures/main-chat-wire";
import { ApiError } from "@/lib/api";
import type { ChatExecutionEvent, ChatExecutionStream } from "@/application/chat-execution";
import type { ChatSendResult } from "./chat-send-result";

const controllers: ChatSendController[] = [];
afterEach(() => { controllers.splice(0).forEach(controller => controller.dispose()); });
const saved = (id: string, role = "user", owner = "A") => mapMessage(messageWire({ id, conv_id: owner, role, content: "same text", thinking: null, drift: null }));
const receipt = (owner = "A", client = "client-A"): ChatSendResult => ({ conversationId: owner, clientMessageId: client, userMessageId: `${owner}-user`, assistantMessageId: null });
const empty = async () => ({ persistedMessageIds: [], regenerateTarget: null, assistants: [] });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function channel() {
  let wake: (() => void) | undefined, closed = false;
  const values: ChatExecutionEvent[] = [];
  return {
    emit(event: ChatExecutionEvent) { values.push(event); wake?.(); },
    close() { closed = true; wake?.(); },
    async *events() { while (!closed || values.length) { if (values.length) yield values.shift()!; else await new Promise<void>(resolve => { wake = resolve; }); } },
  };
}
const settle = async (predicate: () => boolean) => vi.waitFor(() => expect(predicate()).toBe(true), { interval: 1 });

describe("user acceptance is independent of assistant completion", () => {
  it("replaces the user before headers without finishing the execution, then confirms the real assistant", async () => {
    const headers = deferred<ChatExecutionStream>(), stream = channel();
    const rows = [saved("A-user")];
    const open = vi.fn(() => headers.promise), lookup = vi.fn(async () => receipt());
    const controller = createChatSendController({ createUuid: () => "client-A", openExecution: open, lookupSendResult: lookup,
      reconcileHistory: async () => ({ persistedMessageIds: rows.map(row => row.id), regenerateTarget: null,
        assistants: rows.filter(row => row.roleKind === "assistant").map(row => ({ id: row.id, content: row.content, thinking: null, simpleThink: null })) }),
    }); controllers.push(controller);
    const sending = controller.send({ conversationId: "A", content: "same text", generation: { attachments: ["/uploads/synthetic.png"] } });
    await controller.reconcileUserPersistence();
    expect(controller.getState()).toMatchObject({ kind: "sending-user", optimisticUser: { persistedMessageId: "A-user", clientMessageId: "client-A", attachments: ["/uploads/synthetic.png"] } });
    const visible = () => composeVisibleChatMessages(rows, controller.getState(), "A");
    expect(visible().map(row => [row.kind, row.id, row.executionStatus])).toEqual([["user", "A-user", undefined], ["assistant", "execution:client-A:assistant", "streaming"]]);
    expect(await controller.send({ conversationId: "A", content: "same text" })).toBe(false);
    headers.resolve({ kind: "stream", events: stream.events() }); await sending;
    stream.emit({ type: "start", assistantMessageId: "A-assistant" });
    stream.emit({ type: "chunk", content: "partial" });
    await settle(() => visible().some(row => row.content === "partial"));
    expect(visible().filter(row => row.kind === "user")).toHaveLength(1);
    rows.push(saved("A-assistant", "assistant")); stream.close();
    await settle(() => controller.getState().kind === "idle");
    expect(controller.getState()).toMatchObject({ confirmedSend: { conversationId: "A", clientMessageId: "client-A" } });
    expect(visible().map(row => row.id)).toEqual(["A-user", "A-assistant"]);
    expect(open).toHaveBeenCalledOnce(); expect(lookup).toHaveBeenCalledOnce();
  });

  it.each(["history-first", "receipt-first"])("merges only exact identities with %s and preserves legitimate repeated text", async order => {
    const result = deferred<ChatSendResult>(), stream = channel();
    const controller = createChatSendController({ createUuid: () => "client-A", openExecution: async () => ({ kind: "stream", events: stream.events() }), lookupSendResult: () => result.promise, reconcileHistory: empty });
    controllers.push(controller); await controller.send({ conversationId: "A", content: "same text" });
    let history = order === "history-first" ? [saved("other-user"), saved("A-user")] : [saved("other-user")];
    const read = controller.reconcileUserPersistence();
    if (order === "receipt-first") {
      result.resolve(receipt()); await read;
      expect(composeVisibleChatMessages(history, controller.getState(), "A").filter(row => row.kind === "user")).toHaveLength(2); // Original persisted turn + this unmatched optimistic turn.
      history = [...history, saved("A-user")];
    } else { result.resolve(receipt()); await read; }
    const visible = composeVisibleChatMessages(history, controller.getState(), "A");
    expect(visible.filter(row => row.kind === "user").map(row => row.id)).toEqual(["other-user", "A-user"]);
    expect(controller.getState().kind).toBe("streaming");
    stream.close();
  });

  it.each(["owner", "client", "empty-user"])("ignores a %s receipt mismatch and never guesses from content", async mismatch => {
    const stream = channel(), bad = { ...receipt(), ...(mismatch === "owner" ? { conversationId: "B" } : mismatch === "client" ? { clientMessageId: "other" } : { userMessageId: "" }) };
    const controller = createChatSendController({ createUuid: () => "client-A", openExecution: async () => ({ kind: "stream", events: stream.events() }), lookupSendResult: async () => bad, reconcileHistory: empty });
    controllers.push(controller); await controller.send({ conversationId: "A", content: "same text" }); await controller.reconcileUserPersistence();
    const state = controller.getState();
    expect(state).toMatchObject({ kind: "streaming", optimisticUser: { clientMessageId: "client-A" } });
    expect("optimisticUser" in state && state.optimisticUser).not.toHaveProperty("persistedMessageId");
    expect(composeVisibleChatMessages([saved("A-user")], state, "A").filter(row => row.kind === "user")).toHaveLength(2);
    stream.close();
  });

  it("coalesces concurrent identity reads without polling or changing generation state", async () => {
    const result = deferred<ChatSendResult>(), headers = deferred<ChatExecutionStream>();
    const lookup = vi.fn(() => result.promise), open = vi.fn(() => headers.promise);
    const controller = createChatSendController({ createUuid: () => "client-A", openExecution: open, lookupSendResult: lookup, reconcileHistory: empty }); controllers.push(controller);
    const send = controller.send({ conversationId: "A", content: "same text" });
    const reads = [controller.reconcileUserPersistence(), controller.reconcileUserPersistence()];
    expect(lookup).toHaveBeenCalledOnce();
    result.resolve({ ...receipt(), assistantMessageId: "already-persisted-assistant" }); await Promise.all(reads);
    await controller.reconcileUserPersistence();
    expect(lookup).toHaveBeenCalledOnce(); expect(open).toHaveBeenCalledOnce();
    expect(controller.getState().kind).toBe("sending-user"); // A receipt is not a stream EOF / completion action.
    controller.dispose(); headers.resolve({ kind: "stream", events: channel().events() }); await send;
  });

  it("retains unknown and recovery until the exact assistant is authoritative", async () => {
    let available = false, assistant: string | null = null;
    const rows = [saved("A-user")], open = vi.fn(async () => { throw new ApiError("synthetic disconnect", 0, null, "NETWORK_ERROR"); });
    const controller = createChatSendController({ createUuid: () => "client-A", openExecution: open,
      lookupSendResult: async () => { if (!available) throw new Error("synthetic unavailable"); return { ...receipt(), assistantMessageId: assistant }; },
      reconcileHistory: async () => ({ persistedMessageIds: rows.map(row => row.id), regenerateTarget: null,
        assistants: rows.filter(row => row.roleKind === "assistant").map(row => ({ id: row.id, content: row.content, thinking: null, simpleThink: null })) }),
    }); controllers.push(controller); await controller.send({ conversationId: "A", content: "same text" });
    await settle(() => controller.getState().kind === "finalization-uncertain");
    available = true; await controller.reconcileUserPersistence();
    expect(controller.getState()).toMatchObject({ kind: "finalization-uncertain", executionError: { code: "network" }, optimisticUser: { persistedMessageId: "A-user" } });
    expect(composeVisibleChatMessages(rows, controller.getState(), "A").filter(row => row.kind === "user")).toHaveLength(1);
    await controller.retryFinalization(); expect(controller.getState().kind).toBe("finalization-uncertain");
    expect(await controller.send({ conversationId: "A", content: "same text" })).toBe(false);
    assistant = "A-assistant"; rows.push(saved(assistant, "assistant")); await controller.retryFinalization();
    expect(controller.getState().kind).toBe("idle"); expect(open).toHaveBeenCalledOnce();
  });

  it("isolates late A/B receipts and discards an old execution's result after explicit review", async () => {
    const a1 = deferred<ChatSendResult>(), a2 = deferred<ChatSendResult>(), b = deferred<ChatSendResult>();
    const streams = [channel(), channel(), channel()]; let opens = 0, clients = 0;
    const lookup = vi.fn((owner: string, client: string) => owner === "B" ? b.promise : client === "client-1" ? a1.promise : a2.promise);
    const sessions = createChatExecutionSessions({ createUuid: () => `client-${++clients}`, lookupSendResult: lookup,
      openExecution: async () => ({ kind: "stream", events: streams[opens++].events() }), reconcileHistory: empty,
    });
    const a = sessions.get("A"), bc = sessions.get("B"); controllers.push(a, bc);
    await a.send({ conversationId: "A", content: "same text" }); await bc.send({ conversationId: "B", content: "same text" });
    b.resolve(receipt("B", "client-2")); await sessions.reconcileUserPersistence("B");
    expect(sessions.state("B")).toMatchObject({ kind: "streaming", optimisticUser: { persistedMessageId: "B-user" } });
    streams[0].emit({ type: "start", assistantMessageId: "old-assistant" }); streams[0].close();
    await settle(() => sessions.state("A").kind === "finalization-uncertain");
    a.releaseAfterReview(); await a.send({ conversationId: "A", content: "same text" });
    a1.resolve(receipt("A", "client-1")); await Promise.resolve();
    expect(sessions.state("A")).toMatchObject({ kind: "streaming", optimisticUser: { clientMessageId: "client-3" } });
    expect("optimisticUser" in sessions.state("A") && (sessions.state("A") as { optimisticUser: object }).optimisticUser).not.toHaveProperty("persistedMessageId");
    a2.resolve({ ...receipt("A", "client-3"), userMessageId: "A-user-new" }); await sessions.reconcileUserPersistence("A");
    expect(sessions.state("A")).toMatchObject({ optimisticUser: { persistedMessageId: "A-user-new" } });
    expect(sessions.state("B")).toMatchObject({ optimisticUser: { persistedMessageId: "B-user" } });
    streams[1].close(); streams[2].close();
    expect(opens).toBe(3); // Only the three explicit user actions.
  });
});
