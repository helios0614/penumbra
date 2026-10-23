import { useRef, useState } from "react";
import type { ChatSetupViewModel } from "@/application/chat-setup";
import type { MainSelection } from "@/domain/runtime";
import { mainDiagnosticMessage } from "@/components/chat-workspace/chat-sender-policy";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/app-select";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMainModelSelectionDraft } from "./useMainModelSelectionDraft";

type Props = {
  readonly setup: ChatSetupViewModel;
  readonly disabled: boolean;
  readonly configurationPending?: boolean;
  readonly onSave?: (conversationId: string, selection: MainSelection) => Promise<void>;
  readonly onRefresh?: () => Promise<void>;
  readonly onPendingChange?: (pending: boolean) => void;
};
const protocolName = (value: string) => ({ openai_chat_completions: "OpenAI 格式", anthropic_messages: "Anthropic 格式" })[value] ?? "其他接口格式";

/** Daily edit intents only. Effective identity and model status come from PR1 readback. */
export function MainModelSelection(props: Props) {
  const { setup, onSave, onRefresh } = props;
  const editor = useMainModelSelectionDraft(props);
  const { draft } = editor;
  const [advanced, setAdvanced] = useState(false);
  const composing = useRef(false);
  const configuration = setup.configuration;
  const connections = configuration?.connections ?? [];
  const saved = configuration?.selection;
  const savedConnection = connections.find(({ id }) => id === saved?.connectionId);
  const connectionOptions = connections.map((item) => ({ value: item.id,
    label: `${item.name}${!item.enabled ? " · 已停用" : !item.credentialConfigured ? " · 尚未配置凭据" : ""}` }));
  if (draft.connectionId && !connections.some(({ id }) => id === draft.connectionId)) {
    connectionOptions.unshift({ value: draft.connectionId, label: "已保存的连接（当前不可用）" });
  }
  // Global server-provided choices only. A connection change never filters, clears or infers the protocol.
  const protocols = [...(configuration?.allowedProtocols ?? [])];
  if (draft.protocol && !protocols.includes(draft.protocol)) protocols.unshift(draft.protocol);
  const diagnostic = configuration?.diagnostic ?? (setup.readiness.kind === "available" && !setup.readiness.value.ready ? setup.readiness.value.reason : null);
  const modelStatus = setup.readiness.kind === "unavailable" ? "暂时无法确认"
    : setup.readiness.value.ready ? "已就绪" : mainDiagnosticMessage(setup.readiness.value.reason);

  return <ScrollArea className="chat-model-scroll"><section className="min-w-0 space-y-3 p-3 text-xs" aria-label="模型选择">
    <header>
      <h2 className="font-medium">{setup.conversationId ? "当前生效模型" : "新会话默认（只读）"}</h2>
      <p className="mt-1 truncate text-sm text-foreground" title={saved?.model}>{saved?.model ?? "尚未选择"}</p>
      <p className="mt-1 truncate text-muted-foreground">{savedConnection?.name || "当前连接不可用"}</p>
    </header>
    <p className="text-muted-strong" role="status">模型状态：{modelStatus}</p>
    {setup.conversationId && <div className="space-y-3 border-t border-border/60 pt-3">
      <label className="grid gap-1">连接
        <AppSelect surface="translucent" ariaLabel="连接" className="text-sm" contentClassName="text-sm"
          options={connectionOptions} placeholder="请选择连接" value={draft.connectionId} disabled={editor.locked || !configuration} onValueChange={(id) => {
            const next = editor.change({ connectionId: id, model: connections.find((item) => item.id === id)?.defaultModel ?? "" });
            if (next) editor.commit(next);
          }} />
      </label>
      <label className="grid gap-1">模型名称
        <Input surface="translucent" value={draft.model} disabled={editor.locked || !configuration}
          onChange={(event) => { editor.change({ model: event.target.value }); }}
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
          onBlur={() => { if (!composing.current) editor.commit(); }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !composing.current && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
              event.preventDefault(); editor.commit();
            }
          }} placeholder="输入模型名称，完成后自动应用" />
      </label>
      {!draft.model.trim() && <p className="text-muted-foreground">此连接未提供默认模型，请填写模型名称后应用。</p>}
      {editor.dirty && <p className="text-muted-foreground">待应用的选择；上方显示当前生效模型。</p>}
    </div>}
    {editor.pending && <p role="status">正在切换并确认模型状态…</p>}
    {editor.notice && <p role="status">{editor.notice}</p>}
    <p className="text-muted-foreground">切换模型也可能影响知远之后的主动消息与提醒。</p>
    <details onToggle={(event) => setAdvanced(event.currentTarget.open)} className="text-muted-strong">
      <summary className="cursor-pointer">详细信息</summary>
      {advanced && <div className="mt-3 space-y-3">
        {setup.conversationId && <label className="grid gap-1">接口格式
          <AppSelect surface="translucent" ariaLabel="接口格式" className="text-sm" contentClassName="text-sm"
            value={draft.protocol} options={protocols.map((value) => ({ value, label: protocolName(value) }))}
            placeholder="请选择接口格式" disabled={editor.locked || !configuration} onValueChange={(protocol) => {
              const next = editor.change({ protocol }); if (next) editor.commit(next);
            }} />
        </label>}
        {saved && <dl className="grid gap-1 break-all text-muted-foreground"><dt>连接标识</dt><dd>{saved.connectionId ?? saved.profileId}</dd>
          <dt>接口标识</dt><dd>{saved.protocol ?? "兼容格式"}</dd><dt>模型名称</dt><dd>{saved.model}</dd></dl>}
        {diagnostic && <p>状态详情：{diagnostic}</p>}
        <p className="leading-relaxed text-muted-foreground">模型状态只确认本地配置，不保证远端调用成功。当前会话与新会话默认分别保存；切换不会改变已启动的 Runtime。</p>
        <p className="leading-relaxed text-muted-foreground">保存会更新最近 Main 会话，Camera、Location、闹钟、查岗、Activity greeting 和速记 Step2 可能跟随其模型或目标。</p>
      </div>}
    </details>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="compact" disabled={editor.pending || editor.locked || !onRefresh} onClick={() => { void editor.refresh(); }}>刷新状态</Button>
      {editor.dirty && editor.notice && <Button type="button" variant="outline" size="compact"
        disabled={editor.pending || editor.locked || !editor.complete || !onSave} onClick={() => editor.commit()}>重试切换</Button>}
    </div>
  </section></ScrollArea>;
}
