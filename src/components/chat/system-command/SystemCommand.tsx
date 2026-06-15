/**
 * SystemCommand — 系统指令统一展示组件
 *
 * 按交互性分层：
 * - 内联类型 → SimpleThink / ThinkingBlock / HeartWhisper
 * - 交互型（音乐、MCP）→ 卡片
 * - 通知型 → 行内提示
 */
import { memo } from "react";
import type { SystemCommandData, McpToolCall, MusicMeta } from "./types";
import { ResultCard } from "./ResultCard";
import { SimpleThink, ThinkingBlock, HeartWhisper } from "./InlineIndicator";
import { InlineNotification } from "./InlineNotification";

// ─── 判断是否为交互型 ───

const INTERACTIVE_TYPES = new Set(["music", "mcp"]);

function isInteractive(data: SystemCommandData): boolean {
  return INTERACTIVE_TYPES.has(data.type);
}

// ─── 组件 ───

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

  // ─── 通知型 → 行内提示 ───

  if (!isInteractive(data)) {
    return <InlineNotification data={data} className={className} />;
  }

  // ─── 交互型 → 卡片 ───

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
