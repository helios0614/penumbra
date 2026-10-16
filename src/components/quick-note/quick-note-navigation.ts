import { normalizeOutput, type QuickNote } from "@/domain/quick-note";
import type { QuickNoteState } from "@/application/quick-note/quick-note-state";

interface ReadingEntry {
  readonly session: string;
  readonly id: string | null;
  readonly date: string;
  readonly page: number;
}

export interface QuickNoteNavigationHost {
  readonly history: Pick<History, "state" | "pushState" | "replaceState" | "back">;
  readonly location: Pick<Location, "pathname" | "href">;
  addEventListener(type: "popstate", listener: () => void): void;
  removeEventListener(type: "popstate", listener: () => void): void;
}

export function hasQuickNoteDraft(state: QuickNoteState): boolean {
  return Boolean(state.editor && (state.editor.uncertain || state.editor.draft !== normalizeOutput(state.editor.baseline.output)));
}

// A single, feature-local history layer. The data controller stays mounted and
// owns the date/page; only a reader opened from that exact overview can return.
export function createQuickNoteNavigation(host: QuickNoteNavigationHost, options: {
  readonly getState: () => QuickNoteState;
  readonly onReader: (note: QuickNote | null) => void;
  readonly confirmDiscard: (proceed: () => void) => void;
  readonly cancelEdit: () => void;
  readonly restoreOverview: (scrollTop: number, noteId: string) => void;
}) {
  const session = `quick-note-${Math.random().toString(36).slice(2)}`;
  const pathname = host.location.pathname;
  const notes = new Map<string, QuickNote>();
  let reader: QuickNote | null = null;
  let origin = { date: "", page: 1, scrollTop: 0, noteId: "" };
  let afterReturn: (() => void) | null = null;
  let returning = false;
  const entry = (id: string | null): ReadingEntry => ({ session, id, date: origin.date, page: origin.page });
  const historyState = (id: string | null) => ({ ...host.history.state, quickNoteReading: entry(id) });

  function guard(proceed: () => void) {
    const state = options.getState();
    // A save/verification must settle before leaving its editor.
    if (state.editor && state.pending) return;
    if (hasQuickNoteDraft(state)) options.confirmDiscard(() => {
      if (options.getState().pending) return;
      options.cancelEdit();
      proceed();
    });
    else { options.cancelEdit(); proceed(); }
  }

  function showOverview() {
    reader = null;
    returning = false;
    options.onReader(null);
    const current = options.getState();
    options.restoreOverview(current.date === origin.date && current.page === origin.page ? origin.scrollTop : 0, origin.noteId);
    const action = afterReturn;
    afterReturn = null;
    action?.();
  }

  function back() {
    if (!reader || returning) return;
    returning = true;
    host.history.back();
  }

  function onPopState() {
    const target = host.history.state?.quickNoteReading as ReadingEntry | undefined;
    const current = options.getState();
    if (reader && target?.session === session && !target.id) {
      if (current.editor && (hasQuickNoteDraft(current) || current.pending)) {
        // Recreate the consumed reader entry before asking. This truncates its
        // forward copy instead of accumulating history or racing history.go().
        host.history.pushState(historyState(reader.id), "", host.location.href);
        returning = false;
        guard(back);
      } else { options.cancelEdit(); showOverview(); }
      return;
    }
    if (target?.session === session && target.id && host.location.pathname === pathname) {
      const note = notes.get(target.id);
      if (note && target.date === current.date && target.page === current.page) {
        reader = note;
        options.onReader(note);
      } else {
        // Skip obsolete forward entries instead of adding an empty back stop.
        host.history.back();
      }
    }
  }

  host.addEventListener("popstate", onPopState);
  return {
    open(note: QuickNote, scrollTop: number) {
      if (reader || options.getState().editor) return;
      const state = options.getState();
      origin = { date: state.date, page: state.page, scrollTop, noteId: note.id };
      notes.clear();
      notes.set(note.id, note);
      host.history.replaceState(historyState(null), "", host.location.href);
      host.history.pushState(historyState(note.id), "", host.location.href);
      reader = note;
      options.onReader(note);
    },
    back: () => guard(back),
    exit(action: () => void) {
      guard(() => {
        if (reader) { afterReturn = action; back(); }
        else action();
      });
    },
    dispose() { host.removeEventListener("popstate", onPopState); },
  };
}
