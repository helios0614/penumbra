import type { ComponentProps } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

type AccessibleName = { "aria-label": string; "aria-labelledby"?: string } | { "aria-labelledby": string; "aria-label"?: string };
export type SwitchProps = Omit<ComponentProps<typeof Button>, "children" | "onClick" | "role" | "aria-checked" | "aria-label" | "aria-labelledby" | "variant" | "size" | "loading"> & AccessibleName & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  busy?: boolean;
};

// Native Space/Enter activation; the consumer owns saving and confirmation.
export function Switch({ checked, onCheckedChange, disabled, busy = false, className, ...props }: SwitchProps) {
  return <Button {...props} type="button" role="switch" variant="ghost" aria-checked={checked}
    aria-busy={busy || undefined} disabled={disabled || busy} data-slot="switch"
    className={cn("group/switch h-11 w-11 rounded-xl px-0 py-0 hover:bg-transparent dark:hover:bg-transparent active:bg-transparent", className)}
    onClick={() => { if (!disabled && !busy) onCheckedChange(!checked); }}>
    <span aria-hidden="true" className="flex h-6 w-11 items-center rounded-full border border-border-strong bg-background/35 p-0.5 transition-colors group-aria-checked/switch:border-primary/60 group-aria-checked/switch:bg-primary/80 motion-reduce:transition-none">
      <span className="grid size-4.5 shrink-0 place-items-center rounded-full bg-background text-primary-ink shadow-sm transition-transform group-aria-checked/switch:translate-x-5 motion-reduce:transition-none">
        {busy && <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />}
      </span>
    </span>
  </Button>;
}
