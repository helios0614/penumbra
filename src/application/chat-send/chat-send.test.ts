import { describe, expect, it, vi } from "vitest";

import {
  ChatExecutionContractError,
  type ChatExecutionEvent,
  type SendExecutionResult,
} from "@/application/chat-execution";
import {
  appendAssistantChunk,
  type ChatSendExecutionOpener,
  createChatSendController,
  createStreamingAssistantAccumulator,
  flushAssistantAccumulator,
  mapChatSendExecutionInput,
  reduceChatExecutionEvent,
  toSafeChatExecutionError,
} from "@/application/chat-send";
import { ApiError } from "@/lib/api";
import { SseDataError } from "@/lib/sse";

describe("chat send request composition", () => {
  it("sends only content and a stable client ID when no generation UI exists", () => {
    expect(mapChatSendExecutionInput("hello", "client-1")).toEqual({
      content: "hello",
      clientMessageId: "client-1",
    });
  });

  it("preserves explicit false, zero, and null without copying backend defaults", () => {
    expect(mapChatSendExecutionInput("hello", "client-1", {
      temperature: 0,
      contextLimit: 0,
      thinkingEffort: null,
      fastMode: false,
      whisperMode: false,
      attachments: [],
    })).toEqual({
      content: "hello",
      clientMessageId: "client-1",
      temperature: 0,
      contextLimit: 0,
      thinkingEffort: null,
      fastMode: false,
      whisperMode: false,
      attachments: [],
    });
  });

  it("drops model, provider, cache, carryover, and raw history properties", () => {
    const generation = {
      fastMode: false,
      model: "forbidden-model",
      provider: "forbidden-provider",
      cacheKey: "fake-cache-key",
      carryoverMessages: [{ content: "private" }],
      rawHistory: [{ content: "private" }],
    };

    const input = mapChatSendExecutionInput("hello", "client-1", generation);

    expect(input).toEqual({
      content: "hello",
      clientMessageId: "client-1",
      fastMode: false,
    });
    expect(JSON.stringify(input)).not.toMatch(
      /forbidden|fake-cache|carryover|rawHistory/,
    );
  });
});

describe("streaming assistant accumulator", () => {
  it("accumulates content, thinking, and simple thinking across chunk boundaries", () => {
    let accumulator = createStreamingAssistantAccumulator("execution-1", 10);
    for (const chunk of [
      "Hello [THINK",
      "ING_START]private reas",
      "on[THINKING_END] world [SIMPLE",
      "THINK:quiet thought]",
    ]) {
      accumulator = appendAssistantChunk(accumulator, chunk);
    }

    expect(accumulator.message).toMatchObject({
      content: "Hello  world ",
      thinking: "private reason",
      simpleThink: "quiet thought",
    });
    expect(accumulator.pending).toBe("");
  });

  it.each([
    "provider_request_failed",
    "provider_execution_failed",
  ] as const)("classifies %s without adding provider text", (failure) => {
    const accumulator = createStreamingAssistantAccumulator("execution-1", 10);
    const reduction = reduceChatExecutionEvent(accumulator, {
      type: "chunk",
      content: `private provider response ${failure}`,
    });

    expect(reduction.failure).toBe(failure);
    expect(reduction.accumulator.message.content).toBe("");
    expect(JSON.stringify(reduction)).not.toContain("private provider response");
  });

  it("retains only safe usage and failure metadata from debug summary", () => {
    const accumulator = createStreamingAssistantAccumulator("execution-1", 10);
    const reduction = reduceChatExecutionEvent(accumulator, {
      type: "debug-summary",
      messageId: "server-message",
      modelKey: "safe-model",
      hasError: true,
      failureCode: "provider_execution_failed",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });

    expect(reduction.failure).toBe("provider_execution_failed");
    expect(reduction.accumulator.message.usage).toEqual({
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
    });
  });

  it("ignores unknown execution events without retaining their payload", () => {
    const accumulator = createStreamingAssistantAccumulator("execution-1", 10);
    const reduction = reduceChatExecutionEvent(accumulator, {
      type: "unknown",
      rawType: "future_event",
    });

    expect(reduction).toEqual({ accumulator, failure: null });
    expect(JSON.stringify(reduction)).not.toContain("payload");
  });

  it("suppresses an incomplete control prefix at EOF", () => {
    const accumulator = appendAssistantChunk(
      createStreamingAssistantAccumulator("execution-1", 10),
      "answer [THINK",
    );

    expect(flushAssistantAccumulator(accumulator).message.content).toBe(
      "answer ",
    );
  });
});

