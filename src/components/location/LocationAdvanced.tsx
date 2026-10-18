import { useEffect, useState } from "react";
import { ChevronDown, MapPin, SlidersHorizontal } from "lucide-react";
import type { LocationController } from "@/application/location/location-controller";
import type { LocationState } from "@/application/location/location-state";
import { NUMBER_KEYS } from "@/application/location/location-draft";
import { Button } from "@/components/ui/button";
import { LocationField } from "./LocationControls";
import { LocationCredentials } from "./LocationCredentials";

const FIELDS = [
  ["home_lng", "经度", "decimal"],
  ["home_lat", "纬度", "decimal"],
  ["home_threshold", "在家范围（米）", "numeric"],
  ["poi_radius", "POI 搜索半径（米）", "numeric"],
] as const;
export function LocationAdvanced({ state, controller, onHome, onClear }: {
  readonly state: LocationState; readonly controller: LocationController | null; readonly onHome: () => void; readonly onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const disabled = !state.draft || state.configLoading || Boolean(state.configError || state.pending);
  useEffect(() => { if (NUMBER_KEYS.some((key) => state.validation[key])) setOpen(true); }, [state.validation]);
  return <details className="group/location-advanced mist-glass-strong rounded-[24px] px-4 sm:px-6" open={open} onToggle={(event) => {
    setOpen(event.currentTarget.open); if (!event.currentTarget.open) controller?.hideKey();
  }}>
    <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
      <SlidersHorizontal className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">高级位置配置</h2><p className="mt-0.5 text-xs leading-5 text-muted-foreground">Key、家庭坐标与距离设置</p></div>
      <ChevronDown className="size-4 shrink-0 text-muted-strong transition-transform group-open/location-advanced:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
    </summary>
    <div className="space-y-4 border-t border-primary/10 pb-4 pt-4">
      <LocationCredentials state={state} controller={controller} onClear={onClear} />
      <div>
        <p className="mb-3 text-xs text-muted-foreground">家庭坐标 · GCJ-02</p>
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
          {FIELDS.map(([key, label, inputMode]) => <LocationField key={key} id={`location-${key}`} label={label} type="text" inputMode={inputMode}
            autoComplete="off" disabled={disabled} value={state.draft?.[key] ?? ""} error={state.validation[key]} onChange={(event) => controller?.edit(key, event.target.value)} />)}
        </div>
      </div>
      <div className="border-t border-primary/10 pt-3">
        <Button type="button" variant="outline" className="h-auto min-h-11 gap-2 whitespace-normal rounded-xl px-3 py-2 text-sm" disabled={disabled || !state.status?.coordinate} onClick={onHome}><MapPin aria-hidden="true" />使用最近上报位置设为家</Button>
        {!state.status?.coordinate && <p className="mt-2 text-xs text-muted-foreground">暂无可用于设家的定位记录。</p>}
      </div>
    </div>
  </details>;
}
