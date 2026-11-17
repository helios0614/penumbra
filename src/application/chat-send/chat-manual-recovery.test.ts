import { describe, expect, it, vi } from "vitest";
import { createChatSendController, createRegeneratePersistenceProjection, isChatExecutionActive, type ChatSendState } from "./index";
import { composeVisibleChatMessages } from "@/components/chat-workspace/presentation";
import { ApiError } from "@/lib/api";
import type { ChatExecutionEvent } from "@/application/chat-execution";
import { mapMessage } from "@/domain/message";
import { messageWire } from "@/test-fixtures/main-chat-wire";

const original = mapMessage(messageWire({ content: "original", thinking: null, drift: null }));
const projection = createRegeneratePersistenceProjection(original);
const partial = "partial[THINKING_START]thinking[THINKING_END][DRIFT:drift]";
async function* events(values: ChatExecutionEvent[]) { yield* values; }
const unknown = (state: ChatSendState) => state.kind === "finalization-uncertain" || state.kind === "regenerate-finalization-uncertain";

function fixture(kind: "send" | "regenerate") {
  let readable = true, committed = false;
  let nextId = 0;
  const openExecution = vi.fn(async () => ({ kind: "stream" as const, events: events([
    { type: "start", assistantMessageId: `assistant-${nextId}`, driftEnabled: true }, { type: "chunk", content: partial },
  ]) }));
  const openRegenerateExecution = vi.fn(async () => ({ kind: "stream" as const, events: events([
    { type: "start", assistantMessageId: original.id, driftEnabled: true }, { type: "chunk", content: partial },
    // A received receipt still needs a matching authoritative HTTP projection.
    { type: "persisted", receipt: { ...projection, content: "replacement" } },
  ]) }));
  const lookupSendResult = vi.fn(async (_owner: string, clientMessageId: string) => ({
    conversationId: "conv_a", clientMessageId, userMessageId: `user:${clientMessageId}`,
    assistantMessageId: committed ? "assistant-1" : null,
  }));
  const reconcileHistory = vi.fn(async () => {
    if (!readable) throw new Error("synthetic read failed");
    const saved = mapMessage(messageWire({ id: "assistant-1", content: "saved", thinking: null, drift: null }));
    return {
      persistedMessageIds: committed ? [original.id, saved.id] : [original.id],
      assistants: committed ? [saved] : [],
      regenerateTarget: committed ? { ...projection, content: "replacement" } : projection,
    };
  });
  const controller = createChatSendController({ openExecution, openRegenerateExecution, lookupSendResult, reconcileHistory, createUuid: () => `client-${++nextId}` });
  const start = () => kind === "send" ? controller.send({ conversationId: "conv_a", content: "question" })
    : controller.regenerate({ conversationId: "conv_a", targetMessageId: original.id, targetCreatedAt: original.createdAt });
  return { controller, start, openExecution, openRegenerateExecution, reconcileHistory,
    readFails: () => { readable = false; }, commit: () => { committed = true; } };
}

