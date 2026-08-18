import { describe, expect, it, vi } from "vitest";

import {
  createMemoryListController,
  getMemoryDateRange,
  mapMemoryListRequest,
  MEMORY_LIST_PAGE_SIZE,
  toSafeMemoryCreateError,
  toSafeMemoryListError,
  toSafeMemoryMutationError,
  type MemoryListRequest,
} from "@/application/memory-list";
import {
  MemoryContractError,
  type CreateMemoryInput,
  type Memory,
  type MemoryCreateResult,
  type MemoryPage,
  type MemoryUnresolvedMutationResult,
} from "@/domain/memory";
import { ApiError } from "@/lib/api";

describe("memory list application query", () => {
  it("maps search, pagination, supported filters, and no invented fields", () => {
    const mapped = mapMemoryListRequest(request({
      search: "海边",
      importance: "high",
      pinFirst: true,
    }, 3), new Date("2026-08-13T12:00:00+08:00"));

    expect(mapped).toEqual({
      page: 3,
      pageSize: MEMORY_LIST_PAGE_SIZE,
      search: "海边",
      importance: "high",
      pinFirst: true,
    });
    expect(mapped).not.toHaveProperty("type");
    expect(mapped).not.toHaveProperty("pinnedOnly");
  });

  it("uses the established local 04:00 memory day boundary", () => {
    const morning = getMemoryDateRange("today", new Date("2026-08-13T02:00:00+08:00"));
    expect(new Date(morning.createdFrom! * 1_000).getHours()).toBe(4);
    expect(new Date(morning.createdFrom! * 1_000).getDate()).toBe(12);
    expect(new Date(morning.createdTo! * 1_000).getDate()).toBe(13);
    expect(getMemoryDateRange("all", new Date())).toEqual({});
  });
});

