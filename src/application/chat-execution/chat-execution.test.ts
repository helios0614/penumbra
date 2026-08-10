import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as chatExecution from "@/application/chat-execution";
import {
  ChatExecutionContractError,
  mapChatExecutionEvent,
  mapDuplicateSendAcknowledgement,
  mapRegenerateQuery,
  mapSendMessageRequest,
  openRegenerateExecution,
  openSendExecution,
  type ChatExecutionEvent,
  type ChatExecutionStream,
  type SendExecutionResult,
} from "@/application/chat-execution";
import { ApiError } from "@/lib/api";
import { SseDataError, SseFramingError } from "@/lib/sse";

describe("Chat execution request contracts", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("maps the minimal send body without copying backend defaults", () => {
    expect(mapSendMessageRequest({ content: "" })).toEqual({ content: "" });
    expect(mapSendMessageRequest({ content: "  exact text  " })).toEqual({
      content: "  exact text  ",
    });
  });

  it("maps every explicit allowlisted send option, including false, zero, null, attachments, and client ID", () => {
    expect(
      mapSendMessageRequest({
        content: "hello",
        contextLimit: 0,
        attachments: ["/upload/a b.png", "https://example.test/a"],
        whisperMode: false,
        fastMode: false,
        temperature: null,
        thinkingEffort: null,
        clientMessageId: null,
      }),
    ).toEqual({
      content: "hello",
      context_limit: 0,
      attachments: ["/upload/a b.png", "https://example.test/a"],
      whisper_mode: false,
      fast_mode: false,
      temperature: null,
      thinking_effort: null,
      client_msg_id: null,
    });

    expect(
      mapSendMessageRequest({
        content: "hello",
        temperature: 0,
        thinkingEffort: "",
        clientMessageId: "",
      }),
    ).toMatchObject({
      temperature: 0,
      thinking_effort: "",
      client_msg_id: "",
    });
  });

  it("creates a fresh allowlisted request and drops legacy or internal input", () => {
    const unsafeInput = {
      content: "now",
      attachments: ["/upload/a.png"],
      carryoverMessages: [{ content: "past" }],
      model: "forbidden-model",
      provider: "forbidden-provider",
      cacheMetadata: { secret: "fake-cache-secret" },
      rawHistory: [{ content: "fake-history" }],
      providerSecret: "fake-secret",
      rawPrompt: "fake-prompt",
    };

    const request = mapSendMessageRequest(unsafeInput);
    unsafeInput.attachments.push("later");

    expect(request).toEqual({
      content: "now",
      attachments: ["/upload/a.png"],
    });
    expect(JSON.stringify(request)).not.toContain("fake-secret");
    expect(JSON.stringify(request)).not.toContain("fake-prompt");
  });

  it("rejects unsafe send inputs without echoing content or attachment URLs", () => {
    const fakeContent = "fake-sensitive-content";
    const fakeUrl = "https://secret.example/fake-token";
    const invalidInputs: unknown[] = [
      null,
      {},
      { content: 1 },
      { content: fakeContent, contextLimit: Number.NaN },
      { content: fakeContent, temperature: Number.POSITIVE_INFINITY },
      { content: fakeContent, attachments: [fakeUrl, 1] },
      { content: fakeContent, whisperMode: 0 },
      { content: fakeContent, fastMode: "false" },
      { content: fakeContent, thinkingEffort: 1 },
      { content: fakeContent, clientMessageId: 1 },
    ];

    for (const input of invalidInputs) {
      const error = captureError(() =>
        mapSendMessageRequest(input as Parameters<typeof mapSendMessageRequest>[0]),
      );
      expect(error).toBeInstanceOf(ChatExecutionContractError);
      expect(String(error)).not.toContain(fakeContent);
      expect(String(error)).not.toContain(fakeUrl);
      expect(String(error)).not.toContain("fake-token");
    }
  });

  it("maps regenerate query without a body and preserves false, zero, and empty strings", async () => {
    const query = mapRegenerateQuery({
      contextLimit: 0,
      whisperMode: false,
      fastMode: false,
      temperature: 0,
      thinkingEffort: "",
    });
    expect(query.toString()).toBe(
      "context_limit=0&whisper_mode=false&fast_mode=false&temperature=0&thinking_effort=",
    );
    expect(
      mapRegenerateQuery({ temperature: null, thinkingEffort: null }).toString(),
    ).toBe("");

    fetchMock.mockResolvedValue(sseResponse([]));
    const result = await openRegenerateExecution(
      "conv /?#",
      "message /?#",
      {
        contextLimit: 0,
        whisperMode: false,
        fastMode: false,
        temperature: 0,
        thinkingEffort: "",
      },
      { timeoutMs: 0 },
    );
    await collectEvents(result.events);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/conversations/conv%20%2F%3F%23/messages/message%20%2F%3F%23/regenerate?context_limit=0&whisper_mode=false&fast_mode=false&temperature=0&thinking_effort=",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  it("omits an empty regenerate query and rejects non-finite or wrongly typed values", async () => {
    expect(mapRegenerateQuery().toString()).toBe("");
    for (const input of [
      { contextLimit: Number.NaN },
      { temperature: Number.NEGATIVE_INFINITY },
      { whisperMode: 0 },
      { fastMode: "false" },
      { thinkingEffort: 1 },
    ]) {
      expect(() => mapRegenerateQuery(input as never)).toThrow(
        ChatExecutionContractError,
      );
    }

    fetchMock.mockResolvedValue(sseResponse([]));
    const result = await openRegenerateExecution(
      "conv_1",
      "assistant_1",
      undefined,
      { timeoutMs: 0 },
    );
    await collectEvents(result.events);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/conversations/conv_1/messages/assistant_1/regenerate",
    );
  });

  it("URL-encodes the conversation segment and sends only the mapped JSON body through shared transport", async () => {
    fetchMock.mockResolvedValue(duplicateResponse());

    await expect(
      openSendExecution(
        "conv /?#",
        {
          content: "hello",
          fastMode: false,
          temperature: 0,
          clientMessageId: "client_1",
        },
        { timeoutMs: 0, headers: { "x-chat-test": "request" } },
      ),
    ).resolves.toEqual({ kind: "duplicate", userMessageId: "user_1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/conv%20%2F%3F%23/send",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        body: JSON.stringify({
          content: "hello",
          fast_mode: false,
          temperature: 0,
          client_msg_id: "client_1",
        }),
        signal: expect.any(AbortSignal),
      }),
    );
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("accept")).toBe("text/event-stream, application/json");
    expect(headers.get("x-chat-test")).toBe("request");
  });

  it("rejects empty conversation IDs before opening a request", async () => {
    await expect(
      openSendExecution("  ", { content: "secret" }, { timeoutMs: 0 }),
    ).rejects.toBeInstanceOf(ChatExecutionContractError);
    await expect(
      openRegenerateExecution("", "assistant_1", {}, { timeoutMs: 0 }),
    ).rejects.toBeInstanceOf(ChatExecutionContractError);
    await expect(
      openRegenerateExecution("conv_1", "", {}, { timeoutMs: 0 }),
    ).rejects.toBeInstanceOf(ChatExecutionContractError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Chat execution media type and duplicate response", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it.each([
    "text/event-stream",
    "text/event-stream; charset=utf-8",
    "TEXT/EVENT-STREAM; Charset=UTF-8",
    "text/event-stream ; boundary=ignored; charset=utf-8",
  ])("accepts SSE media type %s without exact string matching", async (contentType) => {
    fetchMock.mockResolvedValue(
      sseResponse([{ type: "chunk", content: "ok" }], contentType),
    );

    const result = await openSendExecution(
      "conv_1",
      { content: "hello" },
      { timeoutMs: 0 },
    );
    expect(await collectSendResult(result)).toEqual([
      { type: "chunk", content: "ok" },
    ]);
  });

  it.each([
    "application/json",
    "application/json; charset=utf-8",
    "APPLICATION/JSON ; Charset=UTF-8",
  ])("accepts duplicate JSON media type %s", async (contentType) => {
    fetchMock.mockResolvedValue(duplicateResponse({}, contentType));

    await expect(
      openSendExecution(
        "conv_1",
        { content: "hello" },
        { timeoutMs: 0 },
      ),
    ).resolves.toEqual({ kind: "duplicate", userMessageId: "user_1" });
  });

  it.each([undefined, "text/plain", "application/problem+json"])(
    "rejects a missing or unsupported send media type %s and cancels the body",
    async (contentType) => {
      const cancel = vi.fn();
      fetchMock.mockResolvedValue(
        streamResponse(
          new ReadableStream<Uint8Array>({ cancel }),
          contentType,
        ),
      );

      await expect(
        openSendExecution(
          "conv_1",
          { content: "hello" },
          { timeoutMs: 0 },
        ),
      ).rejects.toBeInstanceOf(ChatExecutionContractError);
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  it("accepts only SSE for regenerate and cancels a JSON body", async () => {
    const cancel = vi.fn();
    fetchMock.mockResolvedValue(
      streamResponse(new ReadableStream<Uint8Array>({ cancel }), "application/json"),
    );

    await expect(
      openRegenerateExecution("conv_1", "assistant_1", {}, { timeoutMs: 0 }),
    ).rejects.toBeInstanceOf(ChatExecutionContractError);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("maps a valid duplicate acknowledgement, its ID, and no extra fields", async () => {
    const payload = {
      ok: true,
      msg_id: "server-user-message-id",
      duplicate: true,
      assistant: { persisted: true },
      role: "user",
      content: "must disappear",
    };
    expect(mapDuplicateSendAcknowledgement(payload)).toEqual({
      kind: "duplicate",
      userMessageId: "server-user-message-id",
    });

    fetchMock.mockResolvedValue(duplicateResponse(payload));
    const result = await openSendExecution(
      "conv_1",
      { content: "hello" },
      { timeoutMs: 0 },
    );
    expect(result).toEqual({
      kind: "duplicate",
      userMessageId: "server-user-message-id",
    });
    expect(result).not.toHaveProperty("role");
    expect(result).not.toHaveProperty("content");
    expect(result).not.toHaveProperty("assistant");
  });

  it.each([
    { ok: false, msg_id: "msg_1", duplicate: true },
    { ok: true, msg_id: "msg_1", duplicate: false },
    { ok: true, duplicate: true },
    { ok: true, msg_id: "", duplicate: true },
    { ok: true, msg_id: "   ", duplicate: true },
    { ok: true, msg_id: 1, duplicate: true },
    [],
    null,
  ])("rejects a non-acknowledgement JSON success shape", async (payload) => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json" },
      }),
    );
    const error = await openSendExecution(
      "conv_1",
      { content: "private-content" },
      { timeoutMs: 0 },
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ChatExecutionContractError);
    expect(String(error)).not.toContain("private-content");
    expect(String(error)).not.toContain(JSON.stringify(payload));
  });

  it("rejects malformed JSON and invalid UTF-8 without retaining raw bodies", async () => {
    const fakeToken = "fake-json-token";
    fetchMock
      .mockResolvedValueOnce(
        bytesResponse(
          [encode(`{"ok":true,"token":"${fakeToken}`)],
          "application/json",
        ),
      )
      .mockResolvedValueOnce(
        bytesResponse(
          [new Uint8Array([0x7b, 0xff, 0x7d])],
          "application/json",
        ),
      );

    for (let index = 0; index < 2; index += 1) {
      const error = await openSendExecution(
        "conv_1",
        { content: "hello" },
        { timeoutMs: 0 },
      ).catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(ChatExecutionContractError);
      expect(String(error)).not.toContain(fakeToken);
      expect(error).not.toHaveProperty("body");
      expect(error).not.toHaveProperty("data");
    }
  });

  it("bounds the duplicate JSON body and cancels further reading", async () => {
    const fakeSecret = "fake-oversized-secret";
    const cancel = vi.fn();
    const oversized = encode(
      JSON.stringify({
        ok: true,
        msg_id: "msg_1",
        duplicate: true,
        padding: fakeSecret.repeat(7000),
      }),
    );
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(oversized);
      },
      cancel,
    });
    fetchMock.mockResolvedValue(streamResponse(source, "application/json"));

    const error = await openSendExecution(
      "conv_1",
      { content: "hello" },
      { timeoutMs: 0 },
    ).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ChatExecutionContractError);
    expect(String(error)).not.toContain(fakeSecret);
    expect(cancel).toHaveBeenCalledOnce();
    expect(source.locked).toBe(false);
  });

  it("preserves caller abort while reading duplicate JSON", async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    const cancel = vi.fn();
    fetchMock.mockResolvedValue(
      streamResponse(new ReadableStream<Uint8Array>({ cancel }), "application/json"),
    );

    const pending = openSendExecution(
      "conv_1",
      { content: "hello" },
      { signal: caller.signal, timeoutMs: 10_000 },
    );
    await Promise.resolve();
    caller.abort("navigation");

    await expect(pending).rejects.toMatchObject({
      name: "ApiError",
      code: "ABORTED",
      status: 0,
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves timeout while reading duplicate JSON", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    fetchMock.mockResolvedValue(
      streamResponse(new ReadableStream<Uint8Array>({ cancel }), "application/json"),
    );

    const pending = openSendExecution(
      "conv_1",
      { content: "hello" },
      { timeoutMs: 25 },
    );
    const assertion = expect(pending).rejects.toMatchObject({
      name: "ApiError",
      code: "TIMEOUT",
      status: 0,
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Chat execution event validation and projection", () => {
  it.each([
    [
      { type: "start", id: "assistant_1", extra: "drop" },
      { type: "start", assistantMessageId: "assistant_1" },
    ],
    [
      { type: "chunk", content: "你好 😺", extra: "drop" },
      { type: "chunk", content: "你好 😺" },
    ],
    [
      { type: "mcp_loading", msg_id: "msg_1", tools: "server:tool" },
      { type: "mcp-loading", messageId: "msg_1", tools: "server:tool" },
    ],
    [
      {
        type: "heart_whisper",
        id: "heart_1",
        msg_id: "msg_1",
        content: "quiet thought",
        created_at: 0,
      },
      {
        type: "heart-whisper",
        id: "heart_1",
        messageId: "msg_1",
        content: "quiet thought",
        createdAt: 0,
      },
    ],
    [
      { type: "toy_command", msg_id: "msg_1", commands: ["1", "STOP"] },
      { type: "toy-command", messageId: "msg_1", commands: ["1", "STOP"] },
    ],
    [
      {
        type: "cam_check",
        conv_id: "conv_1",
        model_key: "model_1",
        msg_id: "msg_1",
      },
      {
        type: "camera-check",
        conversationId: "conv_1",
        modelKey: "model_1",
        messageId: "msg_1",
      },
    ],
    [{ type: "cam_offline", reason: "drop" }, { type: "camera-offline" }],
    [
      {
        type: "poi_search",
        conv_id: "conv_1",
        categories: ["餐厅", "咖啡"],
        msg_id: "msg_1",
      },
      {
        type: "poi-search",
        conversationId: "conv_1",
        categories: ["餐厅", "咖啡"],
        messageId: "msg_1",
      },
    ],
    [
      {
        type: "activity_check",
        conv_id: "conv_1",
        n: 0,
        msg_id: "msg_1",
      },
      {
        type: "activity-check",
        conversationId: "conv_1",
        count: 0,
        messageId: "msg_1",
      },
    ],
    [
      {
        type: "music",
        msg_id: "msg_1",
        cards: [{ id: 1, name: "Night", nested: [true, null] }],
      },
      {
        type: "music",
        messageId: "msg_1",
        cards: [{ id: 1, name: "Night", nested: [true, null] }],
      },
    ],
    [
      {
        type: "debug",
        model: "model_1",
        msg_id: "msg_1",
        usage: {
          prompt_tokens: 0,
          completion_tokens: 2,
          total_tokens: 2,
        },
        has_error: false,
      },
      {
        type: "debug-summary",
        messageId: "msg_1",
        modelKey: "model_1",
        hasError: false,
        failureCode: null,
        usage: { promptTokens: 0, completionTokens: 2, totalTokens: 2 },
      },
    ],
  ])("projects a known direct SSE event with an exact allowlist", (wire, expected) => {
    expect(mapChatExecutionEvent(wire)).toEqual(expected);
  });

  it("recursively copies arrays and JSON cards instead of retaining wire references", () => {
    const commands = ["1", "STOP"];
    const categories = ["cafe"];
    const card = { name: "Night", nested: { candidates: [{ id: 1 }] } };

    const toy = mapChatExecutionEvent({
      type: "toy_command",
      msg_id: "msg_1",
      commands,
    });
    const poi = mapChatExecutionEvent({
      type: "poi_search",
      conv_id: "conv_1",
      categories,
      msg_id: "msg_1",
    });
    const music = mapChatExecutionEvent({
      type: "music",
      msg_id: "msg_1",
      cards: [card],
    });

    commands[0] = "changed";
    categories[0] = "changed";
    card.name = "changed";
    card.nested.candidates[0].id = 99;

    expect(toy).toMatchObject({ commands: ["1", "STOP"] });
    expect(poi).toMatchObject({ categories: ["cafe"] });
    expect(music).toMatchObject({
      cards: [{ name: "Night", nested: { candidates: [{ id: 1 }] } }],
    });
  });

  it.each([
    { type: "start" },
    { type: "start", id: "" },
    { type: "chunk", content: 1 },
    { type: "mcp_loading", msg_id: "msg_1" },
    {
      type: "heart_whisper",
      id: "heart_1",
      msg_id: "msg_1",
      content: "thought",
      created_at: "now",
    },
    { type: "toy_command", msg_id: "msg_1", commands: [1] },
    { type: "cam_check", model_key: "model_1", msg_id: "msg_1" },
    {
      type: "poi_search",
      conv_id: "conv_1",
      categories: "cafe",
      msg_id: "msg_1",
    },
    {
      type: "activity_check",
      conv_id: "conv_1",
      n: Number.NaN,
      msg_id: "msg_1",
    },
    { type: "music", msg_id: "msg_1", cards: [() => undefined] },
    {
      type: "debug",
      model: "model_1",
      msg_id: "msg_1",
      usage: null,
      has_error: "false",
    },
    {
      type: "debug",
      model: "model_1",
      msg_id: "msg_1",
      usage: { total_tokens: Number.POSITIVE_INFINITY },
      has_error: false,
    },
  ])("rejects a malformed known event instead of downgrading it", (wire) => {
    const error = captureError(() => mapChatExecutionEvent(wire));
    expect(error).toBeInstanceOf(ChatExecutionContractError);
    expect(error).not.toMatchObject({ type: "unknown" });
  });

  it("strictly allowlists debug summary fields and emits no logs", () => {
    const fakeApiKey = "sk-fake-api-key";
    const fakeAuthorization = "Bearer fake-auth";
    const fakeEndpoint = "https://private-provider.example/v1/chat";
    const fakePrompt = "fake private system prompt";
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const wire = {
      type: "debug",
      model: "safe-model-key",
      msg_id: "msg_1",
      recall_keywords: "private recall",
      recalled_memories: [{ content: "private memory" }],
      prompt_messages: [{ role: "system", content: fakePrompt }],
      prompt_count: 12,
      usage: {
        prompt_tokens: 10,
        completion_tokens: 4,
        total_tokens: 14,
        api_payload: { prompt: fakePrompt, api_key: fakeApiKey },
        raw_provider_response: fakeAuthorization,
      },
      has_error: true,
      error_text: `${fakeEndpoint} ${fakeAuthorization}`,
      api_format: "provider-private",
      api_payload: {
        endpoint: fakeEndpoint,
        Authorization: fakeAuthorization,
        key: fakeApiKey,
        prompt: fakePrompt,
      },
      unknown_debug_field: { secret: fakeApiKey },
    };

    const event = mapChatExecutionEvent(wire);
    const serialized = JSON.stringify(event);

    expect(event).toEqual({
      type: "debug-summary",
      messageId: "msg_1",
      modelKey: "safe-model-key",
      hasError: true,
      failureCode: null,
      usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
    });
    for (const sensitive of [
      fakeApiKey,
      fakeAuthorization,
      fakeEndpoint,
      fakePrompt,
      "api_payload",
      "prompt_messages",
      "error_text",
      "raw_provider_response",
    ]) {
      expect(serialized).not.toContain(sensitive);
    }
    expect(log).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
    log.mockRestore();
    errorLog.mockRestore();
  });

  it.each([
    "provider_request_failed",
    "provider_execution_failed",
  ] as const)("projects only the fixed provider failure marker %s", (failureCode) => {
    const event = mapChatExecutionEvent({
      type: "debug",
      model: "safe-model-key",
      msg_id: "msg_1",
      usage: null,
      has_error: true,
      error_text: `private provider text ${failureCode}`,
    });

    expect(event).toEqual({
      type: "debug-summary",
      messageId: "msg_1",
      modelKey: "safe-model-key",
      hasError: true,
      failureCode,
      usage: null,
    });
    expect(JSON.stringify(event)).not.toContain("private provider text");
  });

  it("keeps only the unknown type marker and never its payload", () => {
    const payload = {
      type: "future_provider_event",
      content: "private content",
      api_payload: { Authorization: "Bearer fake" },
    };
    const event = mapChatExecutionEvent(payload);
    payload.type = "changed";
    payload.content = "changed";

    expect(event).toEqual({
      type: "unknown",
      rawType: "future_provider_event",
    });
    expect(JSON.stringify(event)).not.toContain("private content");
    expect(JSON.stringify(event)).not.toContain("Authorization");
  });

  it.each([{}, { type: 1 }, { type: null }, [], null])(
    "rejects an event without a string type",
    (wire) => {
      expect(() => mapChatExecutionEvent(wire)).toThrow(
        ChatExecutionContractError,
      );
    },
  );

  it("does not include sensitive malformed debug data in contract errors", () => {
    const fakeSecret = "fake-malformed-debug-secret";
    const error = captureError(() =>
      mapChatExecutionEvent({
        type: "debug",
        model: "model_1",
        msg_id: "msg_1",
        usage: { total_tokens: fakeSecret },
        has_error: false,
        api_payload: { Authorization: fakeSecret },
        prompt_messages: [{ content: fakeSecret }],
      }),
    );

    expect(error).toBeInstanceOf(ChatExecutionContractError);
    expect(String(error)).not.toContain(fakeSecret);
    expect(error).not.toHaveProperty("event");
    expect(error).not.toHaveProperty("data");
  });
});

describe("Chat execution stream lifecycle and error propagation", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("lazily emits multiple events in arrival order and ends naturally at EOF", async () => {
    const source = byteStream([
      encode(sseData({ type: "start", id: "assistant_1" })),
      encode(sseData({ type: "chunk", content: "first" })),
      encode(sseData({ type: "chunk", content: "second" })),
    ]);
    fetchMock.mockResolvedValue(streamResponse(source, "text/event-stream"));

    const result = await openSendExecution(
      "conv_1",
      { content: "hello" },
      { timeoutMs: 0 },
    );
    const events = await collectSendResult(result);

    expect(events).toEqual([
      { type: "start", assistantMessageId: "assistant_1" },
      { type: "chunk", content: "first" },
      { type: "chunk", content: "second" },
    ]);
    expect(events.map(({ type }) => type)).not.toContain("completed");
    expect(events.map(({ type }) => type)).not.toContain("transport-ended");
    expect(source.locked).toBe(false);
  });

  it("handles an event split across every byte, including Chinese and emoji", async () => {
    const text = sseData({ type: "chunk", content: "Penumbra 知远 😺" });
    const bytes = encode(text);
    const chunks = Array.from(bytes, (_value, index) =>
      bytes.slice(index, index + 1),
    );
    fetchMock.mockResolvedValue(
      streamResponse(byteStream(chunks), "text/event-stream; charset=utf-8"),
    );

    const result = await openSendExecution(
      "conv_1",
      { content: "hello" },
      { timeoutMs: 0 },
    );
    await expect(collectSendResult(result)).resolves.toEqual([
      { type: "chunk", content: "Penumbra 知远 😺" },
    ]);
  });

  it("emits an unknown marker and continues with later known frames", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        { type: "future_event", secret: "fake-secret" },
        { type: "chunk", content: "after" },
      ]),
    );

    const result = await openSendExecution(
      "conv_1",
      { content: "hello" },
      { timeoutMs: 0 },
    );
    await expect(collectSendResult(result)).resolves.toEqual([
      { type: "unknown", rawType: "future_event" },
      { type: "chunk", content: "after" },
    ]);
  });

  it("does not expose an internal done event on normal EOF", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        { type: "start", id: "assistant_1" },
        { type: "debug", model: "m", msg_id: "assistant_1", usage: null, has_error: false },
      ]),
    );
    const result = await openRegenerateExecution(
      "conv_1",
      "assistant_1",
      {},
      { timeoutMs: 0 },
    );
    const events = await collectEvents(result.events);
    expect(events.map(({ type }) => type)).toEqual(["start", "debug-summary"]);
    expect(events).not.toContainEqual(expect.objectContaining({ type: "done" }));
  });

  it("keeps truncated SSE framing as SseFramingError", async () => {
    fetchMock.mockResolvedValue(
      bytesResponse(
        [encode('data: {"type":"chunk","content":"secret"}')],
        "text/event-stream",
      ),
    );
    const result = await expectStream(
      openSendExecution("conv_1", { content: "hello" }, { timeoutMs: 0 }),
    );

    const error = await collectEvents(result.events).catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(SseFramingError);
    expect(String(error)).not.toContain("secret");
  });

  it("keeps malformed frame JSON as SseDataError", async () => {
    const fakeToken = "fake-sse-json-token";
    fetchMock.mockResolvedValue(
      bytesResponse(
        [encode(`data: {"type":"chunk","token":"${fakeToken}\n\n`)],
        "text/event-stream",
      ),
    );
    const result = await expectStream(
      openSendExecution("conv_1", { content: "hello" }, { timeoutMs: 0 }),
    );

    const error = await collectEvents(result.events).catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(SseDataError);
    expect(String(error)).not.toContain(fakeToken);
  });

  it("keeps malformed known events as ChatExecutionContractError", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([{ type: "chunk", content: { raw: "fake-secret" } }]),
    );
    const result = await expectStream(
      openSendExecution("conv_1", { content: "hello" }, { timeoutMs: 0 }),
    );
    const error = await collectEvents(result.events).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ChatExecutionContractError);
    expect(String(error)).not.toContain("fake-secret");
  });

  it("maps body reader failures to the shared network ApiError", async () => {
    const source = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error("body reader failed");
      },
    });
    fetchMock.mockResolvedValue(streamResponse(source, "text/event-stream"));
    const result = await expectStream(
      openSendExecution("conv_1", { content: "hello" }, { timeoutMs: 0 }),
    );

    const error = await collectEvents(result.events).catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: "NETWORK_ERROR",
      status: 0,
      message: "body reader failed",
    });
    expect(source.locked).toBe(false);
  });

  it("preserves caller abort while consuming SSE and releases readers", async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    const cancel = vi.fn();
    const source = new ReadableStream<Uint8Array>({ cancel });
    fetchMock.mockResolvedValue(streamResponse(source, "text/event-stream"));
    const result = await expectStream(
      openSendExecution(
        "conv_1",
        { content: "hello" },
        { signal: caller.signal, timeoutMs: 10_000 },
      ),
    );

    const pending = collectEvents(result.events);
    await Promise.resolve();
    caller.abort("navigation");
    await expect(pending).rejects.toMatchObject({
      name: "ApiError",
      code: "ABORTED",
      status: 0,
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(source.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves timeout while consuming SSE and releases readers", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const source = new ReadableStream<Uint8Array>({ cancel });
    fetchMock.mockResolvedValue(streamResponse(source, "text/event-stream"));
    const result = await expectStream(
      openSendExecution(
        "conv_1",
        { content: "hello" },
        { timeoutMs: 25 },
      ),
    );

    const pending = collectEvents(result.events);
    const assertion = expect(pending).rejects.toMatchObject({
      name: "ApiError",
      code: "TIMEOUT",
      status: 0,
    });
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
    expect(source.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the HTTP body when a consumer stops iteration early", async () => {
    const cancel = vi.fn();
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode(sseData({ type: "chunk", content: "first" })));
        controller.enqueue(encode(sseData({ type: "chunk", content: "second" })));
      },
      cancel,
    });
    fetchMock.mockResolvedValue(streamResponse(source, "text/event-stream"));
    const result = await expectStream(
      openSendExecution("conv_1", { content: "hello" }, { timeoutMs: 0 }),
    );

    for await (const event of result.events) {
      expect(event).toEqual({ type: "chunk", content: "first" });
      break;
    }
    expect(cancel).toHaveBeenCalledOnce();
    expect(source.locked).toBe(false);
  });

  it.each([401, 422, 500])("preserves HTTP %s as ApiError", async (status) => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: `HTTP ${status}` }), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      openSendExecution(
        "conv_1",
        { content: "hello" },
        { timeoutMs: 0 },
      ),
    ).rejects.toMatchObject({
      name: "ApiError",
      code: "HTTP_ERROR",
      status,
    });
  });

  it("preserves network failures as ApiError", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      openSendExecution(
        "conv_1",
        { content: "hello" },
        { timeoutMs: 0 },
      ),
    ).rejects.toMatchObject({
      name: "ApiError",
      code: "NETWORK_ERROR",
      status: 0,
    });
  });

  it("performs only one scoped execution request and no delete, history, settings, conversation-list, or WebSocket work", async () => {
    fetchMock.mockResolvedValue(sseResponse([]));
    const result = await openRegenerateExecution(
      "conv_1",
      "assistant_1",
      {},
      { timeoutMs: 0 },
    );
    await collectEvents(result.events);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined();
    const paths = fetchMock.mock.calls.map(([path]) => String(path)).join(" ");
    expect(paths).toBe(
      "/api/conversations/conv_1/messages/assistant_1/regenerate",
    );
    expect(paths).not.toMatch(
      /settings|readiness|models|history|delete|\/ws|websocket/,
    );
    expect(paths).not.toContain("/api/conversations/conv_1/regenerate");
  });

  it("overrides unsafe runtime method, body, and query properties with the canonical regenerate request", async () => {
    fetchMock.mockResolvedValue(sseResponse([]));
    const result = await openRegenerateExecution(
      "conv_1",
      "assistant_1",
      {},
      {
        timeoutMs: 0,
        method: "DELETE",
        body: JSON.stringify({ model: "forbidden-model" }),
        query: { provider: "forbidden-provider" },
      } as never,
    );
    await collectEvents(result.events);

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/conversations/conv_1/messages/assistant_1/regenerate",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: undefined,
    });
  });

  it("exports only pure execution contracts, mappers, and clients", () => {
    expect(Object.keys(chatExecution).sort()).toEqual([
      "ChatExecutionContractError",
      "mapChatExecutionEvent",
      "mapDuplicateSendAcknowledgement",
      "mapRegenerateQuery",
      "mapSendMessageRequest",
      "openRegenerateExecution",
      "openSendExecution",
    ]);
    expect(chatExecution).not.toHaveProperty("Message");
    expect(chatExecution).not.toHaveProperty("MessageHistoryState");
    expect(chatExecution).not.toHaveProperty("useChatExecution");
    expect(chatExecution).not.toHaveProperty("cancelGeneration");
  });
});

