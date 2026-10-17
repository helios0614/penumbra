import { X } from "lucide-react";
import type { ActivityState } from "@/application/activity/activity-state";
import type { ActivityController } from "@/application/activity/activity-controller";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const ACTIVITY_CLEAR_DESCRIPTION = "将删除全部设备、全部日期的所有活动 JSONL 日志文件，不仅是当前筛选结果。此操作不可撤销。手机状态快照和 Wi-Fi 标记不属于活动日志，不受此操作影响。";
export function ActivityClearDialog({ open, busy, onClose, onConfirm }: { readonly open: boolean; readonly busy: boolean; readonly onClose: () => void; readonly onConfirm: () => void }) {
  return <AlertDialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
    <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[24px]">
      <AlertDialogHeader><AlertDialogTitle>清空全部活动日志？</AlertDialogTitle><AlertDialogDescription>{ACTIVITY_CLEAR_DESCRIPTION}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel className="h-11" disabled={busy}>取消</AlertDialogCancel><AlertDialogAction variant="destructive" className="h-11" disabled={busy} onClick={onConfirm}>确认清空全部日志</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
export function ActivitySummaryDialog({ open, state, controller, onClose }: { readonly open: boolean; readonly state: ActivityState; readonly controller: ActivityController | null; readonly onClose: () => void }) {
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogContent showCloseButton={false} className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-[24px] sm:max-w-xl">
      <div className="flex shrink-0 items-start justify-between gap-3 pb-3">
        <div className="min-w-0"><DialogTitle className="leading-6">最近 3 小时活动摘要</DialogTitle><DialogDescription className="mt-1 text-xs leading-5">按十分钟窗口的规则整理，不跟随页面日期或设备筛选；时长为后端估算。</DialogDescription></div>
        <Tooltip><TooltipTrigger render={<DialogClose render={<Button variant="ghost" className="size-11 shrink-0" aria-label="关闭活动摘要" />} />}><X aria-hidden="true" /></TooltipTrigger><TooltipContent>关闭摘要</TooltipContent></Tooltip>
      </div>
      <ActivitySummaryContent state={state} onRetry={() => void controller?.loadSummary(true)} />
    </DialogContent>
  </Dialog>;
}
export function ActivitySummaryContent({ state, onRetry }: { readonly state: ActivityState; readonly onRetry: () => void }) {
  return <div className="min-h-0 overflow-y-auto overscroll-contain border-t border-primary/10" aria-busy={state.summary.loading}>
    {state.summary.loading && <p role="status" className="py-6 text-xs text-muted-foreground">正在读取最近 3 小时的规则摘要…</p>}
    {state.summary.error && <div role="alert" className="py-3 text-xs text-destructive"><p>{state.summary.error}</p><Button variant="ghost" className="mt-1 h-11 text-xs" onClick={onRetry}>重新读取摘要</Button></div>}
    {state.summary.data?.length === 0 && !state.summary.loading && <p className="py-8 text-center text-sm text-muted-foreground">最近 3 小时暂无已完成窗口的活动摘要。</p>}
    <ol className="divide-y divide-primary/10">{state.summary.data?.map((row, occurrence) => <li key={`${row.start}:${row.end}:${occurrence}`} className="py-3">
      <p className="text-xs text-muted-foreground">{row.start}–{row.end} · {row.count} 条已观测事件</p><p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-6">{row.summary}</p>
    </li>)}</ol>
    <p className="py-3 text-[11px] leading-5 text-muted-foreground">窗口时间按服务端原文展示；接口未提供每个窗口的完整日期，页面不据此推断跨日日期。</p>
  </div>;
}
