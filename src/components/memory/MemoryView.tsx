import { useEffect, useRef, useState, type RefObject } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";

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

export function MemoryView({ onBack }: { readonly onBack?: () => void }) {
  const {
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
  } = useMemoryList();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
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
            <PageHeaderAction
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
      />

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
}: {
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
          "memory-list-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain",
          data && "pt-5",
        )}
        role="region"
        aria-label="记忆列表"
        tabIndex={0}
        data-memory-list-scroll="true"
      >
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
                    pending={pendingMemoryIds.includes(memory.id)}
                    onSetUnresolved={onSetUnresolved}
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

function MemoryPagination({
  page,
  pageSize,
  total,
  hasMore,
  disabled,
  onPageChange,
}: {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly hasMore: boolean;
  readonly disabled: boolean;
  readonly onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="flex items-center justify-center gap-3" aria-label="记忆分页">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={disabled || page <= 1}
        className="grid size-11 place-items-center rounded-xl text-muted-strong transition-colors hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        aria-label="上一页"
        title="上一页"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      <span
        className="min-w-24 text-center text-[11px] font-normal leading-none text-muted-foreground"
        data-memory-pagination-label="true"
      >
        第 {page} / {totalPages} 页
      </span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={disabled || !hasMore}
        className="grid size-11 place-items-center rounded-xl text-muted-strong transition-colors hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        aria-label="下一页"
        title="下一页"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </nav>
  );
}

export default MemoryView;
