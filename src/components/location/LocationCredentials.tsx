import { Copy, Eye, EyeOff, Save, Trash2 } from "lucide-react";
import type { LocationController } from "@/application/location/location-controller";
import type { LocationState } from "@/application/location/location-state";
import { Button } from "@/components/ui/button";
import { LocationField, LocationSaveError } from "./LocationControls";

export function LocationCredentials({ state, controller, onClear }: {
  readonly state: LocationState; readonly controller: LocationController | null; readonly onClear: () => void;
}) {
  const credential = state.config?.credential;
  const disabled = !state.config || state.configLoading || Boolean(state.configError || state.pending);
  const unavailable = disabled || !credential?.secretRef;
  const dirty = Boolean(state.replacementKey.trim());
  return <form noValidate className="min-w-0 border-b border-primary/10 pb-4" aria-label="高德 Key 配置" aria-busy={state.pending === "save-key"}
    onSubmit={(event) => { event.preventDefault(); void controller?.saveKey(); }}>
    <div className="mb-2 flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h3 className="min-w-0 text-sm font-semibold text-foreground">高德 Web 服务 Key</h3>
      <span className="break-all text-xs text-muted-strong">{credential ? credential.configured ? `已配置 · ${credential.masked}` : "未配置" : "尚未读取"}</span>
    </div>
    <LocationField id="location-replacement-key" label="新高德 Key" hideLabel type="password" autoComplete="new-password" value={state.replacementKey}
      disabled={disabled} placeholder="输入新key，留空不更换" onChange={(event) => controller?.replaceKey(event.target.value)} />
    <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-2">
      <Button type="button" variant="ghost" className="h-11 gap-1 rounded-xl px-1 text-xs" disabled={unavailable}
        onClick={() => { if (state.revealedKey !== null) controller?.hideKey(); else void controller?.useKey(); }}>
        {state.revealedKey !== null ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}{state.revealedKey !== null ? "隐藏" : "查看"}
      </Button>
      <Button type="button" variant="ghost" className="h-11 gap-1 rounded-xl px-1 text-xs" disabled={unavailable}
        onClick={() => void controller?.useKey(async (value) => {
          if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
          await navigator.clipboard.writeText(value);
        })}><Copy aria-hidden="true" />复制</Button>
      <Button type="button" variant="ghost" className="h-11 gap-1 rounded-xl px-1 text-xs text-destructive" disabled={unavailable} onClick={onClear}><Trash2 aria-hidden="true" />清除 Key</Button>
      <Button type="submit" size="comfortable" aria-busy={state.pending === "save-key"} className="ml-auto gap-2" disabled={disabled || !dirty}><Save aria-hidden="true" />{state.pending === "save-key" ? "保存中…" : "保存 Key"}</Button>
    </div>
    <LocationSaveError state={state} section="key" />
    {state.revealedKey !== null && <div className="mt-3 rounded-xl border border-border-strong/40 bg-background/25 px-3 py-2">
      <p className="break-all font-mono text-xs text-foreground">{state.revealedKey}</p>
      <p className="mt-1 text-xs text-muted-foreground">15 秒后自动隐藏。</p>
    </div>}
  </form>;
}
