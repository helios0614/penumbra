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
    <MCPDialog title={server ? "编辑 MCP 服务器" : "新增 MCP 服务器"} description="使用 SSE。留空的新凭据保留原配置；清除请使用服务器详情中的专用操作。" close={close} busy={busy} bodyAsForm
      footer={<><Button variant="outline" onClick={close} disabled={busy}>取消</Button><Button variant="outline" onClick={probe} disabled={busy || check}>测试草稿</Button><Button onClick={() => { void save(); }} disabled={busy || check}>保存服务器</Button></>}>
      <MCPFailure error={validation ?? task.state.error ?? read.state.error} />
      {check && <div className="space-y-2 rounded-xl bg-warning/10 p-3 text-xs"><p>请先核对已保存状态，再决定是否重新提交。草稿已保留。</p>
        {checked && <p>安全读回：{snapshot ? `${snapshot.displayName} · ${snapshot.enabled ? "已启用" : "已停用"} · ${snapshot.credential.configured ? "凭据已配置" : "未配置凭据"}` : "此 ID 尚未保存"}</p>}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => { void reconcile(); }}>重新读取当前状态</Button>
        <Button variant="outline" size="sm" disabled={!checked || busy} onClick={() => { setCheck(false); task.reset(); }}>已核对，继续编辑</Button></div>}
      {snapshot?.url_diagnostic && <p role="alert" className="break-words text-xs text-warning-ink">{snapshot.url_diagnostic}。公开地址被安全隐藏，空值不代表原地址为空；请手动提供修正后的地址。</p>}
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      {snapshot ? <p className="break-all text-xs text-muted-foreground sm:col-span-2">Server ID：<span aria-label="Server ID" className="font-mono">{snapshot.name}</span></p> : <label className="grid gap-2 text-xs"><span>Server ID</span><Input surface="translucent" controlSize="comfortable" aria-label="Server ID" value={draft.id} disabled={busy} placeholder="例如 my-server" onChange={e => change("id", e.target.value)} autoComplete="off" /></label>}
      <label className="grid gap-2 text-xs"><span>显示名称</span><Input surface="translucent" controlSize="comfortable" aria-label="显示名称" value={draft.displayName} placeholder="例如 日历工具" disabled={busy} onChange={e => change("displayName", e.target.value)} /></label>
      <div className="grid gap-2 text-xs"><span>凭据模式</span><AppSelect<string> surface="translucent" controlSize="comfortable" ariaLabel="凭据模式" value={draft.mode} options={[...(!["query_token", "path_segment"].includes(draft.mode) ? [{ value: draft.mode, label: `不支持的模式：${draft.mode}`, disabled: true }] : []), { value: "query_token", label: "查询参数" }, { value: "path_segment", label: "路径段" }]} disabled={busy} onValueChange={value => { setDraft(previous => ({ ...previous, mode: value, token: "", endpoint: "" })); }} /></div>
      {(draft.mode === "query_token" || !!server) && <label className="grid gap-2 text-xs sm:col-span-2"><span>公开 URL</span><Input surface="translucent" controlSize="comfortable" aria-label="公开 URL" type="url" value={draft.url} disabled={busy} placeholder={snapshot?.url_diagnostic ? "地址已安全隐藏；可手动修正" : "https://example.com/sse"} autoComplete="off" onChange={e => change("url", e.target.value)} /></label>}
      {draft.mode === "path_segment" ? <label className="grid gap-2 text-xs sm:col-span-2"><span>{server ? "新完整 Endpoint（留空保留）" : "完整 Endpoint"}</span><Input surface="translucent" controlSize="comfortable" aria-label="完整 Endpoint" type="password" autoComplete="new-password" placeholder={snapshot ? "输入新完整地址，留空保留" : "粘贴包含路径凭据的完整地址"} value={draft.endpoint} disabled={busy} onChange={e => change("endpoint", e.target.value)} /><span className="block leading-relaxed text-muted-foreground">凭据位于地址路径末段。完整地址提交后安全拆分，现有私有地址不会回填。</span></label>
        : <label className="grid gap-2 text-xs sm:col-span-2"><span>新 Token（查询参数）</span><Input surface="translucent" controlSize="comfortable" aria-label="新 Token" type="password" autoComplete="new-password" value={draft.token} disabled={busy} placeholder={snapshot?.credential.configured ? "输入新 Token，留空保留" : "输入 Token，可稍后配置"} onChange={e => change("token", e.target.value)} /></label>}
      </div>
      {draft.mode === "query_token" && <p className="text-xs leading-relaxed text-muted-foreground">使用公开 URL，Token 通过查询参数传递。</p>}
      {snapshot && <p className="text-xs text-muted-foreground">凭据：{snapshot.credential.configured ? `已配置 ${snapshot.credential.masked}` : "未配置"}</p>}
      {snapshot?.credential.configured && (draft.url !== snapshot.url) && !draft.token && !draft.endpoint && <p className="text-xs text-muted-foreground">修改地址后的草稿测试需要新凭据或完整 Endpoint；保存仍由后端保留原凭据。</p>}
      <div className="flex items-center justify-between text-xs"><span>启用此服务器</span><Switch aria-label="启用此服务器" checked={draft.enabled} disabled={busy} onCheckedChange={value => change("enabled", value)} /></div>
    </MCPDialog>
    {test && <MCPTestDialog input={test} close={() => setTest(null)} stale={() => { setCheck(true); void reconcile(); }} />}
  </>;
}
