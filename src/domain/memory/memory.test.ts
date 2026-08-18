import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildMemoryCreateDto,
  buildMemoryListApiQuery,
  createMemory,
  listMemories,
  mapMemoryCreateResult,
  mapMemoryList,
  MemoryContractError,
  setMemoryUnresolved,
} from "@/domain/memory";

describe("memory create adapter", () => {
  it("trims content and serializes normalized keyword semantics to the wire string", () => {
    expect(buildMemoryCreateDto({
      content: "  七夕论坛照片帖  ",
      type: "event",
      importance: 0.6,
      keywords: [" 七夕 ", "论坛", "", "七夕", "Monitor"],
    })).toEqual({
      content: "七夕论坛照片帖",
      type: "event",
      importance: 0.6,
      keywords: '["七夕","论坛","Monitor"]',
    });
  });

  it("uses an empty wire string when no keywords remain", () => {
    expect(buildMemoryCreateDto({
      content: "一段记忆",
      type: "event",
      importance: 0.5,
      keywords: [" ", ""],
    }).keywords).toBe("");
  });

  it("maps only the stable create receipt instead of inventing a canonical list item", () => {
    expect(mapMemoryCreateResult(createReceipt({ source_start_ts: null }))).toEqual({
      id: "mem_created",
      content: "一段新记忆",
      type: "event",
      createdAt: 1_723_000_000.5,
      importance: 0.5,
      keywords: '["海边"]',
    });
    expect(mapMemoryCreateResult(createReceipt())).not.toHaveProperty("isPinned");
  });

  it("rejects malformed stable response fields without retaining payload details", () => {
    const secret = "private-create-payload";
    for (const payload of [
      null,
      createReceipt({ id: "" }),
      createReceipt({ content: null }),
      createReceipt({ type: null }),
      createReceipt({ created_at: Number.MAX_VALUE }),
      createReceipt({ importance: 1.1 }),
      createReceipt({ keywords: [secret] }),
    ]) {
      let error: unknown;
      try {
        mapMemoryCreateResult(payload);
      } catch (reason) {
        error = reason;
      }
      expect(error).toBeInstanceOf(MemoryContractError);
      expect(String(error)).not.toContain(secret);
    }
  });
});

describe("memory list adapter", () => {
  it("maps the real paged list DTO and normalizes optional metadata", () => {
    expect(mapMemoryList(page([
      memory({
        keywords: '["  海边  ","电影","电影",4,null]',
        importance: 0.8,
        unresolved: 1,
      }),
      memory({
        id: "legacy",
        type: null,
        source_conv: null,
        keywords: "历史标签",
        importance: null,
        source_start_ts: null,
        source_end_ts: null,
        unresolved: 0,
      }),
    ]))).toEqual({
      items: [
        {
          id: "mem_1",
          content: "一段真实记忆",
          type: "shared_moment",
          createdAt: 1_720_000_000.5,
          sourceConversationId: "conv_1",
          tags: ["海边", "电影"],
          importance: 0.8,
          sourceStartedAt: 1_719_999_900,
          sourceEndedAt: 1_720_000_000,
          isPinned: true,
        },
        expect.objectContaining({
          id: "legacy",
          type: null,
          sourceConversationId: null,
          tags: ["历史标签"],
          importance: null,
          sourceStartedAt: null,
          sourceEndedAt: null,
          isPinned: false,
        }),
      ],
      page: 1,
      pageSize: 30,
      total: 2,
      totalAll: 2,
      hasMore: false,
    });
  });

  it("safely drops malformed optional fields while preserving unknown type text", () => {
    const item = mapMemoryList(page([memory({
      type: "future_memory_type",
      keywords: { unsafe: true },
      importance: 7,
      source_start_ts: "bad",
      source_end_ts: Number.NaN,
      unresolved: "yes",
    })])).items[0];

    expect(item).toMatchObject({
      type: "future_memory_type",
      tags: [],
      importance: null,
      sourceStartedAt: null,
      sourceEndedAt: null,
      isPinned: false,
    });
  });

  it("rejects malformed required list, page, and item fields without leaking payload", () => {
    const secret = "fake-memory-secret";
    for (const payload of [
      [],
      { ...page([]), page: 0 },
      { ...page([]), page_size: 201 },
      { ...page([]), total: 2, total_all: 1 },
      page([{ ...memory(), id: "" }]),
      page([{ ...memory(), content: null }]),
      page([{ ...memory(), created_at: secret, secret }]),
      page([{ ...memory(), created_at: Number.MAX_VALUE }]),
    ]) {
      let error: unknown;
      try {
        mapMemoryList(payload);
      } catch (reason) {
        error = reason;
      }
      expect(error).toBeInstanceOf(MemoryContractError);
      expect(String(error)).not.toContain(secret);
    }
  });
});

