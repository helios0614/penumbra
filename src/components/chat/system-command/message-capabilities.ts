import type {
  ChatAttachment,
  ChatMessage,
  McpToolCall,
  MusicAttachment,
} from "../types";

/**
 * 前端只归一化后端已经拆好的能力数据，不重复解析原始指令文本。
 */

export function isMusicAttachment(
  attachment: ChatAttachment,
): attachment is MusicAttachment {
  if (!attachment || typeof attachment !== "object") return false;

  return (
    attachment.type === "music" &&
    typeof attachment.name === "string" &&
    typeof attachment.artist === "string" &&
    (typeof attachment.id === "string" || typeof attachment.id === "number")
  );
}

export function getMusicAttachments(message: ChatMessage): MusicAttachment[] {
  return message.attachments.filter(isMusicAttachment);
}

export function getMcpToolCalls(message: ChatMessage): McpToolCall[] {
  return Array.isArray(message.mcp_tool_calls) ? message.mcp_tool_calls : [];
}

/**
 * 旧数据可能在 system 文本开头带 emoji。这里只做展示清理，
 * 不根据 emoji 或关键词判断指令类型。
 */
export function normalizeSystemMessageText(content: string): string {
  return content
    .replace(/^[\p{Extended_Pictographic}\uFE0F\u200D]+\s*/u, "")
    .trim();
}
