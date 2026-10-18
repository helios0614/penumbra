import { useEffect, useId, useRef, useState } from "react";
import { Clock3 } from "lucide-react";
import { validTime } from "@/application/location/location-draft";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

export function LocationTimeField({ id, label, value, inheritedValue, disabled, error, onChange }: {
  readonly id: string; readonly label: string; readonly value: string; readonly inheritedValue?: string;
  readonly disabled: boolean; readonly error?: string; readonly onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false), [selection, setSelection] = useState("00:00");
  const body = useRef<HTMLDivElement>(null);
  const hint = !value && inheritedValue !== undefined ? `沿用统一 ${inheritedValue}` : undefined;
  const descriptionId = `${id}-description`;
  const changeOpen = (next: boolean) => {
    if (next) {
      if (disabled) return;
      setSelection(validTime(value) ? value : inheritedValue && validTime(inheritedValue) ? inheritedValue : "00:00");
    }
    setOpen(next);
  };
  const confirm = () => {
    if (disabled || !validTime(selection)) return;
    onChange(selection); setOpen(false);
  };
  return <div className="min-w-0">
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger id={id} disabled={disabled} aria-label={`${label}，${value || (inheritedValue !== undefined ? "沿用统一配置" : "未设置")}`} aria-invalid={Boolean(error)} aria-describedby={error || hint ? descriptionId : undefined}
        render={<Button type="button" variant="ghost" className="h-11 w-full min-w-0 justify-between rounded-xl border-border-strong/50 bg-background/25 px-2.5 text-sm font-normal shadow-sm hover:bg-background/35" />}>
        <span>{value || "—:—"}</span><Clock3 className="size-4 text-muted-strong" aria-hidden="true" />
      </DialogTrigger>
      <DialogContent className="max-w-[22rem]" closeButtonProps={{ "aria-label": `关闭${label}选择器` }} aria-describedby={undefined}
        initialFocus={() => body.current?.querySelector<HTMLInputElement>("input:checked") ?? true}>
        <DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
        <DialogBody ref={body} className="location-time-columns">
          <LocationTimeColumn label="小时" value={selection.slice(0, 2)} options={HOURS} onChange={(hour) => setSelection(`${hour}:${selection.slice(3)}`)} />
          <LocationTimeColumn label="分钟" value={selection.slice(3)} options={MINUTES} onChange={(minute) => setSelection(`${selection.slice(0, 2)}:${minute}`)} />
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="ghost" />}>取消</DialogClose>
          <Button type="button" disabled={disabled || !validTime(selection)} onClick={confirm}>确认</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {(error || hint) && <p id={descriptionId} className={`mt-1 text-xs leading-5 ${error ? "text-destructive" : "text-muted-foreground"}`}>{error || hint}</p>}
  </div>;
}

export function LocationTimeColumn({ label, value, options, onChange }: {
  readonly label: string; readonly value: string; readonly options: readonly string[]; readonly onChange: (value: string) => void;
}) {
  const name = useId(), list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = list.current, selected = container?.querySelector<HTMLInputElement>("input:checked")?.parentElement;
    if (container && selected) container.scrollTop = selected.offsetTop - (container.clientHeight - selected.offsetHeight) / 2;
  }, [value]);
  return <section className="flex min-h-0 min-w-0 flex-col">
    <h3 id={`${name}-label`} className="mb-2 text-center text-xs font-medium text-muted-strong">{label}</h3>
    <div ref={list} role="radiogroup" aria-labelledby={`${name}-label`} aria-orientation="vertical" className="location-time-options">
      {options.map((option) => <label key={option} className="relative block cursor-pointer">
        <input className="peer sr-only" type="radio" name={name} value={option} checked={value === option} onChange={(event) => {
          if (event.currentTarget.checked && options.includes(event.currentTarget.value)) onChange(event.currentTarget.value);
        }} />
        <span className="flex min-h-11 items-center justify-center rounded-xl text-sm text-muted-strong hover:bg-primary/5 peer-checked:bg-primary/15 peer-checked:font-semibold peer-checked:text-primary-ink peer-focus-visible:ring-2 peer-focus-visible:ring-ring">{option}</span>
      </label>)}
    </div>
  </section>;
}
