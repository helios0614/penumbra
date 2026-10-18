import { Clock3, Save } from "lucide-react";
import type { LocationController } from "@/application/location/location-controller";
import { effectivePeriod, hasDraftChanges, SETTINGS_KEYS, validTime, type TimeKey } from "@/application/location/location-draft";
import type { LocationState } from "@/application/location/location-state";
import { parseWeekdays, serializeWeekdays } from "@/domain/location";
import { Button } from "@/components/ui/button";
import { LocationSaveError } from "./LocationControls";
import { Switch } from "@/components/ui/switch";
import { LocationTimeField } from "./LocationTimeField";

const DAYS = ["一", "二", "三", "四", "五", "六", "日"];
export function LocationQuietHours({ state, controller }: { readonly state: LocationState; readonly controller: LocationController | null }) {
  const draft = state.draft, disabled = !draft || state.configLoading || Boolean(state.configError || state.pending);
  const selected = draft ? parseWeekdays(draft.weekday_days) : [];
  const dirty = hasDraftChanges(state.baseline, draft, SETTINGS_KEYS);
  return <section className="mist-glass-strong rounded-[24px] px-4 py-4 sm:px-6" aria-labelledby="location-quiet-title">
    <div className="flex items-center gap-3">
      <Clock3 className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 id="location-quiet-title" className="text-sm font-semibold"><label htmlFor="location-quiet-enabled">静默时段</label></h2>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">选择希望暂停定位的时间段</p>
      </div>
      <Switch id="location-quiet-enabled" aria-labelledby="location-quiet-title" checked={draft?.quiet_hours_enabled ?? false}
        busy={state.pending === "save"} disabled={disabled} onCheckedChange={(value) => controller?.edit("quiet_hours_enabled", value)} />
    </div>
    <TimePeriod title="统一时段" startKey="quiet_hours_start" endKey="quiet_hours_end" state={state} controller={controller} disabled={disabled} primary />
    <fieldset className="border-t border-primary/10 py-3" disabled={disabled}>
      <legend className="sr-only">手动选择工作日</legend>
      <div className="mb-2 flex min-h-7 items-center"><h3 className="text-sm font-semibold text-foreground">工作日选择</h3></div>
      <div className="grid grid-cols-4 gap-1.5 min-[440px]:grid-cols-7" aria-label="工作日星期选择">
        {DAYS.map((label, index) => <Button key={label} type="button" aria-label={`周${label}`} aria-pressed={selected.includes(index + 1)} disabled={disabled}
          variant="ghost" className={`h-11 min-w-11 rounded-xl border px-0 text-sm ${selected.includes(index + 1) ? "border-primary/30 bg-primary/15 text-primary-ink hover:bg-primary/20" : "border-border-strong/40 bg-background/20 text-muted-strong hover:bg-background/40"}`}
          onClick={() => controller?.edit("weekday_days", serializeWeekdays(selected.includes(index + 1) ? selected.filter((day) => day !== index + 1) : [...selected, index + 1]))}>{label}</Button>)}
      </div>
      {draft && selected.length === 0 && <p className="mt-2 text-xs leading-5 text-muted-foreground">所有日期均为休息日</p>}
    </fieldset>
    <TimePeriod title="工作日专用时段" kind="weekday" startKey="quiet_hours_weekday_start" endKey="quiet_hours_weekday_end" state={state} controller={controller} disabled={disabled} />
    <TimePeriod title="休息日专用时段" kind="weekend" startKey="quiet_hours_weekend_start" endKey="quiet_hours_weekend_end" state={state} controller={controller} disabled={disabled} />
    <div className="flex justify-end border-t border-primary/10 pt-4">
      <Button type="submit" size="comfortable" aria-busy={state.pending === "save"} disabled={disabled || !dirty} className="gap-2 px-5"><Save aria-hidden="true" />{state.pending === "save" ? "保存中…" : "保存配置"}</Button>
    </div>
    <LocationSaveError state={state} section="settings" />
  </section>;
}

function TimePeriod({ title, startKey, endKey, kind, state, controller, disabled, primary = false }: {
  readonly title: string; readonly startKey: TimeKey; readonly endKey: TimeKey; readonly kind?: "weekday" | "weekend";
  readonly state: LocationState; readonly controller: LocationController | null; readonly disabled: boolean; readonly primary?: boolean;
}) {
  const draft = state.draft;
  const effective = draft ? kind ? effectivePeriod(draft, kind) : { start: draft[startKey], end: draft[endKey] } : null;
  const specialPeriod = effective && validTime(effective.start) && validTime(effective.end) && effective.start >= effective.end;
  return <fieldset className={`min-w-0 border-t border-primary/10 py-3 ${primary ? "mt-3" : ""}`} disabled={disabled}>
    <legend className="sr-only">{title}</legend>
    <div className="mb-2 flex min-h-7 items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {kind && <Button type="button" variant="ghost" className="-my-2 h-11 min-w-11 rounded-xl px-2 text-xs text-muted-strong" aria-label={`清空${title}`} title="清空后沿用统一时间"
        disabled={disabled || (!draft?.[startKey] && !draft?.[endKey])} onClick={() => controller?.clearPeriod(kind)}>清空</Button>}
    </div>
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-2 sm:gap-x-3">
      {[startKey, endKey].map((key, index) => <div key={key} className={`min-w-0 ${index ? "col-start-3 row-start-1" : "col-start-1 row-start-1"}`}>
        <LocationTimeField id={`location-${key}`} label={`${title}${index ? "结束" : "开始"}`}
          value={draft?.[key] ?? ""} disabled={disabled} error={state.validation[key]} onChange={(value) => controller?.edit(key, value)}
          inheritedValue={kind && draft ? draft[index ? "quiet_hours_end" : "quiet_hours_start"] : undefined} />
      </div>)}
      <span aria-hidden="true" className="col-start-2 row-start-1 flex h-11 items-center text-sm text-muted-foreground">—</span>
    </div>
    {specialPeriod && <p className="mt-2 text-xs leading-5 text-muted-foreground">{effective.start === effective.end ? "起止相同，无静默时长" : "跨午夜"}</p>}
  </fieldset>;
}
