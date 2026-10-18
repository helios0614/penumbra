import type { ReactNode } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
      <AlertDialogFooter><AlertDialogCancel variant="ghost" disabled={busy}>取消</AlertDialogCancel><AlertDialogAction variant={destructive ? "destructive" : "default"} disabled={busy} onClick={onConfirm}>{action}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
export function LocationPoiDialog({ poi, onClose }: { readonly poi: LocationPoi | null; readonly onClose: () => void }) {
  return <Dialog open={Boolean(poi)} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="location-dialog" showCloseButton={false}>
      <DialogHeader><DialogTitle>{poi?.name}</DialogTitle><DialogDescription>已查询到的地点信息。</DialogDescription></DialogHeader>
      <dl className="location-dialog-body space-y-3 text-sm">
        {poi && [["类别", poi.category], ["地址", poi.address], ["距离", poi.distance === null ? null : locationDistance(poi.distance)], ["电话", poi.phone], ["评分", poi.rating], ["参考人均", poi.cost ? `¥${poi.cost}` : null]]
          .filter(([, value]) => value).map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words leading-6">{value}</dd></div>)}
      </dl>
      <div className="location-dialog-footer"><DialogClose render={<Button variant="ghost" />}>关闭</DialogClose></div>
    </DialogContent>
  </Dialog>;
}
