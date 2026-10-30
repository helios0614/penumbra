import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { DiaryCalendarItem } from "@/domain/diary";
import { diaryChatEntry, diaryChatUrl } from "./diary-chat-navigation";
import { restoreDiaryCalendar } from "./diary-navigation";

export function useDiaryChatNavigation(calendarRef: RefObject<HTMLDivElement | null>, openButtonRef: RefObject<HTMLButtonElement | null>, dateButtonRef: RefObject<HTMLButtonElement | null>) {
  const [entryId, setEntryId] = useState(() => typeof window === "undefined" ? null : diaryChatEntry(window.location.search));
  const saved = useRef<{ top: number; focus: HTMLElement | null } | null>(null);
  function capture() {
    const active = document.activeElement;
    saved.current = { top: calendarRef.current?.scrollTop ?? 0,
      focus: active instanceof HTMLElement && calendarRef.current?.contains(active) ? active : openButtonRef.current ?? dateButtonRef.current };
  }
  useEffect(() => {
    const pop = () => {
      const next = diaryChatEntry(window.location.search);
      if (next && calendarRef.current?.clientHeight) capture();
      setEntryId(next);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useLayoutEffect(() => {
    if (!entryId && saved.current) {
      const { top, focus } = saved.current;
      restoreDiaryCalendar(calendarRef.current, top, (focus as HTMLButtonElement | null) ?? openButtonRef.current ?? dateButtonRef.current);
      saved.current = null;
    }
  }, [entryId, calendarRef, openButtonRef, dateButtonRef]);
  function openEntry(id: string) {
    if (!id.trim()) return;
    capture();
    window.history.pushState({ ...window.history.state, penumbraDiaryChat: id }, "", diaryChatUrl(window.location.href, id));
    setEntryId(id);
  }
  return {
    entryId,
    openEntry,
    open(item: DiaryCalendarItem) {
      if ((item.calendarState !== "pending" && item.calendarState !== "archived") || !item.entryId.trim()) return;
      openEntry(item.entryId);
    },
    back() {
      if (window.history.state?.penumbraDiaryChat === entryId) { window.history.back(); return; }
      window.history.replaceState(window.history.state, "", diaryChatUrl(window.location.href, null));
      setEntryId(null);
    },
  };
}
