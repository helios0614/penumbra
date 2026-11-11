import { MoreHorizontal, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatSettingsUi } from "@/components/chat-workspace/useChatSettings";
import { isThinkingPreference, THINKING_EFFORTS, type NumericChatDefaultField, type ChatDefaultValue } from "@/domain/runtime/chat-defaults";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { SegmentedControlItem } from "@/components/ui/selection-control";
import { AppSelect } from "@/components/ui/app-select";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { ChatAdvancedSettings } from "./ChatAdvancedSettings";
import { setSendShortcut, useSendShortcut, type SendShortcut } from "./send-shortcut-preference";

const sliderKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]);

export function ChatRequestParametersMenu({ settings, disabled }: { readonly settings?: ChatSettingsUi; readonly disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const scope = settings?.state.scope;
  useEffect(() => { setOpen(false); }, [scope]);
  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (next) void settings?.controller.open();
  };
  const ready = settings?.state.data;
  return <Popover open={open} onOpenChange={changeOpen}>
    <PopoverTrigger render={<Button type="button" variant="ghost" size="icon-lg" disabled={disabled || !scope}
      aria-label="聊天设置" title="聊天设置" className="shrink-0 text-muted-foreground" />}>
      <MoreHorizontal className="size-4.5" aria-hidden="true" />
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} initialFocus={type => type === "keyboard"}
      className="scrollbar-none max-h-(--available-height) w-72 max-w-(--available-width) gap-1.5 overflow-y-auto overscroll-contain rounded-2xl p-3">
      <div className="border-b border-border/60 pb-2">
        <PopoverTitle className="shrink-0 whitespace-nowrap">聊天设置</PopoverTitle>
      </div>
      <ChatSendShortcutSetting />
      {(!ready && settings?.state.status !== "error") && <p className="py-3 text-xs text-muted-foreground" role="status">正在读取设置…</p>}
      {settings?.state.status === "error" && <div className="text-xs text-muted-strong" role="alert">暂时无法读取设置。
        <Button variant="link" size="compact" onClick={() => void settings.controller.open()}>重试读取</Button>
      </div>}
      {settings && ready && <div aria-label="聊天参数">
        <ChatSettingSlider settings={settings} field="context_limit" label="上下文消息数" metadata={ready.context_limit} disabled={disabled} />
        {ready.temperature ? <ChatSettingSlider settings={settings} field="temperature" label="Temperature" metadata={ready.temperature} disabled={disabled} />
          : <p className="text-xs text-muted-foreground">当前接口暂不提供温度设置。</p>}
        <ChatThinkingSetting settings={settings} disabled={disabled} />
        <div className="mt-1.5 border-t border-border/60 pt-1.5">
          <ChatSettingSlider settings={settings} field="float_interval" label="记忆浮现间隔" metadata={ready.float_interval} disabled={disabled} unit="轮" />
          <ChatSettingSlider settings={settings} field="carryover_count" label="新会话携带历史" metadata={ready.carryover_count} disabled={disabled} unit="条" />
        </div>
      </div>}
      <ChatAdvancedSettings disabled={disabled} />
    </PopoverContent>
  </Popover>;
}

export function ChatSendShortcutSetting() {
  const shortcut = useSendShortcut();
  const options: readonly { value: SendShortcut; label: string }[] = [
    { value: "none", label: "无快捷键" },
    { value: "enter", label: "Enter 发送" },
    { value: "shift-enter", label: "Shift + Enter 发送" },
  ];
  return <div className="flex min-h-11 min-w-0 items-center justify-between gap-2 border-b border-border/60 pb-1.5 text-sm" data-chat-setting="send-shortcut">
    <span className="shrink-0">发送快捷键</span>
    <AppSelect value={shortcut} options={options} onValueChange={setSendShortcut} ariaLabel="发送快捷键"
      surface="translucent" controlSize="compact" className="w-auto max-w-full flex-1 text-sm font-normal"
      contentClassName="min-w-44 text-sm" />
  </div>;
}

