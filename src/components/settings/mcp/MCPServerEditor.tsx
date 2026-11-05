import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppSelect } from "@/components/ui/app-select";
import { Switch } from "@/components/ui/switch";
import { MCPError, createServer, updateServer, type MCPServer } from "@/domain/mcp/mcp-client";
import { serverDraft, serverBody, draftTestBody, type ServerDraft } from "@/domain/mcp/mcp-form";
import { useMCPTask } from "./useMCPTask";
import { MCPDialog, MCPFailure } from "./MCPShared";
import { MCPTestDialog, type TestInput } from "./MCPTestDialog";
export function MCPServerEditor({ server, close, refresh, saved }: {
  server?: MCPServer; close: () => void; refresh: () => Promise<MCPServer[] | undefined>; saved: () => void;
}) {
  const [snapshot, setSnapshot] = useState(server), [draft, setDraft] = useState(() => serverDraft(server));
  const [test, setTest] = useState<TestInput | null>(null), [check, setCheck] = useState(false), [checked, setChecked] = useState(false);
  const [validation, setValidation] = useState<MCPError | null>(null);
  const task = useMCPTask<boolean>(), read = useMCPTask<MCPServer[]>(), lock = useRef(false);
  const temporaryId = useRef(`__penumbra_draft_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const change = <K extends keyof ServerDraft>(key: K, value: ServerDraft[K]) => { setDraft(previous => ({ ...previous, [key]: value })); setValidation(null); };
  const reconcile = async () => {
    setChecked(false);
    const result = await read.run(async () => { const result = await refresh(); if (!result) throw new MCPError("readback"); return result; });
    if (result) { const latest = result.find(item => item.name === (snapshot?.name ?? draft.id)); if (latest) setSnapshot(latest); setChecked(true); }
  };
  useEffect(() => { if (task.state.error?.code === "stale_secret_ref") void reconcile(); }, [task.state.error]);
  const save = async () => {
    if (lock.current || check) return;
    let body: Record<string, unknown>;
    try { body = serverBody(draft, snapshot); } catch (e) { setValidation(e as MCPError); return; }
    lock.current = true;
    const result = await task.run(async signal => {
      if (snapshot) await updateServer(snapshot.name, body, signal); else await createServer(body, signal);
      const result = await refresh(); if (!result) throw new MCPError("readback");
      return true;
    });
    lock.current = false;
    if (result) saved(); else { setCheck(true); setChecked(false); }
  };
  const probe = () => {
    try { setTest({ id: snapshot?.name ?? temporaryId.current, body: draftTestBody(draft, snapshot) }); }
    catch (e) { setValidation(e as MCPError); }
  };
  const busy = task.state.busy || read.state.busy;
  return <>
    <MCPDialog title={server ? "编辑 MCP 服务器" : "新增 MCP 服务器"} description="使用 SSE。留空的新凭据保留原配置；清除请使用服务器详情中的专用操作。" close={close} busy={busy}
      footer={<><Button variant="outline" onClick={close} disabled={busy}>取消</Button><Button variant="outline" onClick={probe} disabled={busy || check}>测试草稿</Button><Button onClick={() => { void save(); }} disabled={busy || check}>保存服务器</Button></>}>
      <MCPFailure error={validation ?? task.state.error ?? read.state.error} />
      {check && <div className="space-y-2 rounded-xl bg-warning/10 p-3 text-xs"><p>请先核对已保存状态，再决定是否重新提交。草稿已保留。</p>
        {checked && <p>安全读回：{snapshot ? `${snapshot.displayName} · ${snapshot.enabled ? "已启用" : "已停用"} · ${snapshot.credential.configured ? "凭据已配置" : "未配置凭据"}` : "此 ID 尚未保存"}</p>}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => { void reconcile(); }}>重新读取当前状态</Button>
        <Button variant="outline" size="sm" disabled={!checked || busy} onClick={() => { setCheck(false); task.reset(); }}>已核对，继续编辑</Button></div>}
      {snapshot?.url_diagnostic && <p role="alert" className="break-words text-xs text-warning-ink">{snapshot.url_diagnostic}。公开地址被安全隐藏，空值不代表原地址为空；请手动提供修正后的地址。</p>}
      <label className="block space-y-1 text-xs">Server ID<Input aria-label="Server ID" value={draft.id} disabled={!!snapshot || busy} onChange={e => change("id", e.target.value)} autoComplete="off" /></label>
      <label className="block space-y-1 text-xs">显示名称<Input aria-label="显示名称" value={draft.displayName} disabled={busy} onChange={e => change("displayName", e.target.value)} /></label>
      <div className="space-y-1 text-xs"><span>凭据模式</span><AppSelect<string> ariaLabel="凭据模式" value={draft.mode} options={[...(!["query_token", "path_segment"].includes(draft.mode) ? [{ value: draft.mode, label: `不支持的模式：${draft.mode}`, disabled: true }] : []), { value: "query_token", label: "Query Token" }, { value: "path_segment", label: "Path Segment" }]} disabled={busy} onValueChange={value => { setDraft(previous => ({ ...previous, mode: value, token: "", endpoint: "" })); }} /></div>
      {(draft.mode === "query_token" || !!server) && <label className="block space-y-1 text-xs">公开 URL<Input aria-label="公开 URL" type="url" value={draft.url} disabled={busy} placeholder={snapshot?.url_diagnostic ? "地址已安全隐藏；可手动修正" : "https://example.com/sse"} autoComplete="off" onChange={e => change("url", e.target.value)} /></label>}
      {draft.mode === "path_segment" ? <label className="block space-y-1 text-xs">{server ? "新完整 Endpoint（留空保留）" : "完整 Endpoint"}<Input aria-label="完整 Endpoint" type="password" autoComplete="new-password" value={draft.endpoint} disabled={busy} onChange={e => change("endpoint", e.target.value)} /><span className="block text-muted-foreground">后端拆分地址和凭据，现有私有 Endpoint 不会回填。</span></label>
        : <label className="block space-y-1 text-xs">新 Token<Input aria-label="新 Token" type="password" autoComplete="new-password" value={draft.token} disabled={busy} placeholder="留空保留已有凭据" onChange={e => change("token", e.target.value)} /></label>}
      {snapshot && <p className="text-xs text-muted-foreground">凭据：{snapshot.credential.configured ? `已配置 ${snapshot.credential.masked}` : "未配置"}</p>}
      {snapshot?.credential.configured && (draft.url !== snapshot.url) && !draft.token && !draft.endpoint && <p className="text-xs text-muted-foreground">修改地址后的草稿测试需要新凭据或完整 Endpoint；保存仍由后端保留原凭据。</p>}
      <div className="flex items-center justify-between text-xs"><span>启用此服务器</span><Switch aria-label="启用此服务器" checked={draft.enabled} disabled={busy} onCheckedChange={value => change("enabled", value)} /></div>
    </MCPDialog>
    {test && <MCPTestDialog input={test} close={() => setTest(null)} stale={() => { setCheck(true); void reconcile(); }} />}
  </>;
}