describe("memory list query", () => {
  it("emits only supported backend query fields and omits inactive filters", () => {
    expect(buildMemoryListApiQuery({ page: 2, pageSize: 30 })).toEqual({
      page: 2,
      page_size: 30,
      q: undefined,
      created_from: undefined,
      created_to: undefined,
      importance: undefined,
      pin_first: undefined,
    });

    expect(buildMemoryListApiQuery({
      page: 1,
      pageSize: 50,
      search: "  海边 & 电影  ",
      createdFrom: 10,
      createdTo: 20,
      importance: "top",
      pinFirst: true,
    })).toEqual({
      page: 1,
      page_size: 50,
      q: "海边 & 电影",
      created_from: 10,
      created_to: 20,
      importance: "top",
      pin_first: true,
    });
  });

  it("rejects invented or invalid query values", () => {
    expect(() => buildMemoryListApiQuery({ page: 0, pageSize: 30 }))
      .toThrow(MemoryContractError);
    expect(() => buildMemoryListApiQuery({ page: 1, pageSize: 201 }))
      .toThrow(MemoryContractError);
    expect(() => buildMemoryListApiQuery({
      page: 1,
      pageSize: 30,
      createdFrom: 20,
      createdTo: 10,
    })).toThrow(MemoryContractError);
    expect(() => buildMemoryListApiQuery({
      page: 1,
      pageSize: 30,
      importance: "future" as "top",
    })).toThrow(MemoryContractError);
  });
});