function captureError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected function to throw");
}

function duplicateResponse(
  overrides: unknown = {},
  contentType = "application/json",
): Response {
  const payload =
    typeof overrides === "object" && overrides !== null && !Array.isArray(overrides)
      ? { ok: true, msg_id: "user_1", duplicate: true, ...overrides }
      : overrides;
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": contentType },
  });
}

function sseResponse(
  events: readonly unknown[],
  contentType = "text/event-stream",
): Response {
  return bytesResponse(events.map((event) => encode(sseData(event))), contentType);
}

function bytesResponse(
  chunks: readonly Uint8Array[],
  contentType: string,
): Response {
  return streamResponse(byteStream(chunks), contentType);
}

function streamResponse(
  body: ReadableStream<Uint8Array>,
  contentType?: string,
): Response {
  return new Response(body, {
    headers: contentType === undefined ? undefined : { "content-type": contentType },
  });
}

function byteStream(
  chunks: readonly Uint8Array[],
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function sseData(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function expectStream(
  result: Promise<SendExecutionResult>,
): Promise<ChatExecutionStream> {
  const resolved = await result;
  if (resolved.kind !== "stream") {
    throw new Error("Expected stream result");
  }
  return resolved;
}

async function collectSendResult(
  result: SendExecutionResult,
): Promise<ChatExecutionEvent[]> {
  if (result.kind !== "stream") {
    throw new Error("Expected stream result");
  }
  return collectEvents(result.events);
}

async function collectEvents(
  events: AsyncIterable<ChatExecutionEvent>,
): Promise<ChatExecutionEvent[]> {
  const result: ChatExecutionEvent[] = [];
  for await (const event of events) {
    result.push(event);
  }
  return result;
}
