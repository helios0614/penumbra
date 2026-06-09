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
        "border text-xs backdrop-blur-md shadow-sm",
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
  const artist = meta?.artist ?? "未知艺术家";
  const album = meta?.album ?? "";

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-2 rounded-md",
        "bg-ai/10 border border-ai/20 backdrop-blur-md",
        "shadow-sm",
        "w-[85%]",
      )}
    >
      {/* 封面 — 网易云风格：大圆角 + 渐变遮罩 + 中央播放按钮 */}
      <div
        className={cn(
          "relative size-14 rounded-md overflow-hidden shrink-0",
          "bg-gradient-to-br from-ai/40 via-ai/20 to-ai-subtle",
        )}
      >
        {/* 唱片纹理 */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="size-8 rounded-full border-2 border-ai/20 flex items-center justify-center">
            <div className="size-3 rounded-full bg-ai/15" />
          </div>
        </div>
        {/* 播放按钮 */}
        <button
          onClick={() => setPlaying(!playing)}
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            "bg-black/0 hover:bg-black/10 transition-all duration-200",
          )}
        >
          <div
            className={cn(
              "size-7 rounded-full flex items-center justify-center",
              "bg-white/90 shadow-sm",
              "hover:scale-105 transition-transform duration-200",
            )}
          >
            {playing ? (
              <Pause className="size-3.5 text-ai" />
            ) : (
              <Play className="size-3.5 text-ai ml-0.5" />
            )}
          </div>
        </button>
      </div>

      {/* 歌曲信息 */}
      <div className="flex-1 min-w-0 py-0.5">
        <p className="text-sm font-semibold text-foreground truncate leading-tight">
          {song}
        </p>
        <p className="text-[11px] text-muted-foreground truncate mt-0.5 leading-tight">
          {artist}{album ? ` · ${album}` : ""}
        </p>

        {/* 播放中 — 简易波形 */}
        {playing && (
          <div className="flex items-end gap-[2px] h-3 mt-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="w-[2px] bg-ai rounded-full animate-pulse"
                style={{
                  height: `${4 + Math.random() * 8}px`,
                  animationDelay: `${i * 150}ms`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MCP 工具调用卡片 — 步骤条风格 ───

interface McpCardProps {
  toolCalls: McpToolCall[];
  content: string;
}

function McpCard({ toolCalls, content }: McpCardProps) {
  const [expanded, setExpanded] = useState(true);

  if (toolCalls.length === 0) {
    return (
      <CompactResult
        data={{ type: "mcp", status: "success", content }}
      />
    );
  }

  const doneCount = toolCalls.filter((c) => c.success).length;

  return (
    <div
      className={cn(
        "w-[85%] rounded-md overflow-hidden",
        "bg-ai/10 border border-ai/20 backdrop-blur-md",
      )}
    >
      {/* 头部 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 w-full px-3 py-1.5 text-left",
          "hover:bg-ai/10 transition-all duration-200",
        )}
      >
        <Plug className="size-3.5 text-foreground shrink-0" />
        <span className="text-xs text-foreground flex-1">
          {doneCount}/{toolCalls.length} 步完成
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground transition-all duration-200 shrink-0",
            expanded && "rotate-180",
          )}
        />
      </button>

      {/* 步骤列表 */}
      {expanded && (
        <div className="px-3 pb-1.5 divide-y divide-ai/8">
          {toolCalls.map((call, i) => (
            <div key={i} className="flex items-start gap-2 py-1.5">
              {call.success ? (
                <CircleCheck className="size-3.5 text-success shrink-0 mt-0.5" />
              ) : (
                <CircleX className="size-3.5 text-destructive shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0 text-xs leading-relaxed">
                <span className="text-foreground font-mono">
                  {call.server}:{call.tool}
                </span>
                {call.result && (
                  <span className="text-muted-foreground ml-1">→ {call.result}</span>
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
