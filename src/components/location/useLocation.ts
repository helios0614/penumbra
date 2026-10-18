import { useEffect, useState } from "react";
import { createLocationController } from "@/application/location/location-controller";
import { INITIAL_LOCATION_STATE } from "@/application/location/location-state";
import { createLocationRealtime, type LocationConnectionState } from "@/application/location/location-realtime";

export function useLocation() {
  const [state, setState] = useState(INITIAL_LOCATION_STATE);
  const [controller, setController] = useState<ReturnType<typeof createLocationController> | null>(null);
  const [connection, setConnection] = useState<LocationConnectionState>("connecting");
  const [reconnect, setReconnect] = useState<(() => void) | null>(null);
  useEffect(() => {
    const active = createLocationController();
    setController(active);
    const unsubscribe = active.subscribe(setState);
    const sync = createLocationRealtime((reportedAt) => void active.refresh(true, reportedAt), active.hideKey, setConnection);
    const hide = () => active.hideKey();
    window.addEventListener("pagehide", hide);
    setReconnect(() => sync.reconnect);
    void active.refresh(false);
    return () => { sync.dispose(); unsubscribe(); active.dispose(); window.removeEventListener("pagehide", hide); };
  }, []);
  return { state, controller, connection, reconnect: () => reconnect?.() };
}
