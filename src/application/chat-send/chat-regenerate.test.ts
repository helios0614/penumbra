import { describe, expect, it, vi } from "vitest";

import {
  ChatExecutionContractError,
  type ChatExecutionEvent,
  type ChatExecutionStream,
  type RegeneratePersistenceReceipt,
} from "@/application/chat-execution";
import {
  createRegeneratePersistenceProjection,
  createChatSendController,
  mapChatRegenerateExecutionInput,
  toSafeChatExecutionError,
  type ChatRegenerateExecutionOpener,
  type RegeneratePersistenceProjection,
} from "@/application/chat-send";
import { ApiError } from "@/lib/api";

describe("chat regenerate request composition", () => {
  it("keeps only explicit allowlisted values and preserves zero and false", () => {
    const generation = {
      temperature: 0,
      contextLimit: 0,
      thinkingEffort: null,
      fastMode: false,
      whisperMode: false,
      model: "forbidden-model",
      provider: "forbidden-provider",
      attachments: ["forbidden-attachment"],
      rawHistory: [{ content: "private" }],
      cache: "forbidden-cache",
      carryover: true,
    };

    expect(mapChatRegenerateExecutionInput(generation)).toEqual({
      temperature: 0,
      contextLimit: 0,
      thinkingEffort: null,
      fastMode: false,
      whisperMode: false,
    });
    expect(JSON.stringify(mapChatRegenerateExecutionInput(generation)))
      .not.toMatch(/forbidden|rawHistory|cache|carryover|model|provider/);
  });

  it("does not copy backend defaults when generation UI state is absent", () => {
    expect(mapChatRegenerateExecutionInput()).toEqual({});
  });
});

describe("regenerate persistence projection", () => {
  it("normalizes missing, null, and empty optional text after Domain mapping", () => {
    expect(createRegeneratePersistenceProjection({
      id: "assistant-a",
      content: "answer",
      thinking: undefined,
      simpleThink: "",
    })).toEqual({
      id: "assistant-a",
      content: "answer",
      thinking: null,
      simpleThink: null,
    });

    expect(createRegeneratePersistenceProjection({
      id: "assistant-a",
      content: "answer",
      thinking: null,
      simpleThink: "brief",
    })).toEqual({
      id: "assistant-a",
      content: "answer",
      thinking: null,
      simpleThink: "brief",
    });
  });
});

describe("safe regenerate errors", () => {
  it.each([
    [httpError(404, "regenerate_target_not_found"), "regenerate-target-not-found", "目标回复已不存在。"],
    [httpError(422, "regenerate_target_invalid"), "regenerate-target-invalid", "当前回复不能重新生成。"],
    [httpError(409, "regenerate_target_not_latest"), "regenerate-target-not-latest", "该回复已不是当前最新回复。"],
    [httpError(409, "regenerate_conflict"), "regenerate-conflict", "会话已发生变化，请刷新后重试。"],
    [httpError(409, "unknown_model"), "unknown-model", "当前会话使用的模型已不可用。"],
    [httpError(422, "invalid_generation_options", "temperature"), "invalid-generation-options", "当前生成参数无效。"],
    [httpError(422, "unsupported_generation_option", "fast_mode"), "unsupported-generation-option", "当前模型不支持所选生成参数。"],
    [httpError(503, "provider_not_configured"), "provider-not-configured", "当前模型服务尚未配置完成。"],
    [new ApiError("private", 0, {}, "NETWORK_ERROR"), "network", "重新生成的连接中断，后台可能仍在执行，请重新读取状态。"],
    [new ApiError("private", 0, {}, "TIMEOUT"), "timeout", "重新生成的响应等待超时，请重新读取状态确认结果。"],
    [new ChatExecutionContractError("private"), "contract", "重新生成响应暂时无法安全处理。"],
  ])("maps regenerate failure safely", (error, code, message) => {
    const safe = toSafeChatExecutionError(error, "regenerate");
    expect(safe).toMatchObject({ code, message });
    expect(JSON.stringify(safe)).not.toMatch(/private|endpoint|stack/);
  });
});

