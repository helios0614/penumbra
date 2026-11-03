import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"
import { CONTROL_HEIGHTS, type ControlSize } from "./control-styles"

type InputSurface = "solid" | "translucent"

function Input({
  className,
  type,
  surface = "solid",
  controlSize = "default",
  ...props
}: React.ComponentProps<"input"> & {
  surface?: InputSurface
  controlSize?: ControlSize
}) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-surface={surface}
      data-control-size={controlSize}
      className={cn(
        "w-full min-w-0 rounded-[var(--radius-control)] px-2.5 text-sm leading-5 transition-colors motion-reduce:transition-none outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring/55 focus-visible:outline-none! focus-visible:ring-2 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        CONTROL_HEIGHTS[controlSize],
        surface === "solid"
          ? "mist-solid"
          : "border border-border-strong/50 bg-background/25 shadow-sm hover:bg-background/35 focus:bg-background/35",
        className
      )}
      {...props}
    />
  )
}

export { Input }
export type { InputSurface }
