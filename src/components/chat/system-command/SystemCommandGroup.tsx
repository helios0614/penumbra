/**
 * 系统指令组
 *
 * 后端已经解析指令：MCP 使用结构化字段，其他 system 消息显示为文本。
 * 音乐属于 assistant attachments，心声属于独立事件，都不在这里猜测。
 */
import { memo } from "react";
import type { ChatMessage } from "../types";
import { getMcpToolCalls } from "./message-capabilities";
import { McpResultCard } from "./ResultCard";
import { SystemMessageLine } from "./SystemMessageLine";

// ─── 主组件 ───

interface SystemCommandGroupProps {
  messages: ChatMessage[];
}

function SystemCommandGroupInner({ messages }: SystemCommandGroupProps) {
  return (
    <div className="flex w-full flex-col items-start gap-1.5">
      {messages.map((message) => {
        const toolCalls = getMcpToolCalls(message);

        return (
          <div key={message.id} className="flex w-full justify-start">
            {toolCalls.length > 0 ? (
              <McpResultCard toolCalls={toolCalls} />
            ) : (
              <SystemMessageLine content={message.content} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export const SystemCommandGroup = memo(SystemCommandGroupInner);
