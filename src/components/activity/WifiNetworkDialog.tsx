import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { ActivityState } from "@/application/activity/activity-state";
import type { ActivityController } from "@/application/activity/activity-controller";
import type { WifiConfig, WifiMapping } from "@/domain/device-context";
import { validateWifiMappings } from "@/domain/device-context/device-context-mappers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppSelect } from "@/components/ui/app-select";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { ActivityDialogHeader } from "./ActivityDialogHeader";

export function networkAdditionError(config: WifiConfig, ssid: string, scene: WifiMapping["scene"]): string | null {
  if (config.mappings.some((entry) => entry.ssid === ssid)) return "该网络已有标记，请在列表中修改。";
  try { validateWifiMappings([...config.mappings, { ssid, scene }]); return null; }
  catch { return "名称须为 1–32 个 UTF-8 字节，不含控制字符；最多保存 128 个标记。"; }
}

export function WifiNetworkDialog({ state, controller }: { readonly state: ActivityState; readonly controller: ActivityController | null }) {
  const [open, setOpen] = useState(false), [ssid, setSsid] = useState("");
  const [scene, setScene] = useState<WifiMapping["scene"]>("home");
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const busy = Boolean(state.pending);
  const disabled = busy || !state.wifi.data || state.wifi.loading || Boolean(state.wifi.error);
  const submit = async () => {
    if (disabled || !state.wifi.data) return;
    const problem = networkAdditionError(state.wifi.data, ssid, scene);
    if (problem) { setError(problem); return; }
    setError(null);
    const saved = await controller?.saveMapping(ssid, scene);
    if (!mounted.current) return;
    if (saved) setOpen(false);
    else setError(controller?.getState().notice?.text ?? "保存未完成，请核对配置后重试。");
  };
  return <Dialog open={open} disablePointerDismissal={busy} onOpenChange={(next) => {
    if (busy) return;
    if (next) { setSsid(""); setScene("home"); setError(null); }
    setOpen(next);
  }}>
    <DialogTrigger render={<Button variant="ghost" className="h-9 gap-1.5 px-1 text-xs text-muted-strong" disabled={disabled} />}><Plus className="size-3.5" aria-hidden="true" />添加网络标记</DialogTrigger>
    <DialogContent showCloseButton={false} className="activity-dialog" data-activity-dialog="network" aria-busy={busy}>
      <ActivityDialogHeader title="添加网络标记" description="为手机网络设置家庭或公司场景。" busy={busy} />
      <WifiNetworkFields ssid={ssid} scene={scene} disabled={disabled} error={error} onSsidChange={(value) => { setSsid(value); setError(null); }} onSceneChange={(value) => { setScene(value); setError(null); }} onSubmit={() => void submit()} />
      <DialogFooter><Button type="button" variant="ghost" className="text-muted-strong" disabled={busy} onClick={() => setOpen(false)}>取消</Button><Button type="submit" form="activity-network-form" className="bg-primary/90 hover:bg-primary" disabled={disabled || !ssid}>{state.pending === "wifi" ? "保存中…" : "保存标记"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function WifiNetworkFields({ ssid, scene, disabled, error, onSsidChange, onSceneChange, onSubmit }: {
  readonly ssid: string; readonly scene: WifiMapping["scene"]; readonly disabled: boolean; readonly error: string | null;
  readonly onSsidChange: (value: string) => void; readonly onSceneChange: (value: WifiMapping["scene"]) => void; readonly onSubmit: () => void;
}) {
  return <form id="activity-network-form" className="activity-dialog-body space-y-4" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
    <label className="block text-sm text-foreground">网络名称（SSID）<Input className="mt-2 h-11 rounded-xl px-3 text-sm shadow-none" surface="translucent" value={ssid} onChange={(event) => onSsidChange(event.target.value)} disabled={disabled} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="填写准确名称" aria-describedby={error ? "activity-network-help activity-network-error" : "activity-network-help"} /></label>
    <div><p className="mb-2 text-sm text-foreground">标记为</p><AppSelect value={scene} onValueChange={onSceneChange} ariaLabel="Wi-Fi 标记场景" disabled={disabled} surface="translucent" align="start" className="text-sm font-normal" options={[{ value: "home", label: "家里" }, { value: "work", label: "公司" }]} /></div>
    <p id="activity-network-help" className="text-xs leading-5 text-muted-foreground">当前页面无法读取绑定手机的 Wi-Fi 名称。请填写手机 Wi-Fi 设置中的准确名称，大小写和空格需一致。</p>
    {error && <p id="activity-network-error" role="alert" className="text-xs leading-5 text-destructive">{error}</p>}
  </form>;
}
