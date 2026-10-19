import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { BellRing } from "lucide-react";
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
    <AlarmReminder alarm={state.alarms[0]} count={state.alarms.length} dismiss={() => runtime?.dismissAlarm()} />
  </Context.Provider>;
}

export function AlarmReminder({ alarm, count, dismiss }: {
  readonly alarm?: ScheduleRealtimeState["alarms"][number]; readonly count: number; readonly dismiss: () => void;
}) {
  return <Dialog open={Boolean(alarm)} onOpenChange={(open) => { if (!open) dismiss(); }}>
    <DialogContent className="z-[200]" closeButtonProps={{ "aria-label": "关闭本条闹钟提醒" }}>
      <DialogHeader><DialogTitle className="flex items-center gap-2"><BellRing className="size-5 text-primary-ink" aria-hidden="true" />闹钟提醒</DialogTitle>
        <DialogDescription>已收到在线触发通知{count > 1 ? ` · 还有 ${count - 1} 条提醒` : ""}。</DialogDescription></DialogHeader>
      <DialogBody><p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{alarm?.content || "闹钟已触发"}</p>
        <p className="mt-3 text-xs text-muted-strong">{alarm ? scheduleTime(alarm.triggerAt) : ""} · 服务器本地时间</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">模型回复请在对话中查看。关闭此提醒仅关闭本地提示。</p></DialogBody>
      <DialogFooter><Button onClick={dismiss}>知道了</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
