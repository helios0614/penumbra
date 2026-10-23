import { useLayoutEffect, useRef } from "react";
import type { DiaryCalendarItem } from "@/domain/diary";
import type { DiaryReaderController } from "@/application/diary-reader/diary-reader-controller";
import type { DiaryState } from "@/application/diary-reader/diary-reader-state";
import { restoreDiaryCalendar } from "./diary-navigation";

/** In-app reading only: no nested routes, history entries or cross-app scroll storage. */
export function useDiaryNavigation(state: DiaryState, controller: DiaryReaderController | null) {
  const calendarRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<HTMLElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const dateButtonRef = useRef<HTMLButtonElement>(null);
  const savedTop = useRef<number | null>(null);
  const reading = Boolean(state.reader);

  useLayoutEffect(() => {
    if (calendarRef.current) calendarRef.current.scrollTop = 0;
  }, [state.month]);

  useLayoutEffect(() => {
    if (reading) readerRef.current?.focus({ preventScroll: true });
  }, [reading]);

  useLayoutEffect(() => {
    if (!reading && savedTop.current !== null && (!state.calendarLoading || state.calendar)) {
      restoreDiaryCalendar(calendarRef.current, savedTop.current, openButtonRef.current ?? dateButtonRef.current);
      savedTop.current = null;
    }
  }, [reading, state.calendarLoading, state.calendar]);

  return {
    calendarRef, readerRef, openButtonRef, dateButtonRef,
    open(item: DiaryCalendarItem) {
      if (!controller || item.calendarState !== "archived") return;
      savedTop.current = calendarRef.current?.scrollTop ?? 0;
      void controller.openEntry(item.entryId);
    },
    back: () => controller?.back(),
  };
}
