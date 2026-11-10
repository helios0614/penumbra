import { useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { AppSelect } from "@/components/ui/app-select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToastProvider } from "@/components/ui/toast";
import { validHttpsBaseAddress } from "@/domain/service-settings/service-address";
import {
  speechConfigs, speechPatch, ttsProviders, type SpeechDraft, type SpeechPatch, type SpeechTarget,
} from "@/domain/speech-settings/speech-settings";
import { ResourceStatus } from "../ResourceList";
import { SettingsCredentialActions } from "../SettingsCredentialActions";
import { SettingsServiceAddress } from "../SettingsServiceAddress";
import { useSpeechSettings, type SpeechScope } from "./useSpeechSettings";

type AddressConfirmation = { target: Exclude<SpeechTarget, "siliconflow">; patch: SpeechPatch; origin: string };

export function SpeechSettingsPage() {
  return <ToastProvider mobileClearance={16}><SpeechSettingsPanel /></ToastProvider>;
}

function SpeechSettingsPanel() {
  const speech = useSpeechSettings();
  const { snapshot, current, pending, error } = speech;
  const [drafts, setDrafts] = useState<Partial<Record<SpeechTarget, SpeechDraft>>>({});
  const [confirm, setConfirm] = useState<AddressConfirmation | null>(null);
  const busy = pending !== null;
  const disabled = busy || !current;

  function edit(target: SpeechTarget, change: SpeechDraft) {
    setDrafts(previous => ({ ...previous, [target]: { ...previous[target], ...change } }));
  }

  function save(target: SpeechTarget, patch: SpeechPatch) {
    setConfirm(null);
    void speech.write({ kind: "save", scope: target, patch }, () => {
      if (target === "siliconflow") edit(target, { model: undefined });
      else setDrafts(previous => ({ ...previous, [target]: undefined }));
    });
  }

  function feedback(scope: SpeechScope): ReactNode {
    if (error?.scope !== scope) return undefined;
    return <div className="space-y-2">
      <p role="alert" className="text-xs leading-relaxed text-destructive">{error.text}</p>
      {!current && <Button type="button" size="compact" variant="outline" disabled={busy}
        onClick={() => { void speech.refresh(scope); }}><RefreshCw aria-hidden="true" />重新读取</Button>}
    </div>;
  }

  function config(target: SpeechTarget) {
    if (!snapshot) return null;
    const fields = speechConfigs[target];
    const saved = snapshot.configs[target];
    const draft = drafts[target] ?? {};
    const url = draft.url?.trim() ?? "";
    const badAddress = target !== "siliconflow" && !!url && !validHttpsBaseAddress(url);
    const patch = badAddress ? {} : speechPatch(target, saved, draft);
    const label = fields.name;
    const credentialScope = `${target}-key` as const;
    const credentialPending = pending?.scope === credentialScope && pending.kind !== "read" && pending.kind !== "save" ? pending.kind : undefined;

    return <div key={target} aria-label={label + " 配置"} role="group" className="min-w-0 space-y-3">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {target === "siliconflow" ? <SettingsServiceAddress service={label} resetSubject="语音合成"
          defaultUrl={fields.defaultUrl} customAddress={saved.customAddress}
          draft={draft.url ?? ""} disabled={disabled} busy={busy} saving={pending?.scope === "siliconflow-address" && pending.kind === "save"}
          feedback={feedback("siliconflow-address")} onEdit={value => edit(target, { url: value })} onOpen={() => speech.hide(target)}
          onSave={(value, done) => {
            void speech.write({ kind: "save", scope: "siliconflow-address", patch: { siliconflow_tts_url: value } }, () => {
              edit(target, { url: undefined });
              done();
            });
          }} /> : <label className="grid min-w-0 gap-1.5 text-xs">
          <span>API 地址</span>
          <span className="break-all text-muted-foreground">{saved.customAddress ? "已配置自定义地址" : "使用默认地址 · " + fields.defaultUrl}</span>
          <Input aria-label={label + " API 地址"} surface="translucent" controlSize="comfortable" autoComplete="off" autoCapitalize="none"
            spellCheck={false} inputMode="url" value={draft.url ?? ""} placeholder="新 HTTPS 地址（留空保留）" aria-invalid={badAddress || undefined}
            disabled={disabled} onChange={event => edit(target, { url: event.target.value })} />
          {badAddress && <span className="text-destructive">请输入无内嵌凭据、查询参数或片段的 HTTPS 基础地址。</span>}
        </label>}
        <label className="grid min-w-0 content-start gap-1.5 text-xs">
          <span>模型名称</span>
          <span className="break-all text-muted-foreground">默认 · {fields.defaultModel}</span>
          <Input aria-label={label + " 模型名称"} surface="translucent" controlSize="comfortable" autoComplete="off"
            spellCheck={false} value={draft.model ?? saved.model} placeholder={fields.defaultModel} disabled={disabled}
            onChange={event => edit(target, { model: event.target.value })} />
        </label>
      </div>
      {target === "elevenlabs" && <div className="space-y-1 text-xs">
        <p>输出格式 <span className="ml-2 break-all font-mono text-muted-strong">{snapshot.outputFormat}</span></p>
        <p className="text-muted-foreground">当前音频响应、缓存及分段合成都固定使用 MP3，暂不开放格式修改。</p>
      </div>}
      <Button size="compact" disabled={disabled || badAddress || Object.keys(patch).length === 0}
        loading={pending?.scope === target && pending.kind === "save"} onClick={() => {
          if (disabled || badAddress) return;
          if (target !== "siliconflow" && patch[fields.url] !== undefined) {
            setConfirm({ target, patch, origin: new URL(url).origin });
          } else save(target, patch);
        }}>{target === "asr" ? "保存识别配置" : "保存合成配置"}</Button>
      {feedback(target)}
      {error?.scope === target && <p className="break-all text-xs text-muted-foreground">
        {current ? "已保存模型" : "上次读取的模型"} · {saved.model || fields.defaultModel}
      </p>}
      <div className="space-y-1.5 border-t border-border/60 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold">API Key</h4>
          <ResourceStatus active={saved.credential.configured} label={saved.credential.configured ? "已配置" : "未配置"} stateLabel={label + " Key 状态"} />
        </div>
        <SettingsCredentialActions label={label + " Key"} credential={saved.credential}
          secret={speech.secret?.target === target ? speech.secret.value : null} pending={credentialPending}
          disabled={disabled} busy={busy} feedback={feedback(`${target}-key`)}
          clearDescription={`清除后，${label} 将无法使用此凭据。`}
          onHide={() => speech.hide(target)} onReveal={() => { void speech.reveal(target); }}
          onReplace={(key, done) => { void speech.write({ kind: "replace", target, key }, done); }}
          onClear={(ref, done) => { void speech.write({ kind: "clear", target, ref }, done); }} />
      </div>
    </div>;
  }

  return <>
    <section aria-label="语音服务设置" className="mist-glass min-w-0 divide-y divide-border/60 rounded-[22px] bg-background/70! dark:bg-background/50!">
      {(!snapshot || !current) && <div className="space-y-2 px-4 py-4 sm:px-5">
        {pending?.kind === "read" && <p role="status" className="text-xs text-muted-foreground">正在读取语音服务配置…</p>}
        {snapshot && <p className="text-xs text-muted-foreground">当前显示上次读取的配置。</p>}
        {feedback("page")}
      </div>}
      <section aria-label="TTS 语音合成" className="space-y-3 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">TTS · 语音合成</h3>
          {snapshot && <div className="min-w-32 max-w-full">
            <AppSelect ariaLabel="语音合成 Provider" surface="translucent" controlSize="comfortable" options={ttsProviders}
              value={snapshot.provider} disabled={disabled} onValueChange={provider => {
                if (provider !== snapshot.provider) void speech.write({ kind: "save", scope: "provider", patch: { tts_provider: provider } });
              }} />
          </div>}
        </div>
        {pending?.scope === "provider" && <p role="status" className="text-xs text-muted-foreground">正在保存 Provider…</p>}
        {feedback("provider")}
        {snapshot && config(snapshot.provider)}
      </section>
      <section aria-label="ASR 语音识别" className="space-y-3 px-4 py-4 sm:px-5">
        <h3 className="text-sm font-semibold">ASR · 语音识别 <span className="ml-2 text-xs font-normal text-muted-foreground">MiniMax</span></h3>
        {config("asr")}
      </section>
    </section>
    {confirm && <AlertDialog open onOpenChange={open => { if (!open) setConfirm(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader className="space-y-2">
          <AlertDialogTitle>确认修改 API 地址</AlertDialogTitle>
          <AlertDialogDescription>{snapshot?.configs[confirm.target].credential?.configured
            ? "修改 API 地址后，现有凭据将用于新的目标地址。"
            : "如果已配置凭据，修改 API 地址后，现有凭据将用于新的目标地址。"}</AlertDialogDescription>
          <p className="break-all text-xs text-muted-strong">{confirm.origin}</p>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">取消</AlertDialogCancel>
          <AlertDialogAction disabled={disabled} onClick={() => save(confirm.target, confirm.patch)}>确认保存</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
  </>;
}
