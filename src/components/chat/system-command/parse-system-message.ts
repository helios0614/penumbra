/**
 * 解析系统消息内容，提取指令类型和数据
 * 对齐 AionsHome 后端发送的系统消息格式
 */
import type { SystemCommandData, CommandType, McpToolCall } from "./types";

// ─── 类型关键词映射 ───

const TYPE_KEYWORDS: [RegExp, CommandType][] = [
  [/🎵|MUSIC|播放|歌曲|音乐/i, "music"],
  [/📷|CAM_CHECK|摄像头|相机/i, "cam_check"],
  [/📍|POI_SEARCH|附近|搜索.*周边/i, "poi_search"],
  [/🗺|Location|位置|定位/i, "location"],
  [/📊|查看动态|活动追踪/i, "activity_check"],
  [/🔌|MCP|工具调用/i, "mcp"],
  [/🧠|MEMORY_WRITE|记忆|写入.*记忆/i, "memory_write"],
  [/⏰|ALARM|闹铃|闹钟/i, "alarm"],
  [/🔔|REMINDER|提醒/i, "reminder"],
  [/👁|Monitor|监控/i, "monitor"],
  [/✅|TODO_DONE|完成.*待办|已完成/i, "todo_done"],
  [/📝|TODO|待办|记录.*任务/i, "todo"],
  [/🗑|SCHEDULE_DEL|删除.*日程/i, "schedule_del"],
  [/💕|❤|HEART|心声/i, "heart_whisper"],
];

/**
 * 从系统消息文本推断指令类型
 */
function inferType(content: string): CommandType {
  for (const [pattern, type] of TYPE_KEYWORDS) {
    if (pattern.test(content)) return type;
  }
  return "memory_write"; // 默认 fallback
}

/**
 * 从系统消息 content 中提取主要文本
 * 去掉前缀标签如 "[MUSIC]" "🎵" 等
 */
function extractContent(raw: string): string {
  // 去掉方括号标签
  let s = raw.replace(/^\[[\w_]+\]\s*/, "");
  // 去掉开头的 emoji
  s = s.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*/u, "");
  return s.trim() || raw.trim();
}

/**
 * 尝试从消息中提取 MCP 工具调用
 */
function extractMcpToolCalls(content: string): McpToolCall[] {
  const calls: McpToolCall[] = [];
  const pattern = /\[MCP:([^:]+):([^\]|]+)\|?([^\]]*)\]/g;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    calls.push({
      server: match[1],
      tool: match[2],
      args: match[3] || undefined,
      success: true,
    });
  }

  return calls;
}

/**
 * 判断系统消息是否需要特殊的指令展示
 * 普通系统通知（如 "会话已创建"）返回 null
 */
export function parseSystemMessage(content: string): SystemCommandData | null {
  if (!content) return null;

  // 检查是否包含指令标签
  const hasCommandTag = /^\[[\w_]+[:\]]/.test(content) ||
    /^[\p{Emoji_Presentation}]/u.test(content);

  if (!hasCommandTag) {
    // 普通系统通知，不做特殊处理
    return null;
  }

  const type = inferType(content);
  const cleanContent = extractContent(content);

  return {
    type,
    status: "success",
    content: cleanContent,
  };
}

/**
 * 从 SSE 事件构造 loading 状态的 SystemCommandData
 */
export function createLoadingCommand(
  type: CommandType,
  detail?: string,
): SystemCommandData {
  return {
    type,
    status: "loading",
    content: "",
    detail,
  };
}

export { extractMcpToolCalls };
