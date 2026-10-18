import { DialogCloseButton, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Activity composition of shared Dialog semantics; no independent modal behavior.
export function ActivityDialogHeader({ title, description, closeLabel = `关闭${title}`, busy = false }: {
  readonly title: string; readonly description: string; readonly closeLabel?: string; readonly busy?: boolean;
}) {
  return <DialogHeader>
    <p className="font-decorative text-[11px] font-normal uppercase leading-4 tracking-[0.14em] text-muted-foreground">ACTIVITY LOG</p>
    <DialogTitle>{title}</DialogTitle>
    <DialogDescription>{description}</DialogDescription>
    <DialogCloseButton disabled={busy} aria-label={closeLabel} />
  </DialogHeader>;
}
