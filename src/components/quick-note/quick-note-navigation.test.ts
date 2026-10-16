import { describe, expect, it, vi } from "vitest";
import { normalizeOutput, type QuickNote } from "@/domain/quick-note";
import { INITIAL_QUICK_NOTE_STATE, type QuickNoteState } from "@/application/quick-note/quick-note-state";
import { createQuickNoteNavigation, hasQuickNoteDraft, type QuickNoteNavigationHost } from "./quick-note-navigation";

const note: QuickNote = { id: "qn_1", periodStart: 1, periodEnd: 2, periodLabel: "历史时段", summary: "", output: "保存的<br>正文", createdAt: 3 };

// An in-memory History API model; no browser, DOM automation, or visual checks.
function historyHost() {
  const entries = [{ state: {}, url: "https://penumbra.test/" }, { state: { penumbraApp: "quick-notes" }, url: "https://penumbra.test/app/quick-notes" }];
  let index = 1;
  const listeners = new Set<() => void>();
  function go(delta: number) {
    if (index + delta < 0 || index + delta >= entries.length) return;
    index += delta;
    listeners.forEach((listener) => listener());
  }
  const host: QuickNoteNavigationHost = {
    history: {
      get state() { return entries[index].state; },
      pushState(state, _unused, url) {
        entries.splice(index + 1);
        entries.push({ state, url: String(url ?? entries[index].url) });
        ++index;
      },
      replaceState(state, _unused, url) { entries[index] = { state, url: String(url ?? entries[index].url) }; },
      back() { go(-1); },
    },
    location: {
      get pathname() { return new URL(entries[index].url).pathname; },
      get href() { return entries[index].url; },
    },
    addEventListener(_type, listener) { listeners.add(listener); },
    removeEventListener(_type, listener) { listeners.delete(listener); },
  };
  return { host, forward: () => go(1), length: () => entries.length, index: () => index, listeners };
}

function setup() {
  const history = historyHost();
  let state: QuickNoteState = { ...INITIAL_QUICK_NOTE_STATE, date: "2026-10-13", page: 3 };
  const onReader = vi.fn();
  const restoreOverview = vi.fn();
  const confirmations: (() => void)[] = [];
  const cancelEdit = vi.fn(() => { state = { ...state, editor: null }; });
  const navigation = createQuickNoteNavigation(history.host, {
    getState: () => state, onReader, restoreOverview, cancelEdit,
    confirmDiscard: (proceed) => confirmations.push(proceed),
  });
  return {
    ...history, navigation, onReader, restoreOverview, confirmations, cancelEdit,
    getState: () => state,
    update: (patch: Partial<QuickNoteState>) => { state = { ...state, ...patch }; },
    edit: (draft = "未保存的草稿", uncertain = false) => { state = { ...state, editor: { baseline: note, draft, uncertain, conflict: null, error: null } }; },
  };
}

