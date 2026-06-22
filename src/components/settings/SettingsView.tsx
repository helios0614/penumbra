import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  CircleDashed,
  LogIn,
  RefreshCw,
  Server,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import {
  INITIAL_BACKEND_STATUS,
  checkBackendStatus,
  type BackendStatus,
  type ConnectionState,
  type LoginState,
} from "@/lib/backend";
import { cn } from "@/lib/utils";

interface SettingsViewProps {
  onBack?: () => void;
}

const connectionCopy: Record<ConnectionState, string> = {
  checking: "连接中",
  connected: "已连接",
  failed: "连接失败",
};

const loginCopy: Record<LoginState, string> = {
  "logged-in": "已登录",
  "logged-out": "未登录",
  unknown: "未知",
};

export function SettingsView({ onBack }: SettingsViewProps) {
  const [status, setStatus] = useState<BackendStatus>(INITIAL_BACKEND_STATUS);

  const refresh = useCallback(async () => {
    setStatus((current) => ({
      ...current,
      connection: "checking",
      login: "unknown",
      message: undefined,
    }));
    setStatus(await checkBackendStatus());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isChecking = status.connection === "checking";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-8">
      <div className="rounded-[24px] border border-white/20 bg-white/70 p-4 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-black/35 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Settings
            </p>
            <h2 className="mt-1 text-xl font-semibold text-foreground">设置</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              后端连接状态和基础配置入口。
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={isChecking}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-sm font-medium text-background shadow-sm",
                "transition hover:bg-foreground/85 disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              <RefreshCw className={cn("size-4", isChecking && "animate-spin")} />
              重新检测连接
            </button>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="grid size-10 place-items-center rounded-full bg-white/55 text-foreground shadow-sm backdrop-blur-md transition-colors hover:bg-white/75 dark:bg-black/35 dark:hover:bg-black/50"
                title="返回桌面"
              >
                <XCircle className="size-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <StatusPanel
          icon={<Server className="size-5" />}
          label="后端连接状态"
          value={connectionCopy[status.connection]}
          tone={status.connection}
        />
        <StatusPanel
          icon={<LogIn className="size-5" />}
          label="登录状态"
          value={loginCopy[status.login]}
          tone={status.login === "logged-in" ? "connected" : status.login === "logged-out" ? "failed" : "checking"}
        />
        <StatusPanel
          icon={<CircleDashed className="size-5" />}
          label="检测接口"
          value={status.endpoint}
          tone="checking"
          mono
        />
      </div>

      <div className="rounded-[24px] border border-white/20 bg-white/70 p-4 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-black/35 sm:p-5">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">当前 API Base URL</span>
          <code className="overflow-x-auto rounded-xl bg-surface-secondary px-3 py-2 text-xs text-muted-strong">
            {status.apiBaseUrl}
          </code>
          {status.checkedAt && (
            <span className="text-xs text-muted-foreground">
              最近检测：{new Date(status.checkedAt).toLocaleString()}
            </span>
          )}
          {status.message && (
            <span className="text-xs text-muted-foreground">
              返回信息：{status.message}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <PlaceholderSection title="模型设置" />
        <PlaceholderSection title="Chat 设置" />
        <PlaceholderSection title="日历设置" />
      </div>
    </div>
  );
}

function StatusPanel({
  icon,
  label,
  value,
  tone,
  mono,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: ConnectionState;
  mono?: boolean;
}) {
  const Icon = tone === "connected" ? CheckCircle2 : tone === "failed" ? XCircle : CircleDashed;

  return (
    <div className="rounded-[22px] border border-white/20 bg-white/70 p-4 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-black/35">
      <div className="flex items-start justify-between gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          {icon}
        </div>
        <Icon
          className={cn(
            "size-5 shrink-0",
            tone === "connected" && "text-success",
            tone === "failed" && "text-destructive",
            tone === "checking" && "text-muted-foreground",
          )}
        />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 truncate text-base font-semibold text-foreground",
          mono && "font-mono text-sm",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function PlaceholderSection({ title }: { title: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-border-strong bg-white/45 p-4 backdrop-blur-sm dark:bg-black/20">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <SlidersHorizontal className="size-4 text-muted-foreground" />
        {title}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">预留区块，后续按确认接口接入。</p>
    </div>
  );
}

export default SettingsView;
