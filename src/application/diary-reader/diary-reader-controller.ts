import { ApiError } from "@/lib/api";
import { getArchivedDiary, getDiaryCalendar, diaryDate, diaryMonthDays, isDiaryDate, isDiaryMonth, localDiaryDate, DiaryContractError, DiaryUnavailableError, type ArchivedDiary } from "@/domain/diary";
import { diaryReadFailure, initialDiaryState, type DiaryReader, type DiaryState } from "./diary-reader-state";
import { createDiaryActions, type DiaryActionDependencies } from "./diary-actions-controller";
import { getDiaryAutoFeed, setDiaryAutoFeed, updateArchivedDiary } from "@/domain/diary/diary-write-client";

export interface DiaryReaderDependencies extends Partial<Omit<DiaryActionDependencies, "getArchivedDiary">> {
  readonly getDiaryCalendar: typeof getDiaryCalendar;
  readonly getArchivedDiary: typeof getArchivedDiary;
}

/** Read/edit lifecycles only. Generation and message state remain on the backend. */
export function createDiaryReaderController(
  deps: DiaryReaderDependencies = { getDiaryCalendar, getArchivedDiary },
  today: () => string = localDiaryDate,
) {
  let state = initialDiaryState(today());
  let disposed = false, calendarSeq = 0, readerSeq = 0, reloadOnReturn = false;
  let calendarRead: { month: string; abort: AbortController; promise: Promise<boolean> } | null = null;
  let entryRead: { id: string; date: string; abort: AbortController; promise: Promise<boolean> } | null = null;
  // At most the visited entries of this month; never shared across feature mounts.
  const entries = new Map<string, ArchivedDiary>();
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
    if (manual) {
      entries.clear();
      if (!state.reader) { cancelEntry(); publish({ preview: null }); }
    }
    const seq = ++calendarSeq;
    calendarRead?.abort.abort();
    const abort = new AbortController();
    publish({ calendarLoading: true, calendarError: null, notice: null });
    const promise = (async () => {
      try {
        const calendar = await deps.getDiaryCalendar(month, { signal: abort.signal });
        if (disposed || abort.signal.aborted || seq !== calendarSeq) return false;
        publish({ calendar, calendarLoading: false, calendarError: null, notice: manual ? { text: "日历已刷新" } : null });
        if (!state.reader) void loadPreview();
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

  function sameEntry(value: DiaryReader | null, id: string, date: string) {
    return value?.entryId === id && value.date === date;
  }

  function readEntry(id: string, date: string, manual = false, target: "reader" | "preview" = "reader"): Promise<boolean> {
    if (disposed) return Promise.resolve(false);
    const previous = sameEntry(state.reader, id, date) ? state.reader!.entry : sameEntry(state.preview, id, date) ? state.preview!.entry : null;
    const notice = target === "preview" ? state.notice : null;
    if (entryRead?.id === id && entryRead.date === date) {
      publish({ [target]: { entryId: id, date, entry: previous, loading: true, error: null }, notice });
      return entryRead.promise;
    }
    cancelEntry();
    const cached = entries.get(id);
    if (!manual && cached?.date === date) {
      publish({ [target]: { entryId: id, date, entry: cached, loading: false, error: null }, notice });
      return Promise.resolve(true);
    }
    if (manual) entries.delete(id);
    const seq = readerSeq, abort = new AbortController();
    publish({ [target]: { entryId: id, date, entry: previous, loading: true, error: null }, notice });
    const result = (value: DiaryReader) => ({
      ...(sameEntry(state.reader, id, date) ? { reader: value } : {}),
      ...(sameEntry(state.preview, id, date) ? { preview: value } : {}),
    });
    const promise = (async () => {
      try {
        const entry = await deps.getArchivedDiary(id, date, { signal: abort.signal });
        if (disposed || abort.signal.aborted || seq !== readerSeq) return false;
        entries.set(id, entry);
        publish({ ...result({ entryId: id, date, entry, loading: false, error: null }), notice: manual ? { text: "正文已刷新" } : state.notice });
        return true;
      } catch (error) {
        if (disposed || abort.signal.aborted || seq !== readerSeq) return false;
        const invalid = error instanceof DiaryUnavailableError || error instanceof DiaryContractError || (error instanceof ApiError && error.status === 404);
        const invalidateCalendar = invalid && sameEntry(state.reader, id, date);
        if (invalid) entries.delete(id);
        if (invalidateCalendar) {
          reloadOnReturn = true;
          entries.clear();
          ++calendarSeq;
          calendarRead?.abort.abort();
          calendarRead = null;
        }
        publish({
          ...result({ entryId: id, date, entry: invalid ? null : previous, loading: false, error: diaryReadFailure(error) }),
          ...(invalidateCalendar ? { calendar: null, calendarLoading: false, calendarError: null, preview: null } : {}), notice: target === "preview" ? state.notice : null,
        });
        return false;
      } finally {
        if (seq === readerSeq) entryRead = null;
      }
    })();
    entryRead = { id, date, abort, promise };
    return promise;
  }

  function loadPreview(): Promise<boolean> {
    const item = state.calendar?.items.find((row) => row.date === state.selectedDate);
    if (!item || item.calendarState !== "archived") {
      if (state.preview) { cancelEntry(); publish({ preview: null }); }
      return Promise.resolve(false);
    }
    return readEntry(item.entryId, item.date, false, "preview");
  }

  function selectMonth(month: string, selectedDate?: string): Promise<boolean> {
    if (disposed || state.reader || state.editor || !isDiaryMonth(month)) return Promise.resolve(false);
    const changed = month !== state.month;
    const date = selectedDate ?? diaryDate(month, Math.min(Number(state.selectedDate.slice(8)), diaryMonthDays(month)));
    const selectionChanged = changed || date !== state.selectedDate;
    if (selectionChanged) cancelEntry();
    if (changed) entries.clear();
    publish({ month, selectedDate: date, notice: null, ...(selectionChanged ? { preview: null } : {}), ...(changed ? { calendar: null, calendarError: null } : {}) });
    if (!changed && state.calendar) return selectionChanged ? loadPreview() : Promise.resolve(true);
    return loadCalendar();
  }

  const actions = createDiaryActions({
    deps: { updateArchivedDiary, getDiaryAutoFeed, setDiaryAutoFeed, ...deps }, getState: () => state, publish,
    onSaved(entry) {
      cancelEntry(); ++calendarSeq; calendarRead?.abort.abort(); calendarRead = null;
      entries.set(entry.id, entry);
      if (!state.calendar) reloadOnReturn = true;
      publish({
        reader: { entryId: entry.id, date: entry.date, entry, loading: false, error: null },
        ...(sameEntry(state.preview, entry.id, entry.date) ? { preview: { entryId: entry.id, date: entry.date, entry, loading: false, error: null } } : {}),
        calendarLoading: false,
        calendar: state.calendar ? { ...state.calendar, items: state.calendar.items.map((item) => item.entryId === entry.id && item.date === entry.date ? { ...item, title: entry.title } : item) } : null,
      });
    },
  });
  return {
    beginEdit: actions.beginEdit, changeDraft: actions.changeDraft, cancelEdit: actions.cancelEdit,
    saveEdit: actions.saveEdit, verifyEdit: actions.verifyEdit, loadAutoFeed: actions.loadAutoFeed, toggleAutoFeed: actions.toggleAutoFeed,
    getState: () => state,
    load: () => loadCalendar(),
    reloadCalendar() {
      if (disposed) return Promise.resolve(false);
      ++calendarSeq; calendarRead?.abort.abort(); calendarRead = null;
      return loadCalendar();
    },
    selectMonth: (month: string) => selectMonth(month),
    selectDate(date: string) {
      if (disposed || state.reader || state.editor || !isDiaryDate(date) || date.slice(0, 7) !== state.month) return Promise.resolve(false);
      if (date !== state.selectedDate) cancelEntry();
      publish({ selectedDate: date, notice: null, ...(date !== state.selectedDate ? { preview: null } : {}) });
      return loadPreview();
    },
    goToday() {
      const date = today();
      return selectMonth(date.slice(0, 7), date);
    },
    openEntry(id: string): Promise<boolean> {
      if (state.editor) return Promise.resolve(false);
      const item = state.calendar?.items.find((row) => row.entryId === id);
      if (!item || item.calendarState !== "archived") return Promise.resolve(false);
      return readEntry(item.entryId, item.date);
    },
    refresh() {
      if (state.editor) return Promise.resolve(false);
      return state.reader ? readEntry(state.reader.entryId, state.reader.date, true) : loadCalendar(true);
    },
    back() {
      if (disposed || state.editor) return;
      cancelEntry();
      publish({ reader: null, notice: null });
      if (reloadOnReturn) { reloadOnReturn = false; void loadCalendar(); }
      else void loadPreview();
    },
    subscribe(listener: (value: DiaryState) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() {
      disposed = true;
      actions.dispose();
      ++calendarSeq;
      calendarRead?.abort.abort();
      cancelEntry();
      entries.clear();
      listeners.clear();
    },
  };
}

export type DiaryReaderController = ReturnType<typeof createDiaryReaderController>;
