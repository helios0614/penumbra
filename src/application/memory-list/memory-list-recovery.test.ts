import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryListController } from "@/application/memory-list";
import type { MemoryCreateResult, MemoryPage } from "@/domain/memory";
import { ApiError } from "@/lib/api";

afterEach(() => vi.unstubAllGlobals());

describe("memory write synchronization recovery", () => {
  it.each(["create", "pin"] as const)(
    "recovers %s by GET only, preserving data and the active query across failed retries",
    async (operation) => {
      let failReads = false;
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), "http://localhost");
        if (init?.method === "POST") {
          const receipt = createReceipt();
          return json({ ...receipt, created_at: receipt.createdAt });
        }
        if (init?.method === "PUT") {
          return json({ ok: true, id: "mem_1", unresolved: 1 });
        }
        if (failReads) return json({ detail: "read unavailable" }, 503);
        return json({
          items: [{ id: "mem_1", content: "已读取的记忆", created_at: 1_720_000_000, unresolved: 1 }],
          page: Number(url.searchParams.get("page")),
          page_size: 30,
          total: 90,
          total_all: 90,
          has_more: Number(url.searchParams.get("page")) < 3,
        });
      });
      vi.stubGlobal("fetch", fetchMock);
      const controller = createMemoryListController();
      await controller.load();
      await controller.setSearch("海边");
      await controller.setFilters({ date: "30-days", importance: "high", pinFirst: true });
      await controller.setPage(3);
      const previousData = controller.getState().data;
      failReads = true;

      if (operation === "create") {
        await expect(controller.createMemory(createInput())).resolves.toBe(true);
      } else {
        await controller.setMemoryUnresolved("mem_1", true);
      }
      await vi.waitFor(() => expect(controller.getState().mutationError?.code).toBe("sync"));

      const expectedPage = operation === "create" ? 1 : 3;
      const failedState = controller.getState();
      expect(failedState).toMatchObject({
        status: "error",
        isCreating: false,
        createError: null,
        pendingMemoryIds: [],
        request: {
          page: expectedPage,
          filters: { search: "海边", date: "30-days", importance: "high", pinFirst: true },
        },
      });
      expect(failedState.data).toBe(previousData);
      expect(failedState.mutationError?.message).toContain(
        operation === "create" ? "记忆已保存" : "标记请求已完成",
      );
      const failedReadUrl = String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1]?.[0]);

      const failedRetry = controller.load();
      expect(controller.getState()).toMatchObject({
        status: "loading",
        data: previousData,
        error: null,
        mutationError: failedState.mutationError,
      });
      await failedRetry;
      expect(controller.getState()).toMatchObject({
        status: "error",
        data: previousData,
        mutationError: failedState.mutationError,
      });

      failReads = false;
      await controller.load();
      expect(controller.getState()).toMatchObject({
        status: "ready",
        data: { page: expectedPage },
        request: failedState.request,
        mutationError: null,
        error: null,
      });
      expect(fetchMock.mock.calls.slice(-2).map(([url]) => String(url))).toEqual([
        failedReadUrl, failedReadUrl,
      ]);
      const writes = fetchMock.mock.calls.filter(([, init]) => init?.method !== "GET");
      expect(writes).toHaveLength(1);
      expect(writes[0]?.[1]?.method).toBe(operation === "create" ? "POST" : "PUT");
      controller.dispose();
    },
  );

  it.each(["resolve", "reject"] as const)(
    "ends initial loading after create refresh failure and ignores a late initial %s",
    async (lateOutcome) => {
      const initial = deferred<MemoryPage>();
      const refresh = deferred<MemoryPage>();
      const retry = deferred<MemoryPage>();
      const post = deferred<MemoryCreateResult>();
      const loader = vi.fn()
        .mockReturnValueOnce(initial.promise)
        .mockReturnValueOnce(refresh.promise)
        .mockReturnValueOnce(retry.promise);
      const creator = vi.fn().mockReturnValue(post.promise);
      const controller = createMemoryListController(loader, vi.fn(), creator);
      const initialLoad = controller.load();
      const creating = controller.createMemory(createInput());
      await expect(controller.createMemory(createInput())).resolves.toBe(false);

      post.resolve(createReceipt());
      await expect(creating).resolves.toBe(true);
      expect(loader).toHaveBeenCalledTimes(2);
      expect(loader.mock.calls[0]?.[1]?.signal.aborted).toBe(true);
      refresh.reject(readFailure());
      await vi.waitFor(() => expect(controller.getState()).toMatchObject({
        status: "error",
        data: null,
        mutationError: { code: "sync" },
        isCreating: false,
        createError: null,
      }));

      const recovery = controller.load();
      expect(controller.getState()).toMatchObject({ status: "loading", data: null });
      if (lateOutcome === "resolve") {
        initial.resolve(emptyPage(9));
        await initialLoad;
        expect(controller.getState()).toMatchObject({ status: "loading", data: null });
      }
      retry.resolve(emptyPage(1));
      await recovery;
      if (lateOutcome === "reject") {
        initial.reject(readFailure());
        await initialLoad;
      }
      expect(controller.getState()).toMatchObject({
        status: "ready", data: { page: 1 }, mutationError: null, error: null,
      });
      expect(creator).toHaveBeenCalledTimes(1);
      expect(loader).toHaveBeenCalledTimes(3);
      controller.dispose();
    },
  );

  it("keeps confirmed write recovery when a newer query supersedes its refresh and also fails", async () => {
    const refresh = deferred<MemoryPage>();
    const loader = vi.fn()
      .mockResolvedValueOnce(emptyPage(1))
      .mockReturnValueOnce(refresh.promise)
      .mockRejectedValueOnce(readFailure())
      .mockResolvedValueOnce(emptyPage(1));
    const creator = vi.fn().mockResolvedValue(createReceipt());
    const controller = createMemoryListController(loader, vi.fn(), creator);
    await controller.load();
    await controller.createMemory(createInput());
    await controller.setSearch("更新的查询");
    refresh.reject(readFailure());
    await vi.waitFor(() => expect(controller.getState()).toMatchObject({
      status: "error",
      request: { filters: { search: "更新的查询" } },
      mutationError: { code: "sync", message: expect.stringContaining("记忆已保存") },
    }));

    await controller.load();
    expect(controller.getState()).toMatchObject({
      status: "ready",
      request: { filters: { search: "更新的查询" } },
      mutationError: null,
    });
    expect(creator).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("does not let an older create refresh failure replace a newer successful query", async () => {
    const refresh = deferred<MemoryPage>();
    const loader = vi.fn()
      .mockResolvedValueOnce(emptyPage(1))
      .mockReturnValueOnce(refresh.promise)
      .mockResolvedValueOnce(emptyPage(1));
    const creator = vi.fn().mockResolvedValue(createReceipt());
    const controller = createMemoryListController(loader, vi.fn(), creator);
    await controller.load();
    await controller.createMemory(createInput());
    await controller.setFilters({ importance: "top" });
    const delivered = controller.getState();
    refresh.reject(readFailure());
    await vi.waitFor(() => expect(loader.mock.calls[1]?.[1]?.signal.aborted).toBe(true));
    expect(controller.getState()).toEqual(delivered);
    expect(controller.getState()).toMatchObject({ status: "ready", mutationError: null });
    controller.dispose();
  });
});

function readFailure() {
  return new ApiError("read unavailable", 0, undefined, "NETWORK_ERROR");
}

function createInput() {
  return { content: "一段新记忆", type: "event", importance: 0.5, keywords: [] };
}

function createReceipt(): MemoryCreateResult {
  return {
    id: "mem_created", content: "一段新记忆", type: "event", importance: 0.5,
    keywords: "", createdAt: 1_723_000_000,
  };
}

function emptyPage(page: number): MemoryPage {
  return { items: [], page, pageSize: 30, total: 0, totalAll: 0, hasMore: false };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