describe("Quick Note overview/reader navigation", () => {
  it("opens one reading layer and returns to the exact date/page/scroll without requesting data", () => {
    const s = setup();
    s.navigation.open(note, 428);
    expect(s.onReader).toHaveBeenLastCalledWith(note);
    expect(s.host.history.state.penumbraApp).toBe("quick-notes");
    expect(s.length()).toBe(3);
    s.navigation.open({ ...note, id: "other" }, 0);
    expect(s.length()).toBe(3);
    s.navigation.back();
    expect(s.onReader).toHaveBeenLastCalledWith(null);
    expect(s.restoreOverview).toHaveBeenLastCalledWith(428, note.id);
    expect(s.getState()).toMatchObject({ date: "2026-10-13", page: 3 });
    expect(s.index()).toBe(1);
    s.navigation.dispose();
  });

  it("uses the same return semantics for browser back/forward and truncates old reader history on reopening", () => {
    const s = setup();
    s.navigation.open(note, 154);
    s.host.history.back();
    expect(s.restoreOverview).toHaveBeenLastCalledWith(154, note.id);
    s.forward();
    expect(s.onReader).toHaveBeenLastCalledWith(note);
    s.navigation.back();
    s.navigation.open({ ...note, id: "other" }, 322);
    expect(s.length()).toBe(3);
    s.navigation.back();
    expect(s.restoreOverview).toHaveBeenLastCalledWith(322, "other");
    s.host.history.back();
    expect(s.host.location.pathname).toBe("/");
  });

  it("preserves the complete draft when return is cancelled and confirms explicit discard", () => {
    const s = setup();
    s.navigation.open(note, 200);
    s.edit("完整草稿\n[HEART:保留]");
    s.navigation.back();
    expect(s.confirmations).toHaveLength(1);
    expect(s.index()).toBe(2);
    expect(s.getState().editor?.draft).toBe("完整草稿\n[HEART:保留]");
    expect(s.restoreOverview).not.toHaveBeenCalled();
    // Cancelling means no continuation; another return still needs confirmation.
    s.navigation.back();
    expect(s.confirmations).toHaveLength(2);
    s.confirmations[1]();
    expect(s.getState().editor).toBeNull();
    expect(s.index()).toBe(1);
    expect(s.restoreOverview).toHaveBeenLastCalledWith(200, note.id);
  });

  it("restores the reader entry before confirming native back without accumulating history", () => {
    const s = setup();
    s.navigation.open(note, 99);
    s.edit();
    s.host.history.back();
    expect(s.index()).toBe(2);
    expect(s.length()).toBe(3);
    expect(s.onReader).toHaveBeenLastCalledWith(note);
    expect(s.getState().editor).not.toBeNull();
    s.host.history.back();
    expect(s.length()).toBe(3);
    s.confirmations[1]();
    expect(s.index()).toBe(1);
    expect(s.onReader).toHaveBeenLastCalledWith(null);
  });

  it("does not abandon a saving editor through page back or native back", () => {
    const s = setup();
    s.navigation.open(note, 99);
    s.edit();
    s.update({ pending: { kind: "save", target: note.id } });
    s.navigation.back();
    expect(s.index()).toBe(2);
    s.host.history.back();
    expect(s.index()).toBe(2);
    expect(s.confirmations).toHaveLength(0);
    expect(s.getState().editor).not.toBeNull();
    s.update({ pending: null });
    s.navigation.back();
    expect(s.confirmations).toHaveLength(1);
  });

  it("also protects uncertain saves when draft text happens to match the baseline", () => {
    const s = setup();
    s.navigation.open(note, 0);
    s.edit(normalizeOutput(note.output), true);
    expect(hasQuickNoteDraft(s.getState())).toBe(true);
    s.host.history.back();
    expect(s.confirmations).toHaveLength(1);
    expect(s.getState().editor?.uncertain).toBe(true);
  });

  it("closes an unchanged editor without discard confirmation", () => {
    const s = setup();
    s.navigation.open(note, 0);
    s.edit(normalizeOutput(note.output));
    expect(hasQuickNoteDraft(s.getState())).toBe(false);
    s.navigation.back();
    expect(s.confirmations).toHaveLength(0);
    expect(s.getState().editor).toBeNull();
    expect(s.index()).toBe(1);
  });

  it("consumes the reader entry before the existing app close handler, including dirty exits", () => {
    const s = setup();
    s.navigation.open(note, 0);
    s.edit();
    const close = vi.fn(() => s.host.history.back());
    s.navigation.exit(close);
    expect(close).not.toHaveBeenCalled();
    s.confirmations[0]();
    expect(close).toHaveBeenCalledOnce();
    expect(s.host.location.pathname).toBe("/");
    expect(s.index()).toBe(0);
  });

  it("does not restore a forward reader from an obsolete date/page", () => {
    const s = setup();
    s.navigation.open(note, 600);
    s.navigation.back();
    s.update({ date: "2026-10-12", page: 1 });
    s.forward();
    expect(s.onReader).toHaveBeenLastCalledWith(null);
    expect(s.getState()).toMatchObject({ date: "2026-10-12", page: 1 });
    expect(s.index()).toBe(1);
    expect(s.restoreOverview).toHaveBeenCalledTimes(1);
  });

  it("cleans up history listeners and leaves host app state intact", () => {
    const s = setup();
    expect(s.listeners.size).toBe(1);
    s.navigation.dispose();
    expect(s.listeners.size).toBe(0);
    expect(s.host.history.state).toEqual({ penumbraApp: "quick-notes" });
  });
});
