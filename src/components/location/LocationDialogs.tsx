import type { ReactNode } from "react";
import { X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { LocationPoi } from "@/domain/location";
import { locationDistance } from "./location-presentation";

export function LocationConfirm({ open, title, description, action, destructive = false, busy = false, onCancel, onConfirm }: {
  readonly open: boolean; readonly title: string; readonly description: ReactNode; readonly action: string;
  readonly destructive?: boolean; readonly busy?: boolean; readonly onCancel: () => void; readonly onConfirm: () => void;
}) {
  return <AlertDialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
    <AlertDialogContent className="location-dialog" data-location-dialog="confirm">
      <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription render={<div />}>{description}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel variant="ghost" className="text-muted-strong" disabled={busy}>取消</AlertDialogCancel><AlertDialogAction variant={destructive ? "destructive" : "default"} disabled={busy} onClick={onConfirm}>{action}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
export function LocationDialogClose({ label }: { readonly label: string }) {
  return <DialogClose aria-label={label} title={label}
    render={<Button type="button" variant="ghost" size="icon-lg" className="location-dialog-close absolute right-3 top-3 size-11 text-muted-strong hover:text-foreground sm:right-4 sm:top-4" />}>
    <X className="size-4" aria-hidden="true" />
  </DialogClose>;
}
export function LocationPoiDialog({ poi, onClose }: { readonly poi: LocationPoi | null; readonly onClose: () => void }) {
  return <Dialog open={Boolean(poi)} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="location-dialog" showCloseButton={false} aria-describedby={undefined}>
      <DialogHeader><DialogTitle>{poi?.name}</DialogTitle><LocationDialogClose label="关闭地点详情" /></DialogHeader>
      <dl className="location-dialog-body location-poi-fields divide-y divide-border/50 text-sm">
        {poi && [["类别", poi.category], ["地址", poi.address], ["距离", poi.distance === null ? null : locationDistance(poi.distance)], ["电话", poi.phone], ["评分", poi.rating], ["参考人均", poi.cost ? `¥${poi.cost}` : null]]
          .filter(([, value]) => value).map(([label, value]) => <div key={label} className="grid grid-cols-[4rem_minmax(0,1fr)] items-baseline gap-x-3 py-2"><dt className="text-xs leading-5 text-muted-foreground">{label}</dt><dd className="min-w-0 break-words leading-6">{value}</dd></div>)}
      </dl>
    </DialogContent>
  </Dialog>;
}
