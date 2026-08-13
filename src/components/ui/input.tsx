import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

type InputSurface = "solid" | "translucent"

function Input({
  className,
  type,
  surface = "solid",
  ...props
}: React.ComponentProps<"input"> & {
  surface?: InputSurface
}) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-surface={surface}
      className={cn(
        "h-8 w-full min-w-0 rounded-lg px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        surface === "solid"
          ? "mist-solid"
          : "border border-border-strong/50 bg-background/25 shadow-sm hover:bg-background/35 focus-visible:bg-background/35",
        className
      )}
      {...props}
    />
  )
}

export { Input }
export type { InputSurface }
