import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageScrollArea } from "@/components/ui/page-scroll-area";
import { useToast } from "@/components/ui/toast";
import { copyWithFeedback } from "@/components/ui/copy-feedback";
import { getMCPEnabled, listServers, setMCPEnabled, updateServer, revealSecret, revealedKind, verification, credentialModeLabel, type MCPServer, type MCPTool } from "@/domain/mcp/mcp-client";
import { useMCPTask } from "./useMCPTask";
import { MCPFailure } from "./MCPShared";
import { MCPAdvanced } from "./MCPAdvanced";
import { MCPToolsDialog } from "./MCPTools";
import { MCPConfirmDialog } from "./MCPConfirmDialog";
import { MCPServerEditor } from "./MCPServerEditor";
import { MCPTestDialog, type TestInput } from "./MCPTestDialog";
type Modal = { kind: "tools"; id: string } | { kind: "edit"; server?: MCPServer } | { kind: "clear" | "delete"; server: MCPServer } | { kind: "test"; input: TestInput };
export function MCPPage() {
  const [value, setValue] = useState<{ enabled: boolean; servers: MCPServer[] } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null), [modal, setModal] = useState<Modal | null>(null);
  const [counts, setCounts] = useState<ReadonlyMap<string, MCPTool[] | null>>(() => new Map()), [notice, setNotice] = useState("");
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
    if (result) { setCounts(new Map()); setNotice("配置已保存；后台初始化结果请手动刷新核对。"); }
    await refresh(); lock.current = false;
  };
  const open = (next: Modal) => { if (next.kind !== "tools") setExpanded(null); setModal(next); };
  const saved = () => { setModal(null); setCounts(new Map()); setNotice("操作已保存并安全读回；验证结果可手动刷新。"); };
  const toolsServer = modal?.kind === "tools" ? value?.servers.find(server => server.name === modal.id) : undefined;
  useEffect(() => {
    if (modal?.kind === "tools" && value && !toolsServer) { setModal(null); setNotice("服务器已不在当前列表中，请刷新核对。"); }
  }, [modal, value, toolsServer]);
  const busy = read.state.busy || write.state.busy || !!modal;
  return <section aria-label="MCP 管理面板" className="mist-glass flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[22px] bg-background/70! dark:bg-background/50!">
    <header className="shrink-0 space-y-2 border-b border-border/60 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">MCP 服务 <span className="font-normal text-muted-foreground">{value?.servers.length ?? "—"} 台</span></h3>
        <div className="flex items-center gap-1"><Button size="icon" variant="ghost" aria-label="刷新 MCP 列表" title="刷新 MCP 列表" disabled={busy} onClick={() => { void refresh(); }}><RefreshCw /></Button><Button size="compact" disabled={busy || !value} onClick={() => open({ kind: "edit" })}><Plus />新增服务器</Button></div></div>
      <div data-mcp-global className="flex items-center justify-between gap-3"><div className="min-w-0 space-y-0.5"><p className="text-xs font-medium">全局启用</p><p className="text-xs leading-relaxed text-muted-foreground">关闭后回收连接，保留服务器、凭据与工具配置。</p></div><Switch aria-label="全局启用 MCP" checked={value?.enabled ?? false} disabled={busy || !value} busy={write.state.busy} onCheckedChange={enabled => { void mutate(signal => setMCPEnabled(enabled, signal)); }} /></div>
      <MCPFailure error={read.state.error ?? write.state.error} retry={() => { void refresh(); }} />
      {notice && <p role="status" className="text-xs text-muted-strong">{notice}</p>}
    </header>
    <PageScrollArea label="MCP 服务器列表" topLabel="回到 MCP 顶部" contentClassName="pb-4">
      {!value && read.state.busy && <p role="status" className="text-xs">正在读取 MCP 配置…</p>}
      {value?.servers.length === 0 && <p className="py-4 text-sm text-muted-foreground">暂无服务器，新增后可测试连接。</p>}
      <div className="divide-y divide-border/60">{value?.servers.map(server => <ServerRow key={server.name} server={server} expanded={expanded === server.name} count={counts.get(server.name) ?? null} dialogOpen={!!modal} busy={busy}
        expand={() => setExpanded(previous => previous === server.name ? null : server.name)} refresh={refresh} open={open}
        toggle={enabled => { void mutate(signal => updateServer(server.name, { display_name: server.displayName, url: server.url, enabled, ...(server.credential.secret_ref ? { secret_ref: server.credential.secret_ref } : {}) }, signal)); }} />)}</div>
      <MCPAdvanced />
      <div className="px-3 sm:px-4"><a href="/mcp" target="_top" className="inline-flex min-h-11 items-center text-xs font-medium text-primary-ink underline underline-offset-4">旧版 MCP 管理</a></div>
    </PageScrollArea>
    {modal?.kind === "tools" && toolsServer && <MCPToolsDialog key={toolsServer.name} server={toolsServer} close={() => setModal(null)} refresh={refresh} count={tools => setCounts(previous => new Map(previous).set(toolsServer.name, tools))} />}
    {modal?.kind === "edit" && <MCPServerEditor server={modal.server} close={() => setModal(null)} refresh={refresh} saved={saved} />}
    {(modal?.kind === "clear" || modal?.kind === "delete") && <MCPConfirmDialog kind={modal.kind} server={modal.server} close={() => setModal(null)} refresh={refresh} saved={saved} />}
    {modal?.kind === "test" && <MCPTestDialog input={modal.input} close={() => setModal(null)} stale={() => { void refresh(); }} />}
  </section>;
}
function ServerRow({ server, expanded, expand, busy, count, dialogOpen, refresh, open, toggle }: {
  server: MCPServer; expanded: boolean; expand: () => void; busy: boolean; count: MCPTool[] | null; dialogOpen: boolean;
  refresh: () => Promise<MCPServer[] | undefined>; open: (modal: Modal) => void; toggle: (enabled: boolean) => void;
}) {
  const status = verification(server);
  return <article data-mcp-server={server.name} className="min-w-0 px-3 py-2 text-xs sm:px-4">
    <div data-mcp-server-heading className={`-mx-3 flex items-start gap-2 px-3 py-1 sm:-mx-4 sm:px-4 ${expanded ? "bg-background/15" : ""}`}><button type="button" aria-expanded={expanded} aria-label={`详情 ${server.displayName}`} className="flex min-h-11 min-w-0 flex-1 items-start gap-2 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-ring" onClick={expand}>
      <ChevronDown aria-hidden="true" className={`mt-1 size-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} /><span className="min-w-0 space-y-1"><span className="block break-all text-sm font-semibold">{server.displayName}</span><span className="block text-muted-foreground">{server.enabled ? "服务器已启用" : "服务器已停用"} · 凭据{server.credential.configured ? "已配置" : "未配置"}</span></span></button>
      <Switch aria-label={`启用服务器 ${server.displayName}`} checked={server.enabled} disabled={busy || (server.credential.configured && !server.credential.secret_ref)} onCheckedChange={toggle} /></div>
    <div data-mcp-verification className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 leading-relaxed"><span className={status === "上次验证成功" ? "text-success" : status === "上次验证失败" ? "text-destructive" : "text-muted-foreground"}>{status}</span>{server.lastConnected > 0 && <span className="text-muted-foreground">{new Date(server.lastConnected * 1000).toLocaleString()}</span>}</div>
    {count && <p className="pb-2 text-muted-foreground">已启用 {count.filter(tool => tool.enabled).length} / 共 {count.length} 项工具</p>}
    {expanded && <div data-mcp-details className="space-y-2 border-t border-border/60 pt-2">
      <dl className="space-y-1.5"><div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 leading-relaxed"><dt className="text-muted-foreground">公开 URL</dt><dd className="min-w-0 text-right [overflow-wrap:anywhere]">{server.url || (server.url_diagnostic ? "地址已安全隐藏，请手动修正" : "未提供公开地址")}</dd></div><div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 leading-relaxed"><dt className="text-muted-foreground">凭据模式</dt><dd className="min-w-0 text-right">{credentialModeLabel(server.credentialMode)}</dd></div></dl>
      {server.url_diagnostic && <p role="alert" className="break-words rounded-xl bg-warning/10 p-3">{server.url_diagnostic}。请编辑并手动修正地址；不会猜测或截断 URL。</p>}
      <SecretDetails key={`${server.name}:${dialogOpen}`} server={server} refresh={refresh} clear={() => open({ kind: "clear", server })} />
      <div data-mcp-server-actions className="flex flex-wrap items-start justify-between gap-2 border-t border-border/60 pt-2">
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => open({ kind: "edit", server })}>编辑</Button><Button size="sm" variant="outline" disabled={busy || !!server.url_diagnostic} onClick={() => open({ kind: "test", input: { id: server.name, body: {} } })}>测试连接</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => open({ kind: "tools", id: server.name })}>管理工具</Button></div>
        <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/8 hover:text-destructive" disabled={busy} onClick={() => open({ kind: "delete", server })}>删除</Button>
      </div>
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
  return <div className="space-y-2">
    <dl><div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 leading-relaxed"><dt className="text-muted-foreground">凭据</dt><dd className="min-w-0 text-right [overflow-wrap:anywhere]">{server.credential.configured ? `已配置 · ${server.credential.masked}` : "未配置"}</dd></div></dl>
    <MCPFailure error={task.state.error} />
    {notice && <p role="status">{notice}</p>}
    {secret !== null && <div><p className="text-muted-foreground">{revealedKind(secret)}</p><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all select-text">{secret}</pre></div>}
    {!ref && server.credential.configured && <p className="text-muted-foreground">当前无可用凭据引用，请刷新后再操作。</p>}
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {secret === null ? <Button size="sm" variant="ghost" className="px-0" disabled={!ref || task.state.busy} onClick={() => { setNotice(""); if (ref) void task.run(async signal => ({ secret: await revealSecret(ref, signal), ref })); }}>查看凭据</Button> : <><Button size="sm" variant="ghost" className="px-0" onClick={task.reset}>隐藏凭据</Button><Button size="sm" variant="ghost" className="px-0" onClick={() => { void copyWithFeedback(secret, async value => { if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable"); await navigator.clipboard.writeText(value); }, toast.show); }}>复制凭据</Button></>}
      <Button size="sm" variant="ghost" className="px-0 text-destructive hover:bg-destructive/8 hover:text-destructive" disabled={!server.credential.configured || !ref || task.state.busy} onClick={() => { task.reset(); clear(); }}>清除凭据</Button>
    </div>
  </div>;
}