describe("unified regenerate execution controller", () => {
  it("shows an empty replacement overlay immediately and blocks send and a second regenerate", async () => {
    const opened = deferred<ChatExecutionStream>();
    const openRegenerateExecution = vi.fn<ChatRegenerateExecutionOpener>(
      () => opened.promise,
    );
    const controller = createChatSendController({
      openRegenerateExecution,
      reconcileHistory: vi.fn(async () => reconciliation(oldTarget())),
      createUuid: () => "uuid-regenerate",
    });

    const first = controller.regenerate(regenerateInput());
    expect(controller.getState()).toMatchObject({
      kind: "regenerate-streaming",
      conversationId: "conv-a",
      targetMessageId: "assistant-a",
      assistant: {
        assistantMessageId: null,
        content: "",
        thinking: null,
        simpleThink: null,
        createdAt: 20,
      },
    });
    await expect(controller.send({ conversationId: "conv-a", content: "new" }))
      .resolves.toBe(false);
    await expect(controller.regenerate(regenerateInput()))
      .resolves.toBe(false);
    expect(openRegenerateExecution).toHaveBeenCalledOnce();

    opened.reject(httpError(409, "regenerate_conflict"));
    await expect(first).resolves.toBe(false);
  });

  it("reuses the SSE accumulator, validates same start ID, and finalizes through HTTP", async () => {
    const reload = deferred<ReturnType<typeof reconciliation>>();
    const reconcileHistory = vi.fn(() => reload.promise);
    const openRegenerateExecution = vi.fn<ChatRegenerateExecutionOpener>(
      async () => stream([
        { type: "start", assistantMessageId: "assistant-a" },
        { type: "chunk", content: "new [THINK" },
        { type: "chunk", content: "ING_START]reason" },
        { type: "chunk", content: "ing[THINKING_END] answer [SIMPLE" },
        { type: "chunk", content: "THINK:brief]" },
        persistedReceipt({
          id: "assistant-a",
          content: "new  answer ",
          thinking: "reasoning",
          simpleThink: "brief",
        }),
        { type: "unknown", rawType: "future-event" },
      ]),
    );
    const controller = createChatSendController({
      openRegenerateExecution,
      reconcileHistory,
      createUuid: () => "uuid-success",
    });

    await expect(controller.regenerate(regenerateInput())).resolves.toBe(true);
    await waitFor(() => controller.getState().kind === "regenerate-finalizing");
    expect(controller.getState()).toMatchObject({
      kind: "regenerate-finalizing",
      targetMessageId: "assistant-a",
      assistant: {
        assistantMessageId: "assistant-a",
        content: "new  answer ",
        thinking: "reasoning",
        simpleThink: "brief",
      },
    });
    expect(openRegenerateExecution).toHaveBeenCalledWith(
      "conv-a",
      "assistant-a",
      {},
      { signal: expect.any(AbortSignal) },
    );
    expect(reconcileHistory).toHaveBeenCalledWith("conv-a", "assistant-a");

    reload.resolve(reconciliation({
      id: "assistant-a",
      content: "new  answer ",
      thinking: "reasoning",
      simpleThink: "brief",
    }, ["user-a", "assistant-a"]));
    await waitFor(() => controller.getState().kind === "idle");
  });

  it("keeps a receipt execution-owned until EOF and does not replace the streaming overlay", async () => {
    const finishStream = deferred<void>();
    let receiptYielded = false;
    const reconcileHistory = vi.fn(async () => reconciliation({
      id: "assistant-a",
      content: "canonical answer",
      thinking: null,
      simpleThink: null,
    }));
    const controller = createChatSendController({
      openRegenerateExecution: vi.fn(async () => ({
        kind: "stream" as const,
        events: (async function* () {
          yield { type: "start", assistantMessageId: "assistant-a" } as const;
          yield {
            type: "chunk",
            content: "raw answer<meta>private metadata</meta>",
          } as const;
          yield persistedReceipt({
            id: "assistant-a",
            content: "canonical answer",
            thinking: null,
            simpleThink: null,
          });
          receiptYielded = true;
          await finishStream.promise;
        })(),
      })),
      reconcileHistory,
      createUuid: () => "uuid-receipt-owned",
    });

    await controller.regenerate(regenerateInput());
    await waitFor(() => receiptYielded);
    expect(controller.getState()).toMatchObject({
      kind: "regenerate-streaming",
      assistant: { content: "raw answer" },
    });
    expect(reconcileHistory).not.toHaveBeenCalled();

    finishStream.resolve();
    await waitFor(() => controller.getState().kind === "idle");
    expect(reconcileHistory).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "meta cleanup",
      "到家了跟我说，我提醒你点渔粉 🐟\n" +
        "<meta>发送时间：8月10日 17:59</meta>",
      "到家了跟我说，我提醒你点渔粉 🐟",
    ],
    [
      "canonical TODO cleanup",
      "hello [TODO:follow up]",
      "hello",
    ],
  ] as const)("confirms %s from cleaned receipt and matching HTTP", async (
    _label,
    rawContent,
    canonicalContent,
  ) => {
    const canonical = {
      id: "assistant-a",
      content: canonicalContent,
      thinking: null,
      simpleThink: null,
    } as const;
    const controller = createChatSendController({
      openRegenerateExecution: vi.fn(async () => stream([
        { type: "start", assistantMessageId: "assistant-a" },
        { type: "chunk", content: rawContent },
        persistedReceipt(canonical),
      ])),
      reconcileHistory: vi.fn(async () => reconciliation(canonical)),
      createUuid: () => "uuid-cleanup",
    });

    await controller.regenerate(regenerateInput());
    await waitFor(() => controller.getState().kind === "idle");
  });

  it("normalizes empty optional receipt text before comparing HTTP", async () => {
    const controller = createChatSendController({
      openRegenerateExecution: vi.fn(async () => stream([
        { type: "start", assistantMessageId: "assistant-a" },
        { type: "chunk", content: "new answer" },
        persistedReceipt({
          id: "assistant-a",
          content: "new answer",
          thinking: "",
          simpleThink: "",
        }),
      ])),
      reconcileHistory: vi.fn(async () => reconciliation({
        id: "assistant-a",
        content: "new answer",
        thinking: null,
        simpleThink: null,
      })),
      createUuid: () => "uuid-normalized-receipt",
    });

    await controller.regenerate(regenerateInput());
    await waitFor(() => controller.getState().kind === "idle");
  });

  it("stays uncertain without a receipt across successful HTTP reloads", async () => {
    const reconcileHistory = vi.fn(async () => reconciliation(oldTarget()));
    const openRegenerateExecution = vi.fn<ChatRegenerateExecutionOpener>(
      async () => stream([
        { type: "start", assistantMessageId: "assistant-a" },
        { type: "chunk", content: "new answer" },
      ]),
    );
    const controller = createChatSendController({
      openRegenerateExecution,
      reconcileHistory,
      createUuid: () => "uuid-same-id-old-content",
    });

    await controller.regenerate(regenerateInput());
    await waitFor(() =>
      controller.getState().kind === "regenerate-finalization-uncertain"
    );
    expect(controller.getState()).toMatchObject({
      kind: "regenerate-finalization-uncertain",
      targetMessageId: "assistant-a",
      assistant: { content: "new answer" },
    });

    await controller.retryFinalization();
    expect(controller.getState().kind).toBe(
      "regenerate-finalization-uncertain",
    );
    expect(openRegenerateExecution).toHaveBeenCalledOnce();
    expect(reconcileHistory).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      "content",
      [{ type: "chunk", content: "new answer" }] satisfies ChatExecutionEvent[],
      {
        id: "assistant-a",
        content: "new answer",
        thinking: null,
        simpleThink: null,
      },
      {
        id: "assistant-a",
        content: "different persisted answer",
        thinking: null,
        simpleThink: null,
      },
    ],
    [
      "thinking",
      [{
        type: "chunk",
        content: "new answer[THINKING_START]expected thought[THINKING_END]",
      }] satisfies ChatExecutionEvent[],
      {
        id: "assistant-a",
        content: "new answer",
        thinking: "expected thought",
        simpleThink: null,
      },
      {
        id: "assistant-a",
        content: "new answer",
        thinking: "different persisted thought",
        simpleThink: null,
      },
    ],
    [
      "simpleThink",
      [{
        type: "chunk",
        content: "new answer[SIMPLETHINK:expected brief]",
      }] satisfies ChatExecutionEvent[],
      {
        id: "assistant-a",
        content: "new answer",
        thinking: null,
        simpleThink: "expected brief",
      },
      {
        id: "assistant-a",
        content: "new answer",
        thinking: null,
        simpleThink: "different persisted brief",
      },
    ],
  ] as const)("keeps the replacement uncertain on %s mismatch", async (
    _field,
    chunks,
    receipt,
    persisted,
  ) => {
    const controller = createChatSendController({
      openRegenerateExecution: vi.fn(async () => stream([
        { type: "start", assistantMessageId: "assistant-a" },
        ...chunks,
        persistedReceipt(receipt),
      ])),
      reconcileHistory: vi.fn(async () => reconciliation(persisted)),
      createUuid: () => "uuid-semantic-mismatch",
    });

    await controller.regenerate(regenerateInput());
    await waitFor(() =>
      controller.getState().kind === "regenerate-finalization-uncertain"
    );
  });

  it("confirms identical regenerate output when receipt and HTTP match", async () => {
    const identical = {
      id: "assistant-a",
      content: "same answer",
      thinking: null,
      simpleThink: null,
    } as const;
    const controller = createChatSendController({
      openRegenerateExecution: vi.fn(async () => stream([
        { type: "start", assistantMessageId: "assistant-a" },
        { type: "chunk", content: "same answer" },
        persistedReceipt(identical),
      ])),
      reconcileHistory: vi.fn(async () => reconciliation(identical)),
      createUuid: () => "uuid-identical-receipt",
    });

    await controller.regenerate(regenerateInput());
    await waitFor(() => controller.getState().kind === "idle");
  });

  it.each([
    ["mismatched start", [
      { type: "start", assistantMessageId: "different-assistant" },
      { type: "chunk", content: "temporary" },
    ] satisfies readonly ChatExecutionEvent[]],
    ["missing start", [
      { type: "chunk", content: "temporary" },
    ] satisfies readonly ChatExecutionEvent[]],
  ] as const)("treats %s as a contract failure and never succeeds regenerate", async (_label, events) => {
    const controller = createChatSendController({
      openRegenerateExecution: vi.fn(async () => stream(events)),
      reconcileHistory: vi.fn(async () => reconciliation(oldTarget())),
      createUuid: () => "uuid-contract",
    });

    await controller.regenerate(regenerateInput());
    await waitFor(() => controller.getState().kind === "regenerate-finalization-uncertain");
    expect(controller.getState()).toMatchObject({
      executionError: { code: "contract" },
    });
  });

  it("treats a receipt ID mismatch as a contract failure and finalization uncertain", async () => {
    const reconcileHistory = vi.fn(async () => reconciliation({
      id: "assistant-a",
      content: "new answer",
      thinking: null,
      simpleThink: null,
    }));
    const controller = createChatSendController({
      openRegenerateExecution: vi.fn(async () => stream([
        { type: "start", assistantMessageId: "assistant-a" },
        { type: "chunk", content: "new answer" },
        persistedReceipt({
          id: "different-assistant",
          content: "new answer",
          thinking: null,
          simpleThink: null,
        }),
      ])),
      reconcileHistory,
      createUuid: () => "uuid-receipt-id-mismatch",
    });

    await controller.regenerate(regenerateInput());
    await waitFor(() =>
      controller.getState().kind === "regenerate-finalization-uncertain"
    );
    expect(controller.getState()).toMatchObject({
      kind: "regenerate-finalization-uncertain",
      executionError: { code: "contract" },
      assistant: { content: "new answer" },
    });
    expect(reconcileHistory).toHaveBeenCalledWith("conv-a", "assistant-a");
  });

  it.each([
    "provider_request_failed",
    "provider_execution_failed",
  ] as const)("keeps %s partial content temporary and reloads the unchanged target", async (marker) => {
    const reload = deferred<ReturnType<typeof reconciliation>>();
    const reconcileHistory = vi.fn(() => reload.promise);
    const controller = createChatSendController({
      openRegenerateExecution: vi.fn(async () => stream([
        { type: "start", assistantMessageId: "assistant-a" },
        { type: "chunk", content: "temporary partial" },
        { type: "chunk", content: marker.slice(0, 12) },
        { type: "chunk", content: marker.slice(12) },
      ])),
      reconcileHistory,
      createUuid: () => `uuid-${marker}`,
    });

    await controller.regenerate(regenerateInput());
    await waitFor(() =>
      controller.getState().kind === "regenerate-finalizing"
    );
    expect(controller.getState()).toMatchObject({
      assistant: { content: "temporary partial" },
      executionError: { code: "provider-failure", providerFailure: marker },
    });
    const finalizingState = controller.getState();
    if (finalizingState.kind === "regenerate-finalizing") {
      expect(finalizingState.assistant.content).not.toContain("provider_");
    }

    reload.resolve(reconciliation(oldTarget()));
    await waitFor(() => controller.getState().kind === "error");
    expect(controller.getState()).toMatchObject({
      error: { code: "provider-failure", providerFailure: marker },
    });
    expect(controller.getState()).toMatchObject({ regeneratePartial: { content: "temporary partial" } });
    expect(reconcileHistory).toHaveBeenCalledOnce();
  });

  it("keeps the replacement uncertain on reload failure and retries only HTTP history", async () => {
    const reconcileHistory = vi.fn()
      .mockRejectedValueOnce(new ApiError("private reload", 500))
      .mockResolvedValueOnce(reconciliation({
        id: "assistant-a",
        content: "temporary replacement",
        thinking: null,
        simpleThink: null,
      }));
    const openRegenerateExecution = vi.fn<ChatRegenerateExecutionOpener>(
      async () => stream([
        { type: "start", assistantMessageId: "assistant-a" },
        { type: "chunk", content: "temporary replacement" },
        persistedReceipt({
          id: "assistant-a",
          content: "temporary replacement",
          thinking: null,
          simpleThink: null,
        }),
      ]),
    );
    const controller = createChatSendController({
      openRegenerateExecution,
      reconcileHistory,
      createUuid: () => "uuid-uncertain",
    });

    await controller.regenerate(regenerateInput());
    await waitFor(() =>
      controller.getState().kind === "regenerate-finalization-uncertain"
    );
    expect(controller.getState()).toMatchObject({
      kind: "regenerate-finalization-uncertain",
      targetMessageId: "assistant-a",
      assistant: { content: "temporary replacement" },
      error: { message: "暂时无法确认请求结果，后台可能仍在执行。请只重新读取状态，勿重复发送或重新生成。" },
    });

    await controller.retryFinalization();
    expect(controller.getState()).toEqual({ kind: "idle" });
    expect(openRegenerateExecution).toHaveBeenCalledOnce();
    expect(reconcileHistory).toHaveBeenCalledTimes(2);
  });

  it("retries only HTTP after a mismatch and confirms the saved receipt", async () => {
    const expected = {
      id: "assistant-a",
      content: "new answer",
      thinking: "new thought",
      simpleThink: "new brief",
    } as const;
    const reconcileHistory = vi.fn()
      .mockResolvedValueOnce(reconciliation(oldTarget()))
      .mockResolvedValueOnce(reconciliation(expected));
    const openRegenerateExecution = vi.fn<ChatRegenerateExecutionOpener>(
      async () => stream([
        { type: "start", assistantMessageId: "assistant-a" },
        {
          type: "chunk",
          content: "new answer[THINKING_START]new thought[THINKING_END]" +
            "[SIMPLETHINK:new brief]",
        },
        persistedReceipt(expected),
      ]),
    );
    const controller = createChatSendController({
      openRegenerateExecution,
      reconcileHistory,
      createUuid: () => "uuid-mismatch-retry",
    });

    await controller.regenerate(regenerateInput());
    await waitFor(() =>
      controller.getState().kind === "regenerate-finalization-uncertain"
    );
    expect(controller.getState()).toMatchObject({
      assistant: {
        content: expected.content,
        thinking: expected.thinking,
        simpleThink: expected.simpleThink,
      },
    });

    await controller.retryFinalization();
    expect(controller.getState()).toEqual({ kind: "idle" });
    expect(openRegenerateExecution).toHaveBeenCalledOnce();
    expect(reconcileHistory).toHaveBeenCalledTimes(2);
    expect(reconcileHistory).toHaveBeenNthCalledWith(
      2,
      "conv-a",
      "assistant-a",
    );
  });

  it("remains uncertain when successful SSE cannot find the same target ID in HTTP history", async () => {
    const controller = createChatSendController({
      openRegenerateExecution: vi.fn(async () => stream([
        { type: "start", assistantMessageId: "assistant-a" },
        { type: "chunk", content: "temporary replacement" },
        persistedReceipt({
          id: "assistant-a",
          content: "temporary replacement",
          thinking: null,
          simpleThink: null,
        }),
      ])),
      reconcileHistory: vi.fn(async () => reconciliation(
        null,
        ["different-assistant"],
      )),
      createUuid: () => "uuid-missing-target",
    });

    await controller.regenerate(regenerateInput());
    await waitFor(() =>
      controller.getState().kind === "regenerate-finalization-uncertain"
    );
  });

  it.each([
    [404, "regenerate_target_not_found", "regenerate-target-not-found"],
    [422, "regenerate_target_invalid", "regenerate-target-invalid"],
    [409, "regenerate_target_not_latest", "regenerate-target-not-latest"],
    [409, "regenerate_conflict", "regenerate-conflict"],
  ] as const)("removes preflight overlay for canonical HTTP %s %s", async (status, backendCode, safeCode) => {
    const openRegenerateExecution = vi.fn<ChatRegenerateExecutionOpener>(
      async () => Promise.reject(httpError(status, backendCode)),
    );
    const reconcileHistory = vi.fn(async () => reconciliation(oldTarget()));
    const controller = createChatSendController({
      openRegenerateExecution,
      reconcileHistory,
      createUuid: () => "uuid-preflight",
    });

    await expect(controller.regenerate(regenerateInput())).resolves.toBe(false);
    expect(controller.getState()).toMatchObject({
      kind: "error",
      error: { code: safeCode },
    });
    expect(controller.getState()).not.toHaveProperty("assistant");
    expect(reconcileHistory).toHaveBeenCalledOnce();
  });
});

function regenerateInput() {
  return {
    conversationId: "conv-a",
    targetMessageId: "assistant-a",
    targetCreatedAt: 20,
  };
}

function persistedReceipt(
  receipt: RegeneratePersistenceReceipt,
): ChatExecutionEvent {
  return { type: "persisted", receipt };
}

function oldTarget() {
  return {
    id: "assistant-a",
    content: "old answer",
    thinking: null,
    simpleThink: null,
  } as const;
}

function reconciliation(
  regenerateTarget: RegeneratePersistenceProjection | null,
  persistedMessageIds: readonly string[] = regenerateTarget === null
    ? []
    : [regenerateTarget.id],
) {
  return { persistedMessageIds, regenerateTarget };
}

function httpError(status: number, code: string, field?: string): ApiError {
  return new ApiError("private backend body", status, {
    detail: { code, field, endpoint: "https://private.example" },
  });
}

function stream(events: readonly ChatExecutionEvent[]): ChatExecutionStream {
  return { kind: "stream", events: asyncEvents(events) };
}

async function* asyncEvents(
  events: readonly ChatExecutionEvent[],
): AsyncGenerator<ChatExecutionEvent> {
  for (const event of events) yield event;
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
  throw new Error("Timed out waiting for regenerate state");
}
