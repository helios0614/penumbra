import { useRef, useState } from "react";
import { FileText, MoreHorizontal, RefreshCw, Trash2, X } from "lucide-react";
import { PageHeader, PageHeaderAction } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PhoneStatusPanel } from "./PhoneStatusPanel";
import { ActivityControls } from "./ActivityControls";
import { ActivityTimeline } from "./ActivityTimeline";
import { ActivityClearDialog, ActivitySummaryDialog } from "./ActivityDialogs";
import { useActivity } from "./useActivity";
import { PageScrollArea } from "@/components/ui/page-scroll-area";
import { useFeedbackToast } from "@/components/ui/toast";
import { ActivityPageFeedback } from "./ActivityFeedback";
import { ActivityLinkageDetails } from "./ActivityLinkageDetails";
import "./activity.css";

export function ActivityView({ onBack }: { readonly onBack?: () => void }) {
  const { state, controller, connection, reconnect } = useActivity();
  const [menu, setMenu] = useState(false), [summary, setSummary] = useState(false), [clear, setClear] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const queryKey = JSON.stringify(state.query);
  useFeedbackToast(state.notice, state.notice && !state.notice.error ? { type: "success", text: state.notice.text } : null, `${queryKey}:${state.device}`);
  return <TooltipProvider><main className="mx-auto flex h-full max-h-dvh min-h-0 w-full max-w-5xl flex-col overflow-hidden px-4 pb-4 pt-5 sm:px-0 sm:pb-8 sm:pt-8" aria-labelledby="activity-page-title">
    <PageHeader eyebrow="ACTIVITY LOG" title="活动日志" titleId="activity-page-title" description="设备上的点滴活动，构成一天的轨迹。" actions={<>
      <Tooltip><TooltipTrigger render={<PageHeaderAction aria-label="刷新活动数据" disabled={state.logs.loading || Boolean(state.pending)} onClick={() => void controller?.refresh()} />}><RefreshCw aria-hidden="true" /></TooltipTrigger><TooltipContent>刷新活动数据</TooltipContent></Tooltip>
      <Popover open={menu} onOpenChange={setMenu}><Tooltip><TooltipTrigger render={<PopoverTrigger render={<PageHeaderAction ref={menuTrigger} aria-label="更多活动日志操作" />} />}><MoreHorizontal aria-hidden="true" /></TooltipTrigger><TooltipContent>更多操作</TooltipContent></Tooltip>
        <PopoverContent align="end" className="scrollbar-none max-h-(--available-height) w-64 max-w-[calc(100vw-2rem)] overflow-y-auto p-1.5"><Button variant="ghost" className="h-11 w-full justify-start text-xs" onClick={() => { setMenu(false); setSummary(true); void controller?.loadSummary(true); }}><FileText aria-hidden="true" />最近 3 小时摘要</Button><Button variant="ghost" className="h-11 w-full justify-start text-xs text-destructive" disabled={Boolean(state.pending)} onClick={() => { setMenu(false); setClear(true); }}><Trash2 aria-hidden="true" />清空全部活动日志</Button><ActivityLinkageDetails state={state} controller={controller} /></PopoverContent>
      </Popover>
      {onBack && <Tooltip><TooltipTrigger render={<PageHeaderAction aria-label="返回桌面" onClick={onBack} />}><X aria-hidden="true" /></TooltipTrigger><TooltipContent>返回桌面</TooltipContent></Tooltip>}
    </>} />
    <PageScrollArea label="活动日志页面内容" topLabel="回到活动日志顶部" className="mt-3 sm:mt-4" contentClassName="space-y-3 pb-2" resetKey={`${queryKey}:${state.device}`}>
      <ActivityPageFeedback state={state} controller={controller} connection={connection} reconnect={reconnect} />
      <PhoneStatusPanel state={state} controller={controller} />
      {state.notice?.error && state.notice.source !== "wifi" && state.notice.source !== "wifi-dialog" && <p role="alert" className="mist-glass-strong rounded-[24px] px-4 py-3 text-xs leading-5 text-muted-strong">{state.notice.text}</p>}
      <ActivityControls state={state} controller={controller} />
      <ActivityTimeline state={state} controller={controller} />
    </PageScrollArea>
    <ActivitySummaryDialog open={summary} state={state} controller={controller} finalFocus={menuTrigger} onClose={() => setSummary(false)} />
    <ActivityClearDialog open={clear} busy={Boolean(state.pending)} finalFocus={menuTrigger} onClose={() => setClear(false)} onConfirm={() => { setClear(false); void controller?.clearAll(); }} />
  </main></TooltipProvider>;
}
