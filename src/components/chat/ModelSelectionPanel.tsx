import { useRef, useState } from "react";
import type { MainConfiguration } from "@/domain/runtime";
import type { ModelDraft } from "./useMainModelSelectionDraft";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/app-select";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface ModelSelectionEditor {
  readonly draft: ModelDraft; readonly pending: boolean; readonly notice: string | null;
  readonly dirty: boolean; readonly locked: boolean; readonly complete: boolean;
  change(patch: Partial<ModelDraft>): ModelDraft | null;
  commit(value?: ModelDraft): void;
  refresh(): Promise<unknown>;
}
const protocolName = (value: string) => ({ openai_chat_completions: "OpenAI 格式", anthropic_messages: "Anthropic 格式" })[value] ?? "其他接口格式";
const quickKey = (connectionId: string | undefined, model: string) => JSON.stringify([connectionId, model]);
const modelLabel = (model: string, connection: string) => <span className="grid min-w-0 gap-0.5 text-left">
  <span data-model-name title={model} className="whitespace-normal break-words [overflow-wrap:anywhere]">{model || "填写模型名称"}</span>
  <span data-connection-name title={connection} className="whitespace-normal break-words text-xs font-normal text-muted-foreground [overflow-wrap:anywhere]">{connection}</span>
</span>;

