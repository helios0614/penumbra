import { useCallback, useEffect, useRef, useState } from "react";

import {
  createMemoryListController,
  INITIAL_MEMORY_LIST_STATE,
  type MemoryDateFilter,
  type MemoryImportanceFilter,
  type MemoryListController,
  type MemoryListState,
} from "@/application/memory-list";
import type { CreateMemoryInput } from "@/domain/memory";

const SEARCH_DEBOUNCE_MS = 300;

export interface UseMemoryListResult {
  readonly state: MemoryListState;
  readonly searchInput: string;
  readonly setSearchInput: (value: string) => void;
  readonly setDateFilter: (value: MemoryDateFilter) => void;
  readonly setImportanceFilter: (value: MemoryImportanceFilter) => void;
  readonly setPinFirst: (value: boolean) => void;
  readonly setPage: (page: number) => void;
  readonly setMemoryUnresolved: (memoryId: string, unresolved: boolean) => void;
  readonly createMemory: (input: CreateMemoryInput) => Promise<boolean>;
  readonly clearCreateError: () => void;
  readonly retry: () => void;
}

export function useMemoryList(): UseMemoryListResult {
  const [state, setState] = useState<MemoryListState>(INITIAL_MEMORY_LIST_STATE);
  const [searchInput, setSearchInputState] = useState("");
  const controllerRef = useRef<MemoryListController | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const controller = createMemoryListController();
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe(setState);
    void controller.load();

    return () => {
      if (searchTimerRef.current !== null) clearTimeout(searchTimerRef.current);
      unsubscribe();
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, []);

  const setSearchInput = useCallback((value: string) => {
    const nextValue = value.slice(0, 200);
    setSearchInputState(nextValue);
    if (searchTimerRef.current !== null) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      searchTimerRef.current = null;
      void controllerRef.current?.setSearch(nextValue);
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  const setDateFilter = useCallback((date: MemoryDateFilter) => {
    void controllerRef.current?.setFilters({ date });
  }, []);

  const setImportanceFilter = useCallback((importance: MemoryImportanceFilter) => {
    void controllerRef.current?.setFilters({ importance });
  }, []);

  const setPinFirst = useCallback((pinFirst: boolean) => {
    void controllerRef.current?.setFilters({ pinFirst });
  }, []);

  const setPage = useCallback((page: number) => {
    void controllerRef.current?.setPage(page);
  }, []);

  const setMemoryUnresolved = useCallback((memoryId: string, unresolved: boolean) => {
    void controllerRef.current?.setMemoryUnresolved(memoryId, unresolved);
  }, []);

  const createMemory = useCallback((input: CreateMemoryInput) => {
    return controllerRef.current?.createMemory(input) ?? Promise.resolve(false);
  }, []);

  const clearCreateError = useCallback(() => {
    controllerRef.current?.clearCreateError();
  }, []);

  const retry = useCallback(() => {
    void controllerRef.current?.load();
  }, []);

  return {
    state,
    searchInput,
    setSearchInput,
    setDateFilter,
    setImportanceFilter,
    setPinFirst,
    setPage,
    setMemoryUnresolved,
    createMemory,
    clearCreateError,
    retry,
  };
}
