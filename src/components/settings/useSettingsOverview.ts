import type { SettingsOverviewSection } from "@/application/settings-overview";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  createSettingsOverviewController,
  INITIAL_SETTINGS_OVERVIEW_STATE,
  type SettingsOverviewController,
  type SettingsOverviewState,
} from "@/components/settings/settings-overview-controller";

export interface UseSettingsOverviewResult {
  readonly state: SettingsOverviewState;
  readonly retry: (section?: SettingsOverviewSection) => void;
}

export function useSettingsOverview(enabled = true): UseSettingsOverviewResult {
  const [state, setState] = useState<SettingsOverviewState>(
    INITIAL_SETTINGS_OVERVIEW_STATE,
  );
  const controllerRef = useRef<SettingsOverviewController | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = createSettingsOverviewController();
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe(setState);
    void controller.load();

    return () => {
      unsubscribe();
      controller.dispose();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [enabled]);

  const retry = useCallback((section?: SettingsOverviewSection) => {
    void controllerRef.current?.load(section);
  }, []);

  return { state, retry };
}
