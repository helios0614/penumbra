import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MessageContractError,
  listConversationMessages,
  mapMessage,
  mapMessageHistory,
} from "@/domain/message";

describe("message mappers", () => {
  it("maps persistent wire facts to camelCase without inventing state", () => {
    expect(
      mapMessage(
        message({
          simple_think: "brief thought",
          thinking: "extended thought",
          is_carryover: 1,
          cache_region: "slide",
          status: "streaming",
          client_msg_id: "client-secret",
        }),
      ),
    ).toEqual({
      id: "msg_1",
      conversationId: "conv_1",
      rawRole: "user",
      roleKind: "user",
      content: "hello",
      createdAt: 1710000000.125,
      simpleThink: "brief thought",
      thinking: "extended thought",
      isCarryover: true,
      attachments: [],
      mcpToolCalls: [],
      cacheRegion: "slide",
      voice: null,
    });
  });

  it("preserves raw roles and maps only stable role categories", () => {
    const roles = [
      ["user", "user"],
      ["assistant", "assistant"],
      ["system", "system"],
      ["cam_trigger", "hidden-runtime"],
      ["cam_user", "hidden-runtime"],
      ["cam_log", "hidden-runtime"],
      ["future_role", "unknown"],
      ["", "unknown"],
    ] as const;

    for (const [rawRole, roleKind] of roles) {
      expect(mapMessage(message({ role: rawRole }))).toMatchObject({
        rawRole,
        roleKind,
      });
    }
  });

  it("keeps Unix seconds, nullable text facts, and exact carryover values", () => {
    expect(
      mapMessage(
        message({
          created_at: 0.25,
          simple_think: null,
          thinking: null,
          is_carryover: 0,
          cache_region: null,
        }),
      ),
    ).toMatchObject({
      createdAt: 0.25,
      simpleThink: null,
      thinking: null,
      isCarryover: false,
      cacheRegion: null,
    });

    expect(mapMessage(message({ is_carryover: 1 })).isCarryover).toBe(true);
    expect(mapMessage(message({ is_carryover: null })).isCarryover).toBeNull();
  });

  it("maps an omitted voice to null and projects the complete voice DTO", () => {
    expect(mapMessage(message()).voice).toBeNull();
    expect(mapMessage(message({ voice: voice() })).voice).toEqual({
      audioId: "audio_1",
      messageId: "msg_1",
      provider: "edge",
      voiceId: "voice_1",
      url: "/api/tts/audio/audio_1",
      duration: 2.5,
      favorited: false,
      createdAt: 1710000001.25,
      updatedAt: 1710000002.5,
    });
    expect(
      mapMessage(message({ voice: voice({ duration: null, favorited: true }) }))
        .voice,
    ).toMatchObject({ duration: null, favorited: true });
  });

  it("preserves weakly typed attachment and MCP JSON, including unknown fields", () => {
    const attachment = {
      type: "music",
      id: 7,
      name: "Night",
      artist: "Unknown",
      future: { waveform: [0, 0.5, null], flags: [true, false] },
    };
    const toolCall = {
      server: "demo",
      tool: "inspect",
      success: true,
      result: { nested: ["ok", 3] },
      future_field: "preserved",
    };

    const mapped = mapMessage(
      message({
        attachments: ["/uploads/example.png", attachment],
        mcp_tool_calls: [toolCall],
      }),
    );

    expect(mapped.attachments).toEqual(["/uploads/example.png", attachment]);
    expect(mapped.mcpToolCalls).toEqual([toolCall]);
  });

  it("recursively copies JSON capabilities instead of retaining wire references", () => {
    const attachment = {
      type: "music",
      meta: { artists: ["first"], enabled: true },
    };
    const toolCall = { result: { rows: [{ value: 1 }] } };
    const payload = message({
      attachments: [attachment],
      mcp_tool_calls: [toolCall],
    });
    const mapped = mapMessage(payload);

    attachment.type = "changed";
    attachment.meta.artists[0] = "changed";
    toolCall.result.rows[0].value = 99;
    payload.attachments.push("later");
    payload.mcp_tool_calls.length = 0;

    expect(mapped.attachments).toEqual([
      { type: "music", meta: { artists: ["first"], enabled: true } },
    ]);
    expect(mapped.mcpToolCalls).toEqual([
      { result: { rows: [{ value: 1 }] } },
    ]);
  });

  it("keeps backend message order and accepts an empty history", () => {
    expect(
      mapMessageHistory([
        message({ id: "older", created_at: 20 }),
        message({ id: "newer", created_at: 10 }),
      ]).map(({ id }) => id),
    ).toEqual(["older", "newer"]);
    expect(mapMessageHistory([])).toEqual([]);
  });

  it("rejects a non-array response and non-object history items", () => {
    for (const payload of [undefined, null, {}, "[]", 1]) {
      expect(() => mapMessageHistory(payload)).toThrow(MessageContractError);
    }
    for (const item of [undefined, null, [], "message", 1, new Date()]) {
      expect(() => mapMessageHistory([item])).toThrow(MessageContractError);
    }
  });

  it("rejects missing required fields and malformed scalar fields", () => {
    const valid = message();
    const { id: _id, ...withoutId } = valid;
    const { conv_id: _convId, ...withoutConversationId } = valid;
    const { role: _role, ...withoutRole } = valid;
    const { content: _content, ...withoutContent } = valid;
    const { created_at: _createdAt, ...withoutCreatedAt } = valid;
    const { thinking: _thinking, ...withoutThinking } = valid;
    const { is_carryover: _carryover, ...withoutCarryover } = valid;
    const { cache_region: _cacheRegion, ...withoutCacheRegion } = valid;

    const invalid = [
      withoutId,
      withoutConversationId,
      withoutRole,
      withoutContent,
      withoutCreatedAt,
      withoutThinking,
      withoutCarryover,
      withoutCacheRegion,
      message({ id: "" }),
      message({ id: "   " }),
      message({ conv_id: "" }),
      message({ role: 1 }),
      message({ content: null }),
      message({ created_at: Number.NaN }),
      message({ created_at: Number.POSITIVE_INFINITY }),
      message({ simple_think: false }),
      message({ thinking: 1 }),
      message({ cache_region: {} }),
      message({ is_carryover: false }),
      message({ is_carryover: -1 }),
      message({ is_carryover: 2 }),
      message({ is_carryover: "1" }),
    ];

    for (const payload of invalid) {
      expect(() => mapMessage(payload)).toThrow(MessageContractError);
    }
  });

  it("rejects wrong capability top-level types and non-JSON nested values", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const sparse = Array<unknown>(1);
    const invalid = [
      message({ attachments: null }),
      message({ attachments: {} }),
      message({ attachments: "[]" }),
      message({ mcp_tool_calls: null }),
      message({ mcp_tool_calls: {} }),
      message({ mcp_tool_calls: "[]" }),
      message({ attachments: [undefined] }),
      message({ attachments: [Number.NaN] }),
      message({ attachments: [Number.POSITIVE_INFINITY] }),
      message({ attachments: [1n] }),
      message({ attachments: [() => "not JSON"] }),
      message({ attachments: [new Date()] }),
      message({ attachments: [cyclic] }),
      message({ attachments: sparse }),
      message({ mcp_tool_calls: [{ result: undefined }] }),
    ];

    for (const payload of invalid) {
      expect(() => mapMessage(payload)).toThrow(MessageContractError);
    }
  });

  it("accepts omitted voice but rejects malformed voice fields", () => {
    const completeVoice = voice();
    const { provider: _provider, ...voiceWithoutProvider } = completeVoice;
    const invalid = [
      message({ voice: null }),
      message({ voice: [] }),
      message({ voice: voiceWithoutProvider }),
      message({ voice: voice({ audio_id: "" }) }),
      message({ voice: voice({ msg_id: "" }) }),
      message({ voice: voice({ provider: null }) }),
      message({ voice: voice({ voice_id: 1 }) }),
      message({ voice: voice({ url: false }) }),
      message({ voice: voice({ duration: "2.5" }) }),
      message({ voice: voice({ duration: Number.NaN }) }),
      message({ voice: voice({ favorited: 0 }) }),
      message({ voice: voice({ created_at: Number.POSITIVE_INFINITY }) }),
      message({ voice: voice({ updated_at: "now" }) }),
    ];

    for (const payload of invalid) {
      expect(() => mapMessage(payload)).toThrow(MessageContractError);
    }
  });

  it("drops extra secret/config fields and never includes raw values in errors", () => {
    const fakeSecret = "fake-message-secret-DO-NOT-LEAK";
    const endpoint = "https://secret.invalid/internal";
    const mapped = mapMessage(
      message({
        authorization: `Bearer ${fakeSecret}`,
        endpoint,
        config: { api_key: fakeSecret },
        raw_payload: { secret: fakeSecret },
        voice: voice({ authorization: fakeSecret }),
      }),
    );

    expect(mapped).not.toHaveProperty("authorization");
    expect(mapped).not.toHaveProperty("endpoint");
    expect(mapped).not.toHaveProperty("config");
    expect(mapped).not.toHaveProperty("raw_payload");
    expect(mapped.voice).not.toHaveProperty("authorization");

    let error: unknown;
    try {
      mapMessage(
        message({
          role: { fakeSecret, endpoint },
          attachments: [{ Authorization: fakeSecret }],
        }),
      );
    } catch (reason) {
      error = reason;
    }

    expect(error).toBeInstanceOf(MessageContractError);
    expect(String(error)).not.toContain(fakeSecret);
    expect(String(error)).not.toContain(endpoint);
    expect(String(error)).not.toContain("Authorization");
  });
});

