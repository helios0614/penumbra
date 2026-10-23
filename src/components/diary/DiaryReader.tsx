import type { Ref } from "react";
import { ArrowLeft } from "lucide-react";
import type { DiaryReader as DiaryReaderState } from "@/application/diary-reader/diary-reader-state";
import { diaryDateLabel, diaryDateWeekday, diaryTitle } from "@/application/diary-reader/diary-calendar";
import { Button } from "@/components/ui/button";
import { PageScrollArea } from "@/components/ui/page-scroll-area";
import { DiaryMarker } from "./DiaryCalendar";
import { DiaryFeedback } from "./DiaryFeedback";

export function DiaryReader({ reader, readerRef, onBack, onRetry }: {
  readonly reader: DiaryReaderState;
  readonly readerRef?: Ref<HTMLElement>;
  readonly onBack: () => void;
  readonly onRetry: () => void;
}) {
  return <section ref={readerRef} tabIndex={-1} className="diary-paper mist-glass-strong mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] focus:outline-none sm:mt-4" aria-label="单篇日记阅读">
    <header className="shrink-0 border-b border-primary/10 px-4 pb-3 pt-2 sm:px-7 sm:pt-3">
      <Button variant="ghost" className="mb-2 min-h-11 gap-2 px-2 text-muted-strong" onClick={onBack}><ArrowLeft className="size-4" aria-hidden="true" />返回日历</Button>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-6 text-muted-strong">
        <time dateTime={reader.date}>{diaryDateLabel(reader.date)}</time><span>{diaryDateWeekday(reader.date)}</span>
        {reader.entry && <span className="flex items-center gap-1.5"><DiaryMarker state="archived" />已归档</span>}
      </div>
    </header>
    <PageScrollArea label="日记完整正文" topLabel="回到正文顶部" resetKey={reader.entryId} contentClassName="px-4 pb-8 pt-5 sm:px-7 sm:pt-7">
      <div className="mx-auto w-full max-w-[42rem]">
        <DiaryFeedback loading={reader.loading} error={reader.error} retained={Boolean(reader.entry)} target="正文" onRetry={onRetry} />
        {reader.entry && <article aria-busy={reader.loading}>
          <h2 className="mb-5 text-xl font-semibold leading-8 text-foreground [overflow-wrap:anywhere] sm:text-2xl sm:leading-9">{diaryTitle(reader.entry.title)}</h2>
          <div className="whitespace-pre-wrap text-[15px] leading-8 text-foreground [overflow-wrap:anywhere]" data-diary-content="true">{reader.entry.content}</div>
        </article>}
      </div>
    </PageScrollArea>
  </section>;
}
