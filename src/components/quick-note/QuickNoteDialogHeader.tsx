import { DialogCloseButton, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Quick Note composition only; semantics and focus handling remain in Base UI.
export function QuickNoteDialogHeader({ title, description, busy = false }: {
  readonly title: string; readonly description: string; readonly busy?: boolean;
}) {
  return <DialogHeader>
    <p className="font-decorative text-[11px] font-normal uppercase leading-4 tracking-[0.14em] text-muted-foreground">QUICK NOTES</p>
    <DialogTitle>{title}</DialogTitle>
    <DialogDescription>{description}</DialogDescription>
    <DialogCloseButton
      disabled={busy}
      aria-label={`关闭${title}`}
    />
  </DialogHeader>;
}
