import { useCallback, useEffect, useRef, useState } from "react";

import {
  createSettingsOverviewController,
  INITIAL_SETTINGS_OVERVIEW_STATE,
  type SettingsOverviewController,
  type SettingsOverviewState,
} from "@/components/settings/settings-overview-controller";

export interface UseSettingsOverviewResult {
  readonly state: SettingsOverviewState;
  readonly retry: () => void;
}

export function useSettingsOverview(): UseSettingsOverviewResult {
  const [state, setState] = useState<SettingsOverviewState>(
    INITIAL_SETTINGS_OVERVIEW_STATE,
  );
  const controllerRef = useRef<SettingsOverviewController | null>(null);

  useEffect(() => {
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
  }, []);

  const retry = useCallback(() => {
    void controllerRef.current?.load();
  }, []);

  return { state, retry };
}
