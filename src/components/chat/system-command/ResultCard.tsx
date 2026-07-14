/**
 * 需要用户交互或查看详情的结构化能力卡片。
 * 普通 system 结果不在这里做类型猜测。
 */
import { memo, useState } from "react";
import { ChevronDown, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { McpToolCall, MusicAttachment } from "../types";

// ─── 音乐卡片 ───

interface MusicResultCardProps {
  attachment: MusicAttachment;
}

function MusicResultCardInner({ attachment }: MusicResultCardProps) {
  const [playing, setPlaying] = useState(false);

  return (
    <div
      className={cn(
        "flex w-full max-w-[480px] items-center gap-3 rounded-md p-2.5",
        "border border-ai/20 bg-ai/10",
      )}
    >
      <div
        className={cn(
          "relative size-14 shrink-0 overflow-hidden rounded-md",
          "bg-gradient-to-br from-ai/40 via-ai/20 to-ai-subtle",
        )}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex size-8 items-center justify-center rounded-full border-2 border-ai/20">
            <div className="size-3 rounded-full bg-ai/15" />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPlaying((current) => !current)}
          aria-label={
            playing ? `暂停 ${attachment.name}` : `播放 ${attachment.name}`
          }
          className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all duration-200 hover:bg-black/10"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-white/90 shadow-sm transition-transform duration-200 hover:scale-105">
            {playing ? (
              <Pause className="size-3.5 text-ai" />
            ) : (
              <Play className="ml-0.5 size-3.5 text-ai" />
            )}
          </span>
        </button>
      </div>

      <div className="min-w-0 flex-1 py-0.5">
        <p className="truncate text-sm font-semibold leading-tight text-foreground">
          {attachment.name}
        </p>
        <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
          {attachment.artist}
          {attachment.album ? ` · ${attachment.album}` : ""}
        </p>

        {playing && (
          <div className="mt-1.5 flex h-3 items-end gap-[2px]">
            {[5, 10, 7, 12, 8].map((height, index) => (
              <span
                key={index}
                className="w-[2px] animate-pulse rounded-full bg-ai"
                style={{
                  height: `${height}px`,
                  animationDelay: `${index * 150}ms`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const MusicResultCard = memo(MusicResultCardInner);

// ─── MCP 工具调用 ───

interface McpResultCardProps {
  toolCalls: McpToolCall[];
}

function McpResultCardInner({ toolCalls }: McpResultCardProps) {
  const [expanded, setExpanded] = useState(true);
  const doneCount = toolCalls.filter((call) => call.success).length;

  return (
    <div className="w-full max-w-[480px] overflow-hidden rounded-md border border-ai/20 bg-ai/10">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left transition-colors duration-200 hover:bg-ai/10"
      >
        <span className="flex-1 text-xs font-medium text-muted-strong">
          {doneCount === toolCalls.length
            ? `已完成 ${toolCalls.length} 项工具操作`
            : `${doneCount}/${toolCalls.length} 项工具操作已完成`}
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="divide-y divide-ai/8 px-3 pb-2">
          {toolCalls.map((call, index) => (
            <div key={`${call.server}:${call.tool}:${index}`} className="flex items-start gap-3 py-2">
              <span
                className={cn(
                  "mt-0.5 shrink-0 text-[11px] font-medium",
                  call.success ? "text-success" : "text-destructive",
                )}
              >
                {call.success ? "完成" : "失败"}
              </span>
              <div className="min-w-0 flex-1 break-words text-xs leading-relaxed overflow-wrap-anywhere">
                <p className="break-all font-mono text-[11px] text-muted-strong">
                  {call.server}:{call.tool}
                </p>
                {(call.result || call.error) && (
                  <p className="mt-0.5 break-all text-muted-foreground">
                    {call.result ?? call.error}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const McpResultCard = memo(McpResultCardInner);
