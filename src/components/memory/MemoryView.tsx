import { useEffect, useRef, useState, type RefObject } from "react";
import { Plus, X, BrainCircuit, RefreshCw, LoaderCircle } from "lucide-react";

import type {
  SafeMemoryListError,
  SafeMemoryMutationError,
} from "@/application/memory-list";
import { MemoryCreateDialog } from "@/components/memory/MemoryCreateDialog";
import { MemoryFilters } from "@/components/memory/MemoryFilters";
import { MemoryItem } from "@/components/memory/MemoryItem";
import {
  MemoryListEmpty,
  MemoryListError,
  MemoryListLoading,
  MemoryMutationError,
} from "@/components/memory/MemoryListStates";
import { useMemoryList } from "@/components/memory/useMemoryList";
import { PageHeader, PageHeaderAction } from "@/components/ui/page-header";
import type { MemoryPage } from "@/domain/memory";
import { cn } from "@/lib/utils";
import type { MemoryAction, MemoryManagementState, MemorySourceRead } from "@/application/memory-management";
import { MemoryPagination } from "./MemoryPagination";
import { MemoryEditDialog } from "./MemoryEditDialog";
import { MemoryConfirmDialog } from "./MemoryConfirmDialog";
import { MemoryManagementFeedback } from "./MemoryManagementFeedback";
import { MemorySourceDialog } from "./MemorySourceDialog";

export function MemoryView({ onBack }: { readonly onBack?: () => void }) {
  const {
    state,
    managementState, openMemoryAction, closeMemoryAction, submitMemoryAction, checkMemorySource, digestMemories, refreshMemoryTask,
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
  } = useMemoryList();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [sourceMemoryId, setSourceMemoryId] = useState<string | null>(null);
  const isLoading = state.status === "idle" || state.status === "loading";
  const data = state.data;
  const filters = state.request.filters;
  const hasFilters = Boolean(
    filters.search ||
    filters.date !== "all" ||
    filters.importance !== "all",
  );
  const listScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    resetMemoryListScrollPosition(listScrollRef.current);
  }, [data?.page]);

  return (
    <main className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden px-4 pb-4 pt-5 sm:px-0 sm:pb-8 sm:pt-8" aria-labelledby="memory-page-title">
      <PageHeader
        eyebrow="Memories"
        title="记忆库"
        titleId="memory-page-title"
        description="那些留下来的片段，会在需要时重新浮上来。"
        actions={
          <>
            <PageHeaderAction aria-label="总结新记忆" title="总结新记忆与已入队的历史来源" disabled={managementState.digestPending || state.isCreating || state.pendingMemoryIds.length > 0} onClick={digestMemories} aria-busy={managementState.digestPending}>
              {managementState.digestPending ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <BrainCircuit aria-hidden="true" />}
            </PageHeaderAction>
            <PageHeaderAction aria-label="刷新记忆库" disabled={isLoading} onClick={retry}><RefreshCw aria-hidden="true" /></PageHeaderAction>
            <PageHeaderAction
              disabled={managementState.digestPending}
              type="button"
              onClick={() => {
                clearCreateError();
                setCreateDialogOpen(true);
              }}
              aria-label="新增记忆"
              title="新增记忆"
            >
              <Plus aria-hidden="true" />
            </PageHeaderAction>
            {onBack && (
              <PageHeaderAction
                type="button"
                onClick={onBack}
                aria-label="返回桌面"
                title="返回桌面"
              >
                <X aria-hidden="true" />
              </PageHeaderAction>
            )}
          </>
        }
      />

      <div className="mt-3 shrink-0 sm:mt-4">
        <MemoryFilters
          searchInput={searchInput}
          date={filters.date}
          importance={filters.importance}
          pinFirst={filters.pinFirst}
          loading={isLoading}
          onSearchChange={setSearchInput}
          onDateChange={setDateFilter}
          onImportanceChange={setImportanceFilter}
          onPinFirstChange={setPinFirst}
        />
      </div>

      <MemoryReadingPanel
        data={data}
        isLoading={isLoading}
        error={state.status === "error" ? state.error : null}
        mutationError={state.mutationError}
        pendingMemoryIds={state.pendingMemoryIds}
        hasFilters={hasFilters}
        listScrollRef={listScrollRef}
        onRetry={retry}
        onPageChange={setPage}
        onSetUnresolved={setMemoryUnresolved}
        managementState={managementState} onAction={openMemoryAction} onCheckSource={checkMemorySource} onRefreshTask={refreshMemoryTask}
        onViewSource={setSourceMemoryId}
      />

      {sourceMemoryId && <MemorySourceDialog key={sourceMemoryId} memoryId={sourceMemoryId} onClose={() => setSourceMemoryId(null)} />}
      {managementState.action && (managementState.action.kind === "edit"
        ? <MemoryEditDialog key={managementState.action.memory.id} memory={managementState.action.memory} pending={managementState.actionPending} error={managementState.actionError} onSubmit={submitMemoryAction} onClose={closeMemoryAction} finalFocus={listScrollRef} />
        : <MemoryConfirmDialog action={managementState.action} pending={managementState.actionPending} error={managementState.actionError} source={managementState.sources[managementState.action.memory.id]} onSubmit={() => { void submitMemoryAction(); }} onClose={closeMemoryAction} onCheckSource={() => checkMemorySource(managementState.action!.memory.id)} finalFocus={listScrollRef} />)}
      <MemoryCreateDialog
        open={createDialogOpen}
        isCreating={state.isCreating}
        createError={state.createError}
        onOpenChange={setCreateDialogOpen}
        onCreate={createMemory}
        onClearError={clearCreateError}
      />
    </main>
  );
}

