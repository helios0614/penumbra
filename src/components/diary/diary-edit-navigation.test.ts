import { describe, expect, it, vi } from "vitest";
import type { DiaryState } from "@/application/diary-reader/diary-reader-state";
import { initialDiaryState } from "@/application/diary-reader/diary-reader-state";
import { diaryDraft } from "@/application/diary-reader/diary-actions-state";
import { createDiaryEditNavigation, type DiaryEditHost } from "./diary-edit-navigation";

function session(path = "/app/diary", delayedBack = false) {
  const entry = { id: "entry", date: "2026-10-09", title: "日记", content: "已保存", tags: [], keywords: [], importance: 0.6 };
  let state: DiaryState = initialDiaryState(entry.date), confirm: (() => void) | null = null;
  const locations = [{ path: "/", state: {} }, { path, state: { app: "diary" } }]; let index = 1;
  let listener: ((event: PopStateEvent) => void) | null = null;
  const backQueue: (() => void)[] = [];
  const stop = vi.fn(), confirmPrompt = vi.fn((action: () => void) => { confirm = action; }), outer = vi.fn();
  const host: DiaryEditHost = {
    location: { get pathname() { return locations[index].path; }, get href() { return `https://penumbra.test${locations[index].path}`; } },
    history: {
      get state() { return locations[index].state; },
      pushState(next, _unused, url) { locations.splice(index + 1); locations.push({ state: next, path: url ? new URL(String(url), host.location.href).pathname : host.location.pathname }); index++; },
      replaceState(next) { locations[index].state = next; },
      back() {
        const move = () => { if (index === 0) return; index--; const stopped = vi.fn(() => stop()); listener?.({ stopImmediatePropagation: stopped } as unknown as PopStateEvent); if (!stopped.mock.calls.length) outer(); };
        if (delayedBack) backQueue.push(move); else move();
      },
    },
    addEventListener(_type, next, capture) { expect(capture).toBe(true); listener = next; },
    removeEventListener(_type, next, capture) { expect(capture).toBe(true); if (listener === next) listener = null; },
  };
  const cancelEdit = vi.fn(() => { state = { ...state, editor: null }; });
  const navigation = createDiaryEditNavigation(host, { getState: () => state, cancelEdit, confirm: confirmPrompt });
  function begin(dirty = false) {
    state = { ...state, editor: { baseline: entry, draft: { ...diaryDraft(entry), content: dirty ? "草稿" : entry.content }, submitted: null, busy: null, uncertain: false, conflict: false, error: null } }; navigation.sync();
  }
  return { host, navigation, begin, stop, outer, cancelEdit, confirmPrompt, confirm: () => confirm?.(), flushBack: () => backQueue.shift()?.(), getState: () => state, patch: (patch: Partial<NonNullable<DiaryState["editor"]>>) => { state = { ...state, editor: { ...state.editor!, ...patch } }; }, index: () => index };
}

describe("Diary editing navigation guard", () => {
  it.each(["/app/diary", "/editorial/app/diary"])("keeps the same route and returns unchanged editing directly to Reader: %s", (path) => {
    const s = session(path); s.begin(); expect(s.host.location.pathname).toBe(path); expect(s.index()).toBe(2);
    s.navigation.cancel(); expect(s.getState().editor).toBeNull(); expect(s.index()).toBe(1); expect(s.host.location.pathname).toBe(path); expect(s.confirmPrompt).not.toHaveBeenCalled(); s.navigation.dispose();
  });
  it("requires AlertDialog confirmation before abandoning a dirty editor", () => {
    const s = session(); s.begin(true); s.navigation.cancel(); expect(s.getState().editor?.draft.content).toBe("草稿"); expect(s.cancelEdit).not.toHaveBeenCalled();
    s.confirm(); expect(s.getState().editor).toBeNull(); expect(s.index()).toBe(1); s.navigation.dispose();
  });
  it("consumes native Back from an unchanged editor as a return to reading", () => {
    const s = session(); s.begin(); s.host.history.back(); expect(s.getState().editor).toBeNull(); expect(s.index()).toBe(1); expect(s.host.location.pathname).toBe("/app/diary"); s.navigation.dispose();
  });
  it("captures browser Back before either desktop shell can unmount the dirty draft", () => {
    const s = session(); s.begin(true); s.host.history.back(); expect(s.stop).toHaveBeenCalledOnce(); expect(s.outer).not.toHaveBeenCalled();
    expect(s.index()).toBe(2); expect(s.getState().editor?.draft.content).toBe("草稿");
    s.confirm(); expect(s.index()).toBe(1); expect(s.getState().editor).toBeNull(); s.navigation.dispose();
  });
  it("consumes the editing history layer before invoking the existing desktop close", () => {
    const s = session(); s.begin(true); const exit = vi.fn(() => s.host.history.back()); s.navigation.exit(exit); expect(exit).not.toHaveBeenCalled();
    s.confirm(); expect(exit).toHaveBeenCalledOnce(); expect(s.index()).toBe(0); expect(s.host.location.pathname).toBe("/"); s.navigation.dispose();
  });
  it("protects in-flight and uncertain saves, including a visually unchanged draft", () => {
    const s = session(); s.begin(); s.patch({ busy: "save" }); s.navigation.cancel(); s.host.history.back(); expect(s.getState().editor).not.toBeNull(); expect(s.confirmPrompt).not.toHaveBeenCalled();
    s.patch({ busy: null, uncertain: true }); s.navigation.cancel(); expect(s.confirmPrompt).toHaveBeenCalledOnce(); s.navigation.dispose();
  });
  it("removes the editing layer after a verified save without changing the app route", () => {
    const s = session(); s.begin(true); s.cancelEdit(); s.navigation.sync(); expect(s.index()).toBe(1); expect(s.host.location.pathname).toBe("/app/diary"); s.navigation.dispose();
  });
  it("protects a new draft opened before the previous editor's asynchronous Back completes", () => {
    const s = session("/app/diary", true); s.begin(true); s.cancelEdit(); s.navigation.sync();
    s.begin(true); s.flushBack(); expect(s.getState().editor?.draft.content).toBe("草稿"); expect(s.index()).toBe(2);
    s.outer.mockClear(); s.host.history.back(); s.flushBack(); expect(s.confirmPrompt).toHaveBeenCalledOnce(); expect(s.outer).not.toHaveBeenCalled();
    s.confirm(); s.flushBack(); expect(s.getState().editor).toBeNull(); expect(s.index()).toBe(1); s.navigation.dispose();
  });
});
