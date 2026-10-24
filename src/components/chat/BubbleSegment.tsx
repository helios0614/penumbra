import type { MessageReaction } from "@/domain/message/capability-types";
import { cn } from "@/lib/utils";
import { AI_BUBBLE_SURFACE, BUBBLE_SURFACE } from "./bubble-surface";
import { MarkdownRenderer } from "./MarkdownRenderer";

/** Position the decoration against the final user bubble, outside its clipping surface. */
export function BubbleSegment({ kind, content, reaction }: {
  readonly kind: "user" | "assistant";
  readonly content: string;
  readonly reaction?: MessageReaction | null;
}) {
  const user = kind === "user";
  const sticker = user ? reaction : null;
  return <div className={cn("relative min-w-0 max-w-full", sticker && "mb-3")} data-reaction-anchor={sticker ? reaction?.targetMessageId : undefined}>
    <div data-user-bubble={user ? "" : undefined} className={cn(BUBBLE_SURFACE,
      user ? "border-primary/20 bg-primary/10 text-primary shadow-sm backdrop-blur-md" : AI_BUBBLE_SURFACE,
      sticker && "pb-4")}>
      {user ? <span className="whitespace-pre-wrap">{content}</span> : <MarkdownRenderer content={content} />}
    </div>
    {sticker && <span role="img" data-reaction-target={sticker.targetMessageId} data-reaction-source={sticker.sourceMessageId ?? undefined}
      aria-label={`知远的表情回应 ${sticker.emoji}`} className={cn("chat-reaction-sticker border", AI_BUBBLE_SURFACE)}>
      {sticker.emoji}
    </span>}
  </div>;
}
