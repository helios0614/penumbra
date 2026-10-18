import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LocationSwitch({ label, checked, disabled, onChange, showLabel = true }: {
  readonly label: string; readonly checked: boolean; readonly disabled: boolean; readonly onChange: (value: boolean) => void; readonly showLabel?: boolean;
}) {
  return <div className="flex min-h-11 shrink-0 items-center gap-2.5">
    {showLabel && <span className="text-xs font-medium text-muted-strong">{label}</span>}
    <Button type="button" variant="ghost" role="switch" aria-label={label} aria-checked={checked} disabled={disabled}
      className="group/location-switch h-11 w-11 rounded-xl px-0" onClick={() => onChange(!checked)}>
      <span aria-hidden="true" className="flex h-6 w-11 items-center rounded-full border border-border-strong bg-background/35 p-0.5 transition-colors group-aria-checked/location-switch:border-primary/60 group-aria-checked/location-switch:bg-primary/80 motion-reduce:transition-none">
        <span className="size-4.5 shrink-0 rounded-full bg-background shadow-sm transition-transform group-aria-checked/location-switch:translate-x-5 motion-reduce:transition-none" />
      </span>
    </Button>
  </div>;
}
export function LocationField({ label, error, hint, ...props }: ComponentProps<typeof Input> & {
  readonly label: string; readonly error?: string; readonly hint?: ReactNode;
}) {
  const descriptionId = `${props.id}-description`;
  return <div className="min-w-0">
    <label htmlFor={props.id} className="mb-1.5 block text-xs font-medium text-muted-strong">{label}</label>
    <Input surface="translucent" className="h-11 rounded-xl text-sm" {...props} aria-invalid={Boolean(error)} aria-describedby={error || hint ? descriptionId : undefined} />
    {(error || hint) && <p id={descriptionId} className={`mt-1 text-xs leading-5 ${error ? "text-destructive" : "text-muted-foreground"}`}>{error || hint}</p>}
  </div>;
}