/** Shared presentation; callers own selection, persistence and draft policy. */
export function ModelSelectionPanel({ configuration, ownerId, editor, canSave, canRefresh, needsRecovery,
  recoveryMessage, description, sourceLabel, diagnostic = configuration?.diagnostic ?? null, explicitSave = false, allowSaveUnchanged = false, onCancel }: {
  readonly configuration: MainConfiguration | null | undefined; readonly ownerId: string | null;
  readonly editor: ModelSelectionEditor; readonly canSave: boolean; readonly canRefresh: boolean;
  readonly needsRecovery: boolean; readonly recoveryMessage: string; readonly description: string;
  readonly diagnostic?: string | null; readonly sourceLabel?: string; readonly explicitSave?: boolean; readonly allowSaveUnchanged?: boolean; readonly onCancel?: () => void;
}) {
  const { draft } = editor;
  const [advanced, setAdvanced] = useState(false);
  const composing = useRef(false);
  const connections = configuration?.connections ?? [];
  const saved = configuration?.selection;
  const savedConnection = connections.find(({ id }) => id === saved?.connectionId);
  const connectionName = savedConnection?.name || "当前连接不可用";
  const connectionOptions = connections.map((item) => ({ value: item.id,
    label: `${item.name}${!item.enabled ? " · 已停用" : !item.credentialConfigured ? " · 尚未配置凭据" : ""}` }));
  if (draft.connectionId && !connections.some(({ id }) => id === draft.connectionId)) {
    connectionOptions.unshift({ value: draft.connectionId, label: "已保存的连接（当前不可用）" });
  }
  const quickOptions = connections.map((item) => ({ value: quickKey(item.id, item.defaultModel ?? ""),
    label: modelLabel(item.defaultModel ?? "", `${item.name}${!item.enabled ? " · 已停用" : !item.credentialConfigured ? " · 尚未配置凭据" : ""}`) }));
  const savedKey = saved ? quickKey(saved.connectionId, saved.model) : "";
  // A custom literal or unavailable saved connection stays visible without inventing a fallback.
  if (saved && !quickOptions.some(({ value }) => value === savedKey)) {
    quickOptions.unshift({ value: savedKey, label: modelLabel(saved.model, connectionName) });
  }
  const draftKey = quickKey(draft.connectionId, draft.model);
  if (editor.dirty && !quickOptions.some(({ value }) => value === draftKey)) {
    quickOptions.unshift({ value: draftKey, label: modelLabel(draft.model, connections.find(({ id }) => id === draft.connectionId)?.name || "当前连接不可用") });
  }
  // Server-wide choices only. Changing a connection never infers or clears the protocol.
  const protocols = [...(configuration?.allowedProtocols ?? [])];
  if (draft.protocol && !protocols.includes(draft.protocol)) protocols.unshift(draft.protocol);
  const selectConnection = (id: string) => {
    const next = editor.change({ connectionId: id, model: connections.find((item) => item.id === id)?.defaultModel ?? "" });
    if (next) {
      if (!next.model.trim() || !next.protocol.trim()) setAdvanced(true);
      if (!explicitSave) editor.commit(next);
    }
  };
  const controlsLocked = editor.locked || !configuration || !canSave;

  return <ScrollArea className="chat-model-scroll"><section className="min-w-0 space-y-3 p-3 text-sm leading-5" aria-label="模型选择">
    <header><h2 className="font-medium">{ownerId ? editor.dirty && !explicitSave ? "切换模型" : "当前模型" : "新会话默认（只读）"}</h2></header>
    {!advanced && (ownerId ? <AppSelect surface="translucent" controlSize="comfortable" ariaLabel="切换模型"
      className="chat-model-picker text-sm" contentClassName="chat-model-options text-sm"
      options={quickOptions} placeholder="选择模型" value={editor.dirty ? draftKey : savedKey} disabled={controlsLocked}
      onValueChange={(key) => {
        const connection = connections.find((item) => quickKey(item.id, item.defaultModel ?? "") === key);
        if (connection) selectConnection(connection.id);
        else if (key === savedKey && saved?.connectionId) {
          const next = editor.change({ connectionId: saved.connectionId, model: saved.model });
          if (next && !explicitSave) editor.commit(next);
        }
      }} /> : <p className="break-words [overflow-wrap:anywhere]">{saved?.model ?? "尚未选择"}<span className="mt-1 block text-xs text-muted-foreground">{connectionName}</span></p>)}
    {sourceLabel && <p className="text-xs text-muted-strong">{sourceLabel}</p>}
    {!advanced && editor.dirty && <p data-confirmed-model className="truncate text-xs text-muted-foreground" title={`${saved?.model ?? "尚未选择"} · ${connectionName}`}>当前：{saved?.model ?? "尚未选择"} · {connectionName}</p>}
    {editor.pending && <p role="status" className="text-xs text-muted-strong">正在切换并确认…</p>}
    {!advanced && editor.dirty && !editor.pending && !editor.notice && <p className="text-xs text-muted-foreground">选择尚未应用，请继续手动调整。</p>}
    {editor.notice && <p role="status" className={editor.dirty || explicitSave ? "break-words text-xs text-muted-strong" : "sr-only"}>{editor.notice.replace(/协议/g, "接口格式")}</p>}
    {needsRecovery && <p role="status" className="text-xs text-muted-strong">{recoveryMessage.replace(/协议/g, "接口格式")}</p>}
    {ownerId && <details open={advanced} onToggle={(event) => setAdvanced(event.currentTarget.open)} className="text-muted-strong">
      <summary className="w-fit cursor-pointer rounded-sm text-xs">{advanced ? "收起详情" : "手动调整"}</summary>
      {advanced && <div className="mt-3 space-y-3">
        <label className="grid gap-1.5 text-xs">连接
          <AppSelect surface="translucent" controlSize="comfortable" ariaLabel="连接" className="text-sm" contentClassName="chat-model-options text-sm"
            options={connectionOptions} placeholder="请选择连接" value={draft.connectionId} disabled={controlsLocked} onValueChange={selectConnection} />
        </label>
        <label className="grid gap-1.5 text-xs">模型名称
          <Input surface="translucent" controlSize="comfortable" className="text-sm" value={draft.model} disabled={controlsLocked}
            autoComplete="off" autoCapitalize="none" spellCheck={false}
            onChange={(event) => { editor.change({ model: event.target.value }); }}
            onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
            onBlur={() => { if (!explicitSave && !composing.current) editor.commit(); }}
            onKeyDown={(event) => {
              if (!explicitSave && event.key === "Enter" && !composing.current && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
                event.preventDefault(); editor.commit();
              }
            }} placeholder="输入模型名称" />
        </label>
        {!draft.model.trim() && <p className="text-xs text-muted-foreground">此连接没有默认模型，请填写模型名称。</p>}
        <label className="grid gap-1.5 text-xs">接口格式
          <AppSelect surface="translucent" controlSize="comfortable" ariaLabel="接口格式" className="text-sm" contentClassName="chat-model-options text-sm"
            value={draft.protocol} options={protocols.map((value) => ({ value, label: protocolName(value) }))}
            placeholder="请选择接口格式" disabled={controlsLocked} onValueChange={(protocol) => {
              const next = editor.change({ protocol }); if (next && !explicitSave) editor.commit(next);
            }} />
        </label>
        {!explicitSave && editor.dirty && <p className="text-xs text-muted-foreground">编辑完成后自动应用。</p>}
        {!explicitSave && diagnostic && <div className="space-y-1 break-all text-xs text-muted-foreground">
          <p>状态详情：{diagnostic}</p>
          {saved && <dl className="grid gap-1"><dt>连接标识</dt><dd>{saved.connectionId ?? saved.profileId}</dd>
            <dt>接口标识</dt><dd>{saved.protocol ?? "兼容格式"}</dd></dl>}
        </div>}
      </div>}
    </details>}
    {!explicitSave && (advanced || needsRecovery || (editor.dirty && editor.notice)) && <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="compact" disabled={editor.pending || editor.locked || !canRefresh} onClick={() => { void editor.refresh(); }}>刷新状态</Button>
      {editor.dirty && editor.notice && <Button type="button" variant="outline" size="compact"
        disabled={editor.pending || editor.locked || !editor.complete || !canSave} onClick={() => editor.commit()}>重试切换</Button>}
    </div>}
    {explicitSave && <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" size="compact" disabled={editor.pending || !canRefresh} onClick={() => void editor.refresh()}>刷新状态</Button>
      <Button type="button" variant="ghost" size="compact" disabled={editor.pending} onClick={() => { onCancel?.(); setAdvanced(false); }}>取消修改</Button>
      <Button type="button" size="compact" disabled={controlsLocked || (!editor.dirty && !allowSaveUnchanged) || !editor.complete} onClick={() => editor.commit()}>{editor.pending ? "正在保存…" : "保存模型"}</Button>
    </div>}
    {ownerId && <p className="text-xs leading-5 text-muted-foreground">{description}</p>}
  </section></ScrollArea>;
}
