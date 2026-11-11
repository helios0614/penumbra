import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { SettingsReadbackStatus } from "@/components/settings/SettingsReadbackStatus";
import { useSettingsReadback } from "@/components/settings/useSettingsReadback";
import { Switch } from "@/components/ui/switch";
import {
  readChatAdvancedSettings, setChatAdvancedField, type ChatAdvancedField,
} from "@/domain/advanced-settings/advanced-settings-client";

const groups = [
  { name: "HEART", generation: "enable_hidden_heart", history: "include_heart" },
  { name: "DRIFT", generation: "enable_hidden_drift", history: "include_drift" },
] as const;

export function ChatAdvancedSettings({ disabled }: { disabled: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return <details className="group/advanced mx-3 shrink-0 border-t border-border/60"
    onToggle={event => {
      const section = event.currentTarget;
      setExpanded(section.open);
      if (section.open) section.parentElement?.scrollTo({ top: section.offsetTop });
    }}>
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md text-sm font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
      高级控制
      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open/advanced:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
    </summary>
    {expanded && <HiddenContentSettings disabled={disabled} />}
  </details>;
}

function HiddenContentSettings({ disabled }: { disabled: boolean }) {
  const { value, pending, error, refresh, save } = useSettingsReadback(readChatAdvancedSettings);
  const change = (field: ChatAdvancedField, enabled: boolean) => {
    void save(signal => setChatAdvancedField(field, enabled, signal));
  };
  return <div className="space-y-2">
    {value && <>
      <p className="text-xs leading-relaxed text-muted-foreground">Chat 与 Diary 共用。生成指令和历史回显可分别设置。</p>
      {groups.map(({ name, generation, history }) => <fieldset key={name} className="min-w-0 border-t border-border/60">
        <legend className="pr-2 text-xs font-semibold">{name}</legend>
        <div className="flex min-h-11 items-center justify-between gap-2 text-sm">
          <span>提供生成指令</span>
          <Switch aria-label={`${name} 提供生成指令`} checked={value[generation]} disabled={disabled || pending !== null}
            onCheckedChange={enabled => change(generation, enabled)} />
        </div>
        <div className="flex min-h-11 items-center justify-between gap-2 text-sm">
          <span>向 AI 回显历史</span>
          <Switch aria-label={`${name} 向 AI 回显历史`} checked={value[history]} disabled={disabled || pending !== null}
            onCheckedChange={enabled => change(history, enabled)} />
        </div>
      </fieldset>)}
    </>}
    <SettingsReadbackStatus pending={pending} error={error} onRefresh={() => { void refresh(); }} />
  </div>;
}
