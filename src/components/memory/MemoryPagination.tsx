import { ChevronLeft, ChevronRight } from "lucide-react";

export function MemoryPagination({
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

