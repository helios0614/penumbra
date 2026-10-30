import { useEffect, useState } from "react";
import { createDiaryFeedController, initialDiaryFeedState, type DiaryFeedController } from "@/application/diary-chat/diary-feed-controller";
import type { DiaryReaderController } from "@/application/diary-reader/diary-reader-controller";

export function useDiaryFeed(reader: DiaryReaderController | null) {
  const [state, setState] = useState(initialDiaryFeedState);
  const [controller, setController] = useState<DiaryFeedController | null>(null);
  useEffect(() => {
    if (!reader) return;
    const active = createDiaryFeedController(() => reader.reloadCalendar());
    setController(active); setState(active.getState());
    const unsubscribe = active.subscribe(setState);
    return () => { unsubscribe(); active.dispose(); };
  }, [reader]);
  return { state, controller };
}
