import {
  loadMemoryList,
  memoryCreateRefreshError,
  memoryMutationRefreshError,
  persistMemory,
  toSafeMemoryListError,
  toSafeMemoryCreateError,
  toSafeMemoryMutationError,
} from "@/application/memory-list/memory-list-service";
import {
  INITIAL_MEMORY_LIST_STATE,
  type MemoryListFilters,
  type MemoryListRequest,
  type MemoryListState,
} from "@/application/memory-list/memory-list-types";
import {
  type CreateMemoryInput,
  type MemoryCreateResult,
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

export type MemoryCreator = (
  input: CreateMemoryInput,
  options?: ApiRequestOptions,
) => Promise<MemoryCreateResult>;

export interface MemoryListController {
  getState(): MemoryListState;
  load(): Promise<void>;
  setSearch(search: string): Promise<void>;
  setFilters(filters: Partial<Omit<MemoryListFilters, "search">>): Promise<void>;
  setPage(page: number): Promise<void>;
  setMemoryUnresolved(memoryId: string, unresolved: boolean): Promise<void>;
  createMemory(input: CreateMemoryInput): Promise<boolean>;
  clearCreateError(): void;
  subscribe(listener: (state: MemoryListState) => void): () => void;
  dispose(): void;
}

export function createMemoryListController(
  loader: MemoryListLoader = loadMemoryList,
  mutateUnresolved: MemoryUnresolvedMutator = setMemoryUnresolved,
  create: MemoryCreator = persistMemory,
): MemoryListController {
  let state = INITIAL_MEMORY_LIST_STATE;
  let activeController: AbortController | null = null;
  let requestSequence = 0;
  let disposed = false;
  const listeners = new Set<(state: MemoryListState) => void>();
  const mutationControllers = new Map<string, AbortController>();
  const pendingMemoryIds = new Set<string>();
  let createInFlight = false;
  // A confirmed write stays unsynchronized until a current GET succeeds,
  // including when its first refresh is superseded by a newer query.
  let pendingSyncError: MemoryListState["mutationError"] = null;

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
    if (mode === "foreground" || !previousData) {
      publish({
        status: "loading",
        data: previousData,
        error: null,
        request,
        pendingMemoryIds: [...pendingMemoryIds],
        mutationError: state.mutationError,
        isCreating: state.isCreating,
        createError: state.createError,
      });
    }

    try {
      const data = await loader(request, { signal: controller.signal });
      if (disposed || controller.signal.aborted || sequence !== requestSequence) {
        return "superseded";
      }
      pendingSyncError = null;
      publish({
        status: "ready",
        data,
        error: null,
        request,
        pendingMemoryIds: [...pendingMemoryIds],
        mutationError: state.mutationError?.code === "sync" ? null : state.mutationError,
        isCreating: state.isCreating,
        createError: state.createError,
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
      publish({
        status: "error",
        data: previousData,
        error: toSafeMemoryListError(error),
        request,
        pendingMemoryIds: [...pendingMemoryIds],
        mutationError: pendingSyncError ?? state.mutationError,
        isCreating: state.isCreating,
        createError: state.createError,
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
      publishMutationState(state.mutationError?.code === "sync" ? state.mutationError : null);

      let mutationFailure: unknown;
      let mutationFailed = false;
      let cancelled = false;

      try {
        await mutateUnresolved(memoryId, unresolved, {
          signal: controller.signal,
        });
        if (disposed || controller.signal.aborted) {
          cancelled = true;
          return;
        }
        pendingSyncError = memoryMutationRefreshError();
        await execute(state.request, "reconcile");
      } catch (error) {
        if (disposed || controller.signal.aborted || isAbortError(error)) {
          cancelled = true;
          return;
        }

        mutationFailure = error;
        mutationFailed = true;
        if (shouldReconcileMutationFailure(error)) {
          await execute(state.request, "reconcile");
        }
      } finally {
        mutationControllers.delete(memoryId);
        pendingMemoryIds.delete(memoryId);
        if (!disposed && !cancelled) {
          publishMutationState(
            mutationFailed && state.mutationError?.code !== "sync"
              ? toSafeMemoryMutationError(mutationFailure)
              : state.mutationError,
          );
        }
      }
    },

    async createMemory(input) {
      if (disposed || createInFlight) return false;

      createInFlight = true;
      publish({
        ...state,
        isCreating: true,
        createError: null,
      });

      try {
        await create(input);
        createInFlight = false;
        if (disposed) return false;

        const refreshRequest: MemoryListRequest = {
          page: 1,
          filters: state.request.filters,
        };
        pendingSyncError = memoryCreateRefreshError();
        publish({
          ...state,
          request: refreshRequest,
          isCreating: false,
          createError: null,
          mutationError: state.mutationError?.code === "sync" ? state.mutationError : null,
        });

        void execute(refreshRequest, "reconcile");
        return true;
      } catch (error) {
        createInFlight = false;
        if (disposed) return false;
        publish({
          ...state,
          isCreating: false,
          createError: toSafeMemoryCreateError(error),
        });
        return false;
      }
    },

    clearCreateError() {
      if (disposed || state.createError === null) return;
      publish({ ...state, createError: null });
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
      createInFlight = false;
      pendingSyncError = null;
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
