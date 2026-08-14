import type { ComponentProps, ReactNode } from "react"

import { Button } from "@/components/ui/button"

interface PageHeaderProps {
  readonly eyebrow: ReactNode
  readonly title: ReactNode
  readonly description: ReactNode
  readonly actions?: ReactNode
  readonly titleId?: string
}

function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  titleId,
}: PageHeaderProps) {
  return (
    <header
      className="mist-glass shrink-0 rounded-[24px] px-4 py-3.5 sm:px-5 sm:py-4"
      data-slot="page-header"
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </p>
          <h1
            id={titleId}
            className="mt-0.5 text-xl font-semibold leading-7 text-foreground"
          >
            {title}
          </h1>
        </div>
        {actions && (
          <div
            className="-m-1 flex shrink-0 items-start"
            data-slot="page-header-actions"
          >
            {actions}
          </div>
        )}
      </div>

      <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
        {description}
      </p>
    </header>
  )
}

type PageHeaderActionProps = Omit<
  ComponentProps<typeof Button>,
  "aria-label" | "className" | "size" | "variant"
> & {
  readonly "aria-label": string
}

function PageHeaderAction({
  "aria-label": ariaLabel,
  title = ariaLabel,
  type = "button",
  ...props
}: PageHeaderActionProps) {
  return (
    <Button
      type={type}
      variant="ghost"
      size="icon-lg"
      className="relative size-11 rounded-2xl border-transparent bg-transparent p-1 text-foreground shadow-none before:pointer-events-none before:absolute before:inset-1 before:rounded-xl before:border before:border-border-strong/50 before:bg-background/25 before:shadow-sm before:transition-all before:content-[''] hover:bg-transparent hover:text-primary hover:before:border-primary/30 hover:before:bg-primary/10 active:bg-transparent active:before:bg-primary/15 focus-visible:border-transparent focus-visible:outline-none! focus-visible:ring-2 focus-visible:ring-ring/20 dark:hover:bg-transparent [&_svg]:relative [&_svg]:z-10 [&_svg]:size-4!"
      aria-label={ariaLabel}
      title={title}
      data-slot="page-header-action"
      {...props}
    />
  )
}

export { PageHeader, PageHeaderAction }
export type { PageHeaderActionProps, PageHeaderProps }
