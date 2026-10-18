import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { CONTROL_FOCUS } from "@/components/ui/control-styles"
import { LoaderCircle } from "lucide-react"

const buttonVariants = cva(
  `group/button relative inline-flex shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-transparent bg-clip-padding text-sm font-medium leading-5 whitespace-normal break-words transition-colors outline-none select-none ${CONTROL_FOCUS} disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active",
        "soft-primary":
          "border-primary/15 bg-primary/15 text-primary-ink hover:border-primary/25 hover:bg-primary/20 active:bg-primary/25 aria-expanded:bg-primary/20",
        outline:
          "border-border-strong/50 bg-background/25 text-muted-strong shadow-sm hover:border-border-strong/70 hover:bg-background/45 hover:text-foreground active:bg-background/60 aria-expanded:bg-background/45 aria-expanded:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary-hover active:bg-[color-mix(in_srgb,var(--color-secondary),black_22%)] aria-expanded:bg-secondary-hover",
        ghost:
          "hover:bg-muted hover:text-foreground active:bg-muted/80 aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive-foreground hover:bg-destructive/20 active:bg-destructive/25 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-auto min-h-9 gap-1.5 px-3 py-1.5",
        compact: "h-auto min-h-8 gap-1 px-2.5 py-1 text-[0.8rem]",
        // Retain small toolbar sizes; do not enlarge Chat/calendar icon controls.
        xs: "h-auto min-h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 py-0.5 text-xs leading-4 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-auto min-h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 py-0.5 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-auto min-h-10 gap-1.5 px-4 py-2",
        comfortable: "h-auto min-h-11 gap-1.5 px-4 py-2.5",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  loading,
  disabled,
  children,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants> & { loading?: boolean }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-loading={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
      aria-busy={loading || props["aria-busy"]}
    >
      {loading === undefined ? children : <>
        <span className={cn("inline-flex min-w-0 items-center justify-center gap-[inherit]", loading && "opacity-0")}>{children}</span>
        {loading && <LoaderCircle aria-hidden="true" className="absolute size-4 animate-spin motion-reduce:animate-none" />}
      </>}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
