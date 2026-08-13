import type {
  MemoryImportanceFilter,
  MemoryPage,
} from "@/domain/memory";

export const MEMORY_LIST_PAGE_SIZE = 30;

export type MemoryDateFilter = "all" | "today" | "7-days" | "30-days";

export type MemoryListFilters = {
  readonly search: string;
  readonly date: MemoryDateFilter;
  readonly importance: MemoryImportanceFilter;
  readonly pinFirst: boolean;
};

export type MemoryListRequest = {
  readonly page: number;
  readonly filters: MemoryListFilters;
};

export type SafeMemoryListError = {
  readonly code: "authentication" | "network" | "timeout" | "contract" | "unknown";
  readonly message: string;
};

type MemoryListStateBase = {
  readonly request: MemoryListRequest;
};

export type MemoryListState =
  | (MemoryListStateBase & {
      readonly status: "idle";
      readonly data: null;
      readonly error: null;
    })
  | (MemoryListStateBase & {
      readonly status: "loading";
      readonly data: MemoryPage | null;
      readonly error: null;
    })
  | (MemoryListStateBase & {
      readonly status: "ready";
      readonly data: MemoryPage;
      readonly error: null;
    })
  | (MemoryListStateBase & {
      readonly status: "error";
      readonly data: MemoryPage | null;
      readonly error: SafeMemoryListError;
    });

export const INITIAL_MEMORY_LIST_FILTERS: MemoryListFilters = Object.freeze({
  search: "",
  date: "all",
  importance: "all",
  pinFirst: false,
});

export const INITIAL_MEMORY_LIST_REQUEST: MemoryListRequest = Object.freeze({
  page: 1,
  filters: INITIAL_MEMORY_LIST_FILTERS,
});

export const INITIAL_MEMORY_LIST_STATE: MemoryListState = Object.freeze({
  status: "idle",
  data: null,
  error: null,
  request: INITIAL_MEMORY_LIST_REQUEST,
});
