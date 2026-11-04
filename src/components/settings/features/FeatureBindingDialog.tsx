import { useRef, useState } from "react";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppSelect } from "@/components/ui/app-select";
import { clearFeatureBinding, updateFeatureBinding } from "@/domain/registry/registry-client";
import { FEATURE_NAMES, featureScope, featureStatus, protocolName, sameSelection, type FeatureSelection, type FeatureUsage } from "@/domain/registry/feature-bindings";
import { RegistryError, validLiteral } from "@/domain/registry/registry-types";
import { ConnectionError } from "../connections/ConnectionShared";
import { useRegistryTask } from "../connections/useRegistryTask";
import { readFeatureSnapshot, type FeatureSnapshot } from "./feature-snapshot";

interface Outcome { snapshot: FeatureSnapshot; error: RegistryError | null }
export function FeatureBindingDialog({ initial, usage, onObserved, onSaved, onClose, onManageConnections, finalFocus }: {
  initial: FeatureSnapshot; usage: FeatureUsage; onObserved: (value: FeatureSnapshot) => void;
  onSaved: (cleared: boolean) => void; onClose: () => void; onManageConnections: () => void; finalFocus: () => HTMLElement | null;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const feature = snapshot.features.find(item => item.usage === usage)!;
  const [draft, setDraft] = useState<FeatureSelection>(() => feature.selection ?? { connection_id: "", protocol: "", model: "" });
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [review, setReview] = useState(false), [checked, setChecked] = useState(false);
  const [notice, setNotice] = useState("");
  const task = useRegistryTask<Outcome>();
  const lock = useRef(false);
  const connection = snapshot.registry.connections.find(item => item.id === draft.connection_id);
  const busy = task.state.status === "loading";
  const valid = !!connection?.enabled && connection.credential.configured && feature.allowed_protocols.includes(draft.protocol) && validLiteral(draft.model);
  const observe = (value: FeatureSnapshot) => { setSnapshot(value); onObserved(value); };
  const write = async (clear: boolean) => {
    if (lock.current || review || (!clear && !valid)) return;
    lock.current = true; setReview(true); setChecked(false); setNotice("");
    const intended = clear ? null : { ...draft, model: draft.model.trim() };
    try {
      const result = await task.run(async signal => {
        let error: RegistryError | null = null;
        try {
          if (clear) await clearFeatureBinding(usage, { signal });
          else await updateFeatureBinding(usage, intended!, { signal });
        } catch (value) { error = value instanceof RegistryError ? value : new RegistryError("unknown"); }
        if (signal.aborted) throw new RegistryError("unknown");
        return { snapshot: await readFeatureSnapshot(signal), error };
      });
      if (!result) return;
      observe(result.snapshot); setChecked(true);
      const current = result.snapshot.features.find(item => item.usage === usage)!;
      if (!result.error && sameSelection(current.selection, intended)) { onSaved(clear); return; }
      setNotice(result.error ? `${result.error.message} 已重新读取当前状态，请核对后继续。` : "读回状态与本次提交不同，可能存在并发修改。请核对后继续。");
    } finally { lock.current = false; }
  };
  const reread = async () => {
    if (lock.current) return;
    lock.current = true;
    try {
      const result = await task.run(async signal => ({ snapshot: await readFeatureSnapshot(signal), error: null }));
      if (result) { observe(result.snapshot); setChecked(true); setNotice("已读取当前状态。草稿仍保留，请核对后继续编辑。"); }
    } finally { lock.current = false; }
  };
  const connections = snapshot.registry.connections.map(item => ({ value: item.id,
    label: `${item.name} · ${item.enabled ? "已启用" : "已停用"}${item.credential.configured ? "" : " · 缺少 Key"}` }));
  if (draft.connection_id && !connection) connections.unshift({ value: draft.connection_id, label: `连接不存在：${draft.connection_id}` });
  const protocols = feature.allowed_protocols.map(value => ({ value, label: protocolName(value), disabled: false }));
  if (draft.protocol && !feature.allowed_protocols.includes(draft.protocol)) protocols.unshift({ value: draft.protocol, label: `${protocolName(draft.protocol)}（历史值，当前不允许）`, disabled: true });
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent finalFocus={finalFocus}>
      <DialogHeader><DialogTitle>编辑{FEATURE_NAMES[usage]}</DialogTitle>
        <DialogDescription>{featureScope(feature)}</DialogDescription></DialogHeader>
      <DialogBody className="space-y-4">
        <div className="space-y-1 text-xs text-muted-strong" aria-label="当前后端状态">
          <p>{usage} · {featureStatus(feature)}</p>
          {feature.selection && <p className="break-all">当前：{snapshot.registry.connections.find(item => item.id === feature.selection!.connection_id)?.name ?? feature.selection.connection_id} · {protocolName(feature.selection.protocol)} · {feature.selection.model}</p>}
          {feature.diagnostic && <p className="break-all">诊断：{feature.diagnostic}</p>}
        </div>
        <div className="grid gap-1"><span className="text-xs font-medium">Connection</span>
          <AppSelect ariaLabel="Connection" surface="translucent" controlSize="comfortable" placeholder="选择连接" value={draft.connection_id} options={connections}
            positionMethod="fixed" alignItemWithTrigger={false} contentClassName="max-h-[min(20rem,var(--available-height))]"
            disabled={busy || review} onValueChange={id => {
              const model = snapshot.registry.connections.find(item => item.id === id)?.default_model ?? null;
              setSuggestion(model); setDraft(previous => ({ ...previous, connection_id: id, model: previous.model.trim() ? previous.model : model ?? previous.model }));
            }} />
          <Button variant="ghost" size="compact" className="justify-self-start px-0" onClick={onManageConnections} disabled={busy}>管理连接</Button>
        </div>
        <div className="grid gap-1"><span className="text-xs font-medium">Protocol</span>
          <AppSelect ariaLabel="Protocol" surface="translucent" controlSize="comfortable" placeholder="选择协议" value={draft.protocol} options={protocols}
            positionMethod="fixed" alignItemWithTrigger={false}
            disabled={busy || review} onValueChange={protocol => setDraft(previous => ({ ...previous, protocol }))} />
          {draft.protocol && !feature.allowed_protocols.includes(draft.protocol) && <p className="text-xs text-warning">历史协议已不符合当前功能约束，请主动选择允许的协议。</p>}
        </div>
        <label className="grid gap-1 text-xs font-medium"><span>模型名称</span>
          <Input aria-label="模型名称" surface="translucent" controlSize="comfortable" value={draft.model} disabled={busy || review}
            onChange={event => setDraft(previous => ({ ...previous, model: event.target.value }))} />
        </label>
        <p className="text-xs leading-5 text-muted-foreground">可手动填写目录外模型；1–256 个字符，内部不能含空白或不可打印字符。不根据模型名推断协议。</p>
        {suggestion && <div className="space-y-1 text-xs"><p className="break-all text-muted-strong">新连接的模型建议：{suggestion}</p>
          <Button variant="outline" size="compact" disabled={busy || review} onClick={() => setDraft(previous => ({ ...previous, model: suggestion }))}>采用建议模型</Button></div>}
        <div aria-label="最终分配预览" className="space-y-1 border-t border-border/60 pt-3 text-xs leading-5">
          <p className="font-medium">保存以下分配</p><p className="break-all">{connection?.name ?? (draft.connection_id || "尚未选择连接")} · {protocolName(draft.protocol) || "尚未选择协议"} · {draft.model.trim() || "尚未填写模型"}</p>
        </div>
        <ConnectionError error={task.state.error} />
        {notice && <p role="status" className="text-xs leading-5 text-muted-strong">{notice}</p>}
        {review && <div className="space-y-2 text-xs leading-5" aria-label="写入结果核对">
          <p>写入后须核对当前后端状态，不会自动重发。草稿不会替换读回结果。</p>
          {!busy && <div className="flex flex-wrap gap-2"><Button variant="outline" size="compact" onClick={() => { void reread(); }}>重新读取当前状态</Button>
            <Button variant="outline" size="compact" disabled={!checked} onClick={() => { setReview(false); setConfirmClear(false); setNotice(""); task.reset(); }}>已核对，继续编辑</Button></div>}
        </div>}
        {snapshot.registry.migration_required && <p className="text-xs text-muted-foreground">明确保存或清除时，后端可能同时持久化 Registry v2。</p>}
        {!confirmClear ? <Button variant="ghost" size="compact" className="px-0 text-destructive" disabled={busy || review || (!feature.selection && !feature.diagnostic)} onClick={() => setConfirmClear(true)}>清除当前分配</Button>
          : <div role="group" aria-label="清除分配确认" className="space-y-2 border-t border-border/60 pt-3 text-xs leading-5">
            <p>清除后此功能可能无法执行，不会自动切换到其他 Connection，也不会恢复历史兼容绑定。这不代表停用整个功能。</p>
            <div className="flex flex-wrap gap-2"><Button variant="outline" size="compact" disabled={busy || review} onClick={() => setConfirmClear(false)}>取消清除</Button>
              <Button variant="destructive" size="compact" disabled={busy || review} onClick={() => { void write(true); }}>确认清除</Button></div>
          </div>}
      </DialogBody>
      <DialogFooter><Button variant="outline" onClick={onClose}>关闭</Button>
        <Button loading={busy} disabled={busy || review || confirmClear || !valid} onClick={() => { void write(false); }}>保存分配</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
