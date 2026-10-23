import type { Ref } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { diaryCalendarWeeks, diaryDateLabel, diaryDateWeekday, diaryItemDescription, diaryItemStatus, diaryMonthLabel, diaryTitle, diaryUndatedItems, DIARY_WEEKDAYS } from "@/application/diary-reader/diary-calendar";
import type { DiaryState } from "@/application/diary-reader/diary-reader-state";
import type { DiaryReaderController } from "@/application/diary-reader/diary-reader-controller";
import { shiftDiaryMonth, type DiaryCalendarItem, type DiaryCalendarState } from "@/domain/diary";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DiaryFeedback } from "./DiaryFeedback";

export function DiaryMarker({ state }: { readonly state: DiaryCalendarState }) {
  return state === "invalid"
    ? <TriangleAlert className="diary-marker diary-marker-invalid size-3" aria-hidden="true" data-diary-marker={state} />
    : <span className="diary-marker diary-marker-dot" aria-hidden="true" data-diary-marker={state} />;
}

export function DiaryCalendar({ state, controller, today, onOpen, openButtonRef, dateButtonRef }: {
  readonly state: DiaryState;
  readonly controller: DiaryReaderController | null;
  readonly today: string;
  readonly onOpen: (item: DiaryCalendarItem) => void;
  readonly openButtonRef?: Ref<HTMLButtonElement>;
  readonly dateButtonRef?: Ref<HTMLButtonElement>;
}) {
  const previous = shiftDiaryMonth(state.month, -1), next = shiftDiaryMonth(state.month, 1);
  const items = new Map(state.calendar?.items.map((item) => [item.date, item]));
  const selected = items.get(state.selectedDate);
  const undated = diaryUndatedItems(state.calendar?.items ?? []);
  return <section className="diary-paper mist-glass-strong mx-auto w-full max-w-3xl rounded-[24px] px-3 py-3 sm:px-7 sm:py-5" aria-label="日记月历" aria-busy={state.calendarLoading}>
    <div className="flex items-center gap-1 sm:gap-2">
      <Tooltip><TooltipTrigger render={<Button variant="ghost" className="size-11 text-muted-strong" aria-label="上个月" disabled={!previous || !controller} onClick={() => previous && void controller?.selectMonth(previous)} />}><ChevronLeft aria-hidden="true" /></TooltipTrigger><TooltipContent>上个月</TooltipContent></Tooltip>
      <h2 id="diary-month-title" className="min-w-0 flex-1 text-center text-base font-semibold sm:text-lg" aria-live="polite">{diaryMonthLabel(state.month)}</h2>
      <Button variant="ghost" className="min-h-11 px-3 text-xs text-muted-strong" onClick={() => void controller?.goToday()} disabled={!controller} aria-label="回到今天">今天</Button>
      <Tooltip><TooltipTrigger render={<Button variant="ghost" className="size-11 text-muted-strong" aria-label="下个月" disabled={!next || !controller} onClick={() => next && void controller?.selectMonth(next)} />}><ChevronRight aria-hidden="true" /></TooltipTrigger><TooltipContent>下个月</TooltipContent></Tooltip>
    </div>
    <DiaryFeedback loading={state.calendarLoading || (!state.calendar && !state.calendarError)} error={state.calendarError} retained={Boolean(state.calendar)} target="日历" onRetry={() => void controller?.load()} />
    <table className="diary-calendar-table w-full table-fixed border-separate" aria-labelledby="diary-month-title">
      <thead><tr>{DIARY_WEEKDAYS.map((day) => <th key={day} scope="col" className="h-9 text-xs font-normal text-muted-foreground">{day}</th>)}</tr></thead>
      <tbody>{diaryCalendarWeeks(state.month).map((week, index) => <tr key={index}>{week.map((date, column) => {
        if (!date) return <td key={`blank-${column}`} aria-hidden="true" />;
        const item = items.get(date), selectedDate = date === state.selectedDate, isToday = date === today;
        const status = !state.calendar ? "记录尚未读取" : item ? diaryItemStatus(item) : "无日记";
        return <td key={date} className="p-0.5">
          <Button ref={selectedDate ? dateButtonRef : undefined} type="button" variant="ghost" className="diary-day w-full min-w-0 flex-col gap-1 rounded-xl p-1 text-[13px] font-normal"
            data-diary-date={date} data-selected={selectedDate || undefined} data-today={isToday || undefined}
            aria-label={`${diaryDateLabel(date)}，${isToday ? "今天，" : ""}${status}`} aria-current={isToday ? "date" : undefined} aria-pressed={selectedDate}
            disabled={!controller}
            onClick={() => controller?.selectDate(date)}>
            <span className="diary-day-number grid size-6 place-items-center rounded-full">{Number(date.slice(8))}</span>
            <span className="flex h-3 items-center justify-center">{item && <DiaryMarker state={item.calendarState} />}</span>
          </Button>
        </td>;
      })}</tr>)}</tbody>
    </table>
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] leading-5 text-muted-strong" aria-label="日历状态图例">
      <span className="flex items-center gap-2"><DiaryMarker state="pending" />有写作记录</span>
      <span className="flex items-center gap-2"><DiaryMarker state="archived" />已归档</span>
      <span className="flex items-center gap-2"><DiaryMarker state="invalid" />记录异常</span>
    </div>
    <DiarySelection date={state.selectedDate} item={selected ?? null} known={Boolean(state.calendar)} onOpen={onOpen} openButtonRef={openButtonRef} />
    {undated.length > 0 && <div className="mt-4 border-t border-border pt-4 text-[13px] leading-6" role="note" aria-label="日期异常记录">
      <p className="font-medium text-muted-strong">有记录的日期无法对应到日历</p>
      <ul className="mt-2 space-y-2">{undated.map((item) => <li key={item.entryId} className="flex items-start gap-2 [overflow-wrap:anywhere]">
        <span className="mt-1"><DiaryMarker state="invalid" /></span><div><p>日记记录状态异常 · {item.date}</p><p className="text-xs text-muted-foreground">{diaryItemDescription(item)}</p></div>
      </li>)}</ul>
    </div>}
  </section>;
}

