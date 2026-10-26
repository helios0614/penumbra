import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ConversationContractError,
  createConversation,
  deleteConversation,
  listConversations,
  mapConversation,
  mapDeleteConversationResponse,
  mapConversationList,
  mapUpdateConversationResponse,
  updateConversation,
} from "@/domain/conversation";

describe("conversation mappers", () => {
  it("maps wire names, IDs, timestamps, nullable-free fields, and drops extras", () => {
    expect(mapConversation({
      ...conversation("conv_1", "legacy-unknown"),
      message_count: 9,
      provider_config: { secret: "fake-secret" },
      active_api_config: "hidden",
    })).toEqual({
      id: "conv_1",
      title: "Title conv_1",
      modelKey: "legacy-unknown",
      createdAt: 10.5,
      updatedAt: 20.5,
    });
  });

  it("keeps backend list order and maps message counts", () => {
    expect(mapConversationList([
      { ...conversation("second"), message_count: 2 },
      { ...conversation("first"), message_count: 0 },
    ])).toEqual([
      expect.objectContaining({ id: "second", messageCount: 2 }),
      expect.objectContaining({ id: "first", messageCount: 0 }),
    ]);
  });

  it("rejects malformed lists, missing fields, nullable fields, and wrong types", () => {
    const valid = { ...conversation(), message_count: 0 };
    for (const payload of [
      {},
      [null],
      [{ ...valid, id: 1 }],
      [{ ...valid, title: null }],
      [{ ...valid, model: null }],
      [{ ...valid, created_at: "10" }],
      [{ ...valid, updated_at: Number.NaN }],
      [{ ...valid, message_count: -1 }],
      [{ ...valid, message_count: 1.5 }],
    ]) {
      expect(() => mapConversationList(payload)).toThrow(ConversationContractError);
    }
  });

  it("does not include raw payload values in contract errors", () => {
    const secret = "fake-conversation-secret";
    let error: unknown;
    try {
      mapConversationList([{ ...conversation(), model: 1, secret }]);
    } catch (reason) {
      error = reason;
    }
    expect(error).toBeInstanceOf(ConversationContractError);
    expect(String(error)).not.toContain(secret);
  });

  it("validates update and delete acknowledgements independently and drops extras", () => {
    expect(mapUpdateConversationResponse({ ok: true, ignored: "update" }))
      .toEqual({ ok: true });
    expect(mapDeleteConversationResponse({ ok: true, ignored: "delete" }))
      .toEqual({ ok: true });

    for (const payload of [undefined, null, [], {}, { ok: false }, { ok: 1 }]) {
      expect(() => mapUpdateConversationResponse(payload))
        .toThrow(ConversationContractError);
      expect(() => mapDeleteConversationResponse(payload))
        .toThrow(ConversationContractError);
    }
  });

  it("validates create response fields without requiring list-only message_count", () => {
    expect(mapConversation(conversation("created", "historical-model")))
      .toMatchObject({ id: "created", modelKey: "historical-model" });

    const valid = conversation();
    for (const payload of [
      null,
      { ...valid, id: undefined },
      { ...valid, title: null },
      { ...valid, model: 1 },
      { ...valid, created_at: Number.POSITIVE_INFINITY },
      { ...valid, updated_at: "20.5" },
    ]) {
      expect(() => mapConversation(payload)).toThrow(ConversationContractError);
    }
  });
});

