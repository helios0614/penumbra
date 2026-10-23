import { useRef, useState } from "react";
import type { ChatSetupViewModel } from "@/application/chat-setup";
import type { MainSelection } from "@/domain/runtime";
import { mainDiagnosticMessage } from "@/components/chat-workspace/chat-sender-policy";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/app-select";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type Props = {
  readonly setup: ChatSetupViewModel;
  readonly disabled: boolean;
  readonly onSave?: (conversationId: string, selection: MainSelection) => Promise<void>;
  readonly onRefresh?: () => Promise<void>;
};

/** A conversation-only editor. New conversation defaults remain a separate Settings operation. */
export function MainModelSelection({ setup, disabled, onSave, onRefresh }: Props) {
  const saved = setup.configuration?.selection;
  const [connectionId, setConnectionId] = useState(saved?.connectionId ?? "");
  const [protocol, setProtocol] = useState(saved?.protocol ?? "");
  const [model, setModel] = useState(saved?.model ?? "");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const configuration = setup.configuration;
  const connections = configuration?.connections ?? [];
  const connection = connections.find(({ id }) => id === connectionId);
  const protocols = connection?.protocols ?? [];
  const diagnostic = configuration?.diagnostic ??
    (setup.readiness.kind === "available" && !setup.readiness.value.ready ? setup.readiness.value.reason : null);
  const locked = disabled || pending;
  const canSave = !!onSave && !!setup.conversationId && !!connection && protocols.includes(protocol) && !!model.trim();
  const savedConnection = connections.find(({ id }) => id === saved?.connectionId);
  const [editing, setEditing] = useState(false);
  const connectionOptions = connections.map((item) => ({ value: item.id,
    label: `${item.name}${!item.enabled ? " · 已禁用" : !item.credentialConfigured ? " · 缺少凭据" : ""}` }));
  if (connectionId && !connection) connectionOptions.unshift({ value: connectionId, label: `${connectionId}（已保存，当前不可用）` });
  const protocolOptions = protocols.map((item) => ({ value: item, label: item }));
  if (protocol && !protocols.includes(protocol)) protocolOptions.unshift({ value: protocol, label: `${protocol}（已保存，当前不可用）` });

  return <ScrollArea className="chat-model-scroll"><section className="min-w-0 p-3 text-xs" aria-label="模型选择">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-medium">{setup.conversationId ? "会话模型" : "新会话默认（只读）"}</h2>
      <Button type="button" variant="ghost" size="compact" aria-expanded={editing} onClick={() => setEditing(!editing)}>
        {editing ? "返回摘要" : setup.conversationId ? "编辑选择" : "查看详情"}
      </Button>
    </div>
    <p className="mt-1 truncate text-muted-strong" title={saved?.model ?? undefined}>{saved?.model ?? "尚未选择"}</p>
    <p className="mt-1 truncate text-muted-foreground">{savedConnection?.name ?? "当前连接不可用"} · {saved?.protocol ?? "兼容协议"}</p>
    {!editing && diagnostic && <p className="mt-2 text-muted-strong" role="status">当前选择需要核对，请打开详情。</p>}
    {editing && <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
      <p role="status">Readiness：{setup.readiness.kind === "available"
        ? setup.readiness.value.ready ? "本地配置已就绪" : `未就绪（${setup.readiness.value.reason}）`
        : "暂时无法确认"}</p>
      {diagnostic && <p role="status">{mainDiagnosticMessage(diagnostic)}（{diagnostic}）</p>}
      {!configuration && <p role="status">暂时无法读取模型配置，请重新读取状态。</p>}
      {setup.conversationId && <form className="grid min-w-0 gap-3" onSubmit={async (event) => {
        event.preventDefault();
        if (locked || submitting.current || !canSave || !onSave || !setup.conversationId) return;
        submitting.current = true;
        setPending(true); setNotice(null);
        try {
          await onSave(setup.conversationId, { connectionId, protocol, model: model.trim() });
          setNotice("选择已保存，并已重新读取生效状态。");
        } catch {
          setNotice("未能确认保存结果，请重新读取状态后核对。不会自动重试保存。");
        } finally { submitting.current = false; setPending(false); }
      }}>
        <label className="grid gap-1">Connection
          <AppSelect surface="translucent" ariaLabel="Connection" className="text-sm" contentClassName="text-sm"
            options={connectionOptions} placeholder="请选择连接" value={connectionId} disabled={locked || !configuration} onValueChange={(id) => {
            setConnectionId(id);
            // Connection default is only a draft prefill; never save or choose a protocol implicitly.
            setProtocol(""); setModel(connections.find((item) => item.id === id)?.defaultModel ?? ""); setNotice(null);
          }} />
        </label>
        <label className="grid min-w-0 gap-1">Protocol · 协议
          <AppSelect surface="translucent" ariaLabel="Protocol" className="text-sm" contentClassName="text-sm"
            options={protocolOptions} placeholder="请选择协议" value={protocol} disabled={locked || !connection} onValueChange={setProtocol} />
        </label>
        <label className="grid gap-1">Literal model
          <Input surface="translucent" value={model} disabled={locked || !configuration} onChange={(event) => setModel(event.target.value)} placeholder="具体模型名称" />
        </label>
        <Button type="submit" variant="default" size="compact" disabled={locked || !canSave}>{pending ? "正在确认…" : "保存当前会话"}</Button>
      </form>}
      <Button type="button" variant="outline" size="compact" disabled={locked || !onRefresh} onClick={async () => {
        if (!onRefresh || submitting.current) return;
        submitting.current = true; setPending(true); setNotice(null);
        try { await onRefresh(); setNotice("已重新读取配置、Readiness 和历史状态。"); }
        catch { setNotice("暂时无法重新读取状态，请稍后再试。"); }
        finally { submitting.current = false; setPending(false); }
      }}>重新读取状态</Button>
      {notice && <p role="status">{notice}</p>}
      <details className="text-muted-foreground"><summary className="cursor-pointer">完整选择身份与影响范围</summary>
        {saved && <dl className="mt-2 grid gap-1 break-all"><dt>Connection / Profile</dt><dd>{saved.connectionId ?? saved.profileId}</dd>
          <dt>Protocol</dt><dd>{saved.protocol ?? "兼容协议"}</dd><dt>Literal model</dt><dd>{saved.model}</dd></dl>}
        {connection && <p className="mt-2 break-all">草稿连接：{connection.id}</p>}
      <p className="mt-2 leading-relaxed">当前会话与全局新会话默认分别保存；Connection 默认模型仅用于预填。Readiness 只确认本地配置，不保证远端调用成功。修改不会热切换已启动的 Runtime。</p>
      {setup.conversationId && <p className="leading-relaxed text-muted-foreground">保存会更新会话时间，可能使本会话成为最近 Main 会话。Camera、Location、闹钟、查岗、Activity greeting 和速记 Step2 仍可能跟随最近 Main 会话的模型或目标。</p>}
      </details>
    </div>}
  </section></ScrollArea>;
}
