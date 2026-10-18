import { Copy, Eye, EyeOff, KeyRound, Trash2 } from "lucide-react";
import type { LocationController } from "@/application/location/location-controller";
import type { LocationState } from "@/application/location/location-state";
import { Button } from "@/components/ui/button";
import { LocationField } from "./LocationControls";

export function LocationCredentials({ state, controller, onClear }: {
  readonly state: LocationState; readonly controller: LocationController | null; readonly onClear: () => void;
}) {
  const credential = state.config?.credential;
  const disabled = !state.config || state.configLoading || Boolean(state.configError || state.pending);
  const unavailable = disabled || !credential?.secretRef;
  return <div className="min-w-0 space-y-3 border-b border-primary/10 pb-4">
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <p className="flex min-w-0 items-center gap-2 text-sm font-medium"><KeyRound className="size-4 text-primary" aria-hidden="true" />高德 Web 服务 Key</p>
      <span className="break-all text-xs text-muted-strong">{credential ? credential.configured ? `已配置 · ${credential.masked}` : "未配置" : "尚未读取"}</span>
    </div>
    <LocationField id="location-replacement-key" label="更换 Key" type="password" autoComplete="new-password" value={state.replacementKey}
      disabled={disabled} placeholder="输入新 Key" hint="留空则不更换" onChange={(event) => controller?.replaceKey(event.target.value)} />
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="ghost" className="h-11 gap-1.5 rounded-xl px-2 text-xs" disabled={unavailable}
        onClick={() => { if (state.revealedKey !== null) controller?.hideKey(); else void controller?.useKey(); }}>
        {state.revealedKey !== null ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}{state.revealedKey !== null ? "隐藏" : "查看"}
      </Button>
      <Button type="button" variant="ghost" className="h-11 gap-1.5 rounded-xl px-2 text-xs" disabled={unavailable}
        onClick={() => void controller?.useKey(async (value) => {
          if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
          await navigator.clipboard.writeText(value);
        })}><Copy aria-hidden="true" />复制</Button>
      <Button type="button" variant="ghost" className="h-11 gap-1.5 rounded-xl px-2 text-xs text-destructive" disabled={unavailable} onClick={onClear}><Trash2 aria-hidden="true" />清除 Key</Button>
    </div>
    {state.revealedKey !== null && <div className="rounded-xl border border-border-strong/40 bg-background/25 px-3 py-2">
      <p className="break-all font-mono text-xs text-foreground">{state.revealedKey}</p>
      <p className="mt-1 text-xs text-muted-foreground">15 秒后自动隐藏。</p>
    </div>}
  </div>;
}
