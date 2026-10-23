import { ApiError } from "@/lib/api";
import { getArchivedDiary, getDiaryCalendar, diaryDate, diaryMonthDays, isDiaryDate, isDiaryMonth, localDiaryDate, DiaryContractError, DiaryUnavailableError } from "@/domain/diary";
import { diaryReadFailure, initialDiaryState, type DiaryState } from "./diary-reader-state";

export interface DiaryReaderDependencies {
  readonly getDiaryCalendar: typeof getDiaryCalendar;
  readonly getArchivedDiary: typeof getArchivedDiary;
}

/** Read lifecycles only. Generation, message state and archive transitions remain on the backend. */
export function createDiaryReaderController(
  deps: DiaryReaderDependencies = { getDiaryCalendar, getArchivedDiary },
  today: () => string = localDiaryDate,
) {
  let state = initialDiaryState(today());
  let disposed = false, calendarSeq = 0, readerSeq = 0, reloadOnReturn = false;
  let calendarRead: { month: string; abort: AbortController; promise: Promise<boolean> } | null = null;
  let entryRead: { id: string; abort: AbortController; promise: Promise<boolean> } | null = null;
  const listeners = new Set<(value: DiaryState) => void>();
  const publish = (patch: Partial<DiaryState>) => {
    if (disposed) return;
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener(state));
  };

  function loadCalendar(manual = false): Promise<boolean> {
    if (disposed) return Promise.resolve(false);
    const month = state.month;
    if (calendarRead?.month === month) return calendarRead.promise;
    const seq = ++calendarSeq;
    calendarRead?.abort.abort();
    const abort = new AbortController();
    publish({ calendarLoading: true, calendarError: null, notice: null });
    const promise = (async () => {
      try {
        const calendar = await deps.getDiaryCalendar(month, { signal: abort.signal });
        if (disposed || abort.signal.aborted || seq !== calendarSeq) return false;
        publish({ calendar, calendarLoading: false, calendarError: null, notice: manual ? { text: "日历已刷新" } : null });
        return true;
      } catch (error) {
        if (disposed || abort.signal.aborted || seq !== calendarSeq) return false;
        publish({ calendarLoading: false, calendarError: diaryReadFailure(error), notice: null });
        return false;
      } finally {
        if (seq === calendarSeq) calendarRead = null;
      }
    })();
    calendarRead = { month, abort, promise };
    return promise;
  }

  function cancelEntry() {
    ++readerSeq;
    entryRead?.abort.abort();
    entryRead = null;
  }

  function readEntry(id: string, date: string, manual = false): Promise<boolean> {
    if (disposed) return Promise.resolve(false);
    if (entryRead?.id === id) return entryRead.promise;
    cancelEntry();
    const seq = readerSeq, abort = new AbortController();
    const previous = state.reader?.entryId === id ? state.reader.entry : null;
    publish({ reader: { entryId: id, date, entry: previous, loading: true, error: null }, notice: null });
    const promise = (async () => {
      try {
        const entry = await deps.getArchivedDiary(id, date, { signal: abort.signal });
        if (disposed || abort.signal.aborted || seq !== readerSeq) return false;
        publish({ reader: { entryId: id, date, entry, loading: false, error: null }, notice: manual ? { text: "正文已刷新" } : null });
        return true;
      } catch (error) {
        if (disposed || abort.signal.aborted || seq !== readerSeq) return false;
        const invalid = error instanceof DiaryUnavailableError || error instanceof DiaryContractError || (error instanceof ApiError && error.status === 404);
        if (invalid) {
          reloadOnReturn = true;
          ++calendarSeq;
          calendarRead?.abort.abort();
          calendarRead = null;
        }
        publish({
          reader: { entryId: id, date, entry: invalid ? null : previous, loading: false, error: diaryReadFailure(error) },
          ...(invalid ? { calendar: null, calendarLoading: false, calendarError: null } : {}), notice: null,
        });
        return false;
      } finally {
        if (seq === readerSeq) entryRead = null;
      }
    })();
    entryRead = { id, abort, promise };
    return promise;
  }

  function selectMonth(month: string, selectedDate?: string): Promise<boolean> {
    if (disposed || state.reader || !isDiaryMonth(month)) return Promise.resolve(false);
    const changed = month !== state.month;
    const date = selectedDate ?? diaryDate(month, Math.min(Number(state.selectedDate.slice(8)), diaryMonthDays(month)));
    publish({ month, selectedDate: date, notice: null, ...(changed ? { calendar: null, calendarError: null } : {}) });
    if (!changed && state.calendar) return Promise.resolve(true);
    return loadCalendar();
  }

  return {
    getState: () => state,
    load: () => loadCalendar(),
    selectMonth: (month: string) => selectMonth(month),
    selectDate(date: string) {
      if (disposed || state.reader || !isDiaryDate(date) || date.slice(0, 7) !== state.month) return;
      publish({ selectedDate: date, notice: null });
    },
    goToday() {
      const date = today();
      return selectMonth(date.slice(0, 7), date);
    },
    openEntry(id: string): Promise<boolean> {
      const item = state.calendar?.items.find((row) => row.entryId === id);
      if (!item || item.calendarState !== "archived") return Promise.resolve(false);
      return readEntry(item.entryId, item.date);
    },
    refresh() {
      return state.reader ? readEntry(state.reader.entryId, state.reader.date, true) : loadCalendar(true);
    },
    back() {
      if (disposed) return;
      cancelEntry();
      publish({ reader: null, notice: null });
      if (reloadOnReturn) { reloadOnReturn = false; void loadCalendar(); }
    },
    subscribe(listener: (value: DiaryState) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() {
      disposed = true;
      ++calendarSeq;
      calendarRead?.abort.abort();
      cancelEntry();
      listeners.clear();
    },
  };
}

export type DiaryReaderController = ReturnType<typeof createDiaryReaderController>;