describe("safe chat execution errors", () => {
  it.each([
    [new ApiError("private", 401), "authentication", "请求失败（HTTP 401）。"],
    [new ApiError("private", 403), "authentication", "请求失败（HTTP 403）。"],
    [httpError(409, "unknown_model"), "unknown-model", "当前会话使用的模型已不可用。"],
    [httpError(422, "invalid_generation_options", "temperature"), "invalid-generation-options", "当前生成参数无效。"],
    [httpError(422, "unsupported_generation_option", "fast_mode"), "unsupported-generation-option", "当前模型不支持所选生成参数。"],
    [httpError(503, "provider_not_configured"), "provider-not-configured", "当前模型服务尚未配置完成。"],
    [new ApiError("private endpoint", 0, {}, "NETWORK_ERROR"), "network", "发送的连接中断，后台可能仍在执行，请重新读取状态。"],
    [new ApiError("private endpoint", 0, {}, "TIMEOUT"), "timeout", "发送的响应等待超时，请重新读取状态确认结果。"],
    [new ChatExecutionContractError("private payload"), "contract", "发送响应暂时无法安全处理。"],
    [new SseDataError("private frame"), "contract", "发送响应暂时无法安全处理。"],
  ])("maps a failure to %s safely", (input, code, message) => {
    const safe = toSafeChatExecutionError(input);
    expect(safe).toMatchObject({ code, message });
    expect(JSON.stringify(safe)).not.toMatch(/private|endpoint|payload|frame/);
  });

  it("keeps only an allowlisted invalid field summary", () => {
    expect(toSafeChatExecutionError(
      httpError(422, "invalid_generation_options", "temperature"),
    ).field).toBe("temperature");
    expect(toSafeChatExecutionError(
      httpError(422, "invalid_generation_options", "private_secret"),
    ).field).toBeNull();
  });
});