describe("memory list controller", () => {
  it("moves idle/loading/ready, resets page on query changes, paginates, and retries", async () => {
    const loader = vi.fn().mockResolvedValue(page(1));
    const controller = createMemoryListController(loader);
    const statuses: string[] = [];
    controller.subscribe(({ status }) => statuses.push(status));

    await controller.load();
    await controller.setPage(2);
    await controller.setSearch("  海边  ");
    await controller.setFilters({ importance: "top" });
    await controller.load();

    expect(statuses).toEqual([
      "loading", "ready",
      "loading", "ready",
      "loading", "ready",
      "loading", "ready",
      "loading", "ready",
    ]);
    expect(loader.mock.calls.map(([value]) => value)).toEqual([
      request({}, 1),
      request({}, 2),
      request({ search: "海边" }, 1),
      request({ search: "海边", importance: "top" }, 1),
      request({ search: "海边", importance: "top" }, 1),
    ]);
  });

  it("keeps stale and aborted results from overwriting a newer query", async () => {
    const first = deferred<MemoryPage>();
    const second = deferred<MemoryPage>();
    const loader = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const controller = createMemoryListController(loader);

    const oldLoad = controller.load();
    const newLoad = controller.setSearch("new query");
    second.resolve(page(2));
    await newLoad;
    first.resolve(page(1));
    await oldLoad;

    expect(controller.getState()).toMatchObject({
      status: "ready",
      data: { page: 2 },
      request: { filters: { search: "new query" } },
    });
    expect(loader.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("changes pages without losing the active search or filter state", async () => {
    const loader = vi.fn(async (value: MemoryListRequest) => page(value.page));
    const controller = createMemoryListController(loader);

    await controller.load();
    await controller.setSearch("海边");
    await controller.setFilters({ date: "30-days", importance: "high" });
    await controller.setPage(2);

    expect(loader).toHaveBeenLastCalledWith(
      request({ search: "海边", date: "30-days", importance: "high" }, 2),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(controller.getState().request).toEqual(
      request({ search: "海边", date: "30-days", importance: "high" }, 2),
    );
  });

  it("exposes safe errors, preserves old data during retry, and never retains raw payload", async () => {
    const secret = "fake-memory-private-endpoint";
    const loader = vi.fn()
      .mockResolvedValueOnce(page(1))
      .mockRejectedValueOnce(new ApiError(secret, 500, { endpoint: secret }))
      .mockResolvedValueOnce(page(2));
    const controller = createMemoryListController(loader);
    await controller.load();
    await controller.setPage(2);

    expect(controller.getState()).toMatchObject({
      status: "error",
      data: { page: 1 },
    });
    expect(JSON.stringify(controller.getState())).not.toContain(secret);

    await controller.load();
    expect(controller.getState()).toMatchObject({ status: "ready", data: { page: 2 } });
  });

  it("aborts on dispose without publishing a terminal error", async () => {
    const loader = vi.fn((_request, options) => new Promise<MemoryPage>((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => {
        reject(new ApiError("aborted", 0, undefined, "ABORTED"));
      }, { once: true });
    }));
    const controller = createMemoryListController(loader);
    const listener = vi.fn();
    controller.subscribe(listener);
    const pending = controller.load();
    controller.dispose();
    await pending;

    expect(loader.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: "loading" }));
  });
});

describe("memory unresolved mutation coordinator", () => {
  it.each([
    ["Pin", false, true, 1 as const],
    ["Unpin", true, false, 0 as const],
  ])("completes %s with an explicit target and canonical refresh", async (
    _operation,
    initialPinned,
    target,
    unresolved,
  ) => {
    const loader = vi.fn()
      .mockResolvedValueOnce(projection(initialPinned))
      .mockResolvedValueOnce(projection(target));
    const mutator = vi.fn().mockResolvedValue(
      mutationResult(unresolved),
    );
    const controller = createMemoryListController(loader, mutator);

    await controller.load();
    await controller.setMemoryUnresolved("mem_1", target);

    expect(mutator).toHaveBeenCalledTimes(1);
    expect(mutator).toHaveBeenCalledWith(
      "mem_1",
      target,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(loader).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toMatchObject({
      status: "ready",
      data: { items: [{ id: "mem_1", isPinned: target }] },
      pendingMemoryIds: [],
      mutationError: null,
    });
  });

  it("keeps canonical data unchanged and only the current item pending before refresh", async () => {
    const mutation = deferred<MemoryUnresolvedMutationResult>();
    const refresh = deferred<MemoryPage>();
    const loader = vi.fn()
      .mockResolvedValueOnce(projection(false, [memory(false), memory(true, "mem_2")]))
      .mockReturnValueOnce(refresh.promise);
    const mutator = vi.fn().mockReturnValue(mutation.promise);
    const controller = createMemoryListController(loader, mutator);

    await controller.load();
    const inFlight = controller.setMemoryUnresolved("mem_1", true);
    await controller.setMemoryUnresolved("mem_1", true);

    expect(mutator).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({
      status: "ready",
      data: {
        items: [
          { id: "mem_1", isPinned: false },
          { id: "mem_2", isPinned: true },
        ],
      },
      pendingMemoryIds: ["mem_1"],
    });

    mutation.resolve(mutationResult(1));
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));

    expect(controller.getState()).toMatchObject({
      status: "ready",
      data: {
        items: [
          { id: "mem_1", isPinned: false },
          { id: "mem_2", isPinned: true },
        ],
      },
      pendingMemoryIds: ["mem_1"],
    });

    refresh.resolve(projection(true));
    await inFlight;

    expect(controller.getState()).toMatchObject({
      status: "ready",
      data: { items: [{ id: "mem_1", isPinned: true }] },
      pendingMemoryIds: [],
    });
  });

  it("reloads the complete active query without resetting page or filters", async () => {
    const loader = vi.fn().mockResolvedValue(projection(false));
    const mutator = vi.fn().mockResolvedValue(mutationResult(1));
    const controller = createMemoryListController(loader, mutator);

    await controller.load();
    await controller.setSearch("海边");
    await controller.setFilters({
      date: "30-days",
      importance: "high",
      pinFirst: true,
    });
    await controller.setPage(3);
    loader.mockClear();

    await controller.setMemoryUnresolved("mem_1", true);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith(
      request({
        search: "海边",
        date: "30-days",
        importance: "high",
        pinFirst: true,
      }, 3),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it.each([
    ["network", "NETWORK_ERROR" as const, "network" as const],
    ["timeout", "TIMEOUT" as const, "timeout" as const],
  ])("does not retry an uncertain %s mutation and reconciles by GET", async (
    _case,
    code,
    safeCode,
  ) => {
    const loader = vi.fn()
      .mockResolvedValueOnce(projection(false))
      .mockResolvedValueOnce(projection(true));
    const mutator = vi.fn().mockRejectedValue(
      new ApiError("private transport detail", 0, { private: true }, code),
    );
    const controller = createMemoryListController(loader, mutator);

    await controller.load();
    await controller.setMemoryUnresolved("mem_1", true);

    expect(mutator).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toMatchObject({
      status: "ready",
      data: { items: [{ id: "mem_1", isPinned: true }] },
      pendingMemoryIds: [],
      mutationError: { code: safeCode },
    });
    expect(JSON.stringify(controller.getState())).not.toContain("private transport detail");
  });

  it("surfaces 404 and refreshes the projection so a missing item disappears", async () => {
    const loader = vi.fn()
      .mockResolvedValueOnce(projection(false))
      .mockResolvedValueOnce(projection(false, []));
    const mutator = vi.fn().mockRejectedValue(
      new ApiError("private missing detail", 404, { detail: "private" }),
    );
    const controller = createMemoryListController(loader, mutator);

    await controller.load();
    await controller.setMemoryUnresolved("mem_1", true);

    expect(mutator).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toMatchObject({
      status: "ready",
      data: { items: [] },
      pendingMemoryIds: [],
      mutationError: { code: "not-found" },
    });
  });

  it.each([
    ["401", new ApiError("private auth", 401)],
    ["422", new ApiError("private validation", 422)],
    ["500", new ApiError("private server", 500)],
    ["contract", new MemoryContractError("private contract")],
  ])("keeps canonical local state on explicit %s failure", async (
    _case,
    error,
  ) => {
    const loader = vi.fn().mockResolvedValue(projection(false));
    const mutator = vi.fn().mockRejectedValue(error);
    const controller = createMemoryListController(loader, mutator);

    await controller.load();
    await controller.setMemoryUnresolved("mem_1", true);

    expect(mutator).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({
      status: "ready",
      data: { items: [{ id: "mem_1", isPinned: false }] },
      pendingMemoryIds: [],
      mutationError: {
        code: _case === "401"
          ? "authentication"
          : _case === "contract"
            ? "contract"
            : "server",
      },
    });
  });

  it("keeps a mutation refresh from overwriting a newer active query", async () => {
    const oldRefresh = deferred<MemoryPage>();
    const newQuery = deferred<MemoryPage>();
    const loader = vi.fn()
      .mockResolvedValueOnce(projection(false))
      .mockReturnValueOnce(oldRefresh.promise)
      .mockReturnValueOnce(newQuery.promise);
    const mutator = vi.fn().mockResolvedValue(mutationResult(1));
    const controller = createMemoryListController(loader, mutator);

    await controller.load();
    const mutation = controller.setMemoryUnresolved("mem_1", true);
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
    const query = controller.setSearch("新查询");

    newQuery.resolve(projection(true));
    await query;
    oldRefresh.resolve(projection(false));
    await mutation;

    expect(controller.getState()).toMatchObject({
      status: "ready",
      request: { filters: { search: "新查询" } },
      data: { items: [{ id: "mem_1", isPinned: true }] },
      pendingMemoryIds: [],
      mutationError: null,
    });
    expect(loader.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
  });
});

describe("memory create coordinator", () => {
  it("keeps create pending separate, blocks duplicates, and never inserts a receipt optimistically", async () => {
    const post = deferred<MemoryCreateResult>();
    const refresh = deferred<MemoryPage>();
    const loader = vi.fn()
      .mockResolvedValueOnce(projection(false))
      .mockReturnValueOnce(refresh.promise);
    const creator = vi.fn().mockReturnValue(post.promise);
    const controller = createMemoryListController(
      loader,
      vi.fn(),
      creator,
    );

    await controller.load();
    const creating = controller.createMemory(createInput());
    const duplicate = await controller.createMemory(createInput({ content: "重复" }));

    expect(duplicate).toBe(false);
    expect(creator).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({
      status: "ready",
      data: { items: [{ id: "mem_1" }] },
      isCreating: true,
      pendingMemoryIds: [],
      createError: null,
    });

    post.resolve(createResult());
    await expect(creating).resolves.toBe(true);
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));

    expect(controller.getState()).toMatchObject({
      data: { items: [{ id: "mem_1" }] },
      request: { page: 1 },
      isCreating: false,
    });
    expect(JSON.stringify(controller.getState().data)).not.toContain("mem_created");

    refresh.resolve(projection(false, []));
    await vi.waitFor(() => expect(controller.getState().data?.items).toEqual([]));
    expect(controller.getState()).toMatchObject({
      status: "ready",
      data: { items: [] },
      createError: null,
    });
  });

  it("refreshes page one while preserving q, time, importance, and pin-first", async () => {
    const loader = vi.fn().mockResolvedValue(projection(false));
    const creator = vi.fn().mockResolvedValue(createResult());
    const controller = createMemoryListController(loader, vi.fn(), creator);

    await controller.load();
    await controller.setSearch("海边");
    await controller.setFilters({
      date: "30-days",
      importance: "high",
      pinFirst: true,
    });
    await controller.setPage(3);
    loader.mockClear();

    await expect(controller.createMemory(createInput())).resolves.toBe(true);
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));

    expect(loader).toHaveBeenCalledWith(
      request({
        search: "海边",
        date: "30-days",
        importance: "high",
        pinFirst: true,
      }, 1),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(creator).toHaveBeenCalledWith(createInput());
  });

  it.each([
    ["401", new ApiError("private auth", 401), "authentication"],
    ["422", new ApiError("private validation", 422), "validation"],
    ["500", new ApiError("private server", 500), "server"],
    ["contract", new MemoryContractError("private contract"), "contract"],
  ])("keeps the create form state available on explicit %s failure", async (
    _case,
    error,
    safeCode,
  ) => {
    const loader = vi.fn().mockResolvedValue(projection(false));
    const creator = vi.fn().mockRejectedValue(error);
    const controller = createMemoryListController(loader, vi.fn(), creator);
    await controller.load();

    await expect(controller.createMemory(createInput())).resolves.toBe(false);

    expect(creator).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({
      status: "ready",
      data: { items: [{ id: "mem_1" }] },
      isCreating: false,
      createError: { code: safeCode },
    });
    expect(JSON.stringify(controller.getState())).not.toContain("private");
  });

  it.each([
    ["network", "NETWORK_ERROR" as const],
    ["timeout", "TIMEOUT" as const],
  ])("does not retry an uncertain %s POST or describe it as a confirmed failure", async (
    _case,
    code,
  ) => {
    const loader = vi.fn().mockResolvedValue(projection(false));
    const creator = vi.fn().mockRejectedValue(
      new ApiError("private uncertainty", 0, { private: true }, code),
    );
    const controller = createMemoryListController(loader, vi.fn(), creator);
    await controller.load();

    await expect(controller.createMemory(createInput())).resolves.toBe(false);

    expect(creator).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({
      isCreating: false,
      createError: {
        code: "uncertain",
        message: expect.stringContaining("结果暂时无法确认"),
      },
    });
    expect(controller.getState().createError?.message).not.toContain("保存失败");
  });

  it("reports a refresh failure as saved-but-unsynced without retrying POST", async () => {
    const loader = vi.fn()
      .mockResolvedValueOnce(projection(false))
      .mockRejectedValueOnce(new ApiError("private refresh", 0, undefined, "NETWORK_ERROR"));
    const creator = vi.fn().mockResolvedValue(createResult());
    const controller = createMemoryListController(loader, vi.fn(), creator);
    await controller.load();

    await expect(controller.createMemory(createInput())).resolves.toBe(true);
    await vi.waitFor(() => {
      expect(controller.getState().mutationError).toEqual({
        code: "sync",
        message: "记忆已保存，但列表暂时无法刷新。",
      });
    });

    expect(creator).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toMatchObject({
      isCreating: false,
      createError: null,
    });
  });
});

describe("memory list safe errors", () => {
  it("maps transport categories without raw details", () => {
    const secret = "private-token";
    const errors = [
      new ApiError(secret, 401, { secret }),
      new ApiError(secret, 0, { secret }, "NETWORK_ERROR"),
      new ApiError(secret, 0, { secret }, "TIMEOUT"),
      { secret },
    ];
    for (const error of errors) {
      const safe = toSafeMemoryListError(error);
      expect(JSON.stringify(safe)).not.toContain(secret);
      expect(Object.keys(safe).sort()).toEqual(["code", "message"]);
    }
  });

  it("maps mutation errors without retaining raw transport details", () => {
    const secret = "private-mutation-payload";
    const errors = [
      new ApiError(secret, 401, { secret }),
      new ApiError(secret, 404, { secret }),
      new ApiError(secret, 0, { secret }, "NETWORK_ERROR"),
      new ApiError(secret, 0, { secret }, "TIMEOUT"),
      new ApiError(secret, 422, { secret }),
      new ApiError(secret, 500, { secret }),
      new MemoryContractError(secret),
      { secret },
    ];

    for (const error of errors) {
      const safe = toSafeMemoryMutationError(error);
      expect(JSON.stringify(safe)).not.toContain(secret);
      expect(Object.keys(safe).sort()).toEqual(["code", "message"]);
    }
  });

  it("keeps create uncertainty distinct and never retains raw transport details", () => {
    const secret = "private-create-payload";
    const errors = [
      new ApiError(secret, 401, { secret }),
      new ApiError(secret, 0, { secret }, "NETWORK_ERROR"),
      new ApiError(secret, 0, { secret }, "TIMEOUT"),
      new ApiError(secret, 422, { secret }),
      new ApiError(secret, 500, { secret }),
      new MemoryContractError(secret),
      { secret },
    ];

    for (const error of errors) {
      const safe = toSafeMemoryCreateError(error);
      expect(JSON.stringify(safe)).not.toContain(secret);
      expect(Object.keys(safe).sort()).toEqual(["code", "message"]);
    }
    expect(toSafeMemoryCreateError(errors[1]).code).toBe("uncertain");
    expect(toSafeMemoryCreateError(errors[2]).code).toBe("uncertain");
  });
});

function request(
  overrides: Partial<MemoryListRequest["filters"]> = {},
  pageNumber = 1,
): MemoryListRequest {
  return {
    page: pageNumber,
    filters: {
      search: "",
      date: "all",
      importance: "all",
      pinFirst: false,
      ...overrides,
    },
  };
}

function page(pageNumber: number): MemoryPage {
  return {
    items: [],
    page: pageNumber,
    pageSize: 30,
    total: 0,
    totalAll: 0,
    hasMore: false,
  };
}

function projection(
  isPinned: boolean,
  items: readonly Memory[] = [memory(isPinned)],
): MemoryPage {
  return {
    items,
    page: 1,
    pageSize: 30,
    total: items.length,
    totalAll: items.length,
    hasMore: false,
  };
}

function memory(isPinned: boolean, id = "mem_1"): Memory {
  return {
    id,
    content: "canonical memory",
    type: "promise",
    createdAt: 1_720_000_000,
    sourceConversationId: null,
    tags: [],
    importance: 0.8,
    sourceStartedAt: null,
    sourceEndedAt: null,
    isPinned,
  };
}

function mutationResult(unresolved: 0 | 1): MemoryUnresolvedMutationResult {
  return { ok: true, id: "mem_1", unresolved };
}

function createInput(overrides: Partial<CreateMemoryInput> = {}): CreateMemoryInput {
  return {
    content: "一段新记忆",
    type: "event",
    importance: 0.5,
    keywords: ["海边"],
    ...overrides,
  };
}

function createResult(): MemoryCreateResult {
  return {
    id: "mem_created",
    content: "一段新记忆",
    type: "event",
    createdAt: 1_723_000_000,
    importance: 0.5,
    keywords: '["海边"]',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