export function ChatSettingSlider({ settings, field, label, metadata, disabled, unit = "" }: {
  readonly settings: ChatSettingsUi; readonly field: NumericChatDefaultField; readonly label: string;
  readonly metadata: ChatDefaultValue; readonly disabled: boolean; readonly unit?: string;
}) {
  const keyboard = useRef(false), { state, controller } = settings, scope = state.scope!;
  const edited = Object.prototype.hasOwnProperty.call(state.drafts, field);
  const draft = state.drafts[field];
  const value = edited ? typeof draft === "number" ? draft : metadata.defaultValue : metadata.value;
  const error = state.errors[field];
  return <div className="min-w-0" data-chat-setting={field}>
    <div className="flex min-h-6 items-center gap-2 text-sm">
      <span className="min-w-0 flex-1" title={field === "context_limit" ? "控制初始历史消息行选择，非最终总量上限。" : field === "temperature" ? "温度按接口格式分别保存；具体模型支持性由上游决定。" : undefined}>
        <span className="block">{label}</span>
      </span>
      <output className="shrink-0 tabular-nums text-foreground" aria-live="polite">{field === "temperature" && Number.isInteger(value) ? value.toFixed(1) : value}{unit}</output>
      {!edited && metadata.source === "backend_default" && <span className="text-xs text-muted-foreground">默认</span>}
      {metadata.source === "saved" && <Button type="button" variant="ghost" size="icon-xs" className="text-muted-foreground"
        disabled={disabled} aria-label={`恢复${label}默认值`} title="恢复默认值" onClick={() => controller.commit(scope, field, null)}>
        <RotateCcw className="size-3" aria-hidden="true" />
      </Button>}
    </div>
    <Slider ariaLabel={label} min={metadata.min} max={metadata.max} step={field === "temperature" ? 0.1 : 1}
      value={value} disabled={disabled}
      onKeyDownCapture={event => { if (sliderKeys.has(event.key)) keyboard.current = true; }}
      onKeyUp={event => { if (sliderKeys.has(event.key) && keyboard.current) { keyboard.current = false; controller.commit(scope, field); } }}
      onBlurCapture={() => { if (keyboard.current) { keyboard.current = false; controller.commit(scope, field); } }}
      onValueChange={next => controller.preview(scope, field, next)}
      onValueCommitted={(_next, details) => { if (!keyboard.current && details.reason !== "keyboard") controller.commit(scope, field); }} />
    {error ? <p role="alert" className="text-xs leading-5 text-muted-strong">{error}
      <Button variant="link" size="compact" disabled={disabled || state.saving} onClick={() => controller.commit(scope, field)}>重试</Button>
    </p> : state.saving && edited ? <p role="status" className="text-xs text-muted-foreground">保存中…</p> : null}
  </div>;
}

export function ChatThinkingSetting({ settings, disabled }: { readonly settings: ChatSettingsUi; readonly disabled: boolean }) {
  const { state, controller } = settings, metadata = state.data!.thinking, scope = state.scope!;
  const edited = Object.prototype.hasOwnProperty.call(state.drafts, "thinking"), draft = state.drafts.thinking;
  const value = edited ? isThinkingPreference(draft) ? draft : metadata.defaultValue : metadata.value;
  const unsupported = metadata.capability.status === "unsupported";
  const error = state.errors.thinking;
  return <div data-chat-setting="thinking" className="min-w-0">
    <div className="flex min-h-11 items-center justify-between gap-2 text-sm">
      <div className="min-w-0 flex-1">
        <span>扩展思考</span>
        {unsupported && <p id="chat-thinking-status" className="text-xs leading-4 text-muted-foreground">当前接口不支持扩展思考。</p>}
      </div>
      <Switch aria-label="扩展思考" aria-describedby={unsupported ? "chat-thinking-status" : undefined} checked={value.enabled} disabled={disabled || unsupported}
        onCheckedChange={enabled => controller.commit(scope, "thinking", { ...value, enabled })} />
    </div>
    {value.enabled && !unsupported && <div role="group" aria-label="思考强度" className="grid min-w-0 grid-cols-5 gap-0.5">
      {THINKING_EFFORTS.filter(effort => metadata.capability.allowedEfforts.includes(effort)).map(effort => <SegmentedControlItem key={effort}
        selected={value.effort === effort} disabled={disabled}
        className="min-w-0 [&_[data-slot=selection-surface]]:px-0" onClick={() => controller.commit(scope, "thinking", { ...value, effort })}>{effort}</SegmentedControlItem>)}
    </div>}
    {error ? <p role="alert" className="text-xs leading-5 text-muted-strong">{error}<Button variant="link" size="compact" disabled={disabled || state.saving}
      onClick={() => controller.commit(scope, "thinking")}>重试</Button></p> : state.saving && edited ? <p role="status" className="text-xs text-muted-foreground">保存中…</p> : null}
  </div>;
}
