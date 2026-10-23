import { useEffect, useState } from "react";
import { createDiaryReaderController, type DiaryReaderController } from "@/application/diary-reader/diary-reader-controller";
import { initialDiaryState } from "@/application/diary-reader/diary-reader-state";
import { localDiaryDate } from "@/domain/diary";

export function useDiary() {
  const [state, setState] = useState(initialDiaryState);
  const [controller, setController] = useState<DiaryReaderController | null>(null);
  const [today, setToday] = useState(localDiaryDate);
  useEffect(() => {
    const active = createDiaryReaderController();
    setController(active);
    setState(active.getState());
    const unsubscribe = active.subscribe(setState);
    void active.load();
    void active.loadAutoFeed();
    const timer = window.setInterval(() => setToday(localDiaryDate()), 60_000);
    return () => { window.clearInterval(timer); unsubscribe(); active.dispose(); };
  }, []);
  return { state, controller, today };
}
