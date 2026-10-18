import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"
import { DIALOG_BODY, DIALOG_CONTENT, DIALOG_FOOTER, DIALOG_HEADER, DIALOG_OVERLAY } from "./dialog-styles"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        DIALOG_OVERLAY,
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  closeButtonProps,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  closeButtonProps?: Omit<DialogPrimitive.Close.Props, "children" | "render">
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        data-has-close-button={showCloseButton || undefined}
        className={cn(
          DIALOG_CONTENT,
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && <DialogCloseButton {...closeButtonProps} />}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogCloseButton({
  className,
  "aria-label": ariaLabel = "关闭",
  title = ariaLabel,
  ...props
}: Omit<DialogPrimitive.Close.Props, "children" | "render">) {
  return (
    <DialogClose
      data-slot="dialog-close-button"
      aria-label={ariaLabel}
      title={title}
      className={className}
      render={<Button type="button" variant="ghost" size="icon-lg" className="absolute right-3 top-3 size-11 rounded-xl p-0 text-muted-strong hover:bg-background/45 hover:text-foreground sm:right-4 sm:top-4" />}
      {...props}
    >
      <XIcon className="size-4" aria-hidden="true" />
    </DialogClose>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(DIALOG_HEADER, className)}
      {...props}
    />
  )
}

// render supports semantic bodies (form/dl); ref and native props are forwarded.
function DialogBody({ className, render, ...props }: React.ComponentProps<"div"> & {
  render?: React.ReactElement
}) {
  const bodyProps = { "data-slot": "dialog-body", className: cn(DIALOG_BODY, className), ...props }
  return render ? React.cloneElement(render, bodyProps) : <div {...bodyProps} />
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        DIALOG_FOOTER,
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="ghost" />}>
          关闭
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "mt-0.5 font-sans text-lg font-semibold leading-7 text-foreground [overflow-wrap:anywhere]",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "mt-0.5 text-[13px] leading-5 text-muted-foreground [overflow-wrap:anywhere] *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
