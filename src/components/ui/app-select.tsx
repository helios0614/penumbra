import type { ComponentProps, ReactNode } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SelectTriggerSurface } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ControlSize } from "./control-styles";

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
  controlSize = "default",
  className,
  contentClassName,
  align = "end",
  positionMethod,
  alignItemWithTrigger,
}: {
  readonly value: TValue;
  readonly options: ReadonlyArray<AppSelectOption<TValue>>;
  readonly onValueChange: (value: TValue) => void;
  readonly placeholder?: string;
  readonly ariaLabel: string;
  readonly disabled?: boolean;
  readonly surface?: SelectTriggerSurface;
  readonly controlSize?: ControlSize;
  readonly className?: string;
  readonly contentClassName?: string;
  readonly align?: "start" | "center" | "end";
  readonly positionMethod?: ComponentProps<typeof SelectContent>["positionMethod"];
  readonly alignItemWithTrigger?: boolean;
}) {
  const selected = options.find((option) => option.value === value);

  return (
    <Select
      value={value}
      onValueChange={(nextValue) => {
        if (!disabled && options.some((option) => option.value === nextValue && !option.disabled)) onValueChange(nextValue as TValue);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        surface={surface}
        controlSize={controlSize}
        className={cn(
          "w-full px-2.5 text-xs font-medium leading-5 text-muted-strong hover:text-foreground aria-expanded:text-foreground",
          surface === "solid"
            ? "hover:bg-muted aria-expanded:bg-muted dark:hover:bg-input/50"
            : "shadow-none hover:border-border-strong/70 hover:bg-background/45 aria-expanded:bg-background/45",
          className,
        )}
      >
        <SelectValue placeholder={placeholder}>{selected && <span className="min-w-0 truncate" title={typeof selected.label === "string" ? selected.label : undefined}>{selected.label}</span>}</SelectValue>
      </SelectTrigger>
      <SelectContent align={align} positionMethod={positionMethod} alignItemWithTrigger={alignItemWithTrigger}
        className={cn("rounded-xl p-1 text-xs", contentClassName)}>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className={cn("rounded-lg px-2.5 pr-8 py-2 text-[length:inherit] leading-5", controlSize === "comfortable" ? "min-h-11" : "min-h-9")}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
