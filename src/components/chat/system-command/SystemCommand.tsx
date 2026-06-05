/**
 * SystemCommand — 系统指令统一展示组件
 *
 * 根据指令类型和状态自动选择合适的展示形式：
 * - loading  → LoadingIndicator（玻璃卡片 + 跳动圆点）
 * - success  → ResultCard（紧凑 badge / 音乐卡片 / MCP 卡片）
 * - 内联类型 → SimpleThink / ThinkingBlock / HeartWhisper
 */
import { memo } from "react";
import type { SystemCommandData, McpToolCall, MusicMeta } from "./types";
import { LoadingIndicator } from "./LoadingIndicator";
import { ResultCard } from "./ResultCard";
import { SimpleThink, ThinkingBlock, HeartWhisper } from "./InlineIndicator";

interface SystemCommandProps {
  data: SystemCommandData;
  /** MCP 工具调用详情 */
  toolCalls?: McpToolCall[];
  /** 音乐元数据 */
  musicMeta?: MusicMeta;
  /** 关闭/移除回调 */
  onDismiss?: () => void;
  className?: string;
}

function SystemCommandInner({
  data,
  toolCalls,
  musicMeta,
  onDismiss,
  className,
}: SystemCommandProps) {
  // ─── 内联类型优先处理 ───

  if (data.type === "simple_think") {
    return <SimpleThink content={data.content} className={className} />;
  }

  if (data.type === "thinking") {
    return <ThinkingBlock content={data.content} className={className} />;
  }

  if (data.type === "heart_whisper") {
    return <HeartWhisper content={data.content} className={className} />;
  }

  // ─── Loading 状态 ───

  if (data.status === "loading") {
    return (
      <LoadingIndicator
        type={data.type}
        label={data.label}
        detail={data.detail}
        className={className}
      />
    );
  }

  // ─── 结果展示 ───

  return (
    <ResultCard
      data={data}
      toolCalls={toolCalls}
      musicMeta={musicMeta}
      onDismiss={onDismiss}
    />
  );
}

export const SystemCommand = memo(SystemCommandInner);
