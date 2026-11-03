import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as registry from "@/domain/registry/registry-client";
import { displayBaseUrl, TRANSPORTS, validBaseUrl, validLiteral,
  type Connection, type ConnectionFields, type ConnectionList, type ConnectionReferences, type ConnectionWrite, type Transport } from "@/domain/registry/registry-types";
import { ConnectionError, RegistryVersion } from "./ConnectionShared";
import { ModelDiscovery } from "./ModelDiscovery";
import { ConnectionReferenceFacts } from "./ConnectionReferences";
import { AppSelect } from "@/components/ui/app-select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRegistryTask } from "./useRegistryTask";

const empty: ConnectionFields = { name: "", base_url: "", enabled: true, default_model: null, transport: "direct", gateway_id: null };
const fields = (connection: Connection): ConnectionFields => ({ name: connection.name, base_url: connection.base_url, enabled: connection.enabled,
  default_model: connection.default_model, transport: connection.transport, gateway_id: connection.gateway_id });
export function ConnectionDetail({ id: initialId, onSaved, onUpdated, onClose, finalFocus }: {
  id: string | null; onSaved: () => void; onUpdated: () => void; onClose: () => void; finalFocus: () => HTMLElement | null;
}) {
  const [createdId, setCreatedId] = useState<string | null>(null);
  const id = createdId ?? initialId;
  const [snapshot, setSnapshot] = useState<Connection | null>(null);
  const [draft, setDraft] = useState<ConnectionFields>(empty);
  const [key, setKey] = useState("");
  const [confirm, setConfirm] = useState<"save" | "clear" | null>(null);
  const [creatingForDiscovery, setCreatingForDiscovery] = useState(false);
  const [autoDiscover, setAutoDiscover] = useState(false);
  const [consent, setConsent] = useState(false);
  const [needsCheck, setNeedsCheck] = useState(false);
  const [checked, setChecked] = useState(false);
  const [notice, setNotice] = useState("");
  const writing = useRef(false);
  const read = useRegistryTask<Connection>(), refs = useRegistryTask<ConnectionReferences>(), version = useRegistryTask<ConnectionList>();
  const write = useRegistryTask<Connection>(), reveal = useRegistryTask<string>();
  const refreshReferences = () => { if (id) void refs.run(signal => registry.getConnectionReferences(id, { signal })); };
  const refresh = async (preserveDraft = true) => {
    if (!id) return;
    reveal.reset(); setKey(""); setConfirm(null); setConsent(false); setChecked(false);
    const value = await read.run(signal => registry.getConnection(id, { signal }));
    if (value) {
      setSnapshot(value); setChecked(true);
      setDraft(previous => {
        const next = fields(value);
        if (preserveDraft && snapshot) for (const field of Object.keys(empty) as (keyof ConnectionFields)[]) {
          if (previous[field] !== snapshot[field]) Object.assign(next, { [field]: previous[field] });
        }
        return next;
      });
    }
    return value;
  };
  useEffect(() => {
    void version.run(signal => registry.listConnections({ signal }));
    if (id) { void refresh(false); }
  }, [initialId]);
  useEffect(() => {
    const error = write.state.error ?? reveal.state.error;
    if (!error) return;
    setKey(""); reveal.reset();
    setNotice(error.message);
    if (write.state.error || error.code === "stale_secret_ref" || error.code === "invalid_secret_ref") {
      setNeedsCheck(true); setChecked(false);
      if (error.code === "stale_secret_ref" || error.code === "invalid_secret_ref") {
        setNotice("凭据快照已过期，正在重新读取。核对后请再次明确操作。");
        void refresh(true);
      }
    }
    if (["connection_in_use", "unresolved_selection_references", "profile_in_use"].includes(error.code)) refreshReferences();
  }, [write.state.error, reveal.state.error]);

  const change = <K extends keyof ConnectionFields>(field: K, value: ConnectionFields[K]) => {
    setDraft(previous => ({ ...previous, [field]: value })); setConfirm(null); setConsent(false); setCreatingForDiscovery(false); setNotice("");
  };
  const patch: ConnectionWrite = {};
  if (snapshot) for (const field of Object.keys(empty) as (keyof ConnectionFields)[]) {
    if (draft[field] !== snapshot[field]) Object.assign(patch, { [field]: draft[field] });
  }
  const dirty = !snapshot || Object.keys(patch).length > 0 || key.length > 0;
  // A model hint/name draft does not change the saved connection used by probes.
  const probeUnsaved = key.length > 0 || (!!snapshot && (["base_url", "transport", "gateway_id", "enabled"] as const).some(field => draft[field] !== snapshot[field]));
  const busy = write.state.status === "loading" || read.state.status === "loading";
  const valid = !!draft.name.trim() && validBaseUrl(draft.base_url.trim()) && (draft.default_model === null || validLiteral(draft.default_model)) &&
    (key.length === 0 || !!key.trim()) && !/[•●*]{3,}/.test(key);
  const references = refs.state.status === "success" ? refs.state.data : null;
  const impact = references === null || references.references.length > 0 || references.unresolved.length > 0;
  const controlsDisabled = busy || needsCheck || version.state.status !== "success" || (!!id && !snapshot);
  const begin = (action: "save" | "clear") => { refreshReferences(); reveal.reset(); setConfirm(action); setConsent(false); };

  const perform = async () => {
    if (writing.current || !confirm || refs.state.status === "loading" || controlsDisabled || (!!id && impact && !consent)) return;
    const action = confirm;
    const shouldDiscover = !id && creatingForDiscovery;
    writing.current = true; setConfirm(null); setNotice(""); reveal.reset();
    const credential = key; setKey("");
    try {
      const result = await write.run(async signal => {
        if (action === "clear" && id && snapshot?.credential.secret_ref) return registry.clearCredential(id, snapshot.credential.secret_ref, { signal });
        const body = { ...patch, ...(credential.length ? { credential, ...(snapshot?.credential.configured ? { secret_ref: snapshot.credential.secret_ref! } : {}) } : {}) };
        if (id) return registry.updateConnection(id, body, { signal });
        return registry.createConnection({ ...draft, name: draft.name.trim(), base_url: draft.base_url.trim(), ...(credential.length ? { credential } : {}) }, { signal });
      });
      if (result === undefined) return;
      setNeedsCheck(true);
      let current: Connection | undefined;
      if (!id) {
        // A returned create ID is remembered even if GET fails: never create again blindly.
        setCreatedId(result.id);
        current = await read.run(signal => registry.getConnection(result.id, { signal }));
        if (current) { setSnapshot(current); setDraft(fields(current)); }
      } else current = await refresh(false);
      if (current) {
        setNeedsCheck(false);
        if (action === "save") {
          if (shouldDiscover) { setAutoDiscover(true); setNotice("连接已创建并读回，可选择候选后保存模型建议。"); }
          else { onSaved(); return; }
        }
        if (!shouldDiscover) setNotice("操作已保存并读回。已有绑定和模型选择未修改。"); onUpdated();
      } else setNotice("写入已返回，读回尚未确认。请读取当前状态核对，勿重复提交。");
      refreshReferences(); void version.run(signal => registry.listConnections({ signal }));
    } finally { writing.current = false; }
  };

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-w-2xl" finalFocus={finalFocus} closeButtonProps={{ "aria-label": "关闭连接编辑" }}>
      <DialogHeader><DialogTitle>{id ? "编辑连接" : "新增连接"}</DialogTitle><DialogDescription>共享连接配置；模型预填建议不改变已有绑定。</DialogDescription></DialogHeader>
      <DialogBody className="space-y-4">
        <ConnectionError error={version.state.error} onRetry={() => { void version.run(signal => registry.listConnections({ signal })); }} />
        {version.state.data && (version.state.data.migration_required || version.state.data.diagnosticCount > 0 || version.state.data.deferredCount > 0) && <RegistryVersion value={version.state.data} />}
        <ConnectionError error={read.state.error} onRetry={() => { void refresh(snapshot !== null); }} />
        <ConnectionError error={write.state.error} />
        {read.state.status === "loading" && <p role="status" className="text-xs">正在读取连接…</p>}
        {notice && <p role="status" className="text-xs leading-relaxed text-muted-strong">{notice}</p>}
        {needsCheck && <section aria-label="核对当前状态" className="space-y-2 rounded-xl bg-warning/10 p-3">
          <p className="break-all text-xs leading-relaxed">不会自动重放写入，Key 输入已清理。{snapshot && <>当前：{snapshot.name} · {displayBaseUrl(snapshot.base_url)} · {snapshot.transport} · {snapshot.enabled ? "启用" : "停用"} · {snapshot.credential.configured ? "Key 已配置" : "Key 未配置"} · 预填模型 {snapshot.default_model ?? "无"}</>}</p>
          {id ? <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => { void refresh(true); refreshReferences(); }}>读取核对</Button>
            <Button variant="outline" disabled={!checked || read.state.status !== "success" || busy}
              onClick={() => { setNeedsCheck(false); write.reset(); reveal.reset(); setNotice("已确认当前状态；可继续编辑并再次明确提交。"); }}>已核对，继续编辑</Button>
          </div> : <Button variant="outline" onClick={onClose}>返回列表核对新增结果</Button>}
        </section>}
        {(!id || snapshot) && <>
          <fieldset disabled={busy} className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs"><span>连接名称</span><Input surface="translucent" controlSize="comfortable" aria-label="连接名称" value={draft.name} onChange={event => change("name", event.target.value)} /></label>
            <label className="grid gap-1 text-xs"><span>Base URL</span><Input surface="translucent" controlSize="comfortable" aria-label="Base URL" value={draft.base_url} placeholder="https://relay.example/v1" onChange={event => change("base_url", event.target.value)} /></label>
            <div className="space-y-1"><p className="text-xs">接入方式</p><AppSelect surface="translucent" controlSize="comfortable" ariaLabel="Transport" value={draft.transport} disabled={busy}
              options={TRANSPORTS.map(value => ({ value, label: value === "direct" ? "Direct" : value === "cloudflare_rest" ? "Cloudflare REST" : "Cloudflare Anthropic" }))}
              onValueChange={value => change("transport", value as Transport)} /></div>
            {draft.transport !== "direct" && <label className="grid gap-1 text-xs"><span>Gateway ID（可选）</span><Input surface="translucent" controlSize="comfortable" aria-label="Gateway ID" value={draft.gateway_id ?? ""} onChange={event => change("gateway_id", event.target.value || null)} /></label>}
            <div className="flex items-center justify-between gap-3"><span className="text-xs">启用此连接</span><Switch aria-label="启用此连接" checked={draft.enabled} onCheckedChange={value => change("enabled", value)} disabled={busy} /></div>
          </fieldset>
          {snapshot?.enabled && !draft.enabled && <p className="text-xs leading-relaxed text-warning">停用后引用此连接的调用可能失败，不会自动切换到其他连接。</p>}
          <section aria-label="模型预填配置" className="space-y-3 border-t border-border/60 pt-3">
            {snapshot ? <ModelDiscovery key={`${snapshot.id}:${snapshot.credential.secret_ref}:${snapshot.base_url}:${snapshot.transport}:${snapshot.enabled}`}
              connection={snapshot} autoFetch={autoDiscover} onAutoFetch={() => setAutoDiscover(false)} disabled={controlsDisabled} unsaved={probeUnsaved} value={draft.default_model ?? ""} onUseModel={model => change("default_model", model || null)} /> :
              <div className="space-y-1"><p className="text-xs">模型预填建议（可选）</p><div className="flex min-w-0 items-stretch gap-2"><Input surface="translucent" controlSize="comfortable" className="min-w-0 flex-1" aria-label="模型预填建议" disabled={busy} value={draft.default_model ?? ""} onChange={event => change("default_model", event.target.value || null)} />
                <Button size="comfortable" className="self-stretch px-3" variant="outline" disabled={controlsDisabled || !valid || !key.trim() || !draft.enabled || draft.transport !== "direct"} onClick={() => { setCreatingForDiscovery(true); begin("save"); }}>获取模型</Button></div></div>}
            <p className="text-xs text-muted-foreground">仅用于选择连接时预填，不改变已有模型绑定。</p>
            {!snapshot && <p className="text-xs text-muted-foreground">填写名称、地址和 Key 后可获取模型；需先确认创建连接。</p>}
          </section>
          <section aria-label="API Key" className="space-y-2 border-t border-border/60 pt-3">
            <div className="grid gap-1"><div className="flex flex-wrap items-center justify-between gap-1 text-xs"><h3 className="font-medium">API Key</h3><span className="text-muted-strong">{snapshot?.credential.configured ? `已配置 · ${snapshot.credential.masked}` : "未配置"}</span></div>
            <Input surface="translucent" controlSize="comfortable" aria-label="新 API Key" type="password" autoComplete="new-password" value={key} disabled={controlsDisabled}
              placeholder={snapshot?.credential.configured ? "输入新 Key，留空保留" : "输入 Key，可稍后配置"} onChange={event => { setKey(event.target.value); setConfirm(null); }} /></div>
            {snapshot?.credential.configured && <div className="flex flex-wrap gap-x-5 gap-y-2">
              <Button className="px-0" size="sm" variant="ghost" disabled={controlsDisabled} onClick={() => {
                if (reveal.state.status === "loading" || reveal.state.data !== null) reveal.reset();
                else if (id && snapshot.credential.secret_ref) void reveal.run(signal => registry.revealCredential(id, snapshot.credential.secret_ref!, { signal }));
              }}>{reveal.state.status === "loading" || reveal.state.data !== null ? "关闭明文" : "显式查看 Key"}</Button>
              <Button className="px-0 text-destructive hover:bg-destructive/8 hover:text-destructive" size="sm" variant="ghost" disabled={controlsDisabled} onClick={() => begin("clear")}>显式清除 Key</Button>
            </div>}
            {reveal.state.data !== null && <p aria-label="临时 Key 明文" className="break-all rounded-xl border border-border p-2 font-mono text-xs">{reveal.state.data}</p>}
            <ConnectionError error={reveal.state.error} />
          </section>
        </>}
        {confirm && references && impact && <section aria-label="本次修改的引用影响" className="border-t border-border/60 pt-3"><ConnectionReferenceFacts value={references} /></section>}
      </DialogBody>
      <DialogFooter className="items-stretch">
        {confirm ? <div role="group" aria-label="确认连接操作" className="w-full space-y-2">
          <p className="break-words text-xs">{confirm === "save" ? `确认${id ? "保存" : "创建"}连接「${draft.name}」？` : "确认清除当前连接的 API Key？相关调用可能失败。"}</p>
          {creatingForDiscovery && !id && <p className="text-xs text-muted-strong">确认后将实际创建并保存连接，再获取模型。</p>}
          {id && refs.state.status === "loading" && <p role="status" className="text-xs text-muted-strong">正在核对本次操作的引用影响…</p>}
          {id && impact && refs.state.status !== "loading" && <>
            <div className="flex items-start gap-2"><Switch checked={consent} aria-label="确认共享影响" onCheckedChange={setConsent} />
              <p className="min-w-0 text-xs leading-relaxed">{references ? "已核对引用影响" : "引用暂未核实，我确认潜在影响"}；修改可能使相关调用失败，不自动切换。</p></div>
          </>}
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirm(null)}>取消操作</Button><Button disabled={controlsDisabled || refs.state.status === "loading" || (!!id && impact && !consent)} onClick={() => { void perform(); }}>确认操作</Button></div>
        </div> : <>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button loading={write.state.status === "loading"} disabled={controlsDisabled || !valid || !dirty} onClick={() => { setCreatingForDiscovery(false); begin("save"); }}>{id ? "保存连接" : "创建连接"}</Button>
        </>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
