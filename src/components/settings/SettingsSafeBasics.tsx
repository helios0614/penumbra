import {
  CheckCircle2,
  CircleDashed,
  Database,
  LogIn,
  Server,
} from "lucide-react";

import type { ChatReadiness } from "@/domain/runtime";
import type { SettingsOverviewState } from "@/components/settings/settings-overview-controller";
import {
  SettingsOverviewError,
  SettingsOverviewLoading,
} from "@/components/settings/SettingsOverviewStates";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SettingsSafeBasicsProps {
  readonly state: SettingsOverviewState;
  readonly onRetry: () => void;
}

const readinessCopy: Record<ChatReadiness["reason"], string> = {
  ready: "后端确认当前模型具备发起聊天所需的本地配置。",
  "unknown-model": "后端不识别这个模型 key，原始值已保留供核对。",
  "provider-not-configured": "当前模型所需的服务配置尚未就绪。",
  "configuration-invalid": "后端检测到当前模型的本地配置无效。",
};

export function SettingsSafeBasics({
  state,
  onRetry,
}: SettingsSafeBasicsProps) {
  const isLoading = state.status === "idle" || state.status === "loading";

  return (
    <section
      aria-labelledby="settings-safe-basics-title"
      aria-busy={isLoading}
      className="flex flex-col gap-3"
    >
      <div className="mist-glass rounded-[24px] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              id="settings-safe-basics-title"
              className="text-sm font-semibold text-foreground"
            >
              运行状态概览
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              来自后端安全读取契约的 Session、Chat Readiness 与可用模型，只读展示。
            </p>
          </div>
          <Badge variant="outline">只读</Badge>
        </div>
      </div>

      {isLoading && <SettingsOverviewLoading />}
      {state.status === "error" && (
        <SettingsOverviewError error={state.error} onRetry={onRetry} />
      )}
      {state.status === "success" && (
        <SettingsOverviewContent overview={state.data} />
      )}
    </section>
  );
}

function SettingsOverviewContent({
  overview,
}: {
  readonly overview: NonNullable<Extract<SettingsOverviewState, { status: "success" }>["data"]>;
}) {
  const { session, readiness, models } = overview;
  const readinessModelListed = models.some(
    (model) => model.key === readiness.modelKey,
  );

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <OverviewCard
          icon={LogIn}
          title="Session / Account"
          badge={session.status === "authenticated" ? "已登录" : "未登录"}
          positive={session.status === "authenticated"}
        >
          <p className="text-sm font-medium text-foreground">
            {session.status === "authenticated"
              ? "当前浏览器拥有有效的认证 Session。"
              : "后端可达，但当前 Session 不可用。"}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            后端连接成功。安全契约不公开 cookie、token 或内部 Session ID。
          </p>
        </OverviewCard>

        <OverviewCard
          icon={readiness.ready ? CheckCircle2 : CircleDashed}
          title="Chat Readiness"
          badge={readiness.ready ? "可发起聊天" : "尚未就绪"}
          positive={readiness.ready}
        >
          <p
            className="break-all font-mono text-sm font-semibold text-foreground"
            title={readiness.modelKey || "未提供模型 key"}
          >
            {readiness.modelKey || "未提供模型 key"}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {readinessCopy[readiness.reason]}
          </p>
          {readiness.setupActionRequired && (
            <p className="mt-2 text-xs font-medium text-muted-strong">
              后端标记：需要后续配置
            </p>
          )}
        </OverviewCard>
      </div>

      <div className="mist-glass rounded-[22px] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-muted-strong" aria-hidden="true" />
              <h4 className="text-sm font-semibold text-foreground">
                Available Models
              </h4>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              保持后端顺序；列表仅供查看，不会修改会话模型。
            </p>
          </div>
          <Badge variant="outline">{models.length} 个模型</Badge>
        </div>

        {models.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border-strong bg-background/25 p-5 text-center">
            <p className="text-sm font-medium text-foreground">暂无可用模型</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              后端返回了空模型列表；页面不会补充或选择默认模型。
            </p>
          </div>
        ) : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {models.map((model) => {
              const isReadinessModel = model.key === readiness.modelKey;
              return (
                <li
                  key={model.key}
                  className="min-w-0 rounded-2xl border border-border-strong/50 bg-background/25 p-3"
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p
                        className="break-all font-mono text-xs font-semibold text-foreground"
                        title={model.key}
                      >
                        {model.key}
                      </p>
                      {model.label !== model.key && (
                        <p className="mt-1 text-xs text-muted-strong">
                          {model.label}
                        </p>
                      )}
                    </div>
                    {isReadinessModel && (
                      <Badge className="shrink-0">启动模型</Badge>
                    )}
                  </div>
                  <p className="mt-2 break-words text-xs text-muted-foreground">
                    Provider：{model.provider}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {!readinessModelListed && readiness.modelKey && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-surface-secondary/70 px-3 py-2 text-xs text-muted-strong">
            <Server className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <p className="min-w-0 leading-relaxed">
              Readiness 返回的模型
              <span className="mx-1 break-all font-mono font-semibold">
                {readiness.modelKey}
              </span>
              不在当前列表中；该 unknown key 已按后端事实保留。
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function OverviewCard({
  icon: Icon,
  title,
  badge,
  positive,
  children,
}: {
  readonly icon: typeof LogIn;
  readonly title: string;
  readonly badge: string;
  readonly positive: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="mist-glass min-h-36 rounded-[22px] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon
            className={cn(
              "size-4 shrink-0",
              positive ? "text-success" : "text-warning",
            )}
            aria-hidden="true"
          />
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        </div>
        <Badge
          variant="outline"
          className={cn(
            positive
              ? "border-success/25 bg-success/10 text-success"
              : "border-warning/25 bg-warning/10 text-warning",
          )}
        >
          {badge}
        </Badge>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}
