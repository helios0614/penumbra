import { useEffect, useRef, type RefObject } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

import type { SafeMemoryListError } from "@/application/memory-list";
import { MemoryFilters } from "@/components/memory/MemoryFilters";
import { MemoryItem } from "@/components/memory/MemoryItem";
import {
  MemoryListEmpty,
  MemoryListError,
  MemoryListLoading,
} from "@/components/memory/MemoryListStates";
import { useMemoryList } from "@/components/memory/useMemoryList";
import { Button } from "@/components/ui/button";
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
    retry,
  } = useMemoryList();
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
      <header className="mist-glass shrink-0 rounded-[24px] p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Memories
            </p>
            <h1 id="memory-page-title" className="mt-1 text-xl font-semibold text-foreground">
              记忆库
            </h1>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
              那些被留下来的片段，会在需要的时候重新浮上来。
            </p>
          </div>
          {onBack && (
            <Button
              type="button"
              onClick={onBack}
              variant="ghost"
              size="icon-lg"
              className="size-11 rounded-xl border border-border-strong/50 bg-background/25 text-foreground shadow-sm hover:border-primary/30 hover:bg-primary/10 hover:text-primary active:bg-primary/15"
              aria-label="返回桌面"
              title="返回桌面"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </header>

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
        hasFilters={hasFilters}
        listScrollRef={listScrollRef}
        onRetry={retry}
        onPageChange={setPage}
      />
    </main>
  );
}

export function MemoryReadingPanel({
  data,
  isLoading,
  error,
  hasFilters,
  listScrollRef,
  onRetry,
  onPageChange,
}: {
  readonly data: MemoryPage | null;
  readonly isLoading: boolean;
  readonly error: SafeMemoryListError | null;
  readonly hasFilters: boolean;
  readonly listScrollRef: RefObject<HTMLDivElement | null>;
  readonly onRetry: () => void;
  readonly onPageChange: (page: number) => void;
}) {
  return (
    <section
      className="mist-glass-strong relative mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] sm:mt-4"
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
            className="memory-total-decoration pointer-events-none absolute right-4 top-3 z-10 text-[15px] sm:right-6"
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
          "min-h-0 flex-1 overflow-y-auto overscroll-contain",
          data && "pt-7",
        )}
        role="region"
        aria-label="记忆列表"
        tabIndex={0}
        data-memory-list-scroll="true"
      >
        {!data && isLoading && <MemoryListLoading />}
        {!data && error && <MemoryListError error={error} onRetry={onRetry} />}

        {data && (
          <>
            {error && <MemoryListError error={error} onRetry={onRetry} compact />}
            {data.items.length === 0 ? (
              <MemoryListEmpty filtered={hasFilters} />
            ) : (
              <div className={cn("divide-y divide-primary/10", isLoading && "opacity-70")}>
                {data.items.map((memory) => (
                  <MemoryItem key={memory.id} memory={memory} />
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
