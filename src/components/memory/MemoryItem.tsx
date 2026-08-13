import { useState } from "react";
import { Pin } from "lucide-react";

import { presentMemoryItem } from "@/components/memory/memory-presentation";
import type { Memory } from "@/domain/memory";
import { cn } from "@/lib/utils";

export function MemoryItem({ memory }: { readonly memory: Memory }) {
  const [expanded, setExpanded] = useState(false);
  const presentation = presentMemoryItem(memory);
  const canExpand = memory.content.length > 260 || memory.content.split("\n").length > 4;

  return (
    <article className="px-4 py-4 sm:px-6" data-memory-item>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
          {presentation.typeLabel && (
            <span className="max-w-48 truncate font-medium text-muted-strong" title={presentation.typeLabel}>
              {presentation.typeLabel}
            </span>
          )}
          {presentation.importanceLabel && <span>{presentation.importanceLabel}</span>}
        </div>
        {memory.isPinned && (
          <span
            role="img"
            aria-label="这条记忆仍有未完成事件"
            title="这条记忆仍有未完成事件"
            className="grid size-7 shrink-0 place-items-center text-primary"
            data-memory-pin
          >
            <Pin className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
          </span>
        )}
      </div>

      {memory.content ? (
        <p
          className={cn(
            "mt-2.5 whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground sm:text-base",
            canExpand && !expanded && "line-clamp-4",
          )}
        >
          {memory.content}
        </p>
      ) : (
        <p className="mt-2.5 text-sm leading-6 text-muted-foreground">
          这条记忆没有可显示的正文。
        </p>
      )}

      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 min-h-9 rounded-lg pr-2 text-xs font-medium text-primary-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={expanded}
        >
          {expanded ? "收起" : "展开"}
        </button>
      )}

      <footer className="mt-2.5 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-wrap gap-1.5" aria-label="记忆标签">
          {presentation.visibleTags.map((tag) => (
            <span
              key={tag}
              title={tag}
              className="max-w-44 truncate rounded-full border border-border-strong/30 bg-background/15 px-2 py-0.5 text-[11px] text-muted-strong"
            >
              {tag}
            </span>
          ))}
          {presentation.hiddenTagCount > 0 && (
            <span className="px-1 py-0.5 text-[11px] text-muted-foreground">
              +{presentation.hiddenTagCount}
            </span>
          )}
        </div>
        <time
          dateTime={new Date(memory.createdAt * 1_000).toISOString()}
          className="shrink-0 text-xs text-muted-foreground"
        >
          {presentation.timeLabel}
        </time>
      </footer>
    </article>
  );
}
