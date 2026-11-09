import { useEffect, useRef, useState } from "react";
import { Copy, Eye, FlaskConical, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { PageScrollArea } from "@/components/ui/page-scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { listConnections, revealCredential } from "@/domain/registry/registry-client";
import { displayBaseUrl, RegistryError, type Connection, type ConnectionList } from "@/domain/registry/registry-types";
import { useRegistryTask } from "./useRegistryTask";
import { ConnectionError, RegistryVersion } from "./ConnectionShared";

import { ResourceRow, ResourceField, ResourceStatus, ResourceAction, ResourceActions } from "../ResourceList";
import { ConnectionDetail } from "./ConnectionDetail";
import { ConnectionTestDialog } from "./ConnectionTestDialog";
import { ConnectionDeleteDialog } from "./ConnectionDeleteDialog";

type Modal = { kind: "edit"; id: string | null } | { kind: "test" | "delete"; id: string };
export function ConnectionsList({ locateSiliconFlow = false }: { locateSiliconFlow?: boolean }) {
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
  const sharedId = locateSiliconFlow ? value?.siliconflowConnectionId : undefined;
  useEffect(() => {
    if (!sharedId) return;
    setExpanded(sharedId);
    const action = actionRefs.current[`${sharedId}:edit`];
    action?.focus({ preventScroll: true });
    action?.scrollIntoView({ block: "nearest" });
  }, [sharedId]);
  const close = () => setModal(null);
  const finalFocus = () => modal ? actionRefs.current[`${modal.id}:${modal.kind}`] ?? heading.current : heading.current;
  const changed = () => { void refresh(); };
  const saved = () => { setNotice("连接已保存并读回。"); close(); changed(); };
  const current = value?.connections.find(connection => connection.id === modal?.id);
  return <TooltipProvider>
    <section aria-label="连接管理面板" className="mist-glass flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[22px] bg-background/70! dark:bg-background/50!">
      <header className="shrink-0 space-y-2 border-b border-border/60 px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 ref={heading} tabIndex={-1} className="text-sm font-semibold outline-none">连接管理 <span className="ml-1 font-normal text-muted-foreground">{value?.connections.length ?? "—"}</span></h3>
          <div className="flex gap-1"><Button variant="ghost" size="icon" aria-label="刷新列表" title="刷新列表" disabled={task.state.status === "loading"} onClick={() => { void refresh(); }}><RefreshCw aria-hidden="true" /></Button>
            <Button size="compact" onClick={() => setModal({ kind: "edit", id: null })}><Plus aria-hidden="true" />新增连接</Button></div>
        </div>
        {value && <RegistryVersion value={value} />}
        {locateSiliconFlow && !sharedId && (value || task.state.error) &&
          <p role="status" className="text-xs text-muted-foreground">尚未确认共享连接</p>}
        <ConnectionError error={task.state.error} onRetry={() => { void refresh(); }} />
        {notice && <p role="status" className="text-xs text-muted-strong">{notice}</p>}
      </header>
      <PageScrollArea label="连接列表" topLabel="回到连接列表顶部" contentClassName="divide-y divide-border/60">
        {!value && task.state.status === "loading" && <p role="status" className="p-4 text-xs">正在读取连接…</p>}
        {value?.connections.length === 0 && <p className="p-4 text-xs text-muted-foreground">暂无连接，可新增连接。</p>}
        {value?.connections.map(connection => <ConnectionRow key={connection.id} connection={connection} expanded={expanded === connection.id}
          onExpand={() => setExpanded(previous => previous === connection.id ? null : connection.id)} onRefresh={refresh}
          onAction={kind => { setNotice(""); setModal({ kind, id: connection.id }); }} actionRefs={actionRefs.current} />)}
      </PageScrollArea>
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
  const toast = useToast("connection-copy");
  const copy = useRegistryTask<boolean>();
  const reveal = useRegistryTask<string>();
  useEffect(() => { if (!expanded) reveal.reset(); }, [expanded]);
  const [copyNotice, setCopyNotice] = useState("");
  const [review, setReview] = useState(false), [checked, setChecked] = useState(false);
  useEffect(() => { copy.reset(); reveal.reset(); toast.clear(); if (!review) setCopyNotice(""); }, [connection.credential.secret_ref]);
  useEffect(() => {
    if (!["stale_secret_ref", "invalid_secret_ref"].includes((copy.state.error ?? reveal.state.error)?.code ?? "")) return;
    setReview(true); setChecked(false); setCopyNotice("凭据状态已变化，正在重新读取；核对后可再次明确复制。");
    void onRefresh().then(result => { if (result) setChecked(true); });
  }, [copy.state.error, reveal.state.error]);
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
    if (result) toast.show({ type: "success", text: "Key 已复制" });
  };
  const actions = [
    { kind: "reveal", label: reveal.state.data !== null || reveal.state.status === "loading" ? "隐藏" : "查看", icon: Eye, action: () => {
      if (reveal.state.data !== null || reveal.state.status === "loading") reveal.reset();
      else if (connection.credential.secret_ref) void reveal.run(signal => revealCredential(connection.id, connection.credential.secret_ref!, { signal }));
    }, disabled: !connection.credential.configured || review },
    { kind: "copy", label: "复制", icon: Copy, action: () => { void copyKey(); }, disabled: !connection.credential.configured || review || copy.state.status === "loading" },
    { kind: "test", label: "测试", icon: FlaskConical, action: () => onAction("test"), disabled: false },
    { kind: "delete", label: "删除", icon: Trash2, action: () => onAction("delete"), disabled: false },
  ];
  return <ResourceRow data-connection-id={connection.id} title={connection.name} expanded={expanded} onToggle={onExpand}
    toggleLabel={`${expanded ? "收起" : "展开"}连接：${connection.name}`} detailsLabel={`${connection.name}的只读详情`}
    status={<ResourceStatus active={connection.enabled} stateLabel={connection.enabled ? "已启用" : "已停用"} label={connection.credential.configured ? "Key 已配置" : "Key 未配置"} />}
    feedback={(copyNotice || copy.state.error || reveal.state.error) ? <div className="space-y-2">
      {copyNotice && <p role="status" className="text-xs text-muted-strong">{copyNotice}</p>}
      <ConnectionError error={copy.state.error ?? reveal.state.error} />
      {review && !checked && <Button size="sm" variant="outline" onClick={() => { void onRefresh().then(result => { if (result) setChecked(true); }); }}>重新读取凭据状态</Button>}
      {review && <Button size="sm" variant="outline" disabled={!checked} onClick={() => { setReview(false); copy.reset(); reveal.reset(); setCopyNotice("已核对，可再次明确点击复制。"); }}>已核对，允许重新复制</Button>}
    </div> : null}
    controls={<Tooltip><TooltipTrigger render={<ResourceAction ref={element => { actionRefs[`${connection.id}:edit`] = element; }} icon={Pencil} iconOnly label="编辑" aria-label={`编辑：${connection.name}`} onClick={() => onAction("edit")} />} /><TooltipContent>编辑</TooltipContent></Tooltip>}>
      <dl className="space-y-1.5">
        <ResourceField label="API 地址">{displayBaseUrl(connection.base_url) || "未填写基础地址"}</ResourceField>
        {connection.default_model && <ResourceField label="模型预填">{connection.default_model}</ResourceField>}
        {connection.transport !== "direct" && <>
          <ResourceField label="接入方式">{connection.transport === "cloudflare_rest" ? "Cloudflare REST" : "Cloudflare Anthropic"}</ResourceField>
          <ResourceField label="Gateway ID">{connection.gateway_id || "未填写"}</ResourceField>
        </>}
        <ResourceField label="凭据" actions={<ResourceActions separated={false} className="shrink-0 gap-x-1.5 gap-y-0" aria-label={`${connection.name}的凭据操作`}>
          {actions.filter(({ kind }) => kind === "copy" || kind === "reveal").map(({ kind, label, icon: Icon, action, disabled }) => <ResourceAction key={kind} ref={element => { actionRefs[`${connection.id}:${kind}`] = element; }}
            icon={Icon} label={label} iconOnly compactIcon aria-label={`${label}：${connection.name}`} disabled={disabled} onClick={action} />)}
        </ResourceActions>}>{connection.credential.configured ? `已配置 · ${connection.credential.masked}` : "未配置"}</ResourceField>
      </dl>
      {reveal.state.data !== null && <p aria-label="临时 Key 明文" className="break-all font-mono text-xs">{reveal.state.data}</p>}
      <ResourceActions aria-label={`${connection.name}的操作`}>
        {actions.filter(({ kind }) => kind === "test" || kind === "delete").map(({ kind, label, icon: Icon, action, disabled }) => <ResourceAction key={kind} ref={element => { actionRefs[`${connection.id}:${kind}`] = element; }}
          icon={Icon} label={label} danger={kind === "delete"} aria-label={`${label}：${connection.name}`} disabled={disabled} onClick={action} />)}
      </ResourceActions>
  </ResourceRow>;
}
