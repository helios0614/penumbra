import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { BellRing, Camera } from "lucide-react";
import { createScheduleRealtime, initialScheduleRealtime, type ScheduleRealtimeState } from "@/application/schedule/schedule-realtime";
import { scheduleTime } from "@/domain/schedule";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const Context = createContext({ ...initialScheduleRealtime, reconnect: () => {} });
export const useScheduleRealtime = () => useContext(Context);

export function ScheduleRuntime({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<ScheduleRealtimeState>(initialScheduleRealtime);
  const [runtime, setRuntime] = useState<ReturnType<typeof createScheduleRealtime> | null>(null);
  useEffect(() => {
    const active = createScheduleRealtime(); setRuntime(active);
    const unsubscribe = active.subscribe(setState);
    return () => { unsubscribe(); active.dispose(); };
  }, []);
  return <Context.Provider value={{ ...state, reconnect: () => runtime?.reconnect() }}>
    {children}
    <ScheduleReminder notice={state.notices[0]} count={state.notices.length} dismiss={() => runtime?.dismissNotice()} />
  </Context.Provider>;
}

export function ScheduleReminder({ notice, count, dismiss }: {
  readonly notice?: ScheduleRealtimeState["notices"][number]; readonly count: number; readonly dismiss: () => void;
}) {
  const monitor = notice?.type === "monitor-alert";
  return <Dialog open={Boolean(notice)} onOpenChange={(open) => { if (!open) dismiss(); }}>
    <DialogContent className="z-[200]" closeButtonProps={{ "aria-label": monitor ? "关闭本条摄像头提醒" : "关闭本条闹钟提醒" }}>
      <DialogHeader><DialogTitle className="flex items-center gap-2">{monitor ? <Camera className="size-5 text-primary-ink" aria-hidden="true" /> : <BellRing className="size-5 text-primary-ink" aria-hidden="true" />}{monitor ? "开始查看摄像头" : "闹钟提醒"}</DialogTitle>
        <DialogDescription>已收到在线触发通知{count > 1 ? ` · 还有 ${count - 1} 条提醒` : ""}。</DialogDescription></DialogHeader>
      <DialogBody><p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{notice?.content || (monitor ? "收到摄像头查看通知" : "闹钟已触发")}</p>
        {notice?.type === "schedule-alarm" && <p className="mt-3 text-xs text-muted-strong">{scheduleTime(notice.triggerAt)} · 服务器本地时间</p>}
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{monitor ? "尚未确认截图或回复结果。" : ""}模型回复请在对话中查看。关闭此提醒仅关闭本地提示。</p></DialogBody>
      <DialogFooter><Button onClick={dismiss}>知道了</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
