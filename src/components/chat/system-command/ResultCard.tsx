/**
 * 需要用户交互或查看详情的结构化能力卡片。
 * 普通 system 结果不在这里做类型猜测。
 */
import { memo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MusicCard } from "@/components/media/MusicCard";
import { mapMediaAttachments } from "@/domain/media/media-mappers";
import type { McpToolCall, MusicAttachment } from "../types";

// Legacy export uses the same real player as the Main media presenter.
export function MusicResultCard({ attachment }: { attachment: MusicAttachment }) {
  const song = mapMediaAttachments([attachment], "assistant")[0];
  return song?.kind === "music" ? <MusicCard song={song} identity={`legacy-music:${song.id ?? attachment.name}`} /> : null;
}
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
