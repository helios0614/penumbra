import { useEffect, useState } from "react";
import { createQuickNoteController, type QuickNoteController } from "@/application/quick-note/quick-note-controller";
import { INITIAL_QUICK_NOTE_STATE } from "@/application/quick-note/quick-note-state";
import { createQuickNoteLogSubscription, INITIAL_LOG_STATE } from "@/application/quick-note/quick-note-logs";

export function useQuickNotes() {
  const [state, setState] = useState(INITIAL_QUICK_NOTE_STATE);
  const [controller, setController] = useState<QuickNoteController | null>(null);
  useEffect(() => {
    const active = createQuickNoteController();
    setController(active);
    const unsubscribe = active.subscribe(setState);
    void active.loadConfig();
    return () => { unsubscribe(); active.dispose(); };
  }, []);
  return { state, controller };
}

export function useQuickNoteLogs() {
  const [state, setState] = useState(INITIAL_LOG_STATE);
  const [subscription, setSubscription] = useState<ReturnType<typeof createQuickNoteLogSubscription> | null>(null);
  useEffect(() => {
    const active = createQuickNoteLogSubscription(setState);
    setSubscription(active);
    return () => active.dispose();
  }, []);
  return { state, reconnect: () => subscription?.reconnect() };
}
