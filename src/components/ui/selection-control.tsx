import type { ComponentProps } from "react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

type SelectionProps = Omit<ComponentProps<typeof Button>, "variant" | "size" | "aria-pressed" | "loading"> & {
  selected: boolean;
};

// A 36px surface inside its own 44px layout box: hit areas never overlap.
function SelectionItem({ selected, className, children, kind, ...props }: SelectionProps & { kind: "filter" | "segment" }) {
  return <Button {...props} type={props.type ?? "button"} variant="ghost" aria-pressed={selected}
    data-selection={kind} className={cn(
      "h-auto min-h-11 min-w-11 border-0 bg-transparent px-0 py-1 text-xs leading-5 hover:bg-transparent dark:hover:bg-transparent active:bg-transparent aria-expanded:bg-transparent",
      className,
    )}>
    <span data-slot="selection-surface" className={cn(
      "pointer-events-none flex min-h-9 w-full min-w-0 items-center justify-center gap-1 rounded-[var(--radius-control)] border px-1.5 py-1.5 whitespace-normal break-words transition-colors motion-reduce:transition-none sm:px-2.5",
      kind === "filter"
        ? selected
          ? "border-primary/45 bg-primary/12 text-primary-ink group-hover/button:bg-primary/18 group-active/button:bg-primary/22"
          : "border-border-strong/25 bg-background/10 text-muted-strong group-hover/button:border-border-strong/45 group-hover/button:bg-background/45 group-active/button:bg-background/60"
        : selected
          ? "border-primary bg-primary text-primary-foreground group-hover/button:border-primary-hover group-hover/button:bg-primary-hover group-active/button:bg-primary-active"
          : "border-transparent text-muted-strong group-hover/button:bg-background/45 group-active/button:bg-background/60",
    )}>{children}</span>
  </Button>;
}

export function FilterChip(props: SelectionProps) {
  return <SelectionItem {...props} kind="filter" />;
}

// The parent owns selection and navigation, including calendar popovers.
export function SegmentedControlItem(props: SelectionProps) {
  return <SelectionItem {...props} kind="segment" />;
}
