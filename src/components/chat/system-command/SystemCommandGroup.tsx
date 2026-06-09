/**
 * 系统指令组 — ChatGPT 步骤条风格
 * - 音乐卡片独立渲染
 * - 其他指令合并为一个可折叠的步骤卡片
 * - 每行：状态勾/叉 + 图标 + 标签 + 内容（自动换行）
 */
import { memo, useMemo, useState } from "react";
import {
  Plug, CircleCheck, CircleX, ChevronDown, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "../types";
import type { SystemCommandData, McpToolCall } from "./types";
import { parseSystemMessage, extractMcpToolCalls } from "./parse-system-message";
import { ResultCard } from "./ResultCard";

// ─── 单步（一行） ───

interface StepRowProps {
  data: SystemCommandData;
  mcpCalls?: McpToolCall[];
}

function StepRow({ data, mcpCalls }: StepRowProps) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      {/* 状态 */}
      {data.status === "loading" ? (
        <Loader2 className="size-3.5 text-ai animate-spin shrink-0 mt-0.5" />
      ) : data.status === "success" ? (
        <CircleCheck className="size-3.5 text-success shrink-0 mt-0.5" />
      ) : (
        <CircleX className="size-3.5 text-destructive shrink-0 mt-0.5" />
      )}

      {/* 内容 */}
      <div className="flex-1 min-w-0 text-xs leading-relaxed">
        <span className="text-foreground">
          {data.content || data.label || ""}
        </span>

        {/* MCP 工具详情 */}
        {mcpCalls && mcpCalls.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {mcpCalls.map((call, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {call.success ? (
                  <CircleCheck className="size-2.5 text-success" />
                ) : (
                  <CircleX className="size-2.5 text-destructive" />
                )}
                <span className="font-mono">{call.server}:{call.tool}</span>
                {call.result && <span>→ {call.result}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 步骤卡片 ───

interface StepCardProps {
  commands: { msgId: string; data: SystemCommandData; mcpCalls?: McpToolCall[] }[];
}

function StepCard({ commands }: StepCardProps) {
  const [expanded, setExpanded] = useState(true);
  const doneCount = commands.filter((c) => c.data.status !== "loading").length;

  return (
    <div
      className={cn(
        "w-[85%] rounded-md overflow-hidden",
        "bg-ai/10 border border-ai/20 backdrop-blur-md shadow-sm",
      )}
    >
      {/* 头部 — 可折叠 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 w-full px-3 py-1.5 text-left",
          "hover:bg-ai/15 transition-all duration-200",
        )}
      >
        <Plug className="size-3.5 text-ai shrink-0" />
        <span className="text-xs text-ai flex-1">
          {doneCount}/{commands.length} 步完成
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
          {commands.map((cmd) => (
            <StepRow key={cmd.msgId} data={cmd.data} mcpCalls={cmd.mcpCalls} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 主组件 ───

interface SystemCommandGroupProps {
  messages: ChatMessage[];
}

function SystemCommandGroupInner({ messages }: SystemCommandGroupProps) {
  const { musicMsgs, otherCommands } = useMemo(() => {
    const music: ChatMessage[] = [];
    const others: { msgId: string; data: SystemCommandData; mcpCalls?: McpToolCall[] }[] = [];

    for (const msg of messages) {
      const data = parseSystemMessage(msg.content);
      if (!data) continue;

      if (data.type === "music") {
        music.push(msg);
      } else {
        const mcpCalls = msg.mcp_tool_calls?.length
          ? (msg.mcp_tool_calls as McpToolCall[])
          : extractMcpToolCalls(msg.content);
        others.push({
          msgId: msg.id,
          data,
          mcpCalls: mcpCalls.length > 0 ? mcpCalls : undefined,
        });
      }
    }

    return { musicMsgs: music, otherCommands: others };
  }, [messages]);

  return (
    <div className="flex flex-col gap-1">
      {/* 音乐卡片 — 独立渲染 */}
      {musicMsgs.map((msg) => {
        const data = parseSystemMessage(msg.content);
        if (!data) return null;
        return (
          <div key={msg.id}>
            <ResultCard data={data} />
          </div>
        );
      })}

      {/* 单条 → 简洁行 */}
      {otherCommands.length === 1 && (
        <div
          className={cn(
            "w-[85%] flex items-start gap-2 px-3 py-1.5 rounded-md",
            "bg-ai/10 border border-ai/20 backdrop-blur-md shadow-sm",
          )}
        >
          <StepRow data={otherCommands[0].data} mcpCalls={otherCommands[0].mcpCalls} />
        </div>
      )}

      {/* 多条 → 步骤卡片 */}
      {otherCommands.length > 1 && (
        <StepCard commands={otherCommands} />
      )}
    </div>
  );
}

export const SystemCommandGroup = memo(SystemCommandGroupInner);
