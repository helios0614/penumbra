/**
 * 系统指令类型定义
 * 对齐 AionsHome 后端的系统能力指令集
 */

// ─── 指令类型枚举 ───

export type CommandType =
  | "music"
  | "cam_check"
  | "poi_search"
  | "location"
  | "activity_check"
  | "mcp"
  | "memory_write"
  | "alarm"
  | "reminder"
  | "monitor"
  | "todo"
  | "todo_done"
  | "schedule_del"
  | "heart_whisper"
  | "simple_think"
  | "thinking";

// ─── 指令状态 ───

export type CommandStatus = "loading" | "success" | "error";

// ─── 指令数据 ───

export interface SystemCommandData {
  type: CommandType;
  status: CommandStatus;
  /** 主文本内容 */
  content: string;
  /** 详情/描述（可选，用于展开） */
  detail?: string;
  /** 关联的图标标签 */
  label?: string;
  /** 额外结构化数据 */
  meta?: Record<string, unknown>;
}

// ─── 音乐卡片专用 ───

export interface MusicMeta {
  song: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  duration?: number;
}

// ─── MCP 工具调用专用 ───

export interface McpToolCall {
  server: string;
  tool: string;
  args?: string;
  result?: string;
  success: boolean;
}

// ─── TODO 专用 ───

export interface TodoMeta {
  id: string;
  content: string;
  done?: boolean;
  dueDate?: string;
}

// ─── 指令外观配置 ───

export interface CommandAppearance {
  icon: string; // Lucide icon name
  color: string; // Tailwind color token (e.g., "info", "success")
  bgClass: string; // Tailwind bg class
  textClass: string; // Tailwind text class
  borderClass: string; // Tailwind border class
  dotClass: string; // For loading indicator dot
  label: string; // Default display label
}
