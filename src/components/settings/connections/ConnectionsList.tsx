import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Copy, FlaskConical, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { listConnections, revealCredential } from "@/domain/registry/registry-client";
import { displayBaseUrl, RegistryError, type Connection, type ConnectionList } from "@/domain/registry/registry-types";
import { useRegistryTask } from "./useRegistryTask";
import { ConnectionError, RegistryVersion } from "./ConnectionShared";
import { ConnectionReferences } from "./ConnectionReferences";
import { ConnectionDetail } from "./ConnectionDetail";
import { ConnectionTestDialog } from "./ConnectionTestDialog";
import { ConnectionDeleteDialog } from "./ConnectionDeleteDialog";

type Modal = { kind: "edit"; id: string | null } | { kind: "test" | "delete"; id: string };
export function ConnectionsList() {
  const task = useRegistryTask<ConnectionList>();
  const [value, setValue] = useState<ConnectionList | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const actionRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const refresh = async () => {
    const result = await task.run(signal => listConnections({ signal }));
    if (result) setValue(result);
    return result;
  };
  useEffect(() => { void refresh(); }, []);
  const close = () => setModal(null);
  const finalFocus = () => modal ? actionRefs.current[`${modal.id}:${modal.kind}`] ?? heading.current : heading.current;
  const changed = () => { void refresh(); };
  const saved = () => { setNotice("连接已保存并读回。"); close(); changed(); };
  const current = value?.connections.find(connection => connection.id === modal?.id);
  return <TooltipProvider>
    <section aria-label="连接管理面板" className="mist-glass min-w-0 overflow-hidden rounded-[22px]">
      <header className="space-y-2 border-b border-border/60 px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 ref={heading} tabIndex={-1} className="text-sm font-semibold outline-none">连接管理 <span className="ml-1 font-normal text-muted-foreground">{value?.connections.length ?? "—"}</span></h3>
          <div className="flex gap-1"><Button variant="ghost" size="icon" aria-label="刷新列表" title="刷新列表" disabled={task.state.status === "loading"} onClick={() => { void refresh(); }}><RefreshCw aria-hidden="true" /></Button>
            <Button size="compact" onClick={() => setModal({ kind: "edit", id: null })}><Plus aria-hidden="true" />新增连接</Button></div>
        </div>
        {value && <RegistryVersion value={value} />}
        <ConnectionError error={task.state.error} onRetry={() => { void refresh(); }} />
        {notice && <p role="status" className="text-xs text-muted-strong">{notice}</p>}
      </header>
      {!value && task.state.status === "loading" && <p role="status" className="p-4 text-xs">正在读取连接…</p>}
      {value?.connections.length === 0 && <p className="p-4 text-xs text-muted-foreground">暂无连接，可新增连接。</p>}
      <div className="divide-y divide-border/60">
        {value?.connections.map(connection => <ConnectionRow key={connection.id} connection={connection} expanded={expanded === connection.id}
          onExpand={() => setExpanded(previous => previous === connection.id ? null : connection.id)} onRefresh={refresh}
          onAction={kind => { setNotice(""); setModal({ kind, id: connection.id }); }} actionRefs={actionRefs.current} />)}
      </div>
    </section>
    {modal?.kind === "edit" && <ConnectionDetail key={modal.id ?? "new"} id={modal.id} onSaved={saved} onUpdated={changed} onClose={() => { close(); changed(); }} finalFocus={finalFocus} />}
    {modal?.kind === "test" && <ConnectionTestDialog key={modal.id} id={modal.id} onClose={close} finalFocus={finalFocus} />}
    {modal?.kind === "delete" && current && <ConnectionDeleteDialog key={modal.id} connection={current} onClose={() => { close(); changed(); }} finalFocus={finalFocus}
      onDeleted={() => { setNotice("连接已删除，正在重新读取列表。"); close(); changed(); }} />}
  </TooltipProvider>;
}

