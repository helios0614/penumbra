import { useEffect, useState } from "react";
import { createScheduleCamera, initialScheduleCamera, type ScheduleCameraState } from "@/application/schedule/schedule-camera";
import { cameraSettingsUrl } from "@/domain/schedule/schedule-camera";
import { Button } from "@/components/ui/button";

export function ScheduleCameraStatus({ open }: { readonly open: boolean }) {
  const [state, setState] = useState(initialScheduleCamera);
  const [controller, setController] = useState<ReturnType<typeof createScheduleCamera> | null>(null);
  useEffect(() => {
    if (!open) return;
    const active = createScheduleCamera(); setController(active);
    const unsubscribe = active.subscribe(setState);
    void active.refresh();
    const visible = () => { if (!document.hidden) void active.refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { unsubscribe(); active.dispose(); document.removeEventListener("visibilitychange", visible); };
  }, [open]);
  return <ScheduleCameraInfo state={state} refresh={() => void controller?.refresh()} />;
}

export function ScheduleCameraInfo({ state, refresh }: { readonly state: ScheduleCameraState; readonly refresh: () => void }) {
  return <div className="text-xs leading-5 text-muted-foreground" data-schedule-camera="true">
    <div className="flex flex-wrap items-center gap-x-2">
      <p role="status">{state.loading ? "正在读取摄像头状态…" : state.running === true ? "摄像头当前正在运行" : state.running === false ? "摄像头当前未运行" : "摄像头状态暂时未知"}</p>
      <Button type="button" variant="ghost" size="compact" disabled={state.loading} onClick={refresh}>刷新状态</Button>
      <a className="inline-flex min-h-11 items-center rounded text-primary-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring" href={cameraSettingsUrl} target="_blank" rel="noopener noreferrer">摄像头设置（旧版）</a>
    </div>
    {state.error && <p role="alert" className="text-destructive">{state.error}</p>}
    <p>创建不会开启摄像头；执行时仍需摄像头正在运行。</p>
  </div>;
}
