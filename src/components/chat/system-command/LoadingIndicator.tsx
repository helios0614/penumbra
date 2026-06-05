/**
 * 系统指令 Loading 状态指示器
 * 用于异步指令执行中的等待状态（相机、位置、MCP 等）
 */
import { memo } from "react";
import {
  Camera,
  MapPin,
  Locate,
  Monitor,
  Plug,
  Music,
  Brain,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CommandType } from "./types";
import { COMMAND_APPEARANCE } from "./appearance";

// ─── 图标映射 ───

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Camera,
  MapPin,
  Locate,
  Monitor,
  Plug,
  Music,
  Brain,
};

// ─── 跳动圆点 ───

function BouncingDots({ className }: { className?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn("size-1.5 rounded-full animate-bounce", className)}
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

// ─── Loading 指示器 ───

interface LoadingIndicatorProps {
  type: CommandType;
  /** 自定义标签，覆盖默认 */
  label?: string;
  /** 附加说明 */
  detail?: string;
  className?: string;
}

function LoadingIndicatorInner({
  type,
  label,
  detail,
  className,
}: LoadingIndicatorProps) {
  const appearance = COMMAND_APPEARANCE[type];
  const Icon = ICON_MAP[appearance.icon] ?? Loader2;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2.5 px-3 py-1.5 rounded-md",
        "border backdrop-blur-sm",
        "shadow-sm",
        appearance.bgClass,
        appearance.borderClass,
        className,
      )}
    >
      {/* 图标 + 脉冲环 */}
      <span className="relative flex items-center justify-center size-7">
        <span
          className={cn(
            "absolute inset-0 rounded-full animate-ping opacity-30",
            appearance.dotClass,
          )}
        />
        <span
          className={cn(
            "relative flex items-center justify-center size-7 rounded-full",
            appearance.bgClass,
          )}
        >
          <Icon className={cn("size-3.5", appearance.textClass)} />
        </span>
      </span>

      {/* 文本 */}
      <div className="flex flex-col">
        <span
          className={cn(
            "text-xs font-medium leading-tight",
            appearance.textClass,
          )}
        >
          {label ?? appearance.label}
        </span>
        {detail && (
          <span className="text-[11px] text-muted-foreground leading-tight mt-0.5">
            {detail}
          </span>
        )}
      </div>

      {/* 跳动圆点 */}
      <BouncingDots className={appearance.dotClass} />
    </div>
  );
}

export const LoadingIndicator = memo(LoadingIndicatorInner);
