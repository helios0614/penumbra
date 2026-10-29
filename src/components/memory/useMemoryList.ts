import { useCallback, useEffect, useRef, useState } from "react";

import {
  createMemoryListController,
  INITIAL_MEMORY_LIST_STATE,
  type MemoryDateFilter,
  type MemoryImportanceFilter,
  type MemoryListController,
  type MemoryListState,
} from "@/application/memory-list";
import { createMemoryManagementController, INITIAL_MEMORY_MANAGEMENT_STATE, type MemoryAction, type MemoryManagementController, type MemoryManagementState } from "@/application/memory-management";
import type { MemoryEditInput } from "@/domain/memory";
import type { CreateMemoryInput } from "@/domain/memory";
import { useToast } from "@/components/ui/toast";

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
  readonly managementState: MemoryManagementState;
  readonly openMemoryAction: (action: MemoryAction) => void;
  readonly closeMemoryAction: () => void;
  readonly submitMemoryAction: (input?: MemoryEditInput) => Promise<boolean>;
  readonly checkMemorySource: (id: string) => void;
  readonly digestMemories: () => void;
  readonly refreshMemoryTask: (id: string) => void;
}

export function useMemoryList(): UseMemoryListResult {
  const [state, setState] = useState<MemoryListState>(INITIAL_MEMORY_LIST_STATE);
  const [managementState, setManagementState] = useState(INITIAL_MEMORY_MANAGEMENT_STATE);
  const managementRef = useRef<MemoryManagementController | null>(null);
  const [searchInput, setSearchInputState] = useState("");
  const toast = useToast(JSON.stringify(state.request));
  const createToast = useToast("create");
  const controllerRef = useRef<MemoryListController | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const controller = createMemoryListController();
    controllerRef.current = controller;
    const management = createMemoryManagementController(controller);
    managementRef.current = management;
    const unsubscribeManagement = management.subscribe(setManagementState);
    const unsubscribe = controller.subscribe(setState);
    void controller.load();

    return () => {
      if (searchTimerRef.current !== null) clearTimeout(searchTimerRef.current);
      unsubscribeManagement();
      management.dispose();
      if (managementRef.current === management) managementRef.current = null;
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
    void controllerRef.current?.setMemoryUnresolved(memoryId, unresolved).then((saved) => {
      if (saved) toast.show({ type: "success", text: unresolved ? "已标记为待继续" : "已取消待继续标记", dedupeKey: memoryId });
    });
  }, [toast]);

  const createMemory = useCallback(async (input: CreateMemoryInput) => {
    const saved = await controllerRef.current?.createMemory(input) ?? false;
    if (saved) createToast.show({ type: "success", text: "已创建记忆" });
    return saved;
  }, [createToast]);

  const clearCreateError = useCallback(() => {
    controllerRef.current?.clearCreateError();
  }, []);

  const retry = useCallback(() => {
    void controllerRef.current?.load();
  }, []);

  const openMemoryAction = useCallback((action: MemoryAction) => managementRef.current?.open(action), []);
  const closeMemoryAction = useCallback(() => managementRef.current?.close(), []);
  const checkMemorySource = useCallback((id: string) => { void managementRef.current?.checkSource(id); }, []);
  const digestMemories = useCallback(() => { void managementRef.current?.digest(); }, []);
  const refreshMemoryTask = useCallback((id: string) => { void managementRef.current?.refreshTask(id); }, []);
  const submitMemoryAction = useCallback(async (input?: MemoryEditInput) => {
    const kind = managementRef.current?.getState().action?.kind;
    const saved = await managementRef.current?.submit(input) ?? false;
    if (saved) toast.show({ type: "success", text: kind === "edit" ? "已保存记忆" : kind === "delete" ? "已删除记忆记录" : kind === "requeue" ? "来源请求已确认，请查看任务状态" : "已重新总结记忆" });
    return saved;
  }, [toast]);

  return {
    managementState, openMemoryAction, closeMemoryAction, submitMemoryAction, checkMemorySource, digestMemories, refreshMemoryTask,
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
