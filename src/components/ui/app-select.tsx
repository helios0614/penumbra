import type { ReactNode } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SelectTriggerSurface } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface AppSelectOption<TValue extends string> {
  readonly value: TValue;
  readonly label: ReactNode;
  readonly disabled?: boolean;
}

export function AppSelect<TValue extends string>({
  value,
  options,
  onValueChange,
  placeholder,
  ariaLabel,
  disabled,
  surface = "solid",
  className,
  contentClassName,
  align = "end",
}: {
  readonly value: TValue;
  readonly options: ReadonlyArray<AppSelectOption<TValue>>;
  readonly onValueChange: (value: TValue) => void;
  readonly placeholder?: string;
  readonly ariaLabel: string;
  readonly disabled?: boolean;
  readonly surface?: SelectTriggerSurface;
  readonly className?: string;
  readonly contentClassName?: string;
  readonly align?: "start" | "center" | "end";
}) {
  const selected = options.find((option) => option.value === value);

  return (
    <Select
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue) onValueChange(nextValue as TValue);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        surface={surface}
        className={cn(
          "h-11 min-h-11 w-full rounded-xl px-2.5 py-0 text-xs font-medium leading-5 text-muted-strong hover:text-foreground focus-visible:border-ring/55 focus-visible:outline-none! focus-visible:ring-2 focus-visible:ring-ring/20 aria-expanded:text-foreground data-[size=default]:h-11",
          surface === "solid"
            ? "hover:bg-muted aria-expanded:bg-muted dark:hover:bg-input/50"
            : "shadow-none hover:border-border-strong/70 hover:bg-background/45 aria-expanded:bg-background/45",
          className,
        )}
      >
        <SelectValue placeholder={placeholder}>{selected?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent align={align} className={cn("rounded-xl p-1", contentClassName)}>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className="min-h-9 rounded-lg px-2.5 pr-8 text-xs data-selected:bg-primary/12 data-selected:text-primary-ink"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
