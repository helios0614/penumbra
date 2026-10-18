import { CalendarDays, Clock3, Save } from "lucide-react";
import type { LocationController } from "@/application/location/location-controller";
import { effectivePeriod, validTime, type LocationDraft, type TimeKey } from "@/application/location/location-draft";
import type { LocationState } from "@/application/location/location-state";
import { parseWeekdays, serializeWeekdays } from "@/domain/location";
import { Button } from "@/components/ui/button";
import { LocationField, LocationSwitch } from "./LocationControls";

const DAYS = ["一", "二", "三", "四", "五", "六", "日"];
export function LocationQuietHours({ state, controller }: { readonly state: LocationState; readonly controller: LocationController | null }) {
  const draft = state.draft, disabled = !draft || state.configLoading || Boolean(state.configError || state.pending);
  const selected = draft ? parseWeekdays(draft.weekday_days) : [];
  return <section className="mist-glass-strong rounded-[24px] px-4 py-4 sm:px-6" aria-labelledby="location-quiet-title">
    <div className="flex items-center gap-3">
      <Clock3 className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 id="location-quiet-title" className="text-sm font-semibold">静默时段</h2>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">选择希望暂停定位的时间段</p>
      </div>
      <LocationSwitch label="静默时段" showLabel={false} checked={draft?.quiet_hours_enabled ?? false} disabled={disabled} onChange={(value) => controller?.edit("quiet_hours_enabled", value)} />
    </div>
    <TimePeriod title="统一时段" startKey="quiet_hours_start" endKey="quiet_hours_end" state={state} controller={controller} disabled={disabled} primary />
    <fieldset className="border-t border-primary/10 py-3" disabled={disabled}>
      <legend className="sr-only">手动选择工作日</legend>
      <div className="mb-2 flex items-center gap-2 text-sm font-medium"><CalendarDays className="size-4 text-primary" aria-hidden="true" />工作日选择</div>
      <div className="grid grid-cols-4 gap-1.5 min-[440px]:grid-cols-7" aria-label="工作日星期选择">
        {DAYS.map((label, index) => <Button key={label} type="button" aria-label={`周${label}`} aria-pressed={selected.includes(index + 1)} disabled={disabled}
          variant="ghost" className={`h-11 min-w-11 rounded-xl border px-0 text-sm ${selected.includes(index + 1) ? "border-primary/30 bg-primary/15 text-primary-ink hover:bg-primary/20" : "border-border-strong/40 bg-background/20 text-muted-strong hover:bg-background/40"}`}
          onClick={() => controller?.edit("weekday_days", serializeWeekdays(selected.includes(index + 1) ? selected.filter((day) => day !== index + 1) : [...selected, index + 1]))}>{label}</Button>)}
      </div>
      {draft && selected.length === 0 && <p className="mt-2 text-xs leading-5 text-muted-foreground">所有日期均为休息日</p>}
    </fieldset>
    <TimePeriod title="工作日专用时段" kind="weekday" startKey="quiet_hours_weekday_start" endKey="quiet_hours_weekday_end" state={state} controller={controller} disabled={disabled} />
    <TimePeriod title="休息日专用时段" kind="weekend" startKey="quiet_hours_weekend_start" endKey="quiet_hours_weekend_end" state={state} controller={controller} disabled={disabled} />
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary/10 pt-4">
      <p className="text-xs text-muted-strong" role="status">{state.pending === "save" ? "正在保存…" : state.configError ? "配置读取失败" : !state.draft ? "正在读取配置…" : state.dirty ? "有未保存的修改" : "已保存"}</p>
      <Button type="submit" disabled={disabled || !state.dirty} className="h-11 gap-2 rounded-xl px-5"><Save aria-hidden="true" />保存配置</Button>
    </div>
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
    <h3 className={`mb-2 text-sm font-semibold ${primary ? "text-primary-ink" : "text-foreground"}`}>{title}</h3>
    <div className="grid min-w-0 grid-cols-2 gap-3">
      {[startKey, endKey].map((key, index) => <div key={key} className="min-w-0">
        <LocationField id={`location-${key}`} label={index ? "结束" : "开始"} aria-label={`${title}${index ? "结束" : "开始"}`} type="time" step={60}
          value={draft?.[key] ?? ""} disabled={disabled} error={state.validation[key]} onChange={(event) => controller?.edit(key, event.target.value)}
          hint={kind && draft && !draft[key] ? `沿用统一 ${draft[index ? "quiet_hours_end" : "quiet_hours_start"]}` : undefined} />
        {kind && <ClearTime field={key} label={`清除${title}${index ? "结束" : "开始"}`} draft={draft} disabled={disabled} controller={controller} />}
      </div>)}
    </div>
    {specialPeriod && <p className="mt-2 text-xs leading-5 text-muted-foreground">{effective.start === effective.end ? "起止相同，无静默时长" : "跨午夜"}</p>}
  </fieldset>;
}
function ClearTime({ field, label, draft, disabled, controller }: { readonly field: TimeKey; readonly label: string; readonly draft: LocationDraft | null; readonly disabled: boolean; readonly controller: LocationController | null }) {
  if (!draft?.[field]) return null;
  return <Button type="button" variant="ghost" className="mt-1 h-11 min-w-11 px-2 text-xs text-muted-strong" aria-label={label} title="清除后沿用统一时间" disabled={disabled} onClick={() => controller?.edit(field, "")}>清除</Button>;
}
