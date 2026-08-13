import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

import { MemoryFilters } from "@/components/memory/MemoryFilters";
import { MemoryItem } from "@/components/memory/MemoryItem";
import {
  MemoryListEmpty,
  MemoryListError,
  MemoryListLoading,
} from "@/components/memory/MemoryListStates";
import { useMemoryList } from "@/components/memory/useMemoryList";
import { Button } from "@/components/ui/button";
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

  return (
    <main className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-y-auto px-4 pb-8 pt-5 sm:px-6 sm:pb-10 sm:pt-8" aria-labelledby="memory-page-title">
      <header className="mist-glass relative isolate shrink-0 overflow-hidden rounded-[24px] p-4 sm:p-5">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[color-mix(in_srgb,var(--color-background)_10%,transparent)]"
        />
        <div className="relative z-10 flex items-start justify-between gap-4">
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

      <div className="mt-4 shrink-0">
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

      <section className="mt-4" aria-label="记忆列表" aria-busy={isLoading}>
        {!data && isLoading && <MemoryListLoading />}
        {!data && state.status === "error" && (
          <MemoryListError error={state.error} onRetry={retry} />
        )}

        {data && (
          <div className="mist-solid overflow-hidden rounded-[24px]">
            <div className="flex min-h-10 items-center justify-between border-b border-primary/10 px-4 py-2 text-xs text-muted-foreground sm:px-6">
              <p aria-live="polite">
                共 {data.totalAll} 条
                {data.total !== data.totalAll && `，当前条件下 ${data.total} 条`}
              </p>
              {isLoading && (
                <p className="text-primary-ink" aria-live="polite">正在更新</p>
              )}
            </div>

            {state.status === "error" && (
              <MemoryListError error={state.error} onRetry={retry} compact />
            )}

            {data.items.length === 0 ? (
              <MemoryListEmpty filtered={hasFilters} />
            ) : (
              <div className={cn("divide-y divide-primary/10", isLoading && "opacity-70")}>
                {data.items.map((memory) => (
                  <MemoryItem key={memory.id} memory={memory} />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {data && data.total > 0 && (
        <MemoryPagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          hasMore={data.hasMore}
          disabled={isLoading}
          onPageChange={setPage}
        />
      )}
    </main>
  );
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
    <nav className="mt-4 flex shrink-0 items-center justify-center gap-3" aria-label="记忆分页">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={disabled || page <= 1}
        className="mist-glass grid size-11 place-items-center rounded-xl text-muted-strong transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35"
        aria-label="上一页"
        title="上一页"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      <span className="min-w-24 text-center text-xs text-muted-foreground">
        第 {page} / {totalPages} 页
      </span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={disabled || !hasMore}
        className="mist-glass grid size-11 place-items-center rounded-xl text-muted-strong transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35"
        aria-label="下一页"
        title="下一页"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </nav>
  );
}

export default MemoryView;
