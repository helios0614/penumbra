import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { QuickNote } from "@/domain/quick-note";
import type { QuickNoteController } from "@/application/quick-note/quick-note-controller";
import type { QuickNoteState } from "@/application/quick-note/quick-note-state";
import { createQuickNoteNavigation, hasQuickNoteDraft } from "./quick-note-navigation";

export function useQuickNoteNavigation(state: QuickNoteState, controller: QuickNoteController | null) {
  const [reader, setReader] = useState<QuickNote | null>(null);
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);
  const overviewRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<{ scrollTop: number; noteId: string } | null>(null);
  const navigation = useRef<ReturnType<typeof createQuickNoteNavigation> | null>(null);
  const latest = useRef({ state, controller });
  latest.current = { state, controller };

  useEffect(() => {
    const active = createQuickNoteNavigation(window, {
      getState: () => latest.current.controller?.getState() ?? latest.current.state,
      onReader: (note) => { latest.current.controller?.clearNotice(); setReader(note); },
      confirmDiscard: (action) => setDiscardAction(() => action),
      cancelEdit: () => latest.current.controller?.cancelEdit(),
      restoreOverview: (scrollTop, noteId) => { restoreRef.current = { scrollTop, noteId }; },
    });
    navigation.current = active;
    return () => { active.dispose(); navigation.current = null; };
  }, []);

  useEffect(() => {
    const preventUnload = (event: BeforeUnloadEvent) => {
      if (!hasQuickNoteDraft(latest.current.controller?.getState() ?? latest.current.state)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, []);

  useLayoutEffect(() => {
    if (reader) {
      readerRef.current?.focus({ preventScroll: true });
    } else if (restoreRef.current && overviewRef.current) {
      const { scrollTop, noteId } = restoreRef.current;
      overviewRef.current.scrollTop = scrollTop;
      // Compare dataset values rather than interpolating backend IDs in selectors.
      Array.from(overviewRef.current.querySelectorAll<HTMLElement>("[data-quick-note-open]"))
        .find((element) => element.dataset.quickNoteOpen === noteId)?.focus({ preventScroll: true });
      restoreRef.current = null;
    }
  }, [reader]);

  useLayoutEffect(() => {
    if (!reader && overviewRef.current) overviewRef.current.scrollTop = 0;
  }, [state.date, state.page]);

  return {
    reader, overviewRef, readerRef, discardAction,
    open: (note: QuickNote) => navigation.current?.open(note, overviewRef.current?.scrollTop ?? 0),
    back: () => navigation.current?.back(),
    exit: (action: () => void) => navigation.current?.exit(action),
    cancelDiscard: () => setDiscardAction(null),
    confirmDiscard: () => { setDiscardAction(null); discardAction?.(); },
  };
}