export function DiarySelection({ date, item, known, onOpen, openButtonRef }: {
  readonly date: string;
  readonly item: DiaryCalendarItem | null;
  readonly known: boolean;
  readonly onOpen: (item: DiaryCalendarItem) => void;
  readonly openButtonRef?: Ref<HTMLButtonElement>;
}) {
  return <section className="mt-5 border-t border-primary/10 px-1 pb-2 pt-5 sm:mt-6 sm:pt-6" aria-label="选中日期的日记" aria-live="polite" aria-atomic="true">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs leading-6 text-muted-strong">
      <time dateTime={date}>{diaryDateLabel(date)}</time><span>{diaryDateWeekday(date)}</span>
      {known && item && <span className="flex items-center gap-1.5"><DiaryMarker state={item.calendarState} />{diaryItemStatus(item)}</span>}
    </div>
    {!known ? <p className="mt-3 text-[13px] leading-6 text-muted-foreground">读取当月记录后，可查看这一天的日记状态。</p>
      : !item ? <p className="mt-3 text-[13px] leading-6 text-muted-foreground">这一天还没有日记。</p>
      : item.calendarState === "archived" ? <>
        <h3 className="mt-3 text-base font-semibold leading-7 [overflow-wrap:anywhere] sm:text-lg">{diaryTitle(item.title)}</h3>
        <Button ref={openButtonRef} variant="soft-primary" size="comfortable" className="mt-4 gap-2" onClick={() => onOpen(item)} aria-label={`阅读全文：${diaryTitle(item.title)}`}>阅读全文<ArrowRight className="size-4" aria-hidden="true" /></Button>
      </> : <>
        {item.title?.trim() && <h3 className="mt-3 text-base font-medium leading-7 [overflow-wrap:anywhere]">{item.title}</h3>}
        <p className="mt-3 text-[13px] leading-6 text-muted-strong">{diaryItemDescription(item)}</p>
      </>}
  </section>;
}
