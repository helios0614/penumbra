import {
  loadMemoryList,
  memoryMutationRefreshError,
  toSafeMemoryListError,
  toSafeMemoryMutationError,
} from "@/application/memory-list/memory-list-service";
import {
  INITIAL_MEMORY_LIST_STATE,
  type MemoryListFilters,
  type MemoryListRequest,
  type MemoryListState,
} from "@/application/memory-list/memory-list-types";
import {
  setMemoryUnresolved,
  type MemoryPage,
  type MemoryUnresolvedMutationResult,
} from "@/domain/memory";
import { ApiError, type ApiRequestOptions } from "@/lib/api";

export type MemoryListLoader = (
  request: MemoryListRequest,
  options?: ApiRequestOptions,
) => Promise<MemoryPage>;

export type MemoryUnresolvedMutator = (
  memoryId: string,
  unresolved: boolean,
  options?: ApiRequestOptions,
) => Promise<MemoryUnresolvedMutationResult>;

export interface MemoryListController {
  getState(): MemoryListState;
  load(): Promise<void>;
  setSearch(search: string): Promise<void>;
  setFilters(filters: Partial<Omit<MemoryListFilters, "search">>): Promise<void>;
  setPage(page: number): Promise<void>;
  setMemoryUnresolved(memoryId: string, unresolved: boolean): Promise<void>;
  subscribe(listener: (state: MemoryListState) => void): () => void;
  dispose(): void;
}

export function createMemoryListController(
  loader: MemoryListLoader = loadMemoryList,
  mutateUnresolved: MemoryUnresolvedMutator = setMemoryUnresolved,
): MemoryListController {
  let state = INITIAL_MEMORY_LIST_STATE;
  let activeController: AbortController | null = null;
  let requestSequence = 0;
  let disposed = false;
  const listeners = new Set<(state: MemoryListState) => void>();
  const mutationControllers = new Map<string, AbortController>();
  const pendingMemoryIds = new Set<string>();

  const publish = (nextState: MemoryListState) => {
    if (disposed) return;
    state = nextState;
    listeners.forEach((listener) => listener(state));
  };

  const publishMutationState = (
    mutationError: MemoryListState["mutationError"],
  ) => {
    publish({
      ...state,
      pendingMemoryIds: [...pendingMemoryIds],
      mutationError,
    });
  };

  const execute = async (
    request: MemoryListRequest,
    mode: "foreground" | "reconcile" = "foreground",
  ): Promise<"delivered" | "failed" | "superseded"> => {
    if (disposed) return "superseded";

    const sequence = ++requestSequence;
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const previousData = state.data;
    if (mode === "foreground") {
      publish({
        status: "loading",
        data: previousData,
        error: null,
        request,
        pendingMemoryIds: [...pendingMemoryIds],
        mutationError: state.mutationError,
      });
    }

    try {
      const data = await loader(request, { signal: controller.signal });
      if (disposed || controller.signal.aborted || sequence !== requestSequence) {
        return "superseded";
      }
      publish({
        status: "ready",
        data,
        error: null,
        request,
        pendingMemoryIds: [...pendingMemoryIds],
        mutationError: state.mutationError,
      });
      return "delivered";
    } catch (error) {
      if (
        disposed ||
        controller.signal.aborted ||
        sequence !== requestSequence ||
        isAbortError(error)
      ) {
        return "superseded";
      }
      if (mode === "reconcile") {
        return "failed";
      }
      publish({
        status: "error",
        data: previousData,
        error: toSafeMemoryListError(error),
        request,
        pendingMemoryIds: [...pendingMemoryIds],
        mutationError: state.mutationError,
      });
      return "failed";
    } finally {
      if (sequence === requestSequence) activeController = null;
    }
  };

  return {
    getState() {
      return state;
    },

    load() {
      return execute(state.request).then(() => undefined);
    },

    setSearch(search) {
      const normalized = search.trim().slice(0, 200);
      if (normalized === state.request.filters.search && state.request.page === 1) {
        return Promise.resolve();
      }
      return execute({
        page: 1,
        filters: { ...state.request.filters, search: normalized },
      }).then(() => undefined);
    },

    setFilters(filters) {
      const nextFilters = { ...state.request.filters, ...filters };
      if (areFiltersEqual(nextFilters, state.request.filters) && state.request.page === 1) {
        return Promise.resolve();
      }
      return execute({ page: 1, filters: nextFilters }).then(() => undefined);
    },

    setPage(page) {
      if (!Number.isInteger(page) || page < 1 || page === state.request.page) {
        return Promise.resolve();
      }
      return execute({ ...state.request, page }).then(() => undefined);
    },

    async setMemoryUnresolved(memoryId, unresolved) {
      if (disposed || mutationControllers.has(memoryId)) return;

      const controller = new AbortController();
      mutationControllers.set(memoryId, controller);
      pendingMemoryIds.add(memoryId);
      publishMutationState(null);

      let mutationFailure: unknown;
      let mutationFailed = false;
      let refreshOutcome: "delivered" | "failed" | "superseded" | null = null;
      let cancelled = false;

      try {
        await mutateUnresolved(memoryId, unresolved, {
          signal: controller.signal,
        });
        if (disposed || controller.signal.aborted) {
          cancelled = true;
          return;
        }
        refreshOutcome = await execute(state.request, "reconcile");
      } catch (error) {
        if (disposed || controller.signal.aborted || isAbortError(error)) {
          cancelled = true;
          return;
        }

        mutationFailure = error;
        mutationFailed = true;
        if (shouldReconcileMutationFailure(error)) {
          refreshOutcome = await execute(state.request, "reconcile");
        }
      } finally {
        mutationControllers.delete(memoryId);
        pendingMemoryIds.delete(memoryId);
        if (!disposed && !cancelled) {
          publishMutationState(
            mutationFailed
              ? toSafeMemoryMutationError(mutationFailure)
              : refreshOutcome === "failed"
                ? memoryMutationRefreshError()
                : null,
          );
        }
      }
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
      mutationControllers.forEach((controller) => controller.abort());
      mutationControllers.clear();
      pendingMemoryIds.clear();
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

function shouldReconcileMutationFailure(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 404 ||
      error.code === "NETWORK_ERROR" ||
      error.code === "TIMEOUT" ||
      error.code === "INVALID_RESPONSE")
  );
}
