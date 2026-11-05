import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PageScrollArea } from "@/components/ui/page-scroll-area";
import { useToast } from "@/components/ui/toast";
import { copyWithFeedback } from "@/components/ui/copy-feedback";
import { getMCPEnabled, listServers, setMCPEnabled, updateServer, revealSecret, revealedKind, verification, type MCPServer, type MCPTool } from "@/domain/mcp/mcp-client";
import { useMCPTask } from "./useMCPTask";
import { MCPFailure } from "./MCPShared";
import { MCPAdvanced } from "./MCPAdvanced";
import { MCPTools } from "./MCPTools";
import { MCPConfirmDialog } from "./MCPConfirmDialog";
import { MCPServerEditor } from "./MCPServerEditor";
import { MCPTestDialog, type TestInput } from "./MCPTestDialog";
type Modal = { kind: "edit"; server?: MCPServer } | { kind: "clear" | "delete"; server: MCPServer } | { kind: "test"; input: TestInput };
export function MCPPage() {
  const [value, setValue] = useState<{ enabled: boolean; servers: MCPServer[] } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null), [modal, setModal] = useState<Modal | null>(null);
  const [generation, setGeneration] = useState(0), [notice, setNotice] = useState("");
  const read = useMCPTask<{ enabled: boolean; servers: MCPServer[] }>(), write = useMCPTask<boolean>();
  const lock = useRef(false);
  const refresh = async () => {
    const result = await read.run(async signal => { const [enabled, servers] = await Promise.all([getMCPEnabled(signal), listServers(signal)]); return { enabled, servers }; });
    if (result) setValue(result);
    return result?.servers;
  };
  useEffect(() => { void refresh(); }, []);
  const mutate = async (work: (signal: AbortSignal) => Promise<unknown>) => {
    if (lock.current) return;
    lock.current = true; setNotice("");
    const result = await write.run(async signal => { await work(signal); return true; });
    if (result) { setGeneration(previous => previous + 1); setNotice("配置已保存；后台初始化结果请手动刷新核对。"); }
    await refresh(); lock.current = false;
  };
  const open = (next: Modal) => { setExpanded(null); setModal(next); };
  const saved = () => { setModal(null); setGeneration(previous => previous + 1); setNotice("操作已保存并安全读回；验证结果可手动刷新。"); };
  const busy = read.state.busy || write.state.busy || !!modal;
  return <section aria-label="MCP 管理面板" className="mist-glass flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[22px] bg-background/70! dark:bg-background/50!">
    <header className="shrink-0 space-y-2 border-b border-border/60 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">MCP 服务 <span className="font-normal text-muted-foreground">{value?.servers.length ?? "—"} 台</span></h3>
        <div className="flex items-center gap-1"><Button size="icon" variant="ghost" aria-label="刷新 MCP 列表" title="刷新 MCP 列表" disabled={busy} onClick={() => { void refresh(); }}><RefreshCw /></Button><Button size="compact" disabled={busy || !value} onClick={() => open({ kind: "edit" })}><Plus />新增服务器</Button></div></div>
      <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">按需连接外部工具。全局停用会回收连接，保留服务器、凭据与工具配置。</p><Switch aria-label="全局启用 MCP" checked={value?.enabled ?? false} disabled={busy || !value} busy={write.state.busy} onCheckedChange={enabled => { void mutate(signal => setMCPEnabled(enabled, signal)); }} /></div>
      <MCPFailure error={read.state.error ?? write.state.error} retry={() => { void refresh(); }} />
      {notice && <p role="status" className="text-xs text-muted-strong">{notice}</p>}
    </header>
    <PageScrollArea label="MCP 服务器列表" topLabel="回到 MCP 顶部" contentClassName="space-y-3 p-3 sm:p-4">
      {!value && read.state.busy && <p role="status" className="text-xs">正在读取 MCP 配置…</p>}
      {value?.servers.length === 0 && <p className="py-4 text-sm text-muted-foreground">暂无服务器，新增后可测试连接。</p>}
      {value?.servers.map(server => <ServerCard key={server.name} server={server} expanded={expanded === server.name} generation={generation} busy={busy}
        expand={() => setExpanded(previous => previous === server.name ? null : server.name)} refresh={refresh} open={open}
        toggle={enabled => { void mutate(signal => updateServer(server.name, { display_name: server.displayName, url: server.url, enabled, ...(server.credential.secret_ref ? { secret_ref: server.credential.secret_ref } : {}) }, signal)); }} />)}
      <MCPAdvanced />
      <a href="/mcp" target="_top" className="inline-flex min-h-11 items-center text-xs font-medium text-primary-ink underline underline-offset-4">旧版 MCP 管理</a>
    </PageScrollArea>
    {modal?.kind === "edit" && <MCPServerEditor server={modal.server} close={() => setModal(null)} refresh={refresh} saved={saved} />}
    {(modal?.kind === "clear" || modal?.kind === "delete") && <MCPConfirmDialog kind={modal.kind} server={modal.server} close={() => setModal(null)} refresh={refresh} saved={saved} />}
    {modal?.kind === "test" && <MCPTestDialog input={modal.input} close={() => setModal(null)} stale={() => { void refresh(); }} />}
  </section>;
}
function ServerCard({ server, expanded, expand, busy, generation, refresh, open, toggle }: {
  server: MCPServer; expanded: boolean; expand: () => void; busy: boolean; generation: number;
  refresh: () => Promise<MCPServer[] | undefined>; open: (modal: Modal) => void; toggle: (enabled: boolean) => void;
}) {
  const [manage, setManage] = useState(false), [count, setCount] = useState<MCPTool[] | null>(null);
  useEffect(() => { setCount(null); setManage(false); }, [generation]);
  return <article data-mcp-server={server.name} className="min-w-0 rounded-2xl border border-border/60 bg-background/30 p-3 text-xs shadow-sm sm:p-4">
    <div className="flex items-start gap-2"><button type="button" aria-expanded={expanded} aria-label={`详情 ${server.displayName}`} className="flex min-h-11 min-w-0 flex-1 items-start gap-2 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-ring" onClick={expand}>
      <ChevronDown aria-hidden="true" className={`mt-1 size-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} /><span className="min-w-0 space-y-1"><span className="block break-all text-sm font-semibold">{server.displayName}</span><span className="block text-muted-foreground">{server.enabled ? "已启用" : "已停用"} · 凭据{server.credential.configured ? "已配置" : "未配置"}</span></span></button>
      <Switch aria-label={`启用服务器 ${server.displayName}`} checked={server.enabled} disabled={busy || (server.credential.configured && !server.credential.secret_ref)} onCheckedChange={toggle} /></div>
    <div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant="outline" className={verification(server) === "最近验证成功" ? "border-success/20 bg-success/10 text-success" : "text-muted-strong"}>{verification(server)}</Badge><span className="text-muted-foreground">{server.lastConnected > 0 ? new Date(server.lastConnected * 1000).toLocaleString() : "无验证时间"}</span></div>
    {count && <p className="mt-2 text-muted-foreground">已启用 {count.filter(tool => tool.enabled).length} / 共 {count.length} 项工具</p>}
    {expanded && <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
      <dl className="space-y-2 break-all"><div><dt className="text-muted-foreground">公开 URL</dt><dd>{server.url || (server.url_diagnostic ? "地址已安全隐藏，请手动修正" : "未提供公开地址")}</dd></div><div><dt className="text-muted-foreground">凭据模式</dt><dd>{server.credentialMode}</dd></div></dl>
      {server.url_diagnostic && <p role="alert" className="break-words rounded-xl bg-warning/10 p-3">{server.url_diagnostic}。请编辑并手动修正地址；不会猜测或截断 URL。</p>}
      <SecretDetails key={server.name} server={server} refresh={refresh} clear={() => open({ kind: "clear", server })} />
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => open({ kind: "edit", server })}>编辑</Button><Button size="sm" variant="outline" disabled={busy || !!server.url_diagnostic} onClick={() => open({ kind: "test", input: { id: server.name, body: {} } })}>测试连接</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => setManage(previous => !previous)}>{manage ? "收起工具" : "管理工具"}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => open({ kind: "delete", server })}>删除</Button></div>
      {manage && <MCPTools key={`${server.name}:${generation}`} id={server.name} enabled={server.enabled} refresh={refresh} count={setCount} />}
    </div>}
  </article>;
}
function SecretDetails({ server, refresh, clear }: { server: MCPServer; refresh: () => Promise<unknown>; clear: () => void }) {
  const [notice, setNotice] = useState("");
  const task = useMCPTask<{ secret: string; ref: string }>(), toast = useToast("mcp-credential");
  const ref = server.credential.secret_ref;
  useEffect(() => { task.reset(); }, [ref]);
  useEffect(() => { if (task.state.error?.code === "stale_secret_ref") { setNotice("凭据引用已过期，请核对刷新后的状态，再次确认操作。"); void refresh(); } }, [task.state.error]);
  const secret = task.state.data?.ref === ref ? task.state.data.secret : null;
  return <div className="space-y-2 rounded-xl bg-background/25 p-3">
    <p>凭据：{server.credential.configured ? `已配置 ${server.credential.masked}` : "未配置"}</p>
    <MCPFailure error={task.state.error} />
    {notice && <p role="status">{notice}</p>}
    {secret !== null && <div><p className="text-muted-foreground">{revealedKind(secret)}</p><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all select-text">{secret}</pre></div>}
    {!ref && server.credential.configured && <p className="text-muted-foreground">当前无可用凭据引用，请刷新后再操作。</p>}
    <div className="flex flex-wrap gap-2">
      {secret === null ? <Button size="sm" variant="outline" disabled={!ref || task.state.busy} onClick={() => { setNotice(""); if (ref) void task.run(async signal => ({ secret: await revealSecret(ref, signal), ref })); }}>查看凭据</Button> : <><Button size="sm" variant="outline" onClick={task.reset}>隐藏凭据</Button><Button size="sm" variant="outline" onClick={() => { void copyWithFeedback(secret, async value => { if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable"); await navigator.clipboard.writeText(value); }, toast.show); }}>复制凭据</Button></>}
      <Button size="sm" variant="ghost" disabled={!server.credential.configured || !ref || task.state.busy} onClick={() => { task.reset(); clear(); }}>清除凭据</Button>
    </div>
  </div>;
}
