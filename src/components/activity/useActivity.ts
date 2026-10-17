import { useEffect, useState } from "react";
import { createActivityController, type ActivityController } from "@/application/activity/activity-controller";
import { INITIAL_ACTIVITY_STATE } from "@/application/activity/activity-state";
import { createActivityRealtime, type ActivityConnectionState } from "@/application/activity/activity-realtime";

export function useActivity() {
  const [state, setState] = useState(INITIAL_ACTIVITY_STATE);
  const [controller, setController] = useState<ActivityController | null>(null);
  const [connection, setConnection] = useState<ActivityConnectionState>("connecting");
  const [reconnect, setReconnect] = useState<(() => void) | null>(null);
  useEffect(() => {
    const active = createActivityController();
    setController(active);
    const unsubscribe = active.subscribe(setState);
    const refreshRecent = () => { if (active.getState().query.kind === "recent") void active.loadLogs(); };
    const restored = () => {
      if (active.getState().query.kind === "recent") active.invalidateLogs();
      else void active.loadLogs();
      void active.loadDates(); void active.refreshPhone(); void active.loadLegacy();
    };
    const sync = createActivityRealtime({ invalidateLogs: active.invalidateLogs, refreshRecent,
      refreshPhone: () => void active.refreshPhone(), refreshConfig: () => void active.loadLegacy(), restored }, setConnection);
    setReconnect(() => sync.reconnect);
    void active.start();
    return () => { sync.dispose(); unsubscribe(); active.dispose(); };
  }, []);
  return { state, controller, connection, reconnect: () => reconnect?.() };
}
