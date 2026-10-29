import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { TriggerConfig } from "@/domain/quick-note";
import { createQuickNoteConfigController, INITIAL_CONFIG_STATE, type QuickNoteConfigController, type QuickNoteConfigState } from "@/application/quick-note/quick-note-config-controller";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppSelect } from "@/components/ui/app-select";

const hourOptions = Array.from({ length: 24 }, (_, hour) => ({ value: String(hour), label: `${String(hour).padStart(2, "0")}:00` }));
const cutoff = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

export function QuickNoteConfig({ config, loading, onReload, onRead }: {
  readonly config: TriggerConfig; readonly loading: boolean; readonly onReload: () => void;
  readonly onRead?: (config: TriggerConfig) => void;
}) {
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  return <details className="mist-glass rounded-[24px] px-4 sm:px-5">
    <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">时段配置</summary>
    {editing ? <QuickNoteConfigEditor onRead={onRead} onClose={() => { setEditing(false); requestAnimationFrame(() => editButton.current?.focus()); }} />
      : <div className="space-y-3 pb-3 text-sm text-muted-strong">
        <p className="break-words">业务时区：{config.timeZone} · 日界：{cutoff(config.dayBoundaryHour)}</p>
        <ul className="space-y-2">{config.hours.map((h) => <li key={h} className="break-words">{config.labels[String(h)] || "未命名"} · 截止 {cutoff(h)}</li>)}</ul>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" className="h-11 gap-2 px-2 text-xs text-muted-foreground hover:text-foreground" disabled={loading} onClick={onReload}><RefreshCw className="size-3.5" aria-hidden="true" />重新读取配置</Button>
          <Button ref={editButton} variant="outline" size="comfortable" disabled={loading} onClick={() => setEditing(true)}>编辑配置</Button>
        </div>
      </div>}
  </details>;
}

function QuickNoteConfigEditor({ onClose, onRead }: { readonly onClose: () => void; readonly onRead?: (config: TriggerConfig) => void }) {
  const [state, setState] = useState(INITIAL_CONFIG_STATE);
  const [controller, setController] = useState<QuickNoteConfigController | null>(null);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;
  useEffect(() => {
    const active = createQuickNoteConfigController((config) => onReadRef.current?.(config));
    setController(active);
    const unsubscribe = active.subscribe(setState);
    void active.load();
    return () => { unsubscribe(); active.dispose(); };
  }, []);
  return <QuickNoteConfigForm state={state} controller={controller} onClose={onClose} />;
}

export function QuickNoteConfigForm({ state, controller, onClose }: {
  readonly state: QuickNoteConfigState; readonly controller: QuickNoteConfigController | null; readonly onClose: () => void;
}) {
  const busy = state.phase !== "ready";
  const locked = busy || state.needsReadback;
  return <form className="space-y-4 pb-4 text-sm" aria-label="编辑时段配置" aria-busy={busy} aria-describedby={state.error ? "quick-note-config-error" : undefined} noValidate onSubmit={(event) => { event.preventDefault(); void controller?.save(); }}>
    {state.config && <p className="break-words text-xs leading-5 text-muted-strong">业务时区：{state.config.timeZone} · 日界：{cutoff(state.config.dayBoundaryHour)}</p>}
    {state.phase === "loading" && <p role="status" className="text-muted-foreground">正在读取服务端配置…</p>}
    {state.draft && <>
      <div className="space-y-3 border-t border-border/60 pt-3">
        {state.draft.map((row, index) => <fieldset key={index} disabled={locked} className="grid min-w-0 grid-cols-[minmax(0,1fr)_6.5rem] gap-3 sm:grid-cols-2" aria-label={`第 ${index + 1} 个时段`}>
          <div className="min-w-0">
            <label htmlFor={`quick-note-config-name-${index}`} className="mb-1.5 block text-xs text-muted-strong">时段名称</label>
            <Input id={`quick-note-config-name-${index}`} aria-label={`时段 ${index + 1} 名称`} autoFocus={index === 0} value={row.label} disabled={locked} surface="translucent" controlSize="comfortable" onChange={(event) => controller?.change(index, { label: event.target.value })} />
          </div>
          <div className="min-w-0">
            <p className="mb-1.5 text-xs text-muted-strong" aria-hidden="true">截止小时</p>
            <AppSelect value={row.hour} options={hourOptions} ariaLabel={`时段 ${index + 1} 截止小时`} surface="translucent" controlSize="comfortable" disabled={locked} onValueChange={(hour) => controller?.change(index, { hour })} className="text-sm font-normal" />
          </div>
        </fieldset>)}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">首个时段决定速记业务日的起点，截止小时须依次递增。</p>
    </>}
    {state.error && <p id="quick-note-config-error" role="alert" className="break-words text-xs leading-5 text-destructive-foreground">{state.error}</p>}
    {state.saved && <p role="status" className="text-xs leading-5 text-success-foreground">配置已保存，并已重新读取服务端结果。</p>}
    <div className="flex flex-wrap items-center justify-end gap-2">
      {!state.draft && !busy && <Button type="button" variant="outline" size="comfortable" onClick={() => void controller?.load()}>重试加载</Button>}
      {state.needsReadback && <Button type="button" variant="outline" size="comfortable" disabled={busy} onClick={() => void controller?.verify()}>{state.phase === "verifying" ? "正在核对…" : "核对保存结果"}</Button>}
      <Button type="button" variant="ghost" size="comfortable" disabled={busy} onClick={onClose}>{state.saved ? "完成" : "取消"}</Button>
      {state.draft && <Button type="submit" size="comfortable" disabled={locked || !controller} aria-busy={busy}>{state.phase === "saving" ? "保存中…" : state.phase === "verifying" ? "正在读回…" : "保存配置"}</Button>}
    </div>
  </form>;
}
