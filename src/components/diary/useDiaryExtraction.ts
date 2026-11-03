import { useEffect, useRef, useState } from "react";
import type { ArchivedDiary } from "@/domain/diary";
import { createDiaryExtractionController, initialDiaryExtraction, type DiaryExtractionController } from "@/application/diary-chat/diary-extraction-controller";

export function useDiaryExtraction(onSaved?: (entry: ArchivedDiary) => void) {
  const saved = useRef(onSaved);
  saved.current = onSaved;
  const [state, setState] = useState(initialDiaryExtraction);
  const [controller, setController] = useState<DiaryExtractionController | null>(null);
  useEffect(() => {
    const active = createDiaryExtractionController(entry => saved.current?.(entry));
    setController(active); setState(active.getState());
    const unsubscribe = active.subscribe(setState);
    return () => { unsubscribe(); active.dispose(); };
  }, []);
  return { state, controller };
}
