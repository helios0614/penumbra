/**
 * 内联指示器
 * SimpleThink（AI 随想）、Thinking（扩展思考）、Heart Whisper（心声）
 * 展示在气泡内部或附近，作为辅助信息
 */
import { memo, useState } from "react";
import { Lightbulb, Brain, Heart, ChevronDown, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── SimpleThink — AI 随想 ───
// 气泡上方的小灰框，AI 的流意识

interface SimpleThinkProps {
  content: string;
  className?: string;
}

function SimpleThinkInner({ content, className }: SimpleThinkProps) {
  if (!content) return null;

  return (
    <div
      className={cn(
        "inline-flex items-start gap-1.5 px-3 py-1.5 rounded-md",
        "bg-muted/50 border border-border backdrop-blur-md",
        "max-w-[280px]",
        className,
      )}
    >
      <Lightbulb className="size-3 text-muted-foreground shrink-0 mt-0.5" />
      <p className="text-[11px] leading-[1.5] text-muted-foreground italic line-clamp-2">
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
        "rounded-md border border-border overflow-hidden",
        "bg-muted/50 backdrop-blur-md",
        className,
      )}
    >
      {/* 折叠头 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 w-full px-3 py-2 text-left",
          "hover:bg-muted/70 transition-all duration-200",
        )}
      >
        <Brain className="size-3.5 text-muted-foreground shrink-0" />
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
            "size-3.5 text-muted-foreground transition-all duration-200 shrink-0",
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

// ─── Heart Whisper — 心声 ───
// AI 的私密内心独白，需要点击才能查看

interface HeartWhisperProps {
  content: string;
  className?: string;
}

function HeartWhisperInner({ content, className }: HeartWhisperProps) {
  const [revealed, setRevealed] = useState(false);

  if (!content) return null;

  return (
    <div className={cn("relative", className)}>
      {/* 未揭示：锁定提示 */}
      {!revealed && (
        <button
          onClick={() => setRevealed(true)}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full",
            "bg-ai/10 backdrop-blur-md",
            "border border-ai/20",
            "text-[11px] text-ai",
            "hover:shadow-sm transition-all duration-200",
          )}
        >
          <Heart className="size-3 fill-current" />
          <span>心声</span>
          <Lock className="size-2.5 opacity-60" />
        </button>
      )}

      {/* 已揭示：内容 */}
      {revealed && (
        <div
          className={cn(
            "px-3 py-2 rounded-md",
            "bg-ai/10 backdrop-blur-md",
            "border border-ai/20",
            "shadow-sm",
          )}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <Heart className="size-3 text-ai fill-current" />
            <span className="text-[11px] font-medium text-ai">
              心声
            </span>
            <button
              onClick={() => setRevealed(false)}
              className="ml-auto text-[11px] text-muted-foreground hover:text-foreground transition-all duration-200"
            >
              收起
            </button>
          </div>
          <p className="text-xs leading-[1.6] text-ai whitespace-pre-wrap">
            {content}
          </p>
        </div>
      )}
    </div>
  );
}

export const HeartWhisper = memo(HeartWhisperInner);
