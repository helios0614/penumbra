import { useRef, useState } from "react";
import type { ChatSetupViewModel } from "@/application/chat-setup";
import type { MainSelection } from "@/domain/runtime";
import { mainDiagnosticMessage } from "@/components/chat-workspace/chat-sender-policy";
import { Button } from "@/components/ui/button";

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

  return <details className="shrink-0 border-b border-border px-4 py-2 text-xs">
    <summary className="cursor-pointer text-muted-strong">
      {setup.conversationId ? "会话模型" : "新会话默认（只读）"}：{saved?.model ?? "尚未选择"}
      {saved && ` · ${saved.connectionId ?? saved.profileId} · ${saved.protocol ?? "兼容协议"}`}
    </summary>
    <div className="mt-3 max-h-[45vh] space-y-3 overflow-y-auto pb-2">
      {diagnostic && <p role="status">{mainDiagnosticMessage(diagnostic)}（{diagnostic}）</p>}
      {!configuration && <p role="status">暂时无法读取模型配置，请重新读取状态。</p>}
      {setup.conversationId && <form className="flex flex-wrap items-end gap-2" onSubmit={async (event) => {
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
          <select className="max-w-64 rounded border bg-background p-2" value={connectionId} disabled={locked || !configuration} onChange={(event) => {
            const id = event.target.value;
            setConnectionId(id);
            // Connection default is only a draft prefill; never save or choose a protocol implicitly.
            setProtocol(""); setModel(connections.find((item) => item.id === id)?.defaultModel ?? ""); setNotice(null);
          }}>
            <option value="">请选择连接</option>
            {connectionId && !connection && <option value={connectionId}>{connectionId}（已保存，当前不可用）</option>}
            {connections.map((item) => <option key={item.id} value={item.id}>
              {item.name}（{item.id}）{!item.enabled ? " · 已禁用" : !item.credentialConfigured ? " · 缺少凭据" : ""}
            </option>)}
          </select>
        </label>
        <label className="grid gap-1">协议
          <select className="rounded border bg-background p-2" value={protocol} disabled={locked || !connection} onChange={(event) => setProtocol(event.target.value)}>
            <option value="">请选择协议</option>
            {protocol && !protocols.includes(protocol) && <option value={protocol}>{protocol}（已保存，当前不可用）</option>}
            {protocols.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="grid gap-1">Literal model
          <input className="rounded border bg-background p-2" value={model} disabled={locked || !configuration} onChange={(event) => setModel(event.target.value)} placeholder="具体模型名称" />
        </label>
        <Button type="submit" variant="outline" size="sm" disabled={locked || !canSave}>{pending ? "正在确认…" : "保存当前会话"}</Button>
      </form>}
      <Button type="button" variant="outline" size="sm" disabled={locked || !onRefresh} onClick={async () => {
        if (!onRefresh || submitting.current) return;
        submitting.current = true; setPending(true); setNotice(null);
        try { await onRefresh(); setNotice("已重新读取配置、Readiness 和历史状态。"); }
        catch { setNotice("暂时无法重新读取状态，请稍后再试。"); }
        finally { submitting.current = false; setPending(false); }
      }}>重新读取状态</Button>
      {notice && <p role="status">{notice}</p>}
      <p className="leading-relaxed text-muted-foreground">当前会话与全局新会话默认分别保存；Connection 默认模型仅用于预填。Readiness 只确认本地配置，不保证远端调用成功。修改不会热切换已启动的 Runtime。</p>
      {setup.conversationId && <p className="leading-relaxed text-muted-foreground">保存会更新会话时间，可能使本会话成为最近 Main 会话。Camera、Location、闹钟、查岗、Activity greeting 和速记 Step2 仍可能跟随最近 Main 会话的模型或目标。</p>}
    </div>
  </details>;
}
