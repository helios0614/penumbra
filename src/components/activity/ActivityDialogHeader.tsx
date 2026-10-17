import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Activity composition of shared Dialog semantics; no independent modal behavior.
export function ActivityDialogHeader({ title, description, closeLabel = `关闭${title}`, busy = false }: {
  readonly title: string; readonly description: string; readonly closeLabel?: string; readonly busy?: boolean;
}) {
  return <DialogHeader>
    <p className="font-decorative text-[11px] font-normal uppercase leading-4 tracking-[0.14em] text-muted-foreground">ACTIVITY LOG</p>
    <DialogTitle>{title}</DialogTitle>
    <DialogDescription>{description}</DialogDescription>
    <DialogClose disabled={busy} aria-label={closeLabel} title={closeLabel} render={<Button type="button" variant="ghost" className="absolute right-3 top-3 size-11 rounded-xl text-muted-strong hover:bg-background/45 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20 sm:right-4 sm:top-4" />}>
      <X className="size-4" aria-hidden="true" />
    </DialogClose>
  </DialogHeader>;
}
