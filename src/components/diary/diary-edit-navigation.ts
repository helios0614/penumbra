import { hasDiaryEdits } from "@/application/diary-reader/diary-actions-state";
import type { DiaryState } from "@/application/diary-reader/diary-reader-state";

export interface DiaryEditHost {
  readonly history: Pick<History, "state" | "pushState" | "back" | "replaceState">;
  readonly location: Pick<Location, "href" | "pathname">;
  addEventListener(type: "popstate", listener: (event: PopStateEvent) => void, capture: boolean): void;
  removeEventListener(type: "popstate", listener: (event: PopStateEvent) => void, capture: boolean): void;
}
/** Same-URL editing entry only; the accepted calendar/reader navigation is untouched. */
export function createDiaryEditNavigation(host: DiaryEditHost, options: {
  getState: () => DiaryState; cancelEdit: () => void; confirm: (proceed: () => void) => void;
}) {
  const session = `diary-edit-${Math.random().toString(36).slice(2)}`, pathname = host.location.pathname, href = host.location.href;
  let origin: unknown = host.history.state;
  let active = false, returning = false, after: (() => void) | null = null;
  const push = () => host.history.pushState({ ...(origin as Record<string, unknown>), diaryEditing: session }, "", href);
  function finish(action?: () => void) {
    options.cancelEdit();
    if (active && host.history.state?.diaryEditing === session) { after = action ?? null; returning = true; host.history.back(); }
    else { active = false; action?.(); }
  }
  function guard(action?: () => void) {
    const state = options.getState();
    if (state.editor?.busy || returning) return;
    if (hasDiaryEdits(state.editor)) options.confirm(() => { if (!options.getState().editor?.busy) finish(action); });
    else finish(action);
  }
  function pop(event: PopStateEvent) {
    if (!active) return;
    if (returning) {
      active = false; returning = false;
      const action = after; after = null;
      // history.back() is asynchronous: a new editor may already have opened.
      if (options.getState().editor) { active = true; origin = host.history.state; push(); if (action) guard(action); }
      else action?.();
      return;
    }
    if (host.history.state?.diaryEditing !== session && options.getState().editor) {
      // Capture before either desktop shell consumes this Back and unmounts Diary.
      event.stopImmediatePropagation();
      push(); guard();
    }
  }
  host.addEventListener("popstate", pop, true);
  return {
    sync() {
      if (options.getState().editor && !active) { active = true; origin = host.history.state; push(); }
      else if (!options.getState().editor && active && !returning) finish();
    },
    cancel: () => guard(),
    exit(action: () => void) { if (options.getState().editor) guard(action); else action(); },
    dispose() {
      host.removeEventListener("popstate", pop, true);
      if (host.location.pathname === pathname && host.history.state?.diaryEditing === session) {
        const { diaryEditing: _marker, ...rest } = host.history.state;
        host.history.replaceState(rest, "", host.location.href);
      }
    },
  };
}
