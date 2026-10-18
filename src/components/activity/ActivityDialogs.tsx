import type { ComponentProps } from "react";
import type { ActivityState } from "@/application/activity/activity-state";
import type { ActivityController } from "@/application/activity/activity-controller";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ActivityDialogHeader } from "./ActivityDialogHeader";

export const ACTIVITY_CLEAR_DESCRIPTION = "将删除全部设备、全部日期的所有活动 JSONL 日志文件，不仅是当前筛选结果。此操作不可撤销。手机状态快照和 Wi-Fi 标记不属于活动日志，不受此操作影响。";
export function ActivityClearDialog({ open, busy, onClose, onConfirm, finalFocus }: { readonly open: boolean; readonly busy: boolean; readonly onClose: () => void; readonly onConfirm: () => void; readonly finalFocus?: ComponentProps<typeof DialogContent>["finalFocus"] }) {
  return <AlertDialog open={open} onOpenChange={(next, details) => { if (!next) { if (busy) { details.cancel(); return; } onClose(); } }}>
    <AlertDialogContent finalFocus={finalFocus} data-activity-dialog="clear">
      <AlertDialogHeader><AlertDialogTitle>清空全部活动日志？</AlertDialogTitle><AlertDialogDescription>{ACTIVITY_CLEAR_DESCRIPTION}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel variant="ghost" className="text-muted-strong" disabled={busy}>取消</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={onConfirm}>确认清空全部日志</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
export function ActivitySummaryDialog({ open, state, controller, onClose, finalFocus }: { readonly open: boolean; readonly state: ActivityState; readonly controller: ActivityController | null; readonly onClose: () => void; readonly finalFocus?: ComponentProps<typeof DialogContent>["finalFocus"] }) {
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogContent showCloseButton={false} className="max-w-xl" finalFocus={finalFocus} data-activity-dialog="summary">
      <ActivityDialogHeader title="最近 3 小时活动摘要" closeLabel="关闭活动摘要" description="按十分钟窗口的规则整理，不跟随页面日期或设备筛选；时长为后端估算。" />
      <ActivitySummaryContent state={state} onRetry={() => void controller?.loadSummary(true)} />
    </DialogContent>
  </Dialog>;
}
export function ActivitySummaryContent({ state, onRetry }: { readonly state: ActivityState; readonly onRetry: () => void }) {
  return <DialogBody aria-busy={state.summary.loading}>
    {state.summary.loading && <p role="status" className="py-6 text-xs text-muted-foreground">正在读取最近 3 小时的规则摘要…</p>}
    {state.summary.error && <div role="alert" className="py-3 text-xs text-destructive"><p>{state.summary.error}</p><Button variant="ghost" className="mt-1 h-11 text-xs" onClick={onRetry}>重新读取摘要</Button></div>}
    {state.summary.data?.length === 0 && !state.summary.loading && <p className="py-8 text-center text-sm text-muted-foreground">最近 3 小时暂无已完成窗口的活动摘要。</p>}
    <ol className="divide-y divide-primary/10">{state.summary.data?.map((row, occurrence) => <li key={`${row.start}:${row.end}:${occurrence}`} className="py-3">
      <p className="text-xs text-muted-foreground"><span className="text-primary-ink">{row.start}–{row.end}</span> · {row.count} 条已观测事件</p><p className={`mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-6 ${row.summary.startsWith("缺少活动数据") ? "text-muted-foreground italic" : ""}`}>{row.summary}</p>
    </li>)}</ol>
    <p className="py-3 text-[11px] leading-5 text-muted-foreground">窗口时间按服务端原文展示；接口未提供每个窗口的完整日期，页面不据此推断跨日日期。</p>
  </DialogBody>;
}
