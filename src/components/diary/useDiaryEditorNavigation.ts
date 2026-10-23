import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DiaryState } from "@/application/diary-reader/diary-reader-state";
import type { DiaryReaderController } from "@/application/diary-reader/diary-reader-controller";
import { hasDiaryEdits } from "@/application/diary-reader/diary-actions-state";
import { createDiaryEditNavigation } from "./diary-edit-navigation";

export function useDiaryEditorNavigation(state: DiaryState, controller: DiaryReaderController | null) {
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const latest = useRef({ state, controller }); latest.current = { state, controller };
  const navigation = useRef<ReturnType<typeof createDiaryEditNavigation> | null>(null);
  const editorRef = useRef<HTMLElement>(null), editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    const active = createDiaryEditNavigation(window, {
      getState: () => latest.current.controller?.getState() ?? latest.current.state,
      cancelEdit: () => latest.current.controller?.cancelEdit(), confirm: (action) => setDiscard(() => action),
    });
    navigation.current = active; active.sync();
    const unload = (event: BeforeUnloadEvent) => {
      const current = latest.current.controller?.getState() ?? latest.current.state;
      if (current.editor?.busy || hasDiaryEdits(current.editor)) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", unload);
    return () => { active.dispose(); navigation.current = null; window.removeEventListener("beforeunload", unload); };
  }, []);
  useEffect(() => { navigation.current?.sync(); }, [Boolean(state.editor)]);
  useLayoutEffect(() => {
    if (state.editor) editorRef.current?.focus({ preventScroll: true });
    else if (wasEditing.current) editButtonRef.current?.focus({ preventScroll: true });
    wasEditing.current = Boolean(state.editor);
  }, [Boolean(state.editor)]);
  return {
    editorRef, editButtonRef, discard,
    cancel: () => navigation.current?.cancel(), exit: (action: () => void) => navigation.current?.exit(action),
    keep: () => setDiscard(null),
    confirm: () => { setDiscard(null); discard?.(); },
  };
}
