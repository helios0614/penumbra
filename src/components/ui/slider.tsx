import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

type SliderProps = Omit<
  SliderPrimitive.Root.Props<number>,
  "children" | "orientation"
> & {
  readonly ariaLabel: string
  readonly className?: string
}

function Slider({
  ariaLabel,
  className,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  ...props
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      className={cn("w-full touch-none select-none", className)}
      {...props}
    >
      <SliderPrimitive.Control
        data-slot="slider-control"
        className="relative flex h-11 w-full cursor-pointer touch-none items-center data-disabled:cursor-not-allowed data-disabled:opacity-50"
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-indicator"
            className="h-full rounded-full bg-primary/65"
          />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          getAriaLabel={() => ariaLabel}
          getAriaValueText={(_formattedValue, value) => value.toFixed(1)}
          className="size-4 rounded-full border-2 border-primary/80 bg-background shadow-sm outline-none transition-[box-shadow,transform] hover:scale-110 active:scale-105 [&:has(input:focus-visible)]:ring-2 [&:has(input:focus-visible)]:ring-ring/25"
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
export type { SliderProps }
