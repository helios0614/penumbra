/**
 * 内联指示器
 * SimpleThink（AI 随想）、Thinking（扩展思考）
 * 展示在气泡内部或附近，作为辅助信息
 */
import { memo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── SimpleThink — AI 随想 ───
// 气泡上方的轻量随想，作为每轮回复的固定前奏

interface SimpleThinkProps {
  content: string;
  className?: string;
}

function SimpleThinkInner({ content, className }: SimpleThinkProps) {
  if (!content) return null;

  return (
    <div className={cn("max-w-full py-1", className)}>
      <p className="min-w-0 whitespace-pre-wrap break-words text-xs italic leading-[1.6] text-muted-strong/80">
        {content}
      </p>
    </div>
  );
}

export const SimpleThink = memo(SimpleThinkInner);

// ─── Thinking — 扩展思考块 ───
// 可折叠的思考过程展示

interface ThinkingBlockProps {
  content: string;
  className?: string;
}

function ThinkingBlockInner({ content, className }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

  if (!content) return null;

  // 截取摘要（前 80 字符）
  const summary =
    content.length > 80 ? content.slice(0, 80).replace(/\n/g, " ") + "…" : content;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-border/70",
        "bg-muted/45",
        className,
      )}
    >
      {/* 折叠头 */}
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className={cn(
          "flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left",
          "transition-colors duration-200 hover:bg-muted/70",
        )}
      >
        <span className="text-xs font-semibold text-muted-foreground">
          思考过程
        </span>
        {!expanded && (
          <span className="text-[11px] text-muted-foreground truncate flex-1 ml-1">
            {summary}
          </span>
        )}
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>

      {/* 展开内容 */}
      {expanded && (
        <div className="px-3 pb-3">
          <div
            className={cn(
              "text-xs leading-[1.6] text-muted-foreground",
              "whitespace-pre-wrap break-words",
              "max-h-[300px] overflow-y-auto",
            )}
          >
            {content}
          </div>
        </div>
      )}
    </div>
  );
}

export const ThinkingBlock = memo(ThinkingBlockInner);
