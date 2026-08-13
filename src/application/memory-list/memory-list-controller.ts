import { loadMemoryList } from "@/application/memory-list/memory-list-service";
import {
  INITIAL_MEMORY_LIST_STATE,
  type MemoryListFilters,
  type MemoryListRequest,
  type MemoryListState,
} from "@/application/memory-list/memory-list-types";
import type { MemoryPage } from "@/domain/memory";
import { ApiError, type ApiRequestOptions } from "@/lib/api";
import { toSafeMemoryListError } from "@/application/memory-list/memory-list-service";

export type MemoryListLoader = (
  request: MemoryListRequest,
  options?: ApiRequestOptions,
) => Promise<MemoryPage>;

export interface MemoryListController {
  getState(): MemoryListState;
  load(): Promise<void>;
  setSearch(search: string): Promise<void>;
  setFilters(filters: Partial<Omit<MemoryListFilters, "search">>): Promise<void>;
  setPage(page: number): Promise<void>;
  subscribe(listener: (state: MemoryListState) => void): () => void;
  dispose(): void;
}

export function createMemoryListController(
  loader: MemoryListLoader = loadMemoryList,
): MemoryListController {
  let state = INITIAL_MEMORY_LIST_STATE;
  let activeController: AbortController | null = null;
  let requestSequence = 0;
  let disposed = false;
  const listeners = new Set<(state: MemoryListState) => void>();

  const publish = (nextState: MemoryListState) => {
    if (disposed) return;
    state = nextState;
    listeners.forEach((listener) => listener(state));
  };

  const execute = async (request: MemoryListRequest) => {
    if (disposed) return;

    const sequence = ++requestSequence;
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const previousData = state.data;
    publish({ status: "loading", data: previousData, error: null, request });

    try {
      const data = await loader(request, { signal: controller.signal });
      if (disposed || controller.signal.aborted || sequence !== requestSequence) return;
      publish({ status: "ready", data, error: null, request });
    } catch (error) {
      if (
        disposed ||
        controller.signal.aborted ||
        sequence !== requestSequence ||
        isAbortError(error)
      ) {
        return;
      }
      publish({
        status: "error",
        data: previousData,
        error: toSafeMemoryListError(error),
        request,
      });
    } finally {
      if (sequence === requestSequence) activeController = null;
    }
  };

  return {
    getState() {
      return state;
    },

    load() {
      return execute(state.request);
    },

    setSearch(search) {
      const normalized = search.trim().slice(0, 200);
      if (normalized === state.request.filters.search && state.request.page === 1) {
        return Promise.resolve();
      }
      return execute({
        page: 1,
        filters: { ...state.request.filters, search: normalized },
      });
    },

    setFilters(filters) {
      const nextFilters = { ...state.request.filters, ...filters };
      if (areFiltersEqual(nextFilters, state.request.filters) && state.request.page === 1) {
        return Promise.resolve();
      }
      return execute({ page: 1, filters: nextFilters });
    },

    setPage(page) {
      if (!Number.isInteger(page) || page < 1 || page === state.request.page) {
        return Promise.resolve();
      }
      return execute({ ...state.request, page });
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      requestSequence += 1;
      listeners.clear();
      activeController?.abort();
      activeController = null;
    },
  };
}

function areFiltersEqual(left: MemoryListFilters, right: MemoryListFilters): boolean {
  return (
    left.search === right.search &&
    left.date === right.date &&
    left.importance === right.importance &&
    left.pinFirst === right.pinFirst
  );
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof ApiError && error.code === "ABORTED") ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}
