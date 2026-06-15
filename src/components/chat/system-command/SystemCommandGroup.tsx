/**
 * 系统指令组
 *
 * 按交互性分层：
 * - 交互型（音乐、MCP 工具详情）→ 卡片，用户可能想点
 * - 通知型（闹铃、待办、提醒等）→ 行内提示，看一眼就过
 */
import { memo, useMemo } from "react";
import type { ChatMessage } from "../types";
import type { SystemCommandData, McpToolCall } from "./types";
import { parseSystemMessage, extractMcpToolCalls } from "./parse-system-message";
import { ResultCard } from "./ResultCard";
import { InlineNotification } from "./InlineNotification";

// ─── 判断是否为交互型 ───

const INTERACTIVE_TYPES = new Set(["music", "mcp"]);

function isInteractive(data: SystemCommandData): boolean {
  return INTERACTIVE_TYPES.has(data.type);
}

// ─── 主组件 ───

interface SystemCommandGroupProps {
  messages: ChatMessage[];
}

function SystemCommandGroupInner({ messages }: SystemCommandGroupProps) {
  const { interactiveItems, notificationItems } = useMemo(() => {
    const interactive: { msgId: string; data: SystemCommandData; mcpCalls?: McpToolCall[] }[] = [];
    const notification: { msgId: string; data: SystemCommandData }[] = [];

    for (const msg of messages) {
      const data = parseSystemMessage(msg.content);
      if (!data) continue;

      if (isInteractive(data)) {
        const mcpCalls = msg.mcp_tool_calls?.length
          ? (msg.mcp_tool_calls as McpToolCall[])
          : extractMcpToolCalls(msg.content);
        interactive.push({
          msgId: msg.id,
          data,
          mcpCalls: mcpCalls.length > 0 ? mcpCalls : undefined,
        });
      } else {
        notification.push({ msgId: msg.id, data });
      }
    }

    return { interactiveItems: interactive, notificationItems: notification };
  }, [messages]);

  return (
    <div className="w-full flex flex-col items-center gap-0.5">
      {/* 通知型 — 行内提示，自然堆叠 */}
      {notificationItems.map((item) => (
        <div key={item.msgId} className="w-full flex justify-center">
          <InlineNotification data={item.data} />
        </div>
      ))}

      {/* 交互型 — 保留卡片 */}
      {interactiveItems.map((item) => (
        <div key={item.msgId} className="w-full flex justify-center">
          <ResultCard
            data={item.data}
            toolCalls={item.mcpCalls}
          />
        </div>
      ))}
    </div>
  );
}

export const SystemCommandGroup = memo(SystemCommandGroupInner);