describe("conversation client", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("lists through the shared cookie transport without sorting or extra requests", async () => {
    fetchMock.mockResolvedValue(json([
      { ...conversation("b"), message_count: 1 },
      { ...conversation("a"), message_count: 0 },
    ]));
    const caller = new AbortController();

    await expect(listConversations({ signal: caller.signal, timeoutMs: 0 })).resolves
      .toEqual([expect.objectContaining({ id: "b" }), expect.objectContaining({ id: "a" })]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("creates without copying a frontend default model", async () => {
    fetchMock.mockResolvedValue(json(conversation("created", "backend-default")));
    await createConversation({}, { timeoutMs: 0 });

    expect(requestBody(0)).toEqual({});
  });
  it("preserves only the source conversation identity when creating with history carryover", async () => {
    fetchMock.mockResolvedValue(json(conversation("created", "backend-default")));
    await createConversation({ carryoverSourceConversationId: "source" }, { timeoutMs: 0 });
    expect(requestBody(0)).toEqual({ carryover_source_conv_id: "source" });
  });

  it("passes explicit title and unknown model keys unchanged", async () => {
    fetchMock.mockResolvedValue(json(conversation("created", "unknown/model")));
    await expect(createConversation(
      { title: "New", modelKey: "unknown/model" },
      { timeoutMs: 0 },
    )).resolves.toMatchObject({ modelKey: "unknown/model" });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/conversations");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    expect(requestBody(0)).toEqual({ title: "New", model: "unknown/model" });
  });

  it("URL-encodes IDs and sends only explicitly provided update fields", async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true })).mockResolvedValueOnce(json({ ok: true }));

    await updateConversation("conv/a + b", { title: "Renamed" }, { timeoutMs: 0 });
    await updateConversation("conv/a + b", { modelKey: "legacy" }, { timeoutMs: 0 });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/conversations/conv%2Fa%20%2B%20b");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PUT" });
    expect(requestBody(0)).toEqual({ title: "Renamed" });
    expect(requestBody(1)).toEqual({ model: "legacy" });
  });

  it("preserves the backend's distinct null and omitted wire payloads", async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    await updateConversation("id", { title: null, modelKey: undefined }, { timeoutMs: 0 });
    expect(requestBody(0)).toEqual({ title: null });
  });

  it("deletes exactly once and validates the real JSON acknowledgement", async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    await expect(deleteConversation("conv/1", {
      timeoutMs: 0,
      body: { must_not_be_sent: true },
    })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/conversations/conv%2F1");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  it("rejects empty 204 mutation responses because the backend contract is JSON", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteConversation("id", { timeoutMs: 0 }))
      .rejects.toBeInstanceOf(ConversationContractError);
  });

  it("preserves HTTP and network transport errors", async () => {
    for (const status of [401, 404, 500]) {
      fetchMock.mockResolvedValueOnce(json({ detail: `status ${status}` }, status));
      await expect(deleteConversation("id", { timeoutMs: 0 })).rejects.toMatchObject({
        name: "ApiError",
        status,
      });
    }

    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await expect(listConversations({ timeoutMs: 0 })).rejects.toMatchObject({
      name: "ApiError",
      code: "NETWORK_ERROR",
    });
  });

  it("preserves timeout and caller abort behavior from the shared transport", async () => {
    fetchMock.mockImplementation((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }),
    );
    await expect(listConversations({ timeoutMs: 1 })).rejects.toMatchObject({ code: "TIMEOUT" });

    const caller = new AbortController();
    const pending = listConversations({ signal: caller.signal, timeoutMs: 0 });
    caller.abort("stop");
    await expect(pending).rejects.toMatchObject({ code: "ABORTED" });
  });

  it("never requests settings, readiness, or message endpoints", async () => {
    fetchMock
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json(conversation()))
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(json({ ok: true }));
    await listConversations({ timeoutMs: 0 });
    await createConversation({}, { timeoutMs: 0 });
    await updateConversation("id", {}, { timeoutMs: 0 });
    await deleteConversation("id", { timeoutMs: 0 });

    const paths = fetchMock.mock.calls.map(([path]) => String(path));
    expect(paths).toHaveLength(4);
    expect(paths.every((path) => path.startsWith("/api/conversations"))).toBe(true);
    expect(paths.join(" ")).not.toMatch(/settings|readiness|messages/);
  });

  function requestBody(call: number): unknown {
    return JSON.parse(String(fetchMock.mock.calls[call]?.[1]?.body));
  }
});

function conversation(id = "conv_1", model = "model-key") {
  return {
    id,
    title: `Title ${id}`,
    model,
    created_at: 10.5,
    updated_at: 20.5,
  };
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
