import { loadSettingsOverview, type SettingsOverview, type SettingsOverviewSection } from "@/application/settings-overview";
import type { ApiRequestOptions } from "@/lib/api";

export type OverviewItemState<T> =
  | { readonly status: "idle" | "loading"; readonly data: null; readonly error: null }
  | { readonly status: "success"; readonly data: T; readonly error: null }
  | { readonly status: "error"; readonly data: null; readonly error: unknown };

export type SettingsOverviewState = { readonly [K in SettingsOverviewSection]: OverviewItemState<SettingsOverview[K]> };
const idle = { status: "idle", data: null, error: null } as const;
export const INITIAL_SETTINGS_OVERVIEW_STATE: SettingsOverviewState = { session: idle, models: idle, readiness: idle };
export type SettingsOverviewLoader = <K extends SettingsOverviewSection>(section: K, options?: ApiRequestOptions) => Promise<SettingsOverview[K]>;
export interface SettingsOverviewController {
  getState(): SettingsOverviewState;
  load(section?: SettingsOverviewSection): Promise<void>;
  subscribe(listener: (state: SettingsOverviewState) => void): () => void;
  dispose(): void;
}

export function createSettingsOverviewController(loader: SettingsOverviewLoader = loadSettingsOverview): SettingsOverviewController {
  let state = INITIAL_SETTINGS_OVERVIEW_STATE;
  let disposed = false;
  const active: Partial<Record<SettingsOverviewSection, AbortController>> = {};
  const listeners = new Set<(state: SettingsOverviewState) => void>();
  const publish = <K extends SettingsOverviewSection>(section: K, item: OverviewItemState<SettingsOverview[K]>) => {
    if (disposed) return;
    state = { ...state, [section]: item };
    listeners.forEach(listener => listener(state));
  };
  const loadItem = async <K extends SettingsOverviewSection>(section: K) => {
    if (disposed) return;
    active[section]?.abort();
    const controller = new AbortController();
    active[section] = controller;
    publish(section, { status: "loading", data: null, error: null });
    const current = () => !disposed && !controller.signal.aborted && active[section] === controller;
    try {
      const data = await loader(section, { signal: controller.signal });
      if (current()) publish(section, { status: "success", data, error: null });
    } catch (error) {
      if (current()) publish(section, { status: "error", data: null, error });
    } finally {
      if (active[section] === controller) delete active[section];
    }
  };
  return {
    getState: () => state,
    async load(section) {
      if (section) await loadItem(section);
      else await Promise.all((["session", "models", "readiness"] as const).map(loadItem));
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() {
      disposed = true;
      listeners.clear();
      Object.values(active).forEach(controller => controller.abort());
    },
  };
}
