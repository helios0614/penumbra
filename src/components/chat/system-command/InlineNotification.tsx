/**
 * 行内通知 — 微信"你撤回了一条消息"风格
 * 居中、小字、无边框、无背景，安静地待在对话流里
 */
import { memo } from "react";
import { CircleCheck, CircleX, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SystemCommandData } from "./types";

// ─── 前缀文案映射 ───

const PREFIX_MAP: Record<string, string> = {
  alarm: "已设置闹铃",
  reminder: "已设置提醒",
  todo: "已记录待办",
  todo_done: "已完成待办",
  schedule_del: "已删除日程",
  memory_write: "已写入记忆",
  monitor: "已设置监控",
  cam_check: "已查看相机",
  poi_search: "已搜索附近",
  location: "已获取位置",
  activity_check: "已查看动态",
  mcp: "已调用工具",
};

// ─── 组件 ───

interface InlineNotificationProps {
  data: SystemCommandData;
  className?: string;
}

function InlineNotificationInner({ data, className }: InlineNotificationProps) {
  const prefix = PREFIX_MAP[data.type] ?? "已完成";

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1.5 py-0.5 w-full max-w-[85%] mx-auto",
        className,
      )}
    >
      {/* 状态图标 */}
      {data.status === "loading" ? (
        <Loader2 className="size-3 text-foreground/40 animate-spin" />
      ) : data.status === "success" ? (
        <CircleCheck className="size-3 text-foreground/40" />
      ) : (
        <CircleX className="size-3 text-foreground/40" />
      )}

      {/* 文案 */}
      <span className="text-[11px] text-foreground/40 text-center break-words overflow-wrap-anywhere">
        {prefix}
        {data.content ? `：${data.content}` : ""}
      </span>
    </div>
  );
}

export const InlineNotification = memo(InlineNotificationInner);