export function MemoryReadingPanel({
  data,
  isLoading,
  error,
  mutationError,
  pendingMemoryIds,
  hasFilters,
  listScrollRef,
  onRetry,
  onPageChange,
  onSetUnresolved,
  managementState, onAction, onCheckSource, onRefreshTask, onViewSource,
}: {
  readonly onViewSource?: (id: string) => void;
  readonly managementState?: MemoryManagementState;
  readonly onAction?: (action: MemoryAction) => void;
  readonly onCheckSource?: (id: string) => void;
  readonly onRefreshTask?: (id: string) => void;
  readonly data: MemoryPage | null;
  readonly isLoading: boolean;
  readonly error: SafeMemoryListError | null;
  readonly mutationError: SafeMemoryMutationError | null;
  readonly pendingMemoryIds: readonly string[];
  readonly hasFilters: boolean;
  readonly listScrollRef: RefObject<HTMLDivElement | null>;
  readonly onRetry: () => void;
  readonly onPageChange: (page: number) => void;
  readonly onSetUnresolved: (memoryId: string, unresolved: boolean) => void;
}) {
  const hasSyncError = mutationError?.code === "sync";

  return (
    <section
      className="memory-reading-panel mist-glass-strong relative mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] sm:mt-4"
      aria-label="记忆阅读区"
      aria-busy={isLoading}
      data-memory-reading-panel="true"
    >
      {data && (
        <>
          <span
            className="sr-only"
            aria-live="polite"
            data-memory-total-announcement="true"
          >
            共 {data.totalAll} 条记忆
          </span>
          <span
            className="memory-total-decoration font-decorative pointer-events-none absolute right-3 top-2.5 z-10 text-xl sm:right-5"
            aria-hidden="true"
            data-memory-total-decoration="true"
          >
            {data.totalAll}
          </span>
        </>
      )}

      <div
        ref={listScrollRef}
        className={cn(
          "scrollbar-none memory-list-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain",
          data && "pt-5",
        )}
        role="region"
        aria-label="记忆列表"
        tabIndex={0}
        data-memory-list-scroll="true"
      >
        {managementState && onRefreshTask && <MemoryManagementFeedback state={managementState} onRefreshTask={onRefreshTask} />}
        {mutationError && (
          <MemoryMutationError error={mutationError} onRetry={onRetry} isLoading={isLoading} />
        )}
        {!data && isLoading && <MemoryListLoading />}
        {!data && error && !hasSyncError && <MemoryListError error={error} onRetry={onRetry} />}

        {data && (
          <>
            {error && !hasSyncError && <MemoryListError error={error} onRetry={onRetry} compact />}
            {data.items.length === 0 ? (
              <MemoryListEmpty filtered={hasFilters} />
            ) : (
              <div className={cn("divide-y divide-primary/10", isLoading && "opacity-70")}>
                {data.items.map((memory) => (
                  <MemoryItem
                    key={memory.id}
                    memory={memory}
                    pending={pendingMemoryIds.includes(memory.id) || !!managementState?.digestPending}
                    onSetUnresolved={onSetUnresolved}
                    onAction={onAction} onCheckSource={onCheckSource} source={managementState?.sources[memory.id] as MemorySourceRead | undefined}
                    onViewSource={onViewSource}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {data && data.total > 0 && (
        <footer
          className="shrink-0 border-t border-primary/10 px-4 py-0.5"
          data-memory-pagination-footer="true"
        >
          <MemoryPagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            hasMore={data.hasMore}
            disabled={isLoading}
            onPageChange={onPageChange}
          />
        </footer>
      )}
    </section>
  );
}

export function resetMemoryListScrollPosition(
  scrollRegion: Pick<HTMLDivElement, "scrollTop"> | null,
) {
  if (scrollRegion) scrollRegion.scrollTop = 0;
}


export default MemoryView;
