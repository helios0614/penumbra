import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToastProvider } from "@/components/ui/toast";
import { defaultEmbeddingUrl } from "@/domain/embedding-settings/embedding-settings-client";
import { ResourceStatus } from "../ResourceList";
import { SettingsCredentialActions } from "../SettingsCredentialActions";
import { SettingsServiceAddress } from "../SettingsServiceAddress";
import { useEmbeddingSettings, type EmbeddingScope } from "./useEmbeddingSettings";

export function EmbeddingSettingsPage() {
  return <ToastProvider mobileClearance={16}><EmbeddingSettingsPanel /></ToastProvider>;
}

function EmbeddingSettingsPanel() {
  const embedding = useEmbeddingSettings();
  const { snapshot, current, pending, error } = embedding;
  const [addressDraft, setAddressDraft] = useState("");
  const busy = pending !== null;
  const disabled = busy || !current;
  const credentialPending = pending === "reveal" || pending === "replace" || pending === "clear" ? pending : undefined;

  function feedback(scope: EmbeddingScope) {
    if (error?.scope !== scope) return undefined;
    return <div className="space-y-2">
      <p role="alert" className="text-xs leading-relaxed text-destructive">{error.text}</p>
      {!current && <Button type="button" variant="outline" size="compact" disabled={busy}
        onClick={() => { void embedding.refresh(scope); }}><RefreshCw aria-hidden="true" />重新读取</Button>}
    </div>;
  }

  return <section aria-label="Embedding 服务设置" className="mist-glass min-w-0 divide-y divide-border/60 rounded-[22px] bg-background/70! dark:bg-background/50!">
    {!current && <div className="space-y-2 px-4 py-4 sm:px-5">
      {pending === "read" && <p role="status" className="text-xs text-muted-foreground">正在读取 Embedding 服务配置…</p>}
      {snapshot && <p className="text-xs text-muted-foreground">当前显示上次读取的配置。</p>}
      {feedback("page")}
    </div>}
    <section aria-label="API 地址" className="space-y-2 px-4 py-4 sm:px-5">
      {snapshot ? <SettingsServiceAddress service="Embedding" resetSubject="Embedding 服务" defaultUrl={defaultEmbeddingUrl}
        keyNotice="修改 API 地址后，当前 Embedding API Key 会随请求发送到新地址。"
        customAddress={snapshot.customAddress} draft={addressDraft} disabled={disabled} busy={busy} saving={pending === "address"}
        feedback={feedback("address")} onOpen={embedding.hide} onClose={() => setAddressDraft("")} onEdit={setAddressDraft}
        onSave={(value, done) => { void embedding.write({ kind: "address", value }, done); }} />
        : <h3 className="text-sm font-semibold">API 地址</h3>}
    </section>
    <section aria-label="模型名称" className="space-y-2 px-4 py-4 sm:px-5">
      <h3 className="text-sm font-semibold">模型名称 <span className="ml-2 text-xs font-normal text-muted-foreground">只读</span></h3>
      {snapshot && <p className="break-all font-mono text-xs text-muted-strong">{snapshot.model}</p>}
      <p className="text-xs leading-relaxed text-muted-foreground">当前模型暂不开放修改。记忆和日记已保存历史向量，更换模型可能导致新旧向量空间不兼容。当前默认维度约定为 1024。</p>
      <p className="text-xs leading-relaxed text-muted-foreground">开放修改前，需要先设计模型版本、向量重建和回滚机制。</p>
    </section>
    <section aria-label="API Key" className="space-y-2 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">API Key</h3>
        {snapshot && <ResourceStatus active={snapshot.credential.configured}
          label={snapshot.credential.configured ? "已配置" : "未配置"} stateLabel="Embedding API Key 状态" />}
      </div>
      {snapshot && <SettingsCredentialActions label="Embedding API Key" credential={snapshot.credential} secret={embedding.secret}
        disabled={disabled} busy={busy} pending={credentialPending} feedback={feedback("key")}
        clearDescription="清除后，Embedding 服务将无法使用此凭据。"
        onReveal={() => { void embedding.reveal(); }} onHide={embedding.hide}
        onReplace={(key, done) => { void embedding.write({ kind: "replace", key }, done); }}
        onClear={(ref, done) => { void embedding.write({ kind: "clear", ref }, done); }} />}
    </section>
  </section>;
}
