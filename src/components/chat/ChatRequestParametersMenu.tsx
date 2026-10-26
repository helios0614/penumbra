import { SlidersHorizontal } from "lucide-react";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import {
  EMPTY_REQUEST_PARAMETERS, equalRequestOverrides, requestParameterDraft, temperatureMaximum, validateRequestParameters,
  type ChatRequestParameterDraft, type ChatRequestParameters, type ChatRequestParameterScope, type ChatRequestParameterResult,
} from "@/components/chat-workspace/chat-request-parameters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTitle, PopoverDescription, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const breakpoint = "(min-width: 768px)";
const subscribeDesktop = (listener: () => void) => {
  const media = window.matchMedia(breakpoint);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
};
const desktopSnapshot = () => window.matchMedia(breakpoint).matches;

type Edit = { readonly scope: ChatRequestParameterScope; readonly draft: ChatRequestParameterDraft };
type Props = {
  readonly parameters?: ChatRequestParameters;
  readonly disabled: boolean;
  readonly onApply?: (scope: ChatRequestParameterScope, draft: ChatRequestParameterDraft) => ChatRequestParameterResult;
};

/** One form and edit lease shared by the responsive surfaces; Workspace owns the applied values. */
export function ChatRequestParametersMenu({ parameters = EMPTY_REQUEST_PARAMETERS, disabled, onApply }: Props) {
  const desktop = useSyncExternalStore(subscribeDesktop, desktopSnapshot, () => false);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const open = edit !== null && edit.scope === parameters.scope;
  const applied = Object.keys(parameters.overrides).length > 0;
  useEffect(() => { setEdit(current => current?.scope === parameters.scope ? current : null); }, [parameters.scope]);
  const changeOpen = (next: boolean) => {
    setError(null);
    setEdit(next && parameters.scope && !disabled && onApply
      ? { scope: parameters.scope, draft: requestParameterDraft(parameters.overrides) } : null);
  };
  const apply = (draft: ChatRequestParameterDraft) => {
    if (!edit || disabled || !onApply) return;
    const result = onApply(edit.scope, draft);
    if (result === "applied" || result === "unchanged") changeOpen(false);
    else setError(result === "stale" ? "会话或模型已变化，请重新打开快捷配置。"
      : result === "locked" ? "请先处理当前请求或等待操作完成。" : "请核对参数后再应用。");
  };
  const maximum = temperatureMaximum(edit?.scope.protocol ?? null);
  const parsed = validateRequestParameters(edit?.draft ?? { contextLimit: "", temperature: "" }, edit?.scope.protocol ?? null);
  const changed = !equalRequestOverrides(parsed.overrides, parameters.overrides);
  const change = (field: keyof ChatRequestParameterDraft, value: string) => {
    setError(null);
    setEdit(current => current ? { ...current, draft: { ...current.draft, [field]: value } } : null);
  };
  const trigger = <Button type="button" variant="ghost" size="icon-lg"
    disabled={disabled || !parameters.scope || !onApply} aria-label="聊天快捷配置"
    title={applied ? "聊天快捷配置 · 已应用临时参数" : "聊天快捷配置"}
    className="shrink-0 text-muted-foreground">
    <SlidersHorizontal className="size-4.5" aria-hidden="true" />
    {applied && <span className="absolute bottom-1 right-1 size-1.5 rounded-full bg-primary" aria-hidden="true" />}
  </Button>;
  const description = "仅当前会话与模型的后续发送、重新生成使用；刷新或离开后不保留。";
  const form = <form noValidate aria-label="聊天快捷参数" onSubmit={event => {
    event.preventDefault();
    if (edit && parsed.valid && changed) apply(edit.draft);
  }} className="min-w-0 space-y-4">
    <p className="break-words text-xs text-muted-strong [overflow-wrap:anywhere]">当前模型：{edit?.scope.model}</p>
    {parameters.notice && <p role="status" className="text-xs text-muted-strong">{parameters.notice}</p>}
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={`${id}-context`} className="block text-sm font-medium">上下文消息数</label>
        <Input id={`${id}-context`} surface="translucent" controlSize="comfortable" inputMode="numeric" autoComplete="off"
          value={edit?.draft.contextLimit ?? ""} onChange={event => change("contextLimit", event.target.value)}
          placeholder="后端默认（30）" aria-invalid={!!parsed.errors.contextLimit} aria-describedby={`${id}-context-help ${id}-context-error`} />
        <p id={`${id}-context-help`} className="text-xs leading-5 text-muted-foreground">1–100 的整数，控制初始历史消息行选择；不是对话轮数或最终总量上限。</p>
        <p id={`${id}-context-error`} role={parsed.errors.contextLimit ? "alert" : undefined} className="text-xs text-destructive">{parsed.errors.contextLimit}</p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${id}-temperature`} className="block text-sm font-medium">Temperature</label>
        <Input id={`${id}-temperature`} surface="translucent" controlSize="comfortable" inputMode="decimal" autoComplete="off"
          disabled={maximum === null} value={edit?.draft.temperature ?? ""} onChange={event => change("temperature", event.target.value)}
          placeholder={maximum === null ? "当前接口范围未确认" : "后端默认（1.0）"}
          aria-invalid={!!parsed.errors.temperature} aria-describedby={`${id}-temperature-help ${id}-temperature-error`} />
        <p id={`${id}-temperature-help`} className="text-xs leading-5 text-muted-foreground">{maximum === null
          ? "当前选择未提供可确认的接口格式，温度保持后端默认。"
          : `当前接口范围 0–${maximum}；具体模型是否接受温度仍由上游决定。`}</p>
        <p id={`${id}-temperature-error`} role={parsed.errors.temperature ? "alert" : undefined} className="text-xs text-destructive">{parsed.errors.temperature}</p>
      </div>
    </fieldset>
    <p className="text-xs leading-5 text-muted-foreground">留空表示不覆盖。30 和 1.0 是后端契约默认值，并非读取的已保存设置。</p>
    {disabled && <p role="status" className="text-xs text-muted-strong">请先处理当前请求或等待操作完成。</p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-3">
      <Button type="button" variant="ghost" className="min-h-11" disabled={disabled || !applied}
        onClick={() => apply({ contextLimit: "", temperature: "" })}>恢复后端默认</Button>
      <Button type="button" variant="ghost" className="min-h-11" onClick={() => changeOpen(false)}>取消</Button>
      <Button type="submit" className="min-h-11" disabled={disabled || !parsed.valid || !changed}>应用到后续请求</Button>
    </div>
  </form>;

  return <>
    {desktop ? <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align="end" sideOffset={8}
        className="scrollbar-none max-h-(--available-height) w-[360px] max-w-(--available-width) gap-3 overflow-y-auto overscroll-contain rounded-2xl p-4">
        <PopoverTitle>聊天快捷配置</PopoverTitle>
        <PopoverDescription className="text-xs leading-5">{description}</PopoverDescription>
        {form}
      </PopoverContent>
    </Popover> : <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader><DialogTitle>聊天快捷配置</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <DialogBody>{form}</DialogBody>
      </DialogContent>
    </Dialog>}
    <span role="status" className="sr-only">{parameters.notice ?? (applied ? "已应用临时参数，仅用于当前会话和模型的后续手动请求。" : "聊天参数使用后端默认。")}</span>
  </>;
}