describe("CHAT-B1 manual read and explicit release", () => {
  it.each(["send", "regenerate"] as const)("keeps %s partial and execution identity after manual read, without POST", async kind => {
    const f = fixture(kind);
    await f.start(); await vi.waitFor(() => expect(unknown(f.controller.getState())).toBe(true));
    const before = f.controller.getState();
    await f.controller.retryFinalization({ manual: true });
    expect(f.controller.getState()).toEqual(before);
    expect(isChatExecutionActive(f.controller.getState())).toBe(true);
    expect(composeVisibleChatMessages([original], f.controller.getState(), "conv_a")).toContainEqual(expect.objectContaining({ content: "partial", thinking: "thinking", simpleThink: "drift", executionStatus: "unconfirmed" }));
    expect(f.openExecution.mock.calls.length + f.openRegenerateExecution.mock.calls.length).toBe(1);
    f.commit(); await f.controller.retryFinalization({ manual: true });
    expect(f.controller.getState().kind).toBe("idle");
    f.controller.dispose();
  });

  it.each(["send", "regenerate"] as const)("does not reuse a successful %s read after this read fails or while it is pending", async kind => {
    const f = fixture(kind);
    await f.start(); await vi.waitFor(() => expect(unknown(f.controller.getState())).toBe(true));
    let reject!: (error: Error) => void;
    f.reconcileHistory.mockImplementationOnce(() => new Promise((_resolve, rejectRead) => { reject = rejectRead; }));
    const read = f.controller.retryFinalization({ manual: true });
    await vi.waitFor(() => expect(reject).toBeTypeOf("function"));
    f.controller.releaseAfterReview();
    expect(isChatExecutionActive(f.controller.getState())).toBe(true);
    reject(new Error("synthetic read failed")); await read;
    expect(f.controller.getState()).toMatchObject({ recoveryReadSucceeded: false, assistant: { content: "partial", thinking: "thinking", simpleThink: "drift" } });
    f.controller.releaseAfterReview();
    expect(unknown(f.controller.getState())).toBe(true);
    expect(f.openExecution.mock.calls.length + f.openRegenerateExecution.mock.calls.length).toBe(1);
    f.controller.dispose();
  });
  it.each(["send", "regenerate"] as const)("retains explicitly released %s separately and reconciles only its own late result", async kind => {
    const f = fixture(kind);
    await f.start(); await vi.waitFor(() => expect(unknown(f.controller.getState())).toBe(true));
    const before = f.controller.getState();
    f.controller.releaseAfterReview();
    expect(f.controller.getState()).toMatchObject({ kind: "idle", recoveries: [before] });
    expect(f.controller.getState()).not.toHaveProperty("confirmedSend");
    expect(isChatExecutionActive(f.controller.getState())).toBe(false);
    const visible = composeVisibleChatMessages([original], f.controller.getState(), "conv_a");
    expect(visible[0]).toMatchObject({ id: original.id, content: original.content });
    expect(visible).toContainEqual(expect.objectContaining({ content: "partial", thinking: "thinking", simpleThink: "drift", executionStatus: "unconfirmed" }));
    expect(composeVisibleChatMessages([], f.controller.getState(), "conv_b")).toEqual([]);
    let finish!: () => void;
    f.openExecution.mockImplementationOnce(async () => ({ kind: "stream", events: (async function* () {
      yield { type: "start" as const, assistantMessageId: "assistant-2" };
      yield { type: "chunk" as const, content: "next partial" };
      await new Promise<void>(resolve => { finish = resolve; });
    })() }));
    expect(await f.controller.send({ conversationId: "conv_a", content: "next question", generation: { attachments: ["/uploads/next.png"] } })).toBe(true);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    const current = f.controller.getState();
    const reads = f.reconcileHistory.mock.calls.length;
    f.commit(); await Promise.all([f.controller.retryFinalization(), f.controller.retryFinalization({ manual: true })]);
    expect(f.reconcileHistory).toHaveBeenCalledTimes(reads + 1);
    const { recoveries: _released, ...currentExecution } = current;
    expect(f.controller.getState()).toMatchObject(currentExecution);
    expect(f.controller.getState().recoveries).toBeUndefined();
    expect(f.controller.getState()).not.toHaveProperty("confirmedSend");
    expect(f.openExecution.mock.calls.length + f.openRegenerateExecution.mock.calls.length).toBe(2);
    finish(); f.controller.dispose();
  });

  it("keeps a released partial and safe error when subsequent reads fail", async () => {
    const f = fixture("send");
    f.openExecution.mockImplementationOnce(async () => ({ kind: "stream", events: (async function* () {
      yield { type: "start" as const, assistantMessageId: "assistant-1", driftEnabled: true };
      yield { type: "chunk" as const, content: partial };
      throw new Error("synthetic stream failure");
    })() }));
    await f.start(); await vi.waitFor(() => expect(unknown(f.controller.getState())).toBe(true));
    f.controller.releaseAfterReview(); f.readFails();
    await f.controller.retryFinalization({ manual: true });
    expect(f.controller.getState()).toMatchObject({ kind: "idle", recoveries: [{
      executionId: "execution:client-1", recoveryReadSucceeded: false,
      assistant: { content: "partial", thinking: "thinking", simpleThink: "drift" }, executionError: { code: "unknown" },
    }] });
    expect(composeVisibleChatMessages([], f.controller.getState(), "conv_a")).toContainEqual(expect.objectContaining({ content: "partial", executionStatus: "unconfirmed" }));
    expect(f.openExecution).toHaveBeenCalledOnce(); f.controller.dispose();
  });

  it("keeps a reviewed regenerate unknown when its original persisted receipt was never received", async () => {
    const f = fixture("regenerate");
    f.openRegenerateExecution.mockImplementationOnce(async () => ({ kind: "stream", events: events([
      { type: "start", assistantMessageId: original.id, driftEnabled: true }, { type: "chunk", content: partial },
    ]) }));
    await f.start(); await vi.waitFor(() => expect(unknown(f.controller.getState())).toBe(true));
    f.controller.releaseAfterReview(); f.commit(); await f.controller.retryFinalization();
    expect(f.controller.getState()).toMatchObject({ kind: "idle", recoveries: [{
      kind: "regenerate-finalization-uncertain", targetMessageId: original.id, assistant: { content: "partial" },
    }] });
    f.readFails(); await f.controller.retryFinalization();
    const visible = composeVisibleChatMessages([original], f.controller.getState(), "conv_a");
    expect(visible.map(row => row.content)).toEqual(["original", "partial"]);
    expect(f.openRegenerateExecution).toHaveBeenCalledOnce(); f.controller.dispose();
  });

  it("does not clear a new rejected request when the reviewed request finishes later", async () => {
    const f = fixture("send");
    await f.start(); await vi.waitFor(() => expect(unknown(f.controller.getState())).toBe(true));
    f.controller.releaseAfterReview();
    f.openExecution.mockImplementationOnce(async () => { throw new ApiError("synthetic", 422, { detail: { code: "invalid_generation_options", field: "temperature" } }); });
    await f.controller.send({ conversationId: "conv_a", content: "new rejected input" });
    const { recoveries: _previous, ...rejected } = f.controller.getState();
    expect(rejected.kind).toBe("error");
    f.commit(); await f.controller.retryFinalization();
    expect(f.controller.getState()).toMatchObject(rejected);
    expect(f.controller.getState().recoveries).toBeUndefined();
    f.controller.dispose();
  });

});
