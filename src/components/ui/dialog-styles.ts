import "./dialog-layout.css"

// Shared layout only; Base UI owns modal behavior and focus management.
export const DIALOG_CONTENT = "dialog-viewport mist-glass-strong fixed z-50 flex min-h-0 max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden rounded-[28px] p-0 text-sm text-popover-foreground duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"

export const DIALOG_OVERLAY = "fixed inset-0 isolate z-50 bg-black/10 duration-100 dark:bg-black/40 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"

export const DIALOG_HEADER = "relative flex shrink-0 flex-col items-stretch gap-0 border-b border-border/60 px-5 pb-4 pt-5 text-left sm:px-6 sm:pb-5 sm:pt-6"

export const DIALOG_BODY = "scrollbar-none min-h-0 flex-auto overflow-y-auto overscroll-contain p-5 sm:px-6"

export const DIALOG_FOOTER = "flex shrink-0 flex-row flex-wrap items-center justify-end gap-2 border-t border-border/60 bg-transparent px-5 py-3 sm:px-6 [&_button]:min-w-0 [&_button]:max-w-full"
