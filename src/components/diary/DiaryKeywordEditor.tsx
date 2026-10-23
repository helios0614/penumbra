import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface KeywordEdit { readonly index: number; readonly original: string | null }

/** Keyword edits stay in the existing draft, including an input not yet closed by Enter. */
export function DiaryKeywordEditor({ values, disabled, onChange }: {
  readonly values: readonly string[]; readonly disabled: boolean; readonly onChange: (values: readonly string[]) => void;
}) {
  const [editing, setEditing] = useState<KeywordEdit | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<number | "add" | null>(null);
  useLayoutEffect(() => {
    if (returnFocus.current === null) return;
    const target = returnFocus.current === "add" ? "[data-diary-keyword-add]" : `[data-diary-keyword-edit="${returnFocus.current}"]`;
    root.current?.querySelector<HTMLButtonElement>(target)?.focus({ preventScroll: true });
    returnFocus.current = null;
  });

  const update = (index: number, value: string) => {
    if (!disabled) onChange(values.map((word, offset) => offset === index ? value : word));
  };
  const finish = (cancel: boolean) => {
    if (disabled || !editing) return;
    if (cancel) {
      if (editing.original === null) onChange(values.filter((_, index) => index !== editing.index));
      else update(editing.index, editing.original);
    }
    returnFocus.current = cancel && editing.original === null ? "add" : editing.index;
    setEditing(null);
  };
  const remove = (index: number) => {
    if (disabled) return;
    onChange(values.filter((_, offset) => offset !== index));
    if (editing?.index === index) setEditing(null);
    else if (editing && editing.index > index) setEditing({ ...editing, index: editing.index - 1 });
    if (!editing || editing.index === index) returnFocus.current = values.length === 1 ? "add" : Math.min(index, values.length - 2);
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229 || disabled) return;
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); finish(event.key === "Escape");
    }
  };

  return <div ref={root} className="min-w-0">
    <ul className="diary-editor-keywords" aria-label="关键词草稿">
      {values.map((value, index) => editing?.index === index ? <li key={index} className="diary-keyword-edit" aria-label={`正在编辑关键词 ${index + 1}`}>
        <div className="min-w-0 flex-1 space-y-1">
          {/* Keep historic line separators inside ONE keyword; native inputs would strip them. */}
          {value.split(/(\r\n|\r|\n)/).map((part, offset, parts) => offset % 2 ? null : <Input key={offset} autoFocus={offset === 0} surface="translucent" controlSize="comfortable" className="diary-keyword-input"
            aria-label={parts.length === 1 ? `关键词 ${index + 1}` : `关键词 ${index + 1}，第 ${offset / 2 + 1} 段`} value={part} disabled={disabled} onKeyDown={keyDown}
            onChange={(event) => update(index, parts.map((text, position) => position === offset ? event.target.value : text).join(""))}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text/plain");
              if (disabled || !/[\r\n]/.test(text)) return;
              event.preventDefault();
              const input = event.currentTarget;
              const next = part.slice(0, input.selectionStart ?? part.length) + text + part.slice(input.selectionEnd ?? part.length);
              update(index, parts.map((text, position) => position === offset ? next : text).join(""));
            }} />)}
          {/[\r\n]/.test(value) && <p className="px-1 text-xs leading-5 text-muted-foreground">各段仍属于同一个关键词，换行会保留。</p>}
        </div>
        <Button type="button" variant="ghost" size="comfortable" className="min-w-11 px-2 text-xs text-primary-ink" disabled={disabled} aria-label="确认关键词修改" onClick={() => finish(false)}>确定</Button>
        <Button type="button" variant="ghost" size="comfortable" className="min-w-11 px-2 text-xs text-muted-strong" disabled={disabled} aria-label="取消关键词修改" onClick={() => finish(true)}>取消</Button>
      </li> : <li key={index} className="diary-keyword-chip">
        <Button type="button" variant="ghost" size="compact" className="diary-keyword-label" data-diary-keyword-edit={index}
          aria-label={`编辑关键词 ${index + 1}：${value.trim() ? value : "空关键词"}`} title={value.trim() ? value : "空关键词"} disabled={disabled}
          onClick={() => { if (!disabled) setEditing({ index, original: value }); }}>
          <span className="truncate">{value.trim() ? value : "空关键词"}</span>
        </Button>
        <Button type="button" variant="ghost" className="size-11 shrink-0 rounded-full px-0 text-muted-foreground" aria-label={`移除关键词 ${index + 1}`} disabled={disabled} onClick={() => remove(index)}>
          <X className="size-3" aria-hidden="true" />
        </Button>
      </li>)}
    </ul>
    <Button type="button" variant="ghost" size="compact" className="mt-1 min-h-11 gap-1 text-xs text-muted-strong" data-diary-keyword-add disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onChange([...values, ""]); setEditing({ index: values.length, original: null });
      }}><Plus className="size-3.5" aria-hidden="true" />添加关键词</Button>
  </div>;
}
