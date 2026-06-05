/**
 * 系统指令结果卡片
 * 指令执行完成后的展示：紧凑 badge 式 + 富卡片式（音乐、MCP）
 */
import { memo, useState } from "react";
import {
  Music,
  Brain,
  AlarmClock,
  Bell,
  Eye,
  CheckSquare,
  CheckCircle2,
  Trash2,
  Camera,
  MapPin,
  Locate,
  Monitor,
  Plug,
  ChevronDown,
  Play,
  Pause,
  X,
  CircleDot,
  CircleCheck,
  CircleX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SystemCommandData, McpToolCall, MusicMeta } from "./types";
import { COMMAND_APPEARANCE } from "./appearance";

// ─── 图标映射 ───

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Music,
  Brain,
  AlarmClock,
  Bell,
  Eye,
  CheckSquare,
  CheckCircle2,
  Trash2,
  Camera,
  MapPin,
  Locate,
  Monitor,
  Plug,
};

// ─── 紧凑 badge 式结果 ───

interface CompactResultProps {
  data: SystemCommandData;
  onDismiss?: () => void;
}

function CompactResult({ data, onDismiss }: CompactResultProps) {
  const appearance = COMMAND_APPEARANCE[data.type];
  const Icon = ICON_MAP[appearance.icon] ?? CircleDot;

  return (
    <div
      className={cn(
        "group inline-flex items-center gap-2 px-3 py-1.5 rounded-md",
        "border text-xs",
        appearance.bgClass,
        appearance.borderClass,
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", appearance.textClass)} />
      <span className={cn("font-medium", appearance.textClass)}>
        {data.label ?? appearance.label}
      </span>
      {data.content && (
        <span className="text-muted-foreground truncate max-w-[200px]">
          {data.content}
        </span>
      )}

      {/* 状态指示 */}
      {data.status === "success" && (
        <CircleCheck className="size-3 text-success shrink-0" />
      )}
      {data.status === "error" && (
        <CircleX className="size-3 text-destructive shrink-0" />
      )}

      {/* 关闭按钮 */}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className={cn(
            "ml-0.5 p-0.5 rounded-sm opacity-0 group-hover:opacity-100",
            "text-muted-foreground hover:text-foreground",
            "transition-all duration-200",
          )}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

// ─── 音乐卡片 ───

interface MusicCardProps {
  meta?: MusicMeta;
  content: string;
}

function MusicCard({ meta, content }: MusicCardProps) {
  const [playing, setPlaying] = useState(false);
  const song = meta?.song ?? content;
  const artist = meta?.artist ?? "";

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md",
        "bg-primary-subtle border border-primary/15",
        "shadow-sm",
      )}
    >
      {/* 封面占位 */}
      <div
        className={cn(
          "relative size-10 rounded-sm overflow-hidden shrink-0",
          "bg-gradient-to-br from-primary/30 to-primary/10",
          "flex items-center justify-center",
        )}
      >
        <Music className="size-4 text-primary/60" />
        {/* 播放按钮覆盖层 */}
        <button
          onClick={() => setPlaying(!playing)}
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            "bg-black/0 hover:bg-black/20 transition-all duration-200",
          )}
        >
          {playing ? (
            <Pause className="size-4 text-white drop-shadow" />
          ) : (
            <Play className="size-4 text-white drop-shadow ml-0.5" />
          )}
        </button>
      </div>

      {/* 歌曲信息 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{song}</p>
        {artist && (
          <p className="text-xs text-muted-foreground truncate">{artist}</p>
        )}
      </div>

      {/* 播放状态指示 */}
      {playing && (
        <div className="flex items-end gap-0.5 h-4">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-0.5 bg-primary rounded-full animate-pulse"
              style={{
                height: `${8 + Math.random() * 8}px`,
                animationDelay: `${i * 200}ms`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MCP 工具调用卡片 ───

interface McpCardProps {
  toolCalls: McpToolCall[];
  content: string;
}

function McpCard({ toolCalls, content }: McpCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (toolCalls.length === 0) {
    return (
      <CompactResult
        data={{ type: "mcp", status: "success", content }}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-md border border-info/15 overflow-hidden",
        "bg-info-subtle shadow-sm",
      )}
    >
      {/* 头部 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 w-full px-3 py-1.5 text-left",
          "hover:bg-info/5 transition-all duration-200",
        )}
      >
        <Plug className="size-3.5 text-info-foreground shrink-0" />
        <span className="text-xs font-medium text-info-foreground flex-1">
          工具调用
        </span>
        <span className="text-[11px] text-muted-foreground">
          {toolCalls.length} 个调用
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground transition-all duration-200 shrink-0",
            expanded && "rotate-180",
          )}
        />
      </button>

      {/* 展开的工具列表 */}
      {expanded && (
        <div className="px-3 pb-2 space-y-1">
          {toolCalls.map((call, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-2 px-3 py-1.5 rounded-sm",
                "bg-white/50 dark:bg-white/5",
              )}
            >
              {/* 状态点 */}
              {call.success ? (
                <CircleCheck className="size-3.5 text-success shrink-0 mt-0.5" />
              ) : (
                <CircleX className="size-3.5 text-destructive shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono text-foreground">
                  {call.server}
                  <span className="text-muted-foreground">:</span>
                  {call.tool}
                </p>
                {call.result && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                    {call.result}
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

// ─── 主组件 ───

interface ResultCardProps {
  data: SystemCommandData;
  toolCalls?: McpToolCall[];
  musicMeta?: MusicMeta;
  onDismiss?: () => void;
}

function ResultCardInner({
  data,
  toolCalls,
  musicMeta,
  onDismiss,
}: ResultCardProps) {
  // 音乐 → 富卡片
  if (data.type === "music") {
    return <MusicCard meta={musicMeta} content={data.content} />;
  }

  // MCP → 可展开卡片
  if (data.type === "mcp" && toolCalls && toolCalls.length > 0) {
    return <McpCard toolCalls={toolCalls} content={data.content} />;
  }

  // 其他 → 紧凑 badge
  return <CompactResult data={data} onDismiss={onDismiss} />;
}

export const ResultCard = memo(ResultCardInner);