function ConnectionRow({ connection, expanded, onExpand, onAction, onRefresh, actionRefs }: {
  connection: Connection; expanded: boolean; onExpand: () => void; onAction: (kind: "edit" | "delete" | "test") => void;
  onRefresh: () => Promise<ConnectionList | undefined>; actionRefs: Record<string, HTMLButtonElement | null>;
}) {
  const detailsId = useId();
  const copy = useRegistryTask<boolean>();
  const [copyNotice, setCopyNotice] = useState("");
  const [review, setReview] = useState(false), [checked, setChecked] = useState(false);
  useEffect(() => { copy.reset(); if (!review) setCopyNotice(""); }, [connection.credential.secret_ref]);
  useEffect(() => {
    if (!["stale_secret_ref", "invalid_secret_ref"].includes(copy.state.error?.code ?? "")) return;
    setReview(true); setChecked(false); setCopyNotice("凭据状态已变化，正在重新读取；核对后可再次明确复制。");
    void onRefresh().then(result => { if (result) setChecked(true); });
  }, [copy.state.error]);
  const copyKey = async () => {
    if (!connection.credential.configured || !connection.credential.secret_ref || review || copy.state.status === "loading") return;
    setCopyNotice("");
    const result = await copy.run(async signal => {
      let secret: string | null = null;
      try {
        secret = await revealCredential(connection.id, connection.credential.secret_ref!, { signal });
        if (signal.aborted) return false;
        if (!navigator.clipboard?.writeText) throw new RegistryError("unknown");
        // Like Location's copy action, keep the value in this call only, never in task state.
        try { await navigator.clipboard.writeText(secret); } catch { throw new RegistryError("unknown"); }
        return true;
      } finally { secret = null; }
    });
    if (result) setCopyNotice("Key 已复制");
  };
  const actions = [
    { kind: "edit", label: "编辑", icon: Pencil, action: () => onAction("edit"), disabled: false },
    { kind: "delete", label: "删除", icon: Trash2, action: () => onAction("delete"), disabled: false },
    { kind: "copy", label: "复制 Key", icon: Copy, action: () => { void copyKey(); }, disabled: !connection.credential.configured || review || copy.state.status === "loading" },
    { kind: "test", label: "测试", icon: FlaskConical, action: () => onAction("test"), disabled: false },
  ];
  return <article data-connection-id={connection.id} className="min-w-0">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 sm:px-4">
      <Button variant="ghost" onClick={onExpand} aria-expanded={expanded} aria-controls={detailsId} aria-label={`${expanded ? "收起" : "展开"}连接：${connection.name}`}
        className="h-auto min-h-0 min-w-0 basis-full justify-start gap-2 rounded-xl px-0 py-1 text-left hover:bg-transparent sm:flex-1 sm:basis-0">
        <ChevronDown className={`size-3.5 shrink-0 self-start mt-1 ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="break-all text-sm font-semibold">{connection.name}</span>
            <span className="text-[11px] font-normal text-muted-foreground">{connection.enabled ? "已启用" : "已停用"} · {connection.credential.configured ? "Key 已配置" : "Key 未配置"}</span>
            {connection.transport !== "direct" && <Badge variant="outline" className="text-[10px]">{connection.transport === "cloudflare_rest" ? "Cloudflare REST" : "Cloudflare Anthropic"}</Badge>}
          </span>
          <span className="block break-all text-xs font-normal text-muted-strong">{displayBaseUrl(connection.base_url) || "未填写基础地址"}</span>
          {connection.default_model && <span className="block break-all text-xs font-normal text-muted-foreground">模型预填：{connection.default_model}</span>}
        </span>
      </Button>
      <div role="group" aria-label={`${connection.name}的操作`} className="ml-auto flex shrink-0 gap-0.5">
        {actions.map(({ kind, label, icon: Icon, action, disabled }) => <Tooltip key={kind}>
          <TooltipTrigger render={<Button ref={element => { actionRefs[`${connection.id}:${kind}`] = element; }} variant="ghost" size="icon-lg"
            aria-label={`${label}：${connection.name}`} title={label} disabled={disabled} onClick={action} />}><Icon className="size-4" aria-hidden="true" /></TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>)}
      </div>
    </div>
    {(copyNotice || copy.state.error) && <div className="space-y-2 px-4 pb-2">
      {copyNotice && <p role="status" className="text-xs text-muted-strong">{copyNotice}</p>}
      <ConnectionError error={copy.state.error} />
      {review && !checked && <Button size="sm" variant="outline" onClick={() => { void onRefresh().then(result => { if (result) setChecked(true); }); }}>重新读取凭据状态</Button>}
      {review && <Button size="sm" variant="outline" disabled={!checked} onClick={() => { setReview(false); copy.reset(); setCopyNotice("已核对，可再次明确点击复制。"); }}>已核对，允许重新复制</Button>}
    </div>}
    {expanded && <div id={detailsId} className="space-y-2 border-t border-border/40 bg-background/10 px-4 py-3" aria-label={`${connection.name}的只读详情`}>
      {connection.transport !== "direct" && <p className="break-all text-xs">Gateway ID：{connection.gateway_id || "未填写"}</p>}
      <ConnectionReferences id={connection.id} />
      <p className="break-all font-mono text-[11px] text-muted-foreground">ID：{connection.id}</p>
    </div>}
  </article>;
}
