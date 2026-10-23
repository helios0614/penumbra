import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDiaryReaderController } from "@/application/diary-reader/diary-reader-controller";
import { initialDiaryState, type DiaryState } from "@/application/diary-reader/diary-reader-state";
import type { DiaryCalendarItem } from "@/domain/diary";
import { restoreDiaryCalendar } from "./diary-navigation";
import { useDiaryNavigation } from "./useDiaryNavigation";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useRef: vi.fn(actual.useRef), useLayoutEffect: vi.fn(actual.useLayoutEffect) };
});
afterEach(() => vi.restoreAllMocks());

const item: DiaryCalendarItem = { date: "2026-10-09", entryId: "entry", title: null, entryStatus: "done", hasDiaryMessages: true, hasSavedContent: true, calendarState: "archived", invalidReason: null };
const state: DiaryState = { ...initialDiaryState(item.date), calendar: { month: "2026-10", items: [item] } };
const reading: DiaryState = { ...state, reader: { entryId: item.entryId, date: item.date, loading: true, error: null, entry: null } };

function session() {
  const active = createDiaryReaderController(undefined, () => item.date);
  const open = vi.spyOn(active, "openEntry").mockResolvedValue(true), back = vi.spyOn(active, "back");
  const viewport = { scrollTop: 0, scrollHeight: 1200, clientHeight: 400, focus: vi.fn() };
  const reader = { focus: vi.fn() }, button = { isConnected: true, disabled: false, focus: vi.fn() };
  const values: unknown[] = [];
  let cursor = 0, effects: (() => void)[] = [];
  vi.mocked(React.useRef).mockImplementation(((initial: unknown) => {
    const index = cursor++;
    if (!(index in values)) values[index] = { current: initial };
    return values[index];
  }) as typeof React.useRef);
  vi.mocked(React.useLayoutEffect).mockImplementation(((effect: () => void, deps: readonly unknown[]) => {
    const index = cursor++, previous = values[index] as readonly unknown[] | undefined;
    if (!previous || deps.some((value, i) => previous[i] !== value)) { values[index] = deps; effects.push(effect); }
  }) as typeof React.useLayoutEffect);
  const render = (next: DiaryState) => {
    cursor = 0; effects = [];
    const navigation = useDiaryNavigation(next, active);
    navigation.calendarRef.current = viewport as unknown as HTMLDivElement;
    navigation.readerRef.current = reader as unknown as HTMLElement;
    navigation.openButtonRef.current = button as unknown as HTMLButtonElement;
    effects.forEach((effect) => effect());
    return navigation;
  };
  return { render, viewport, reader, button, open, back, active };
}

describe("Diary internal reading navigation", () => {
  it("captures the actual calendar viewport and restores scroll/focus after return", () => {
    const s = session(), navigation = s.render(state);
    s.viewport.scrollTop = 680; navigation.open(item);
    expect(s.open).toHaveBeenCalledWith("entry");
    const readerNavigation = s.render(reading); expect(s.reader.focus).toHaveBeenCalledOnce();
    s.viewport.scrollTop = 0; readerNavigation.back(); s.render(state);
    expect(s.back).toHaveBeenCalledOnce(); expect(s.viewport.scrollTop).toBe(680);
    expect(s.button.focus).toHaveBeenCalledWith({ preventScroll: true });
    s.active.dispose();
  });
  it("does not reopen pending records, reset refresh scroll or steal focus on a background update", () => {
    const s = session(), navigation = s.render(state);
    navigation.open({ ...item, calendarState: "pending" }); expect(s.open).not.toHaveBeenCalled();
    s.viewport.scrollTop = 500; s.render({ ...state, calendarLoading: true }); expect(s.viewport.scrollTop).toBe(500);
    navigation.open(item); s.render(reading);
    s.render({ ...reading, calendarLoading: false, calendar: { ...state.calendar!, items: [item] } });
    expect(s.reader.focus).toHaveBeenCalledOnce(); s.active.dispose();
  });
  it("waits for an invalidated month reload before restoring and resets only on month navigation", () => {
    const s = session(), navigation = s.render(state);
    s.viewport.scrollTop = 700; navigation.open(item); s.render(reading); s.viewport.scrollTop = 0;
    s.render({ ...state, calendar: null, calendarLoading: true }); expect(s.viewport.scrollTop).toBe(0);
    s.render(state); expect(s.viewport.scrollTop).toBe(700);
    s.render({ ...state, month: "2026-11", selectedDate: "2026-11-09", calendar: null }); expect(s.viewport.scrollTop).toBe(0);
    s.active.dispose();
  });
  it("clamps restored scroll when content shrinks and uses the named region if the old trigger disappeared", () => {
    const viewport = { scrollTop: 0, scrollHeight: 450, clientHeight: 400, focus: vi.fn() };
    const trigger = { isConnected: false, disabled: false, focus: vi.fn() };
    restoreDiaryCalendar(viewport, 800, trigger); expect(viewport.scrollTop).toBe(50);
    expect(viewport.focus).toHaveBeenCalledWith({ preventScroll: true }); expect(trigger.focus).not.toHaveBeenCalled();
    restoreDiaryCalendar(viewport, -1, { ...trigger, isConnected: true, disabled: true }); expect(viewport.scrollTop).toBe(0);
    expect(() => restoreDiaryCalendar(null, 100, null)).not.toThrow();
  });
});
