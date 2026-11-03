import { RefreshCw, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ErrorPresentation {
  readonly title: string;
  readonly description: string;
  readonly connectionLabel: string;
}

export function SettingsOverviewLoading() {
  return <div aria-live="polite">
    <span className="sr-only">正在加载运行状态</span>
    <SkeletonLine className="w-24" />
    <SkeletonLine className="mt-3 w-2/3" />
  </div>;
}

function SkeletonLine({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-3 animate-pulse rounded-full bg-muted/55 motion-reduce:animate-none",
        className,
      )}
    />
  );
}

export function SettingsOverviewError({
  error,
  onRetry,
}: {
  readonly error: unknown;
  readonly onRetry: () => void;
}) {
  const presentation = getSettingsOverviewErrorPresentation(error);

  return (
    <div
      className="rounded-xl bg-destructive/5 p-3"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
          <TriangleAlert className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">
              {presentation.title}
            </p>
            <Badge variant="destructive">{presentation.connectionLabel}</Badge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {presentation.description}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover active:bg-primary-active"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            重试
          </button>
        </div>
      </div>
    </div>
  );
}

export function getSettingsOverviewErrorPresentation(
  error: unknown,
): ErrorPresentation {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return {
        title: "此项读取未获授权",
        description: "后端已响应，但当前浏览器没有此项读取权限。请确认登录状态后重试。",
        connectionLabel: "无读取权限",
      };
    }
    if (error.code === "TIMEOUT") {
      return {
        title: "请求超时",
        description: "此项请求未在预期时间内返回，请稍后重试。",
        connectionLabel: "超时",
      };
    }
    if (error.code === "NETWORK_ERROR") {
      return {
        title: "此项请求连接失败",
        description: "暂时无法读取此项状态，请稍后重试。",
        connectionLabel: "连接失败",
      };
    }
  }

  return {
    title: "无法读取此项状态",
    description: "后端返回了异常状态或不符合安全契约的数据，请稍后重试。",
    connectionLabel: "加载失败",
  };
}