describe("message history client", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("requests the safe public view through the shared GET cookie transport", async () => {
    fetchMock.mockResolvedValue(json([]));
    const caller = new AbortController();

    await expect(
      listConversationMessages("conv_1", undefined, {
        signal: caller.signal,
        timeoutMs: 0,
      }),
    ).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/conv_1/messages?public_view=true",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("encodes limit, before, combined query, and an explicit before=0", async () => {
    fetchMock.mockImplementation(async () => json([]));

    await listConversationMessages("id", { limit: 1 }, { timeoutMs: 0 });
    await listConversationMessages("id", { limit: 500 }, { timeoutMs: 0 });
    await listConversationMessages("id", { before: 1710000000.25 }, { timeoutMs: 0 });
    await listConversationMessages(
      "id",
      { limit: 50, before: 1710000000.25 },
      { timeoutMs: 0 },
    );
    await listConversationMessages("id", { before: 0 }, { timeoutMs: 0 });

    expect(requestPaths()).toEqual([
      "/api/conversations/id/messages?limit=1&public_view=true",
      "/api/conversations/id/messages?limit=500&public_view=true",
      "/api/conversations/id/messages?before=1710000000.25&public_view=true",
      "/api/conversations/id/messages?limit=50&before=1710000000.25&public_view=true",
      "/api/conversations/id/messages?before=0&public_view=true",
    ]);
  });

  it("URL-encodes the conversation ID as a path segment", async () => {
    fetchMock.mockResolvedValue(json([]));
    await listConversationMessages("conv/a + 中文?", {}, { timeoutMs: 0 });
    expect(requestPaths()).toEqual([
      "/api/conversations/conv%2Fa%20%2B%20%E4%B8%AD%E6%96%87%3F/messages?public_view=true",
    ]);
  });

  it("rejects invalid local query values before sending a request", async () => {
    const invalidQueries = [
      { limit: 0 },
      { limit: 501 },
      { limit: 1.5 },
      { limit: Number.NaN },
      { limit: Number.POSITIVE_INFINITY },
      { limit: "50" },
      { before: Number.NaN },
      { before: Number.POSITIVE_INFINITY },
      { before: Number.NEGATIVE_INFINITY },
      { before: "0" },
      null,
      [],
    ];

    for (const query of invalidQueries) {
      await expect(
        listConversationMessages(
          "id",
          query as never,
          { timeoutMs: 0 },
        ),
      ).rejects.toBeInstanceOf(MessageContractError);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves the backend order and treats an empty array as success", async () => {
    fetchMock
      .mockResolvedValueOnce(
        json([
          message({ id: "wire-first", created_at: 200 }),
          message({ id: "wire-second", created_at: 100 }),
        ]),
      )
      .mockResolvedValueOnce(json([]));

    await expect(
      listConversationMessages("id", {}, { timeoutMs: 0 }),
    ).resolves.toEqual([
      expect.objectContaining({ id: "wire-first" }),
      expect.objectContaining({ id: "wire-second" }),
    ]);
    await expect(
      listConversationMessages("missing", {}, { timeoutMs: 0 }),
    ).resolves.toEqual([]);
  });

  it("preserves 401, 422, and 500 ApiError responses", async () => {
    for (const status of [401, 422, 500]) {
      fetchMock.mockResolvedValueOnce(json({ detail: `status ${status}` }, status));
      await expect(
        listConversationMessages("id", {}, { timeoutMs: 0 }),
      ).rejects.toMatchObject({
        name: "ApiError",
        status,
        code: "HTTP_ERROR",
      });
    }
  });

  it("preserves network, timeout, and caller abort transport semantics", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await expect(
      listConversationMessages("id", {}, { timeoutMs: 0 }),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });

    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
    );
    await expect(
      listConversationMessages("id", {}, { timeoutMs: 1 }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });

    const caller = new AbortController();
    const pending = listConversationMessages(
      "id",
      {},
      { signal: caller.signal, timeoutMs: 0 },
    );
    caller.abort("stop");
    await expect(pending).rejects.toMatchObject({ code: "ABORTED" });
  });

  it("uses MessageContractError for malformed success payloads", async () => {
    fetchMock.mockResolvedValue(json({ messages: [] }));
    await expect(
      listConversationMessages("id", {}, { timeoutMs: 0 }),
    ).rejects.toBeInstanceOf(MessageContractError);
  });

  it("makes only the history request and never calls other domain endpoints", async () => {
    fetchMock.mockResolvedValue(json([]));
    await listConversationMessages("id", { limit: 50 }, { timeoutMs: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const paths = requestPaths().join(" ");
    expect(paths).toContain("/api/conversations/id/messages?limit=50&public_view=true");
    expect(paths).not.toMatch(
      /settings|readiness|send|regenerate|websocket|message_count/,
    );
  });

  function requestPaths(): string[] {
    return fetchMock.mock.calls.map(([path]) => String(path));
  }
});

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_1",
    conv_id: "conv_1",
    role: "user",
    content: "hello",
    created_at: 1710000000.125,
    simple_think: "",
    is_carryover: 0,
    attachments: [] as unknown[],
    thinking: "",
    mcp_tool_calls: [] as unknown[],
    cache_region: "",
    ...overrides,
  };
}

function voice(overrides: Record<string, unknown> = {}) {
  return {
    audio_id: "audio_1",
    msg_id: "msg_1",
    provider: "edge",
    voice_id: "voice_1",
    url: "/api/tts/audio/audio_1",
    duration: 2.5,
    favorited: false,
    created_at: 1710000001.25,
    updated_at: 1710000002.5,
    ...overrides,
  };
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