describe("chat send controller", () => {
  it("publishes optimistic user immediately, uses one UUID, and blocks double submit", async () => {
    const opened = deferred<SendExecutionResult>();
    const openExecution = vi.fn(() => opened.promise);
    const createUuid = vi.fn(() => "uuid-client-1");
    const persistentHistory = Object.freeze(["persisted-message"]);
    const controller = createChatSendController({
      openExecution,
      reconcileHistory: vi.fn(async () => reconciliation()),
      createUuid,
      now: () => 12,
    });

    const first = controller.send({ conversationId: "conv-a", content: "  hello  " });
    expect(controller.getState()).toEqual({
      kind: "sending-user",
      executionId: "execution:uuid-client-1",
      conversationId: "conv-a",
      optimisticUser: {
        overlayId: "execution:uuid-client-1:user",
        clientMessageId: "uuid-client-1",
        content: "hello",
        createdAt: 12,
      },
    });
    await expect(controller.send({ conversationId: "conv-a", content: "again" }))
      .resolves.toBe(false);
    expect(createUuid).toHaveBeenCalledOnce();
    expect(persistentHistory).toEqual(["persisted-message"]);

    opened.reject(httpError(409, "unknown_model"));
    await expect(first).resolves.toBe(false);
    expect(controller.getState()).toMatchObject({
      kind: "error",
      error: { code: "unknown-model" },
    });
    expect(controller.getState()).not.toHaveProperty("optimisticUser");
  });

  it.each(["", "   \n\t"])("rejects empty content %j before opening execution", async (content) => {
    const openExecution = vi.fn();
    const controller = createChatSendController({
      openExecution,
      reconcileHistory: vi.fn(async () => reconciliation()),
      createUuid: () => "uuid",
    });

    await expect(controller.send({ conversationId: "conv-a", content }))
      .resolves.toBe(false);
    expect(openExecution).not.toHaveBeenCalled();
  });

  it("streams safe presentation data, treats EOF as finalizing, then trusts HTTP reload", async () => {
    const reload = deferred<ReturnType<typeof reconciliation>>();
    const reconcileHistory = vi.fn(() => reload.promise);
    const controller = createChatSendController({
      openExecution: vi.fn(async () => streamResult([
        { type: "start", assistantMessageId: "server-assistant" },
        { type: "chunk", content: "Hello " },
        { type: "chunk", content: "[THINKING_START]reason" },
        { type: "chunk", content: "ing[THINKING_END]world" },
        {
          type: "debug-summary",
          messageId: "server-assistant",
          modelKey: "model-a",
          hasError: false,
          failureCode: null,
          usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
        },
      ])),
      reconcileHistory,
      createUuid: () => "uuid-stream",
      now: () => 20,
    });

    await expect(controller.send({ conversationId: "conv-a", content: "hello" }))
      .resolves.toBe(true);
    await waitFor(() => controller.getState().kind === "finalizing");
    expect(controller.getState()).toMatchObject({
      kind: "finalizing",
      assistant: {
        assistantMessageId: "server-assistant",
        content: "Hello world",
        thinking: "reasoning",
        usage: { totalTokens: 6 },
      },
    });
    expect(reconcileHistory).toHaveBeenCalledWith("conv-a");

    reload.resolve(reconciliation(["server-assistant"]));
    await waitFor(() => controller.getState().kind === "idle");
    expect(controller.getState()).toMatchObject({ kind: "idle" });
  });

  it("keeps send finalization unchanged when a persisted event is present", async () => {
    const reconcileHistory = vi.fn(async () =>
      reconciliation(["server-assistant"])
    );
    const controller = createChatSendController({
      openExecution: vi.fn(async () => streamResult([
        { type: "start", assistantMessageId: "server-assistant" },
        { type: "chunk", content: "temporary send answer" },
        {
          type: "persisted",
          receipt: {
            id: "unrelated-receipt-id",
            content: "must not own send finalization",
            thinking: null,
            simpleThink: null,
          },
        },
      ])),
      reconcileHistory,
      createUuid: () => "uuid-send-receipt-regression",
    });

    await controller.send({ conversationId: "conv-a", content: "hello" });
    await waitFor(() => controller.getState().kind === "idle");
    expect(reconcileHistory).toHaveBeenCalledWith("conv-a");
  });

  it.each([
    "provider_request_failed",
    "provider_execution_failed",
  ] as const)("shows safe %s failure and reconciles partial output", async (marker) => {
    const reload = deferred<ReturnType<typeof reconciliation>>();
    const controller = createChatSendController({
      openExecution: vi.fn(async () => streamResult([
        { type: "start", assistantMessageId: "server-assistant" },
        { type: "chunk", content: "partial answer" },
        { type: "chunk", content: `private provider body ${marker}` },
      ])),
      reconcileHistory: vi.fn(() => reload.promise),
      createUuid: () => `uuid-${marker}`,
    });

    await controller.send({ conversationId: "conv-a", content: "hello" });
    await waitFor(() => controller.getState().kind === "finalizing");
    expect(controller.getState()).toMatchObject({
      assistant: { content: "partial answer" },
      executionError: {
        code: "provider-failure",
        providerFailure: marker,
      },
    });
    expect(JSON.stringify(controller.getState())).not.toContain(
      "private provider body",
    );

    reload.resolve(reconciliation(["server-assistant"]));
    await waitFor(() => controller.getState().kind === "error");
    expect(controller.getState()).toMatchObject({
      kind: "error",
      error: { code: "provider-failure" },
    });
  });

  it("keeps overlay uncertain after reload failure and retries reload without resending", async () => {
    const reconcileHistory = vi.fn()
      .mockRejectedValueOnce(new ApiError("private reload", 500))
      .mockResolvedValueOnce(reconciliation(["server-assistant"]));
    const openExecution = vi.fn<ChatSendExecutionOpener>(async () => streamResult([
      { type: "start", assistantMessageId: "server-assistant" },
      { type: "chunk", content: "temporary answer" },
    ]));
    const controller = createChatSendController({
      openExecution,
      reconcileHistory,
      createUuid: () => "uuid-uncertain",
    });

    await controller.send({ conversationId: "conv-a", content: "hello" });
    await waitFor(() => controller.getState().kind === "finalization-uncertain");
    expect(controller.getState()).toMatchObject({
      kind: "finalization-uncertain",
      executionId: "execution:uuid-uncertain",
      optimisticUser: { clientMessageId: "uuid-uncertain" },
      assistant: { content: "temporary answer" },
      error: { message: "暂时无法确认请求结果，后台可能仍在执行。请只重新读取状态，勿重复发送或重新生成。" },
    });

    await controller.retryFinalization();
    expect(controller.getState()).toMatchObject({ kind: "idle" });
    expect(openExecution).toHaveBeenCalledOnce();
    expect(reconcileHistory).toHaveBeenCalledTimes(2);
    expect(openExecution.mock.calls[0]?.[1]).toMatchObject({
      clientMessageId: "uuid-uncertain",
    });
  });

  it("keeps a normal reply uncertain when HTTP history contains only the user", async () => {
    const controller = createChatSendController({
      openExecution: vi.fn(async () => streamResult([
        { type: "start", assistantMessageId: "expected-assistant" },
        { type: "chunk", content: "temporary answer" },
      ])),
      reconcileHistory: vi.fn(async () => reconciliation(["persisted-user"])),
      createUuid: () => "uuid-user-only",
    });

    await controller.send({ conversationId: "conv-a", content: "hello" });
    await waitFor(() => controller.getState().kind === "finalization-uncertain");
    expect(controller.getState()).toMatchObject({
      kind: "finalization-uncertain",
      assistant: {
        assistantMessageId: "expected-assistant",
        content: "temporary answer",
      },
    });
  });

  it("keeps a normal reply uncertain when SSE never identifies the assistant", async () => {
    const controller = createChatSendController({
      openExecution: vi.fn(async () => streamResult([
        { type: "chunk", content: "temporary answer" },
      ])),
      reconcileHistory: vi.fn(async () => reconciliation(["some-assistant"])),
      createUuid: () => "uuid-no-start",
    });

    await controller.send({ conversationId: "conv-a", content: "hello" });
    await waitFor(() => controller.getState().kind === "finalization-uncertain");
    expect(controller.getState()).toMatchObject({
      kind: "finalization-uncertain",
      assistant: {
        assistantMessageId: null,
        content: "temporary answer",
      },
    });
  });

  it("keeps duplicate user acknowledgement unknown without an assistant result", async () => {
    const reconcileHistory = vi.fn().mockResolvedValue(
      reconciliation(["persisted-user"]),
    );
    const openExecution = vi.fn(async () => ({
      kind: "duplicate" as const,
      userMessageId: "persisted-user",
    }));
    const controller = createChatSendController({
      openExecution,
      reconcileHistory,
      createUuid: () => "uuid-duplicate",
    });

    await expect(controller.send({ conversationId: "conv-a", content: "hello" }))
      .resolves.toBe(true);
    await waitFor(() => controller.getState().kind === "finalization-uncertain");
    expect(openExecution).toHaveBeenCalledOnce();
    expect(reconcileHistory).toHaveBeenCalledOnce();
  });

  it("reconciles a malformed SSE failure before exposing an unknown result", async () => {
    const reconcileHistory = vi.fn().mockResolvedValue(reconciliation());
    const controller = createChatSendController({
      openExecution: vi.fn(async () => ({
        kind: "stream" as const,
        events: throwingEvents(new SseDataError("private malformed frame")),
      })),
      reconcileHistory,
      createUuid: () => "uuid-malformed",
    });

    await controller.send({ conversationId: "conv-a", content: "hello" });
    await waitFor(() => controller.getState().kind === "finalization-uncertain");
    expect(controller.getState()).toMatchObject({
      executionError: { code: "contract" },
    });
    expect(JSON.stringify(controller.getState())).not.toContain("private");
    expect(reconcileHistory).toHaveBeenCalledOnce();
  });
});

function httpError(status: number, code: string, field?: string): ApiError {
  return new ApiError("private backend body", status, {
    detail: { code, field, endpoint: "https://private.example" },
  });
}

function streamResult(events: readonly ChatExecutionEvent[]): SendExecutionResult {
  return { kind: "stream", events: asyncEvents(events) };
}

async function* asyncEvents(
  events: readonly ChatExecutionEvent[],
): AsyncGenerator<ChatExecutionEvent> {
  for (const event of events) yield event;
}

async function* throwingEvents(error: Error): AsyncGenerator<ChatExecutionEvent> {
  throw error;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for chat send state");
}

function reconciliation(persistedMessageIds: readonly string[] = []) {
  return {
    persistedMessageIds,
    regenerateTarget: null,
  };
}
