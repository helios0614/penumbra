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

const FILTER_FOCUS_CLASSES =
  "focus-visible:border-ring/55 focus-visible:outline-none! focus-visible:ring-2 focus-visible:ring-ring/20";

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
      className="mist-glass flex flex-col gap-1.5 rounded-[22px] px-3 py-1.5 sm:py-2"
      data-memory-filter-surface="true"
    >
      <div
        className="flex min-w-0 items-center gap-1.5"
        role="group"
        aria-label="搜索与重要度"
        data-memory-filter-row="search-importance"
      >
        <label
          className="relative block min-w-11 flex-1"
          data-memory-search-filter="true"
        >
          <span className="sr-only">搜索记忆</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            surface="translucent"
            value={searchInput}
            onChange={(event) => onSearchChange(event.target.value)}
            maxLength={200}
            placeholder="搜索被留下来的片段"
            className={cn(
              "h-11 min-h-11 w-full min-w-11 rounded-xl py-0 pl-11 text-xs font-medium leading-5 shadow-none placeholder:font-normal md:text-xs",
              searchInput ? "pr-11" : loading ? "pr-10" : "pr-4",
            )}
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className={cn(
                "absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-xl border border-transparent text-muted-strong transition-colors hover:bg-background/50",
                FILTER_FOCUS_CLASSES,
              )}
              aria-label="清空搜索"
              title="清空搜索"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : loading ? (
            <LoaderCircle className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary motion-reduce:animate-none" aria-label="正在加载" />
          ) : null}
        </label>

        <div className="shrink-0" data-memory-importance-filter="true">
          <AppSelect
            value={importance}
            surface="translucent"
            options={IMPORTANCE_FILTERS}
            onValueChange={onImportanceChange}
            ariaLabel="按重要度筛选"
            className="w-auto min-w-28"
          />
        </div>
      </div>

      <div
        className="flex min-w-0 items-center gap-1"
        role="group"
        aria-label="时间与置顶排序"
        data-memory-filter-row="time-pin"
      >
        <div
          className="flex min-w-0 flex-1 gap-1"
          aria-label="时间范围"
          data-memory-time-filters="true"
        >
          {DATE_FILTERS.map((option) => {
            const active = date === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onDateChange(option.value)}
                aria-pressed={active}
                data-memory-date-filter={option.value}
                className={cn(
                  "h-11 min-h-11 min-w-11 flex-1 whitespace-nowrap rounded-xl border px-1 text-xs font-medium leading-5 transition-colors sm:px-2.5",
                  FILTER_FOCUS_CLASSES,
                  active
                    ? "border-primary/45 bg-primary/12 text-primary-ink"
                    : "border-border-strong/50 bg-background/25 text-muted-strong hover:bg-background/45",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onPinFirstChange(!pinFirst)}
          aria-pressed={pinFirst}
          className={cn(
            "h-11 min-h-11 min-w-11 shrink-0 whitespace-nowrap rounded-xl border px-2 text-xs font-medium leading-5 transition-colors sm:px-3",
            FILTER_FOCUS_CLASSES,
            pinFirst
              ? "border-primary/45 bg-primary/12 text-primary-ink"
              : "border-border-strong/50 bg-background/25 text-muted-strong hover:bg-background/45",
          )}
          data-memory-pin-first-filter="true"
        >
          钉选优先
        </button>
      </div>
    </section>
  );
}
