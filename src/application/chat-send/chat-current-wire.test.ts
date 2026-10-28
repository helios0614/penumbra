import { afterEach, describe, expect, it, vi } from "vitest";
import { mapMessage, mapMessageHistory } from "@/domain/message";
import { mapChatExecutionEvent, openRegenerateExecution } from "@/application/chat-execution";
import { appendAssistantChunk, createStreamingAssistantAccumulator, flushAssistantAccumulator,
  createChatSendController, createRegeneratePersistenceProjection } from "@/application/chat-send";
import { presentChatMessages } from "@/components/chat-workspace/presentation";
import { messageWire, messageWithoutDriftWire } from "@/test-fixtures/main-chat-wire";
import { ApiError } from "@/lib/api";

afterEach(() => vi.unstubAllGlobals());

describe("current HTTP and persisted DRIFT wire", () => {
  it.each(["user", "assistant", "system", "cam_trigger"])("accepts HTTP %s history with omitted empty drift after removal of the physical legacy column", (role) => {
    const wire = messageWithoutDriftWire({ role });
    expect(wire).not.toHaveProperty("drift");
    expect(wire).not.toHaveProperty("simple_think");
    expect(mapMessage(wire)).toMatchObject({ simpleThink: null, thinking: "独立思考", content: "synthetic answer" });
  });

  it("still requires drift or the legacy field in canonical persisted receipts", () => {
    expect(() => mapChatExecutionEvent({ id: "assistant-a", content: "answer", thinking: null }, "persisted")).toThrow();
  });

  it("confirms a null-drift regenerate receipt against HTTP that omits empty drift", async () => {
    const receipt = mapChatExecutionEvent({ id: "assistant-a", content: "new answer", thinking: null, drift: null }, "persisted");
    const committed = mapMessage(messageWithoutDriftWire({ content: "new answer", thinking: null }));
    const controller = createChatSendController({
      openRegenerateExecution: async () => ({ kind: "stream", events: events([
        { type: "start" as const, assistantMessageId: "assistant-a" }, receipt,
      ]) }),
      reconcileHistory: async () => ({ persistedMessageIds: [committed.id], regenerateTarget: createRegeneratePersistenceProjection(committed) }),
      createUuid: () => "omitted-http-drift",
    });
    await controller.regenerate({ conversationId: "conv_a", targetMessageId: "assistant-a", targetCreatedAt: 10 });
    await waitFor(() => controller.getState().kind === "idle");
    controller.dispose();
  });
  it.each([null, "", "canonical drift"])("reads drift=%s without requiring a legacy field", (drift) => {
    expect(mapMessageHistory([messageWire({ drift })])[0]?.simpleThink).toBe(drift);
    expect(mapChatExecutionEvent({ id: "assistant-a", content: "answer", thinking: null, drift }, "persisted"))
      .toMatchObject({ type: "persisted", receipt: { id: "assistant-a", simpleThink: drift } });
  });
  it.each([null, "", "canonical drift"])("canonical presence wins over a conflicting legacy field: %s", (drift) => {
    expect(mapMessage(messageWire({ drift, simple_think: "legacy" })).simpleThink).toBe(drift);
    expect(mapChatExecutionEvent({ id: "assistant-a", content: "answer", thinking: null, drift, simple_think: "legacy" }, "persisted"))
      .toMatchObject({ receipt: { simpleThink: drift } });
  });
  it("accepts legacy only at the wire boundary and rejects malformed canonical rather than falling back", () => {
    const { drift: _drift, ...legacy } = messageWire();
    expect(mapMessage({ ...legacy, simple_think: "old" }).simpleThink).toBe("old");
    expect(() => mapMessage({ ...legacy, drift: false, simple_think: "old" })).toThrow();
    expect(() => mapChatExecutionEvent({ id: "a", content: "ok", thinking: null, drift: false, simple_think: "old" }, "persisted")).toThrow();
  });

  it("pairs a named canonical persisted receipt with HTTP under the original target ID", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      'data: {"type":"start","id":"assistant-a"}\n\n' +
      'data: {"type":"chunk","content":"new[DRIFT:随想]"}\n\n' +
      'event: persisted\ndata: {"id":"assistant-a","content":"new","thinking":null,"drift":"随想"}\n\n',
      { headers: { "content-type": "text/event-stream" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const original = mapMessage(messageWire());
    const committed = mapMessage(messageWire({ content: "new", thinking: null, drift: "随想" }));
    const reconcileHistory = vi.fn(async () => ({ persistedMessageIds: [committed.id], regenerateTarget: createRegeneratePersistenceProjection(committed) }));
    const controller = createChatSendController({ openRegenerateExecution, reconcileHistory, createUuid: () => "synthetic" });
    await controller.regenerate({ conversationId: "conv_a", targetMessageId: original.id, targetCreatedAt: original.createdAt });
    await waitFor(() => controller.getState().kind === "idle");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/conversations/conv_a/messages/assistant-a/regenerate");
    expect(reconcileHistory).toHaveBeenCalledWith("conv_a", "assistant-a");
    expect(original.content).toBe("synthetic answer");
    expect(committed.id).toBe(original.id);
    controller.dispose();
  });
});

describe("stream display control boundaries", () => {
  const controls = ["[THINKING_END]", "[HEART:private]", '[MCP:tool {"list":[1,2],"text":"] secret"}]',
    "[TODO:private]", "[ALARM:private|tomorrow]", "[CAM_CHECK]", "[Location]", "[MEMORY_WRITE:private]", "<meta>private</meta>"];
  it.each(controls)("suppresses %s at every possible chunk split", (control) => {
    const input = `before${control}after`;
    for (let split = 0; split <= input.length; split += 1) {
      let accumulator = createStreamingAssistantAccumulator("synthetic", 0);
      accumulator = appendAssistantChunk(accumulator, input.slice(0, split));
      expect(accumulator.message.content).not.toContain("private");
      accumulator = appendAssistantChunk(accumulator, input.slice(split));
      expect(flushAssistantAccumulator(accumulator).message.content).toBe("beforeafter");
    }
  });
  it("keeps Thinking and DRIFT independent for one-character chunks, including legacy reads", () => {
    let accumulator = createStreamingAssistantAccumulator("synthetic", 0);
    for (const character of "body[DRIFT:随想][THINKING_START]思考[THINKING_END][SIMPLETHINK:兼容]end") {
      accumulator = appendAssistantChunk(accumulator, character);
      expect(accumulator.message.content).not.toMatch(/DRIFT|SIMPLETHINK|随想|思考|兼容/);
    }
    expect(flushAssistantAccumulator(accumulator).message).toMatchObject({ content: "bodyend", thinking: "思考", simpleThink: null });
  });
  it.each(["[DR", "[HEART:private", "[MCP:private", "<meta>private"])("never flushes truncated control content into the body: %s", (suffix) => {
    const accumulator = appendAssistantChunk(createStreamingAssistantAccumulator("synthetic", 0), `body${suffix}`);
    expect(flushAssistantAccumulator(accumulator).message.content).toBe("body");
  });
  it("keeps hidden runtime messages and residual assistant commands out of visible/copy content", () => {
    const result = presentChatMessages([
      mapMessage(messageWire({ role: "cam_trigger", content: "private context" })),
      mapMessage(messageWire({ content: "answer[HEART:private][TODO:private]<meta>private</meta>" })),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.content).toBe("answer");
    expect(JSON.stringify(result)).not.toContain("private");
  });
});

describe("canonical failure and read-only recovery", () => {
  it("does not accept another target's failure as completion of this regenerate", async () => {
    const controller = createChatSendController({
      openRegenerateExecution: async () => ({ kind: "stream", events: events([
        mapChatExecutionEvent({ type: "error", id: "another-target", code: "regenerate_conflict" }),
      ]) }),
      reconcileHistory: async () => ({ persistedMessageIds: ["assistant-a"], regenerateTarget: null }),
      createUuid: () => "wrong-failure-id",
    });
    await controller.regenerate({ conversationId: "conv_a", targetMessageId: "assistant-a", targetCreatedAt: 10 });
    await waitFor(() => controller.getState().kind === "regenerate-finalization-uncertain");
    expect(controller.getState()).toMatchObject({ executionError: { code: "contract" } });
    controller.dispose();
  });

  it("does not release an unknown request before any successful HTTP reread", async () => {
    const openExecution = vi.fn(async () => { throw new ApiError("private", 0, null, "TIMEOUT"); });
    const controller = createChatSendController({ openExecution, createUuid: () => "unknown",
      reconcileHistory: async () => { throw new ApiError("private", 503); } });
    await controller.send({ conversationId: "conv_a", content: "synthetic" });
    await waitFor(() => controller.getState().kind === "finalization-uncertain");
    controller.releaseAfterReview();
    expect(controller.getState().kind).toBe("finalization-uncertain");
    expect(openExecution).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it.each(["provider_execution_failed", "regenerate_conflict", "future_failure"])("handles type:error plus minimal debug for %s without copying raw details", async (code) => {
    const unsafe = { endpoint: "https://private.invalid", api_payload: "fake-secret", prompt_messages: ["private context"] };
    const error = mapChatExecutionEvent({ type: "error", id: "assistant-a", code, ...unsafe });
    const debug = mapChatExecutionEvent({ type: "debug", msg_id: "assistant-a", has_error: true, error_code: code, ...unsafe });
    const controller = createChatSendController({
      openRegenerateExecution: async () => ({ kind: "stream", events: events([error, debug]) }),
      reconcileHistory: async () => ({ persistedMessageIds: ["assistant-a"], regenerateTarget: createRegeneratePersistenceProjection(mapMessage(messageWire())) }),
      createUuid: () => "failure",
    });
    await controller.regenerate({ conversationId: "conv_a", targetMessageId: "assistant-a", targetCreatedAt: 10 });
    await waitFor(() => controller.getState().kind === "error");
    expect(JSON.stringify(controller.getState())).not.toMatch(/fake-secret|private|ContractError/);
    expect(JSON.stringify([error, debug])).not.toMatch(/fake-secret|private/);
    controller.dispose();
  });

  it.each(["TIMEOUT", "NETWORK_ERROR"] as const)("does not infer unsaved user input after opening %s", async (code) => {
    const openExecution = vi.fn(async () => { throw new ApiError("private", 0, null, code); });
    const reconcileHistory = vi.fn(async () => ({ persistedMessageIds: ["already-saved-user"], regenerateTarget: null }));
    const controller = createChatSendController({ openExecution, reconcileHistory, createUuid: () => "stable" });
    expect(await controller.send({ conversationId: "conv_a", content: "user" })).toBe(false);
    await waitFor(() => controller.getState().kind === "finalization-uncertain");
    expect(await controller.send({ conversationId: "conv_a", content: "user" })).toBe(false);
    await controller.retryFinalization();
    expect(openExecution).toHaveBeenCalledOnce();
    expect(reconcileHistory).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toMatchObject({ kind: "finalization-uncertain", recoveryReadSucceeded: true });
    controller.releaseAfterReview();
    expect(controller.getState().kind).toBe("idle");
    expect(openExecution).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it("keeps a broken stream uncertain until HTTP confirms the expected assistant ID", async () => {
    let committed = false;
    const openExecution = vi.fn(async () => ({ kind: "stream" as const, events: (async function* () {
      yield { type: "start" as const, assistantMessageId: "assistant-a" };
      throw new ApiError("private", 0, null, "NETWORK_ERROR");
    })() }));
    const controller = createChatSendController({ openExecution, createUuid: () => "broken",
      reconcileHistory: async () => ({ persistedMessageIds: committed ? ["assistant-a"] : ["saved-user"], regenerateTarget: null }) });
    await controller.send({ conversationId: "conv_a", content: "user" });
    await waitFor(() => controller.getState().kind === "finalization-uncertain");
    committed = true;
    await controller.retryFinalization();
    expect(controller.getState().kind).toBe("idle");
    expect(openExecution).toHaveBeenCalledOnce();
    controller.dispose();
  });
});

async function* events<T>(values: T[]) { for (const value of values) yield value; }
async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Synthetic execution did not reach expected state");
}
