import { readScheduleCamera } from "@/domain/schedule/schedule-camera";
import { scheduleFailure } from "./schedule-controller";

export interface ScheduleCameraState {
  readonly running: boolean | null;
  readonly loading: boolean;
  readonly error: string | null;
}
export const initialScheduleCamera: ScheduleCameraState = { running: null, loading: false, error: null };

/** Read-only, scoped to the open create dialog. Never opens or captures a camera. */
export function createScheduleCamera(read = readScheduleCamera) {
  let state = initialScheduleCamera, disposed = false, request: AbortController | null = null;
  const listeners = new Set<(value: ScheduleCameraState) => void>();
  const publish = (change: Partial<ScheduleCameraState>) => {
    if (!disposed) { state = { ...state, ...change }; listeners.forEach((listener) => listener(state)); }
  };
  return {
    getState: () => state,
    subscribe(listener: (value: ScheduleCameraState) => void) { listeners.add(listener); listener(state); return () => { listeners.delete(listener); }; },
    async refresh() {
      if (disposed) return;
      request?.abort(); const abort = new AbortController(); request = abort;
      publish({ running: null, loading: true, error: null });
      try {
        const running = await read({ signal: abort.signal });
        if (!abort.signal.aborted) publish({ running });
      } catch (error) {
        if (!abort.signal.aborted) publish({ running: null, error: scheduleFailure(error) });
      } finally {
        if (request === abort) { request = null; publish({ loading: false }); }
      }
    },
    dispose() { disposed = true; request?.abort(); listeners.clear(); },
  };
}
