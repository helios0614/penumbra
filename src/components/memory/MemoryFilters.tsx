import { LoaderCircle, Search, X } from "lucide-react";

import type {
  MemoryDateFilter,
  MemoryImportanceFilter,
} from "@/application/memory-list";
import { AppSelect } from "@/components/ui/app-select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DATE_FILTERS: ReadonlyArray<{ value: MemoryDateFilter; label: string }> = [
  { value: "all", label: "全部时间" },
  { value: "today", label: "今天" },
  { value: "7-days", label: "近 7 天" },
  { value: "30-days", label: "近 30 天" },
];

const IMPORTANCE_FILTERS: ReadonlyArray<{
  value: MemoryImportanceFilter;
  label: string;
}> = [
  { value: "all", label: "全部重要度" },
  { value: "low", label: "低" },
  { value: "mid", label: "中" },
  { value: "high", label: "较高" },
  { value: "top", label: "高" },
];

export function MemoryFilters({
  searchInput,
  date,
  importance,
  pinFirst,
  loading,
  onSearchChange,
  onDateChange,
  onImportanceChange,
  onPinFirstChange,
}: {
  readonly searchInput: string;
  readonly date: MemoryDateFilter;
  readonly importance: MemoryImportanceFilter;
  readonly pinFirst: boolean;
  readonly loading: boolean;
  readonly onSearchChange: (value: string) => void;
  readonly onDateChange: (value: MemoryDateFilter) => void;
  readonly onImportanceChange: (value: MemoryImportanceFilter) => void;
  readonly onPinFirstChange: (value: boolean) => void;
}) {
  return (
    <section
      aria-label="搜索与筛选"
      className="mist-glass flex flex-col gap-2.5 rounded-[22px] p-3 sm:p-4"
      data-memory-filter-surface="true"
    >
      <label className="relative block">
        <span className="sr-only">搜索记忆</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          surface="translucent"
          value={searchInput}
          onChange={(event) => onSearchChange(event.target.value)}
          maxLength={200}
          placeholder="搜索被留下来的片段"
          className="h-12 rounded-2xl pl-11 pr-12 text-sm"
        />
        {searchInput ? (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-xl text-muted-strong transition-colors hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="清空搜索"
            title="清空搜索"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : loading ? (
          <LoaderCircle className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary motion-reduce:animate-none" aria-label="正在加载" />
        ) : null}
      </label>

      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0" aria-label="时间范围">
          {DATE_FILTERS.map((option) => {
            const active = date === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onDateChange(option.value)}
                aria-pressed={active}
                className={cn(
                  "min-h-11 shrink-0 rounded-xl border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary/45 bg-primary/12 text-primary-ink shadow-sm"
                    : "border-border-strong/50 bg-background/25 text-muted-strong hover:bg-background/45",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <AppSelect
            value={importance}
            surface="translucent"
            options={IMPORTANCE_FILTERS}
            onValueChange={onImportanceChange}
            ariaLabel="按重要度筛选"
            className="sm:w-36"
          />
          <button
            type="button"
            onClick={() => onPinFirstChange(!pinFirst)}
            aria-pressed={pinFirst}
            className={cn(
              "min-h-11 shrink-0 rounded-xl border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              pinFirst
                ? "border-primary/45 bg-primary/12 text-primary-ink shadow-sm"
                : "border-border-strong/50 bg-background/25 text-muted-strong hover:bg-background/45",
            )}
          >
            钉住的在前
          </button>
        </div>
      </div>
    </section>
  );
}
