import type { Ref } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import type { DiaryReader as DiaryReaderState } from "@/application/diary-reader/diary-reader-state";
import { diaryDateLabel, diaryDateWeekday } from "@/application/diary-reader/diary-calendar";
import { Button } from "@/components/ui/button";
import { PageScrollArea } from "@/components/ui/page-scroll-area";
import { DiaryMarker } from "./DiaryCalendar";
import { DiaryFeedback } from "./DiaryFeedback";
import { DiaryReaderHeading, DiaryReaderKeywords, DiaryReaderPaper } from "./DiaryReaderDetails";

// Legacy Diary: slider / 100 on save, then 0.6 / 0.8 display thresholds.
// The write endpoint does not enforce that range; invalid values get no decoration.
export function diaryReaderImportance(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) return null;
  return value >= 0.8 ? { level: "high", label: "较高" } : value >= 0.6 ? { level: "mid", label: "中等" } : { level: "low", label: "较低" };
}

export function DiaryReader({ reader, readerRef, onBack, onRetry, onEdit, editButtonRef }: {
  readonly reader: DiaryReaderState;
  readonly readerRef?: Ref<HTMLElement>;
  readonly onBack: () => void;
  readonly onRetry: () => void;
  readonly onEdit?: () => void;
  readonly editButtonRef?: Ref<HTMLButtonElement>;
}) {
  const importance = reader.entry ? diaryReaderImportance(reader.entry.importance) : null;
  return <DiaryReaderPaper readerRef={readerRef}>
    <header className="diary-reader-header border-b border-primary/10">
      <div className="mx-auto w-full max-w-[42rem]">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <Button variant="ghost" className="min-h-11 gap-2 px-2 text-muted-strong" onClick={onBack}><ArrowLeft className="size-4" aria-hidden="true" />返回日历</Button>
          {reader.entry && <Button ref={editButtonRef} data-diary-edit-trigger variant="ghost" size="compact" className="min-h-11 gap-1.5 text-xs text-muted-strong" disabled={!onEdit || reader.loading} onClick={onEdit} aria-label="编辑日记"><Pencil className="size-3.5" aria-hidden="true" />编辑</Button>}
        </div>
        <div className="diary-reader-date flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-6 text-muted-strong">
          <time dateTime={reader.date}>{diaryDateLabel(reader.date)}</time><span>{diaryDateWeekday(reader.date)}</span>
          {reader.entry && <span className="flex items-center gap-1.5"><DiaryMarker state="archived" />已归档</span>}
        </div>
        {reader.entry && <div className="diary-reader-heading" data-importance-level={importance?.level}>
          <DiaryReaderHeading entry={reader.entry} />
          {importance && <span className="sr-only">日记重要度{importance.label}。</span>}
        </div>}
      </div>
    </header>
    <PageScrollArea label="日记完整正文" topLabel="回到正文顶部" resetKey={reader.entryId} className="diary-reader-body" contentClassName="diary-reader-body-content">
      <div className="mx-auto w-full max-w-[42rem]">
        <DiaryFeedback loading={reader.loading} error={reader.error} retained={Boolean(reader.entry)} target="正文" onRetry={onRetry} />
        {reader.entry && <article aria-busy={reader.loading} aria-labelledby="diary-entry-title">
          <div className="whitespace-pre-wrap text-[15px] leading-8 text-foreground [overflow-wrap:anywhere]" data-diary-content="true">{reader.entry.content}</div>
        </article>}
      </div>
    </PageScrollArea>
    {reader.entry && reader.entry.keywords.length > 0 && <DiaryReaderKeywords key={reader.entryId} keywords={reader.entry.keywords} />}
  </DiaryReaderPaper>;
}
