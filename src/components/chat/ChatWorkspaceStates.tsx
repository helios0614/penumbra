import { LoaderCircle, MessageCircle, RefreshCw, TriangleAlert } from "lucide-react";

import type { ChatWorkspaceSafeUiError } from "@/components/chat-workspace";
import { Button } from "@/components/ui/button";

export function ChatWorkspaceLoading() {
  return (
    <div
      className="flex min-h-0 w-full flex-1 overflow-hidden"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mist-solid hidden h-full w-[280px] shrink-0 flex-col border-r border-border shadow-none md:flex">
        <div className="border-b border-border p-3">
          <SkeletonLine className="w-16" />
        </div>
        <div className="flex flex-col gap-2 p-2">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="rounded-lg px-3 py-2.5">
              <SkeletonLine className="w-3/4" />
              <SkeletonLine className="mt-2 w-1/2" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-14 shrink-0 items-center border-b border-border px-4">
          <SkeletonLine className="w-36" />
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-muted-foreground">
          <span className="flex items-center gap-2 text-sm">
            <LoaderCircle
              className="size-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            正在加载会话工作区
          </span>
        </div>
        <div className="border-t border-border p-4">
          <div className="mist-solid mx-auto h-12 max-w-[720px] animate-pulse rounded-lg bg-muted/30 motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}

export function ChatWorkspaceError({
  error,
  onRetry,
}: {
  readonly error: ChatWorkspaceSafeUiError;
  readonly onRetry: () => void;
}) {
  const title = getErrorTitle(error.code);

  return (
    <div className="flex min-h-0 w-full flex-1 overflow-hidden">
      <div className="mist-solid hidden h-full w-[280px] shrink-0 border-r border-border shadow-none md:block">
        <div className="border-b border-border p-3 text-sm font-semibold text-foreground">
          会话
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-14 shrink-0 items-center border-b border-border px-4 text-sm font-medium text-foreground">
          Penumbra
        </div>
        <div className="grid min-h-0 flex-1 place-items-center overflow-y-auto p-5">
          <div
            className="mist-glass w-full max-w-md rounded-[22px] p-4 sm:p-5"
            role="alert"
            aria-live="assertive"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
                <TriangleAlert className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {error.message}
                </p>
                <Button type="button" onClick={onRetry} className="mt-4">
                  <RefreshCw className="size-4" aria-hidden="true" />
                  重试
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChatWorkspaceEmpty({
  kind,
}: {
  readonly kind: "conversations" | "selection" | "history";
}) {
  const copy = {
    conversations: {
      title: "暂无会话",
      description: "当前没有可读取的会话。创建会话将在后续阶段接入。",
    },
    selection: {
      title: "请选择会话",
      description: "从会话列表中选择一项以查看持久化历史。",
    },
    history: {
      title: "暂无可显示的消息",
      description: "这个会话的当前历史为空，或只包含隐藏的运行时消息。",
    },
  }[kind];

  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-y-auto px-6 py-12 text-center">
      <div className="flex max-w-sm flex-col items-center">
        <span className="grid size-16 place-items-center rounded-full border border-border bg-surface-secondary/65 text-muted-strong shadow-sm">
          <MessageCircle className="size-7" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-base font-semibold text-foreground">{copy.title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {copy.description}
        </p>
      </div>
    </div>
  );
}

function SkeletonLine({ className }: { readonly className?: string }) {
  return (
    <div
      className={`h-3 animate-pulse rounded-full bg-muted/55 motion-reduce:animate-none ${className ?? ""}`}
    />
  );
}

function getErrorTitle(code: ChatWorkspaceSafeUiError["code"]): string {
  switch (code) {
    case "authentication":
      return "需要登录";
    case "network":
      return "无法连接服务";
    case "timeout":
      return "请求超时";
    case "service":
      return "会话服务暂时不可用";
    case "contract":
      return "会话数据暂时不可用";
    case "unknown":
      return "无法加载会话";
  }
}

