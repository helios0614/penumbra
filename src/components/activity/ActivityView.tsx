import { useRef, useState, useEffect } from "react";
import { ArrowUp, FileText, MoreHorizontal, RefreshCw, Trash2, X } from "lucide-react";
import { PageHeader, PageHeaderAction } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PhoneStatusPanel } from "./PhoneStatusPanel";
import { ActivityControls } from "./ActivityControls";
import { ActivityTimeline } from "./ActivityTimeline";
import { ActivityClearDialog, ActivitySummaryDialog } from "./ActivityDialogs";
import { useActivity } from "./useActivity";
import { scrollActivityToTop, showActivityTopButton } from "./activity-scroll";
import "./activity.css";

export function ActivityView({ onBack }: { readonly onBack?: () => void }) {
  const { state, controller, connection, reconnect } = useActivity();
  const [menu, setMenu] = useState(false), [summary, setSummary] = useState(false), [clear, setClear] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const queryKey = JSON.stringify(state.query);
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = 0; setShowTop(false); }, [queryKey, state.device]);
  return <TooltipProvider><main className="mx-auto flex h-full max-h-dvh min-h-0 w-full max-w-5xl flex-col overflow-hidden px-4 pb-4 pt-5 sm:px-0 sm:pb-8 sm:pt-8" aria-labelledby="activity-page-title">
    <PageHeader eyebrow="ACTIVITY LOG" title="活动日志" titleId="activity-page-title" description="设备上的点滴活动，构成一天的轨迹。" actions={<>
      <Tooltip><TooltipTrigger render={<PageHeaderAction aria-label="刷新活动数据" disabled={state.logs.loading || Boolean(state.pending)} onClick={() => void controller?.refresh()} />}><RefreshCw aria-hidden="true" /></TooltipTrigger><TooltipContent>刷新活动数据</TooltipContent></Tooltip>
      <Popover open={menu} onOpenChange={setMenu}><Tooltip><TooltipTrigger render={<PopoverTrigger render={<PageHeaderAction aria-label="更多活动日志操作" />} />}><MoreHorizontal aria-hidden="true" /></TooltipTrigger><TooltipContent>更多操作</TooltipContent></Tooltip>
        <PopoverContent align="end" className="w-48 p-1.5"><Button variant="ghost" className="h-11 w-full justify-start text-xs" onClick={() => { setMenu(false); setSummary(true); void controller?.loadSummary(true); }}><FileText aria-hidden="true" />最近 3 小时摘要</Button><Button variant="ghost" className="h-11 w-full justify-start text-xs text-destructive" disabled={Boolean(state.pending)} onClick={() => { setMenu(false); setClear(true); }}><Trash2 aria-hidden="true" />清空全部活动日志</Button></PopoverContent>
      </Popover>
      {onBack && <Tooltip><TooltipTrigger render={<PageHeaderAction aria-label="返回桌面" onClick={onBack} />}><X aria-hidden="true" /></TooltipTrigger><TooltipContent>返回桌面</TooltipContent></Tooltip>}
    </>} />
    <div className="relative mt-3 min-h-0 flex-1 sm:mt-4">
    <div ref={scroll} role="region" tabIndex={0} className={`h-full space-y-3 overflow-y-auto overscroll-contain focus:outline-none ${showTop ? "pb-16" : "pb-2"}`} aria-label="活动日志页面内容" onScroll={(event) => setShowTop(showActivityTopButton(event.currentTarget.scrollTop, event.currentTarget.clientHeight))}>
      <PhoneStatusPanel state={state} controller={controller} />
      {state.notice && <p role={state.notice.error ? "alert" : "status"} className={`mist-glass rounded-2xl px-4 py-3 text-xs leading-5 ${state.notice.error ? "text-destructive" : "text-muted-strong"}`}>{state.notice.text}</p>}
      <ActivityControls state={state} controller={controller} />
      {(connection === "blocked" || connection === "reconnecting") && <div role="status" className="flex items-center justify-between gap-2 px-1 text-xs text-warning">
        <p>{connection === "blocked" ? "实时连接受限，请检查登录状态。" : "实时连接中断，正在重连。"}</p>
        <Button variant="ghost" className="h-11 shrink-0 px-2 text-xs" onClick={reconnect}>重新连接</Button>
      </div>}
      {state.legacyEnabled.data === false && <p className="px-1 text-xs leading-5 text-warning">旧版活动联动配置已关闭，相关 AI 动态读取受限；日志和本页规则摘要仍可查看。如需恢复联动，请在旧版设置中单独处理。</p>}
      {state.legacyEnabled.error && <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted-foreground"><p>未能确认旧版活动联动配置。</p><Button variant="ghost" className="h-11 text-xs" onClick={() => void controller?.loadLegacy()}>重新读取配置</Button></div>}
      <ActivityTimeline state={state} controller={controller} />
    </div>
    <ActivityTopButton visible={showTop} onClick={() => scrollActivityToTop(scroll.current, window.matchMedia("(prefers-reduced-motion: reduce)").matches)} />
    </div>
    <ActivitySummaryDialog open={summary} state={state} controller={controller} onClose={() => setSummary(false)} />
    <ActivityClearDialog open={clear} busy={Boolean(state.pending)} onClose={() => setClear(false)} onConfirm={() => { setClear(false); void controller?.clearAll(); }} />
  </main></TooltipProvider>;
}

export function ActivityTopButton({ visible, onClick }: { readonly visible: boolean; readonly onClick: () => void }) {
  if (!visible) return null;
  return <Button variant="ghost" className="mist-glass absolute bottom-3 right-3 size-11 rounded-full text-foreground" aria-label="回到活动日志顶部" title="回到活动日志顶部" onClick={onClick}><ArrowUp aria-hidden="true" /></Button>;
}
