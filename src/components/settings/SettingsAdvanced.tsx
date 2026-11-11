import { useId, useState } from "react";
import { AppSelect } from "@/components/ui/app-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  readCacheSettings, setCacheEnabled, setKeepalive, setSystemCacheTtl, type SystemCacheTtl,
} from "@/domain/advanced-settings/advanced-settings-client";
import { SettingsReadbackStatus } from "./SettingsReadbackStatus";
import { useSettingsReadback } from "./useSettingsReadback";

const ttlOptions = [
  { value: "5m", label: "5 分钟" },
  { value: "1h", label: "1 小时" },
] as const;
const ttlLabel = "Anthropic 系统缓存有效期";

export function SettingsAdvanced() {
  const { value, pending, error, refresh, save } = useSettingsReadback(readCacheSettings);
  const busy = pending !== null;
  const keepaliveHintId = useId();

  return <div className="mist-glass min-w-0 divide-y divide-border/60 rounded-[22px] bg-background/70! dark:bg-background/50!">
    <section aria-label="缓存配置" className="space-y-2 px-4 py-4 sm:px-5">
      <h3 className="text-sm font-semibold">缓存配置</h3>
      {value && <>
        <div className="flex min-h-11 items-center justify-between gap-3 text-sm">
          <span>缓存总开关</span>
          <Switch aria-label="缓存总开关" checked={value.cache_enabled} disabled={busy}
            onCheckedChange={next => { void save(signal => setCacheEnabled(next, signal)); }} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
          <span>{ttlLabel}</span>
          <AppSelect<SystemCacheTtl> ariaLabel={ttlLabel} value={value.anthropic_system_cache_ttl}
            options={ttlOptions} className="w-auto min-w-24" surface="translucent" controlSize="comfortable" disabled={busy}
            onValueChange={next => { void save(signal => setSystemCacheTtl(next, signal)); }} />
        </div>
      </>}
    </section>
    <section aria-label="缓存保活" className="space-y-2 px-4 py-4 sm:px-5">
      <h3 className="text-sm font-semibold">缓存保活</h3>
      {value && <>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm">服务端缓存保活</p>
            <p id={keepaliveHintId} className="text-xs text-muted-foreground">Activity 后台检查时生效，与浏览器语音播放保活无关。</p>
          </div>
          <Switch aria-label="服务端缓存保活" aria-describedby={keepaliveHintId}
            checked={value.cache_keepalive_enabled} disabled={busy}
            onCheckedChange={next => { void save(signal => setKeepalive({ cache_keepalive_enabled: next }, signal)); }} />
        </div>
        {value.cache_keepalive_enabled && <KeepaliveThreshold value={value.cache_keepalive_threshold_min} disabled={busy}
          onSave={next => save(signal => setKeepalive({ cache_keepalive_threshold_min: next }, signal))} />}
      </>}
    </section>
    {(pending || error) && <div className="px-4 py-3 sm:px-5">
      <SettingsReadbackStatus pending={pending} error={error} onRefresh={() => { void refresh(); }} />
    </div>}
  </div>;
}

function KeepaliveThreshold({ value, disabled, onSave }: {
  value: number;
  disabled: boolean;
  onSave: (next: number) => Promise<boolean>;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  return <form className="flex flex-wrap items-center justify-between gap-2" onSubmit={async event => {
    event.preventDefault();
    if (!disabled && draft !== null && await onSave(Number(draft))) setDraft(null);
  }}>
    <label htmlFor={id} className="text-sm">回复间隔阈值（分钟）</label>
    <div className="flex items-center gap-2">
      <Input id={id} type="number" min={1} max={55} step={1} required surface="translucent" controlSize="comfortable"
        className="w-20" value={draft ?? String(value)} disabled={disabled} onChange={event => setDraft(event.target.value)} />
      <Button type="submit" size="comfortable" disabled={disabled || !draft || Number(draft) === value}>保存</Button>
    </div>
  </form>;
}
