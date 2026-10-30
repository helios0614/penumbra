import type { Ref } from "react";
import { ChevronLeft, ChevronRight, MessagesSquare, TriangleAlert } from "lucide-react";
import { diaryCalendarWeeks, diaryDateLabel, diaryDateWeekday, diaryItemDescription, diaryItemStatus, diaryMonthLabel, diaryTitle, diaryUndatedItems, DIARY_WEEKDAYS } from "@/application/diary-reader/diary-calendar";
import type { DiaryReader, DiaryState } from "@/application/diary-reader/diary-reader-state";
import type { DiaryReaderController } from "@/application/diary-reader/diary-reader-controller";
import { shiftDiaryMonth, type DiaryCalendarItem, type DiaryCalendarState } from "@/domain/diary";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DiaryFeedback } from "./DiaryFeedback";
import { DiaryAutoFeed } from "./DiaryAutoFeed";

export function DiaryMarker({ state }: { readonly state: DiaryCalendarState }) {
  return state === "invalid"
    ? <TriangleAlert className="diary-marker diary-marker-invalid size-3" aria-hidden="true" data-diary-marker={state} />
    : <span className="diary-marker diary-marker-dot" aria-hidden="true" data-diary-marker={state} />;
}

export function DiaryCalendar({ state, controller, today, onOpen, onOpenChat, openButtonRef, dateButtonRef }: {
  readonly onOpenChat?: (item: DiaryCalendarItem) => void;
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
    <DiaryAutoFeed state={state.autoFeed} controller={controller} />
    <DiaryFeedback loading={state.calendarLoading || (!state.calendar && !state.calendarError)} error={state.calendarError} retained={Boolean(state.calendar)} target="日历" onRetry={() => void controller?.load()} />
    <table className="diary-calendar-table mt-2 w-full table-fixed border-separate" aria-labelledby="diary-month-title">
      <thead><tr>{DIARY_WEEKDAYS.map((day) => <th key={day} scope="col" className="h-8 text-xs font-normal text-muted-foreground">{day}</th>)}</tr></thead>
      <tbody>{diaryCalendarWeeks(state.month).map((week, index) => <tr key={index}>{week.map((date, column) => {
        if (!date) return <td key={`blank-${column}`} aria-hidden="true" />;
        const item = items.get(date), selectedDate = date === state.selectedDate, isToday = date === today;
        const status = !state.calendar ? "记录尚未读取" : item ? diaryItemStatus(item) : "无日记";
        return <td key={date} className="p-0.5">
          <Button ref={selectedDate ? dateButtonRef : undefined} type="button" variant="ghost" className="diary-day w-full min-w-0 rounded-xl p-1 text-[13px] font-normal"
            data-diary-date={date} data-selected={selectedDate || undefined} data-today={isToday || undefined}
            aria-label={`${diaryDateLabel(date)}，${isToday ? "今天，" : ""}${status}`} aria-current={isToday ? "date" : undefined} aria-pressed={selectedDate}
            disabled={!controller}
            onClick={() => controller?.selectDate(date)}>
            <span className="diary-day-number relative grid size-6 place-items-center rounded-full">{Number(date.slice(8))}
              {item && <span className="diary-day-marker"><DiaryMarker state={item.calendarState} /></span>}
            </span>
          </Button>
        </td>;
      })}</tr>)}</tbody>
    </table>
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] leading-5 text-muted-strong" aria-label="日历状态图例">
      <span className="flex items-center gap-2"><DiaryMarker state="pending" />有写作记录</span>
      <span className="flex items-center gap-2"><DiaryMarker state="archived" />已归档</span>
      <span className="flex items-center gap-2"><DiaryMarker state="invalid" />记录异常</span>
    </div>
    <DiarySelection date={state.selectedDate} item={selected ?? null} known={Boolean(state.calendar)} preview={state.preview} onOpen={onOpen} onOpenChat={onOpenChat} openButtonRef={openButtonRef} />
    {undated.length > 0 && <div className="mt-4 border-t border-border pt-4 text-[13px] leading-6" role="note" aria-label="日期异常记录">
      <p className="font-medium text-muted-strong">有记录的日期无法对应到日历</p>
      <ul className="mt-2 space-y-2">{undated.map((item) => <li key={item.entryId} className="flex items-start gap-2 [overflow-wrap:anywhere]">
        <span className="mt-1"><DiaryMarker state="invalid" /></span><div><p>日记记录状态异常 · {item.date}</p><p className="text-xs text-muted-foreground">{diaryItemDescription(item)}</p></div>
      </li>)}</ul>
    </div>}
  </section>;
}

