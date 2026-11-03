import { CheckCircle2, CircleDashed, Database, LogIn, RefreshCw } from "lucide-react";
import type { SettingsOverviewSection } from "@/application/settings-overview";
import type { ChatReadiness } from "@/domain/runtime";
import type { OverviewItemState, SettingsOverviewState } from "./settings-overview-controller";
import { SettingsOverviewError, SettingsOverviewLoading } from "./SettingsOverviewStates";
import { Badge } from "@/components/ui/badge";

const readinessCopy: Readonly<Record<string, string>> = {
  ready: "当前新会话默认配置已就绪；不代表上游调用一定成功。",
  "unknown-model": "默认模型无法识别，请核对模型配置。",
  "provider-not-configured": "当前默认模型所需的服务配置尚未就绪。",
  "configuration-invalid": "当前新会话默认配置无效，请检查连接、协议和模型。",
  missing_credential: "当前默认连接缺少凭据。",
  disabled_profile: "当前默认连接已禁用。",
  missing_profile: "当前默认连接已不存在或无法找到。",
  invalid_connection: "当前默认连接无效。",
  invalid_profile: "当前默认连接配置无效。",
  incompatible_protocol: "当前默认连接与所选协议不兼容。",
  main_default_not_selected: "尚未选择新会话默认连接、协议和模型。",
  main_selection_required: "需要选择新会话默认连接、协议和模型。",
  feature_binding_required: "尚未配置聊天任务的默认模型分配。",
  literal_model_required: "当前默认配置缺少有效的模型名称。",
  invalid_main_selection: "新会话默认模型选择无效。",
  duplicate_main_selection: "新会话默认模型存在重复选择，请核对配置。",
  conflicting_main_selection: "新会话默认模型选择存在冲突。",
  missing_base_url: "当前默认连接缺少服务地址。",
  invalid_base_url: "当前默认连接的服务地址无效。",
  invalid_registry_configuration: "连接配置目录无效，请检查配置。",
  malformed_api_configs: "历史连接配置格式无效，需要核对配置。",
};

export function settingsReadinessCopy(readiness: ChatReadiness): string {
  if (readiness.generationUnsupported) return "当前默认模型不支持聊天生成。";
  return Object.prototype.hasOwnProperty.call(readinessCopy, readiness.reason)
    ? readinessCopy[readiness.reason]
    : "当前新会话默认配置尚未就绪，请检查连接与模型配置后重试。";
}

export function SettingsSafeBasics({ state, onRetry }: {
  readonly state: SettingsOverviewState;
  readonly onRetry: (section?: SettingsOverviewSection) => void;
}) {
  const loading = Object.values(state).some(item => item.status === "idle" || item.status === "loading");
  const readiness = state.readiness.status === "success" ? state.readiness.data : null;
  const models = state.models.status === "success" ? state.models.data : null;
  return <section aria-labelledby="settings-safe-basics-title" className="space-y-3">
    <div className="mist-glass flex items-center justify-between gap-3 rounded-2xl px-3 py-2">
      <div>
        <h3 id="settings-safe-basics-title" className="text-sm font-semibold text-foreground">运行状态概览</h3>
        <p className="mt-1 text-xs text-muted-foreground">分项只读，不发起上游模型调用。</p>
      </div>
      <button type="button" onClick={() => onRetry()} disabled={loading} aria-label="重新加载设置状态"
        className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-2 text-xs text-primary-ink hover:bg-primary/10 disabled:opacity-50">
        <RefreshCw className="size-3.5" aria-hidden="true" />全部重试
      </button>
    </div>
    <OverviewItem title="Session" icon={LogIn} state={state.session} onRetry={() => onRetry("session")}>
      {state.session.status === "success" && <>
        <Badge variant="outline">{state.session.data.status === "authenticated" ? "Session 可达 · 已登录" : "Session 可达 · 未登录"}</Badge>
        <p className="mt-2 text-xs text-muted-foreground">仅表示当前浏览器的认证状态。</p>
      </>}
    </OverviewItem>
    <OverviewItem title="模型目录" icon={Database} state={state.models} onRetry={() => onRetry("models")}>
      {models && <>
        <Badge variant="outline">目录可读取 · {models.length} 个模型</Badge>
        <p className="mt-2 text-xs text-muted-foreground">内置目录，不代表远端模型全集；不会修改会话模型。</p>
        {models.length === 0 ? <p className="mt-3 text-sm text-muted-strong">目录为空；不会补充或选择默认模型。</p> :
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {models.map(model => <li key={model.key} className="min-w-0 rounded-xl border border-border-strong/50 bg-background/25 p-3">
              <p className="break-all font-mono text-xs font-semibold">{model.key}</p>
              {model.label !== model.key && <p className="mt-1 break-words text-xs">{model.label}</p>}
              <p className="mt-1 break-words text-xs text-muted-foreground">Provider：{model.provider}</p>
              {readiness?.modelKey === model.key && <Badge variant="outline" className="mt-2">新会话默认模型</Badge>}
            </li>)}
          </ul>}
        {readiness?.modelKey && !models.some(model => model.key === readiness.modelKey) &&
          <p className="mt-3 text-xs text-muted-foreground">默认模型未列于内置目录；这不影响后端对默认配置的就绪判断。</p>}
      </>}
    </OverviewItem>
    <OverviewItem title="Chat readiness · 新会话默认配置" icon={readiness?.ready ? CheckCircle2 : CircleDashed}
      state={state.readiness} onRetry={() => onRetry("readiness")}>
      {readiness && <>
        <Badge variant="outline">{readiness.ready ? "默认配置就绪" : "默认配置尚未就绪"}</Badge>
        <p className="mt-3 break-all font-mono text-sm font-semibold">{readiness.modelKey || "未提供默认模型"}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{settingsReadinessCopy(readiness)}</p>
        {readiness.setupActionRequired && <p className="mt-2 text-xs text-muted-strong">需要后续配置</p>}
        <p className="mt-2 text-xs text-muted-foreground">已有会话保留各自的模型选择。</p>
      </>}
    </OverviewItem>
  </section>;
}

function OverviewItem({ title, icon: Icon, state, onRetry, children }: {
  readonly title: string;
  readonly icon: typeof LogIn;
  readonly state: OverviewItemState<unknown>;
  readonly onRetry: () => void;
  readonly children: React.ReactNode;
}) {
  const loading = state.status === "idle" || state.status === "loading";
  return <section aria-label={title} aria-busy={loading} className="mist-glass min-w-0 rounded-[22px] p-4 sm:p-5">
    <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Icon className="size-4 shrink-0 text-muted-strong" aria-hidden="true" />{title}</h4>
    {loading && <SettingsOverviewLoading />}
    {state.status === "error" && <SettingsOverviewError error={state.error} onRetry={onRetry} />}
    {state.status === "success" && children}
  </section>;
}
