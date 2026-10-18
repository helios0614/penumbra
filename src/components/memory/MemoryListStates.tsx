import { RefreshCw } from "lucide-react";

import type {
  SafeMemoryListError,
  SafeMemoryMutationError,
} from "@/application/memory-list";
import { Button } from "@/components/ui/button";

export function MemoryListLoading() {
  return (
    <div className="min-w-0" aria-live="polite" aria-busy="true">
      <span className="sr-only">正在加载记忆</span>
      {[0, 1, 2, 3].map((key) => (
        <div key={key} className="border-b border-primary/10 px-4 py-4 last:border-b-0 sm:px-6">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-5/6" />
          <div className="mt-4 flex justify-between gap-4">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Skeleton({ className }: { readonly className: string }) {
  return (
    <div className={`animate-pulse rounded-full bg-muted/60 motion-reduce:animate-none ${className}`} />
  );
}

export function MemoryListError({
  error,
  onRetry,
  compact = false,
}: {
  readonly error: SafeMemoryListError;
  readonly onRetry: () => void;
  readonly compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={
        compact
          ? "flex flex-col gap-3 border-b border-error/15 bg-error-subtle px-4 py-3 text-error-subtle-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6"
          : "flex min-h-full flex-col items-center justify-center px-5 py-10 text-center"
      }
    >
      <div>
        <p className="text-sm font-semibold text-foreground">无法加载记忆</p>
        <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
      </div>
      <Button
        type="button"
        size="comfortable"
        onClick={onRetry}
        className="mx-auto mt-4 gap-2 sm:mx-0 sm:mt-0"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        重试
      </Button>
    </div>
  );
}

export function MemoryListEmpty({ filtered }: { readonly filtered: boolean }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-5 py-10 text-center">
      <p className="text-base font-semibold text-foreground">
        {filtered ? "没有找到相符的记忆" : "还没有留下记忆"}
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        {filtered
          ? "可以换一个关键词，或放宽当前筛选条件。"
          : "当记忆被写入后，它们会安静地出现在这里。"}
      </p>
    </div>
  );
}

export function MemoryMutationError({
  error,
  onRetry,
  isLoading = false,
}: {
  readonly error: SafeMemoryMutationError;
  readonly onRetry: () => void;
  readonly isLoading?: boolean;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 border-b border-error/15 bg-error-subtle px-4 py-2 text-xs text-error-subtle-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6"
      data-memory-mutation-error="true"
    >
      <p>{error.message}</p>
      {error.code === "sync" && (
        <Button
          type="button"
          size="comfortable"
          onClick={onRetry}
          disabled={isLoading}
          aria-busy={isLoading || undefined}
          className="mx-auto gap-2 sm:mx-0"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          重新读取列表
        </Button>
      )}
    </div>
  );
}
