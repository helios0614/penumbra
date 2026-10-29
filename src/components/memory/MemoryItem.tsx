import { useState } from "react";
import { Pin, ScrollText } from "lucide-react";
import { MemoryActions } from "./MemoryActions";
import type { MemoryAction, MemorySourceRead } from "@/application/memory-management";

import { presentMemoryItem } from "@/components/memory/memory-presentation";
import { allowsMemorySourceActions, type Memory } from "@/domain/memory";
import { cn } from "@/lib/utils";

export function MemoryItem({
  memory,
  pending,
  onSetUnresolved,
  onAction, onCheckSource, source, onViewSource,
}: {
  readonly onViewSource?: (id: string) => void;
  readonly onAction?: (action: MemoryAction) => void;
  readonly onCheckSource?: (id: string) => void;
  readonly source?: MemorySourceRead;
  readonly memory: Memory;
  readonly pending: boolean;
  readonly onSetUnresolved: (memoryId: string, unresolved: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const presentation = presentMemoryItem(memory);
  const showSource = !!onViewSource && allowsMemorySourceActions(memory);
  const canExpand = memory.content.length > 260 || memory.content.split("\n").length > 4;

  return (
    <article className="relative px-4 py-3.5 sm:px-6" data-memory-item data-memory-id={memory.id} aria-busy={pending || undefined}>
      <div
        className={cn("min-w-0", showSource ? "pr-36" : onAction ? "pr-24" : "pr-14")}
        data-memory-item-header="true"
      >
        <div
          className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground"
          data-memory-item-metadata="true"
        >
          {presentation.typeLabel && (
            <span
              className="max-w-48 truncate font-medium text-primary-ink"
              title={presentation.typeLabel}
              data-memory-type="true"
            >
              {presentation.typeLabel}
            </span>
          )}
          {presentation.importanceLabel && presentation.importanceValue && (
            <span data-memory-importance="true">
              <span
                className="text-muted-foreground"
                data-memory-importance-label="true"
              >
                {presentation.importanceLabel}
              </span>{" "}
              <span
                className="text-muted-strong"
                data-memory-importance-value="true"
              >
                {presentation.importanceValue}
              </span>
            </span>
          )}
        </div>
        <div
          className="absolute right-2 top-0 flex items-center gap-1 sm:right-4"
          data-memory-item-actions="true"
        >
          {showSource && <button type="button" aria-label="查看原文" title="查看原文" onClick={() => onViewSource?.(memory.id)}
            className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-memory-source={memory.id}>
            <ScrollText className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
          </button>}
          <MemoryPinAction
            memoryId={memory.id}
            isPinned={memory.isPinned}
            pending={pending}
            onSetUnresolved={onSetUnresolved}
          />
          {onAction && onCheckSource && <MemoryActions memory={memory} pending={pending} source={source} onAction={onAction} onCheckSource={onCheckSource} />}
        </div>
      </div>

      {memory.content ? (
        <p
          className={cn(
            "mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-7 text-[color-mix(in_srgb,var(--color-foreground)_70%,var(--color-muted-strong))] sm:text-sm",
            canExpand && !expanded && "line-clamp-4",
          )}
          data-memory-body="true"
        >
          {memory.content}
        </p>
      ) : (
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
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

      <footer className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
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
          className="shrink-0 self-end text-xs text-muted-foreground"
        >
          {presentation.timeLabel}
        </time>
      </footer>
    </article>
  );
}

export function MemoryPinAction({
  memoryId,
  isPinned,
  pending,
  onSetUnresolved,
}: {
  readonly memoryId: string;
  readonly isPinned: boolean;
  readonly pending: boolean;
  readonly onSetUnresolved: (memoryId: string, unresolved: boolean) => void;
}) {
  const label = isPinned ? "取消待继续标记" : "标记为待继续";

  return (
    <button
      type="button"
      onClick={() => onSetUnresolved(memoryId, !isPinned)}
      disabled={pending}
      aria-label={label}
      aria-pressed={isPinned}
      aria-busy={pending || undefined}
      title={label}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45",
        isPinned
          ? "text-primary"
          : "text-muted-foreground hover:bg-primary/10 hover:text-primary",
      )}
      data-memory-pin
      data-memory-pin-state={isPinned ? "pinned" : "unpinned"}
    >
      <Pin className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}
