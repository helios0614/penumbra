import { useEffect, useState } from "react";
import { createScheduleController, initialScheduleState, type ScheduleController } from "@/application/schedule/schedule-controller";
import type { ManagedScheduleKind } from "@/domain/schedule";
import { useScheduleRealtime } from "./ScheduleRuntime";

export function useSchedules(kind: ManagedScheduleKind) {
  const [state, setState] = useState(initialScheduleState);
  const [controller, setController] = useState<ScheduleController | null>(null);
  const realtime = useScheduleRealtime();
  useEffect(() => {
    const active = createScheduleController(kind); setController(active);
    const unsubscribe = active.subscribe(setState);
    void active.refresh();
    return () => { unsubscribe(); active.dispose(); };
  }, [kind]);
  useEffect(() => { if (controller) void controller.refresh(); }, [controller, realtime.revision]);
  return { state, controller, realtime };
}