export function DiarySelection({ date, item, known, preview, onOpen, onOpenChat, openButtonRef }: {
  readonly onOpenChat?: (item: DiaryCalendarItem) => void;
  readonly date: string;
  readonly item: DiaryCalendarItem | null;
  readonly known: boolean;
  readonly preview?: DiaryReader | null;
  readonly onOpen: (item: DiaryCalendarItem) => void;
  readonly openButtonRef?: Ref<HTMLButtonElement>;
}) {
  const detail = item && preview?.entryId === item.entryId && preview.date === date ? preview : null;
  const metadata = <div data-diary-selection-meta="true" className="flex items-center justify-between gap-3 px-1">
    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs font-normal leading-6 text-muted-strong">
      <time dateTime={date}>{diaryDateLabel(date)}</time><span>{diaryDateWeekday(date)}</span>
      {known && item && <span className="flex items-center gap-1.5"><DiaryMarker state={item.calendarState} />{diaryItemStatus(item)}</span>}
    </span>
    {known && item && (item.calendarState === "pending" || item.calendarState === "archived") && item.entryId.trim() && onOpenChat && <Button
      ref={item.calendarState === "pending" ? openButtonRef : undefined} data-diary-chat-trigger="true" type="button" variant="link" size="compact"
      className="min-h-11 shrink-0 gap-1.5 px-1 text-xs font-normal text-muted-strong" onClick={() => onOpenChat(item)}>
      <MessagesSquare className="size-3.5" aria-hidden="true" />查看对话
    </Button>}
  </div>;
  const title = diaryTitle(detail?.entry ? detail.entry.title : item?.title ?? null);
  const excerpt = detail?.entry && Array.from(detail.entry.content).slice(0, 180).join("");
  return <section className="mt-3 border-t border-primary/10 pt-3" aria-label="选中日期的日记" aria-live="polite" aria-atomic="true">
    {metadata}
    {known && item?.calendarState === "archived" ? <Button ref={openButtonRef} type="button" variant="ghost" size="comfortable"
      className="diary-entry-link w-full min-w-0 items-start justify-between gap-3 rounded-2xl px-3 py-3 text-left"
      onClick={() => onOpen(item)} aria-label={`阅读全文：${title}，${diaryDateLabel(date)}`}>
      <span className="min-w-0 flex-1">
        <span className="mt-1.5 block text-base font-semibold leading-7 text-foreground [overflow-wrap:anywhere] sm:text-lg">{title}</span>
        {excerpt && <span className="mt-1.5 line-clamp-2 whitespace-pre-line text-[13px] font-normal leading-6 text-muted-strong [overflow-wrap:anywhere]" data-diary-excerpt="true">{excerpt}</span>}
        {detail?.loading && !excerpt && <span className="mt-1.5 block text-xs font-normal leading-6 text-muted-foreground">正在读取正文预览…</span>}
        {detail?.error && <span className="mt-1.5 block text-xs font-normal leading-6 text-muted-strong">正文预览暂不可用，可进入阅读重试。</span>}
      </span>
      <ChevronRight className="mt-1 size-4 text-muted-strong" aria-hidden="true" />
    </Button> : <div className="px-1 pb-1">
      {!known ? <p className="mt-1 text-[13px] leading-6 text-muted-foreground">读取当月记录后，可查看这一天的日记状态。</p>
        : !item ? <p className="mt-1 text-[13px] leading-6 text-muted-foreground">这一天还没有日记。</p>
        : <>
          {item.title?.trim() && <h3 className="mt-2 text-base font-medium leading-7 [overflow-wrap:anywhere]">{item.title}</h3>}
          <p className="mt-1 text-[13px] leading-6 text-muted-strong">{diaryItemDescription(item)}</p>
        </>}
    </div>}
  </section>;
}
