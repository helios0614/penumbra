import type { MessageReaction } from "@/domain/message/capability-types";
import { cn } from "@/lib/utils";
import { AI_BUBBLE_SURFACE, BUBBLE_SURFACE } from "./bubble-surface";
import { MarkdownDefinitionLinks, MarkdownRenderer } from "./MarkdownRenderer";
import { markdownSurface } from "./markdown-presentation";
import {
  SearchText,
  SearchHighlightContext,
  searchTextRanges,
} from "./search-highlight";
import { memo, useContext, useMemo } from "react";
import { useAiName } from "@/components/identity/AiNameContext";
import type { SearchHighlight } from "./search-highlight";
import { insertableBody } from "./insertable-body";

/** Map full-message phrase ranges into the existing paragraph bubbles. */
export function SearchableBubbleSegments({
  chunks,
  kind,
  reaction,
  identity,
}: {
  chunks: readonly string[];
  kind: "user" | "assistant";
  reaction?: MessageReaction | null;
  identity: string;
}) {
  const search = useContext(SearchHighlightContext);
  const queries = useMemo(() => {
    if (!search.active) return null;
    const plain = chunks.map((chunk) => insertableBody(chunk)),
      ranges = searchTextRanges(plain.join("\n\n"), search.query);
    let offset = 0;
    return plain.map((text) => {
      const terms = ranges
        .flatMap(([a, b]) =>
          a < offset + text.length && b > offset
            ? [
                text
                  .slice(
                    Math.max(0, a - offset),
                    Math.min(text.length, b - offset),
                  )
                  .trim(),
              ]
            : [],
        )
        .filter(Boolean);
      offset += text.length + 2;
      return kind === "user"
        ? [...new Set(terms.flatMap((term) => [term, ...term.split(/\s+/u)]))]
        : terms;
    });
  }, [chunks, search.active, search.query, kind]);
  return (
    <>
      {chunks.map((content, index) => (
        <SearchableSegment
          key={`${identity}:${index}`}
          search={search} bodyQueries={queries?.[index]} kind={kind} content={content}
          reaction={index === chunks.length - 1 ? reaction : null} />
      ))}
    </>
  );
}

const SearchableSegment = memo(function SearchableSegment({ search, bodyQueries, ...props }: {
  search: SearchHighlight; bodyQueries?: readonly string[]; kind: "user" | "assistant"; content: string; reaction?: MessageReaction | null;
}) {
  const value = useMemo(() => ({ ...search, bodyQueries }), [search, bodyQueries]);
  return <SearchHighlightContext value={value}><BubbleSegment {...props} /></SearchHighlightContext>;
});

/** Position the decoration against the final user bubble, outside its clipping surface. */
function BubbleSegmentInner({
  kind,
  content,
  reaction,
}: {
  readonly kind: "user" | "assistant";
  readonly content: string;
  readonly reaction?: MessageReaction | null;
}) {
  const aiName = useAiName();
  const user = kind === "user";
  const sticker = user ? reaction : null;
  const surface = user ? "body" : markdownSurface(content);
  return (
    <div
      className={cn("relative min-w-0 max-w-full", sticker && "mb-5")}
      data-reaction-anchor={sticker ? reaction?.targetMessageId : undefined}
      data-markdown-segment={user ? undefined : surface}
    >
      <div
        data-user-bubble={user ? "" : undefined}
        className={cn(
          surface === "code" ? "chat-code-segment min-w-0 max-w-full"
            : surface === "rule" ? "chat-rule-segment"
            : cn(BUBBLE_SURFACE, user
              ? "border-primary/20 bg-primary/10 text-primary shadow-sm backdrop-blur-md"
              : AI_BUBBLE_SURFACE),
        )}
      >
        {user ? (
          <span className="whitespace-pre-wrap">
            <SearchText text={content} />
          </span>
        ) : surface === "definitions" ? (
          <MarkdownDefinitionLinks content={content} />
        ) : (
          <MarkdownRenderer content={content} />
        )}
      </div>
      {sticker && (
        <span
          role="img"
          data-reaction-target={sticker.targetMessageId}
          data-reaction-source={sticker.sourceMessageId ?? undefined}
          aria-label={`${aiName}的表情回应 ${sticker.emoji}`}
          className={cn("chat-reaction-sticker border", AI_BUBBLE_SURFACE)}
        >
          {sticker.emoji}
        </span>
      )}
    </div>
  );
}

export const BubbleSegment = memo(BubbleSegmentInner);
