import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Quick Note composition only; semantics and focus handling remain in Base UI.
export function QuickNoteDialogHeader({ title, description, busy = false }: {
  readonly title: string; readonly description: string; readonly busy?: boolean;
}) {
  return <DialogHeader>
    <p className="font-decorative text-[11px] font-normal uppercase leading-4 tracking-[0.14em] text-muted-foreground">QUICK NOTES</p>
    <DialogTitle>{title}</DialogTitle>
    <DialogDescription>{description}</DialogDescription>
    <DialogClose
      disabled={busy}
      aria-label={`关闭${title}`}
      title={`关闭${title}`}
      render={<Button type="button" variant="ghost" size="icon-lg" className="quick-note-dialog-close absolute right-3 top-3 size-11 text-muted-strong hover:bg-background/45 hover:text-foreground sm:right-4 sm:top-4" />}
    >
      <X className="size-4" aria-hidden="true" />
    </DialogClose>
  </DialogHeader>;
}
