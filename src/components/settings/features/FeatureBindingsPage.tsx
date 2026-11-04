import { useEffect, useRef, useState } from "react";
import { Cable, Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageScrollArea } from "@/components/ui/page-scroll-area";
import { FEATURE_GROUPS, FEATURE_NAMES, featureStatus, protocolName, type FeatureUsage } from "@/domain/registry/feature-bindings";
import { ConnectionError, RegistryVersion } from "../connections/ConnectionShared";
import { useRegistryTask } from "../connections/useRegistryTask";
import { FeatureBindingDialog } from "./FeatureBindingDialog";
import { readFeatureSnapshot, type FeatureSnapshot } from "./feature-snapshot";
export function FeatureBindingsPage({ onManageConnections }: { onManageConnections: () => void }) {
  const read = useRegistryTask<FeatureSnapshot>();
  const [snapshot, setSnapshot] = useState<FeatureSnapshot | null>(null);
  const [editing, setEditing] = useState<FeatureUsage | null>(null);
  const [notice, setNotice] = useState("");
  const actions = useRef<Record<string, HTMLButtonElement | null>>({});
  const refresh = async () => { const value = await read.run(readFeatureSnapshot); if (value) setSnapshot(value); };
  useEffect(() => { void refresh(); }, []);
  const feature = snapshot?.features.find(item => item.usage === editing);
  return <>
    <section aria-label="模型与任务分配面板" className="mist-glass flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[22px] bg-background/70! dark:bg-background/50!">
      <header className="shrink-0 space-y-2 border-b border-border/60 px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">功能分配 <span className="font-normal text-muted-foreground">9</span></h3>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="刷新功能分配" disabled={read.state.status === "loading"} onClick={() => { void refresh(); }}><RefreshCw aria-hidden="true" /></Button>
            <Button variant="ghost" size="compact" onClick={onManageConnections}><Cable aria-hidden="true" />管理连接</Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">为后续会话与任务选择模型。不同功能的生效范围见编辑窗口。</p>
        {snapshot && <RegistryVersion value={snapshot.registry} writeSubject="功能分配" />}
        <ConnectionError error={read.state.error} onRetry={() => { void refresh(); }} />
        {read.state.error && snapshot && <p className="text-xs text-warning">当前显示上次读取结果，请重新读取后编辑。</p>}
        {notice && <p role="status" className="text-xs text-muted-strong">{notice}</p>}
      </header>
      <PageScrollArea label="功能分配列表" topLabel="回到功能分配顶部" contentClassName="pb-2">
        {!snapshot && read.state.status === "loading" && <p role="status" className="p-4 text-xs">正在读取功能分配…</p>}
        {snapshot && FEATURE_GROUPS.map(group => <section key={group.name} aria-label={group.name}>
          <h4 className="px-4 pb-1 pt-4 text-xs font-medium text-muted-foreground">{group.name}</h4>
          <div className="divide-y divide-border/60">{group.usages.map(usage => {
            const item = snapshot.features.find(value => value.usage === usage)!;
            const selection = item.selection;
            const connection = snapshot.registry.connections.find(value => value.id === selection?.connection_id);
            return <article key={usage} data-feature-usage={usage} className="flex min-w-0 items-center gap-2 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><h5 className="text-sm font-semibold">{FEATURE_NAMES[usage]}</h5>
                  <span className={`text-[11px] ${item.diagnostic || !selection ? "text-warning" : "text-muted-strong"}`}>{featureStatus(item)}</span></div>
                {selection && <p className="break-all text-xs leading-5 text-muted-strong">{connection?.name ?? `连接 ID：${selection.connection_id || "空值"}`} · {protocolName(selection.protocol) || "协议为空"} · {selection.model || "模型为空"}</p>}
                {item.diagnostic && <p className="break-all text-[11px] text-muted-foreground">{usage} · {item.diagnostic}</p>}
              </div>
              <Button ref={element => { actions.current[usage] = element; }} variant="ghost" size="icon-lg" aria-label={`编辑：${FEATURE_NAMES[usage]}`}
                disabled={read.state.status !== "success"} onClick={() => { setNotice(""); setEditing(usage); }}><Pencil className="size-4" aria-hidden="true" /></Button>
            </article>;
          })}</div>
        </section>)}
      </PageScrollArea>
    </section>
    {feature && snapshot && <FeatureBindingDialog key={feature.usage} initial={snapshot} usage={feature.usage}
      finalFocus={() => actions.current[feature.usage]} onObserved={setSnapshot}
      onSaved={cleared => { setEditing(null); setNotice(cleared ? "当前分配已清除并读回。" : "功能分配已保存并读回。"); }}
      onClose={() => { setEditing(null); void refresh(); }} onManageConnections={onManageConnections} />}
  </>;
}