describe("memory list client", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("uses the paged server read contract and shared URL encoding", async () => {
    fetchMock.mockResolvedValue(json(page([memory()])));
    await expect(listMemories({
      page: 1,
      pageSize: 30,
      search: "海边 & 电影",
      importance: "high",
    }, { timeoutMs: 0 })).resolves.toMatchObject({ total: 1 });

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toBe("/api/memories?page=1&page_size=30&q=%E6%B5%B7%E8%BE%B9+%26+%E7%94%B5%E5%BD%B1&importance=high");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      credentials: "include",
      signal: expect.any(AbortSignal),
    });
    expect(url).not.toMatch(/type=|unresolved=|cursor=|offset=/);
  });

  it("posts every create field to the memories endpoint and returns a receipt", async () => {
    fetchMock.mockResolvedValue(json(createReceipt()));

    await expect(createMemory({
      content: "  一段新记忆  ",
      type: "event",
      importance: 0.5,
      keywords: ["海边"],
    }, { timeoutMs: 0 })).resolves.toEqual({
      id: "mem_created",
      content: "一段新记忆",
      type: "event",
      createdAt: 1_723_000_000.5,
      importance: 0.5,
      keywords: '["海边"]',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/memories");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      credentials: "include",
      signal: expect.any(AbortSignal),
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      content: "一段新记忆",
      type: "event",
      importance: 0.5,
      keywords: '["海边"]',
    });
  });

  it("sends explicit empty keywords and rejects malformed create responses", async () => {
    fetchMock
      .mockResolvedValueOnce(json(createReceipt({ keywords: "" })))
      .mockResolvedValueOnce(json(createReceipt({ importance: "0.5" })));

    await createMemory({
      content: "没有关键词",
      type: "event",
      importance: 0.5,
      keywords: [],
    }, { timeoutMs: 0 });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).keywords).toBe("");

    await expect(createMemory({
      content: "响应损坏",
      type: "event",
      importance: 0.5,
      keywords: [],
    }, { timeoutMs: 0 })).rejects.toBeInstanceOf(MemoryContractError);
  });

  it("preserves shared ApiError semantics for create HTTP failures", async () => {
    for (const status of [401, 422, 500]) {
      fetchMock.mockResolvedValueOnce(json({ detail: `status ${status}` }, status));

      await expect(createMemory({
        content: "一段记忆",
        type: "event",
        importance: 0.5,
        keywords: [],
      }, { timeoutMs: 0 })).rejects.toMatchObject({
        name: "ApiError",
        code: "HTTP_ERROR",
        status,
      });
    }
  });

  it("does not accept the legacy unpaged array response", async () => {
    fetchMock.mockResolvedValue(json([memory()]));
    await expect(listMemories({ page: 1, pageSize: 30 }, { timeoutMs: 0 }))
      .rejects.toBeInstanceOf(MemoryContractError);
  });

  it("sets unresolved true through the target-state PUT contract", async () => {
    fetchMock.mockResolvedValue(json({
      ok: true,
      id: "mem_1",
      unresolved: 1,
    }));

    await expect(setMemoryUnresolved("mem_1", true, { timeoutMs: 0 }))
      .resolves.toEqual({ ok: true, id: "mem_1", unresolved: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/memories/mem_1/unresolved");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "PUT",
      credentials: "include",
      signal: expect.any(AbortSignal),
    });
    expect(fetchMock.mock.calls[0]?.[1]?.method).not.toBe("PATCH");
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("content-type"),
    ).toBe("application/json");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      unresolved: true,
    });
  });

  it("preserves an explicit false target in the request body", async () => {
    fetchMock.mockResolvedValue(json({
      ok: true,
      id: "mem_1",
      unresolved: 0,
    }));

    await expect(setMemoryUnresolved("mem_1", false, { timeoutMs: 0 }))
      .resolves.toEqual({ ok: true, id: "mem_1", unresolved: 0 });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      unresolved: false,
    });
  });

  it.each([
    ["ok=false", { ok: false, id: "mem_1", unresolved: 1 }],
    ["missing ok", { id: "mem_1", unresolved: 1 }],
    ["missing id", { ok: true, unresolved: 1 }],
    ["mismatched id", { ok: true, id: "mem_2", unresolved: 1 }],
    ["missing unresolved", { ok: true, id: "mem_1" }],
    ["non-canonical unresolved", { ok: true, id: "mem_1", unresolved: true }],
  ])("rejects %s mutation responses", async (_case, payload) => {
    fetchMock.mockResolvedValue(json(payload));

    await expect(setMemoryUnresolved("mem_1", true, { timeoutMs: 0 }))
      .rejects.toBeInstanceOf(MemoryContractError);
  });

  it("preserves shared ApiError semantics for mutation HTTP failures", async () => {
    for (const status of [401, 404, 422, 500]) {
      fetchMock.mockResolvedValueOnce(json({ detail: `status ${status}` }, status));

      await expect(setMemoryUnresolved("mem_1", true, { timeoutMs: 0 }))
        .rejects.toMatchObject({
          name: "ApiError",
          code: "HTTP_ERROR",
          status,
        });
    }
  });
});

function memory(overrides: Record<string, unknown> = {}) {
  return {
    id: "mem_1",
    content: "一段真实记忆",
    type: "shared_moment",
    created_at: 1_720_000_000.5,
    source_conv: "conv_1",
    keywords: "[]",
    importance: 0.5,
    source_start_ts: 1_719_999_900,
    source_end_ts: 1_720_000_000,
    unresolved: 0,
    ...overrides,
  };
}

function page(items: unknown[]) {
  return {
    items,
    page: 1,
    page_size: 30,
    total: items.length,
    total_all: items.length,
    has_more: false,
  };
}

function createReceipt(overrides: Record<string, unknown> = {}) {
  return {
    id: "mem_created",
    content: "一段新记忆",
    type: "event",
    created_at: 1_723_000_000.5,
    importance: 0.5,
    keywords: '["海边"]',
    ...overrides,
  };
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
