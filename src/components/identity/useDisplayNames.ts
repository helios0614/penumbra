import { useEffect, useState } from "react";
import { DEFAULT_DISPLAY_NAMES, getDisplayNames } from "@/domain/worldbook/worldbook-client";

export function useDisplayNames(enabled = true) {
  const [names, setNames] = useState<Awaited<ReturnType<typeof getDisplayNames>>>(DEFAULT_DISPLAY_NAMES);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void getDisplayNames(controller.signal).then(names => {
      if (!controller.signal.aborted) setNames(names);
    }).catch(() => {
      // Display names must not block the page if the worldbook is unavailable.
    });
    return () => controller.abort();
  }, [enabled]);

  return names;
}
