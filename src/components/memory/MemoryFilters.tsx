import { LoaderCircle, Search, X } from "lucide-react";

import type {
  MemoryDateFilter,
  MemoryImportanceFilter,
} from "@/application/memory-list";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    <section aria-label="搜索与筛选" className="flex flex-col gap-2.5">
      <label className="relative block">
        <span className="sr-only">搜索记忆</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={searchInput}
          onChange={(event) => onSearchChange(event.target.value)}
          maxLength={200}
          placeholder="搜索被留下来的片段"
          className="mist-glass-strong h-12 w-full rounded-2xl pl-11 pr-12 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/40"
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
                    ? "border-primary/25 bg-primary/10 text-primary-ink"
                    : "border-transparent bg-background/20 text-muted-strong hover:border-border-strong/35 hover:bg-background/35",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <Select
            value={importance}
            onValueChange={(value) => {
              if (value) onImportanceChange(value as MemoryImportanceFilter);
            }}
          >
            <SelectTrigger
              aria-label="按重要度筛选"
              className="w-full border border-transparent! bg-background/20! px-3 text-xs font-medium text-muted-strong shadow-none! hover:border-border-strong/35! hover:bg-background/35! data-[size=default]:h-11 sm:w-36"
            >
              <SelectValue>
                {IMPORTANCE_FILTERS.find((option) => option.value === importance)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end" className="p-1">
              {IMPORTANCE_FILTERS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => onPinFirstChange(!pinFirst)}
            aria-pressed={pinFirst}
            className={cn(
              "min-h-11 shrink-0 rounded-xl border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              pinFirst
                ? "border-primary/25 bg-primary/10 text-primary-ink"
                : "border-transparent bg-background/20 text-muted-strong hover:border-border-strong/35 hover:bg-background/35",
            )}
          >
            钉住的在前
          </button>
        </div>
      </div>
    </section>
  );
}
