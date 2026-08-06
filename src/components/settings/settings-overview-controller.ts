import {
  loadSettingsOverview,
  type SettingsOverview,
} from "@/application/settings-overview";
import { ApiError, type ApiRequestOptions } from "@/lib/api";

export type SettingsOverviewState =
  | { readonly status: "idle"; readonly data: null; readonly error: null }
  | { readonly status: "loading"; readonly data: null; readonly error: null }
  | { readonly status: "success"; readonly data: SettingsOverview; readonly error: null }
  | { readonly status: "error"; readonly data: null; readonly error: unknown };

export const INITIAL_SETTINGS_OVERVIEW_STATE: SettingsOverviewState = {
  status: "idle",
  data: null,
  error: null,
};

export type SettingsOverviewLoader = (
  options?: ApiRequestOptions,
) => Promise<SettingsOverview>;

export interface SettingsOverviewController {
  getState(): SettingsOverviewState;
  load(): Promise<void>;
  subscribe(listener: (state: SettingsOverviewState) => void): () => void;
  dispose(): void;
}

export function createSettingsOverviewController(
  loader: SettingsOverviewLoader = loadSettingsOverview,
): SettingsOverviewController {
  let state = INITIAL_SETTINGS_OVERVIEW_STATE;
  let activeController: AbortController | null = null;
  let requestSequence = 0;
  let disposed = false;
  const listeners = new Set<(state: SettingsOverviewState) => void>();

  const publish = (nextState: SettingsOverviewState) => {
    if (disposed) return;
    state = nextState;
    listeners.forEach((listener) => listener(state));
  };

  return {
    getState() {
      return state;
    },

    async load() {
      if (disposed) return;

      const sequence = ++requestSequence;
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      publish({ status: "loading", data: null, error: null });

      try {
        const data = await loader({ signal: controller.signal });
        if (disposed || controller.signal.aborted || sequence !== requestSequence) {
          return;
        }
        publish({ status: "success", data, error: null });
      } catch (error) {
        if (
          disposed ||
          controller.signal.aborted ||
          sequence !== requestSequence ||
          isAbortError(error)
        ) {
          return;
        }
        publish({ status: "error", data: null, error });
      } finally {
        if (sequence === requestSequence) {
          activeController = null;
        }
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      requestSequence += 1;
      listeners.clear();
      activeController?.abort();
      activeController = null;
    },
  };
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof ApiError && error.code === "ABORTED") ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}
