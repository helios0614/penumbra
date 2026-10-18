import * as React from "react"

import { cn } from "@/lib/utils"
import type { ControlSize } from "./control-styles"

type TextareaSurface = "solid" | "translucent"

function Textarea({
  className,
  surface = "solid",
  controlSize = "default",
  ...props
}: React.ComponentProps<"textarea"> & {
  surface?: TextareaSurface
  controlSize?: ControlSize
}) {
  return (
    <textarea
      data-slot="textarea"
      data-surface={surface}
      data-control-size={controlSize}
      className={cn(
        "scrollbar-none flex field-sizing-content min-h-16 w-full rounded-[var(--radius-control)] text-base leading-6 transition-colors motion-reduce:transition-none outline-none placeholder:text-muted-foreground focus-visible:border-ring/55 focus-visible:outline-none! focus-visible:ring-2! focus-visible:ring-ring/20! disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        controlSize === "compact" ? "px-2.5 py-1.5" : controlSize === "comfortable" ? "px-3 py-2.5" : "px-3 py-2",
        surface === "solid"
          ? "mist-solid"
          : "border border-border-strong/50 bg-background/25 shadow-sm hover:bg-background/35 focus:bg-background/35",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
export type { TextareaSurface }
