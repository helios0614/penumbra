import { useId, useState } from "react";
import { ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ToastProvider } from "@/components/ui/toast";
import { ResourceStatus } from "../ResourceList";
import { SettingsCredentialActions } from "../SettingsCredentialActions";
import { useWebSettings } from "./useWebSettings";

type WebPageProps = { onManageCompression: () => void };

export function WebSettingsPage(props: WebPageProps) {
  return <ToastProvider mobileClearance={16}><WebSettingsPanel {...props} /></ToastProvider>;
}

function WebSettingsPanel({ onManageCompression }: WebPageProps) {
  const web = useWebSettings();
  const [dialog, setDialog] = useState(false);
  const accessDescription = useId();
  const brave = web.snapshot?.brave;
  const disabled = !web.current || web.pending !== null;

  const feedback = <>
    {web.error && <p role="alert" className="text-xs leading-relaxed text-destructive">{web.error}</p>}
    {!web.current && web.snapshot && <p className="text-xs text-muted-foreground">当前显示上次读取的状态。</p>}
    {!web.current && web.error && <Button type="button" variant="outline" size="compact" disabled={web.pending !== null}
      onClick={() => { void web.refresh(); }}><RefreshCw aria-hidden="true" />重新读取</Button>}
  </>;

  return <>
    <section aria-label="Web 服务设置" className="mist-glass min-w-0 divide-y divide-border/60 rounded-[22px] bg-background/70! dark:bg-background/50!">
      <section aria-labelledby={accessDescription + "-title"} className="px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h3 id={accessDescription + "-title"} className="text-sm font-semibold">联网访问</h3>
            <p id={accessDescription} className="text-xs leading-relaxed text-muted-foreground">允许 AI 在新消息中使用网页读取与搜索能力。关闭后不会删除已有的联网证据。</p>
          </div>
          {web.enabled !== undefined && <Switch aria-label="联网访问" aria-describedby={accessDescription} checked={web.enabled}
            disabled={disabled} busy={web.pending === "access"} onCheckedChange={enabled => { void web.write({ kind: "access", enabled }); }} />}
        </div>
        {web.pending === "access" && <p role="status" className="mt-2 text-xs text-muted-foreground">正在保存联网许可…</p>}
      </section>

      <section aria-label="Brave Search 凭据" className="space-y-2 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Brave Search</h3>
          {brave && <ResourceStatus active={brave.configured} label={brave.configured ? "已配置" : "未配置"} stateLabel="Brave Key 状态" />}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">用于 AI 的网页搜索。URL 直接读取不依赖此 Key。</p>
        {brave && <SettingsCredentialActions label="Brave Key" credential={brave} secret={web.secret}
          disabled={disabled} busy={web.pending !== null}
          pending={web.pending === "read" || web.pending === "access" || web.pending === null ? undefined : web.pending}
          feedback={web.error ? feedback : undefined} onDialogChange={setDialog}
          clearDescription="清除后 Brave 搜索将无法使用。联网许可和 URL 读取保持原设置。"
          onReveal={() => { void web.reveal(); }} onHide={web.hide}
          onReplace={(key, done) => { void web.write({ kind: "replace", key }, done); }}
          onClear={(ref, done) => { void web.write({ kind: "clear", ref }, done); }} />}
      </section>

      <Button type="button" variant="ghost" onClick={onManageCompression}
        className="flex w-full min-w-0 justify-between gap-3 rounded-none rounded-b-[22px] px-4 py-4 text-left sm:px-5">
        <span className="min-w-0 space-y-1">
          <span className="block text-sm font-semibold">网页内容压缩模型</span>
          <span className="block text-xs font-normal leading-relaxed text-muted-foreground">模型和连接由模型与任务分配统一管理。</span>
        </span>
        <ChevronRight className="size-4 text-primary-ink" aria-hidden="true" />
      </Button>
      {((!dialog && web.error) || web.pending === "read") && <div className="space-y-2 px-4 py-3 sm:px-5">
        {web.pending === "read" && <p role="status" className="text-xs text-muted-foreground">正在读取 Web 设置…</p>}
        {!dialog && feedback}
      </div>}
    </section>
  </>;
}
