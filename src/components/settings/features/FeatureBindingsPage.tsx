import { useEffect, useRef, useState } from "react";
import { Cable, Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageScrollArea } from "@/components/ui/page-scroll-area";
import { FEATURE_GROUPS, FEATURE_NAMES, type FeatureUsage } from "@/domain/registry/feature-bindings";
import { ConnectionError, RegistryVersion } from "../connections/ConnectionShared";
import { useRegistryTask } from "../connections/useRegistryTask";
import { FeatureSelectionSummary, FeatureStatus } from "./FeatureBindingSummary";
import { FeatureBindingDialog } from "./FeatureBindingDialog";
import { readFeatureSnapshot, type FeatureSnapshot } from "./feature-snapshot";
export function FeatureBindingsPage({ onManageConnections, focusUsage }: { onManageConnections: () => void; focusUsage?: FeatureUsage }) {
  const read = useRegistryTask<FeatureSnapshot>();
  const [snapshot, setSnapshot] = useState<FeatureSnapshot | null>(null);
  const [editing, setEditing] = useState<FeatureUsage | null>(null);
  const [notice, setNotice] = useState("");
  const actions = useRef<Record<string, HTMLButtonElement | null>>({});
  const refresh = async () => { const value = await read.run(readFeatureSnapshot); if (value) setSnapshot(value); };
  useEffect(() => { void refresh(); }, []);
  const focusRow = useRef<HTMLElement>(null);
  const ready = snapshot !== null;
  useEffect(() => {
    if (!ready || !focusUsage || !focusRow.current) return;
    focusRow.current.focus({ preventScroll: true });
    focusRow.current.scrollIntoView({ block: "nearest" });
  }, [ready, focusUsage]);

  const feature = snapshot?.features.find(item => item.usage === editing);
  return <>
    <section aria-label="模型与任务分配面板" className="mist-glass flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[22px] bg-background/70! dark:bg-background/50!">
      <header className="shrink-0 space-y-2.5 border-b border-border/60 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">功能分配 <span className="font-normal text-muted-foreground">9</span></h3>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="刷新功能分配" disabled={read.state.status === "loading"} onClick={() => { void refresh(); }}><RefreshCw aria-hidden="true" /></Button>
            <Button variant="ghost" size="compact" onClick={onManageConnections}><Cable aria-hidden="true" />管理连接</Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">为后续会话与任务分配模型，具体生效范围见编辑窗口。</p>
        {snapshot && <RegistryVersion value={snapshot.registry} writeSubject="功能分配" />}
        <ConnectionError error={read.state.error} onRetry={() => { void refresh(); }} />
        {read.state.error && snapshot && <p className="text-xs text-warning">当前显示上次读取结果，请重新读取后编辑。</p>}
        {notice && <p role="status" className="text-xs text-muted-strong">{notice}</p>}
      </header>
      <PageScrollArea label="功能分配列表" topLabel="回到功能分配顶部" contentClassName="space-y-6 px-4 py-5 sm:px-5">
        {!snapshot && read.state.status === "loading" && <p role="status" className="p-4 text-xs">正在读取功能分配…</p>}
        {snapshot && FEATURE_GROUPS.map(group => <section key={group.name} aria-label={group.name}>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><span aria-hidden="true" className="h-3.5 w-0.5 rounded-full bg-primary/70" />{group.name}</h4>
          <div className="divide-y divide-border/60">{group.usages.map(usage => {
            const item = snapshot.features.find(value => value.usage === usage)!;
            const selection = item.selection;
            const connection = snapshot.registry.connections.find(value => value.id === selection?.connection_id);
            return <article key={usage} data-feature-usage={usage} ref={usage === focusUsage ? focusRow : undefined}
              tabIndex={usage === focusUsage ? -1 : undefined} aria-label={usage === focusUsage ? FEATURE_NAMES[usage] : undefined}
              className="min-w-0 space-y-1.5 py-4 focus:outline-2 focus:-outline-offset-2 focus:outline-ring">
              <div data-feature-heading className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
                <h5 className="min-w-0 text-sm font-semibold">{FEATURE_NAMES[usage]}</h5>
                <FeatureStatus feature={item} />
                <Button ref={element => { actions.current[usage] = element; }} variant="ghost" size="icon-lg" className="shrink-0" aria-label={`编辑：${FEATURE_NAMES[usage]}`}
                  disabled={read.state.status !== "success"} onClick={() => { setNotice(""); setEditing(usage); }}><Pencil className="size-4" aria-hidden="true" /></Button>
              </div>
              {selection && <FeatureSelectionSummary selection={selection} connectionName={connection?.name ?? `连接 ID：${selection.connection_id || "空值"}`} />}
              {item.diagnostic && <p className="break-all text-[11px] text-muted-foreground">{usage} · {item.diagnostic}</p>}
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
