import { ChevronRight, RefreshCw } from "lucide-react";
import type { QuickNoteController } from "@/application/quick-note/quick-note-controller";
import type { QuickNoteState } from "@/application/quick-note/quick-note-state";
import { formatPeriod } from "@/application/quick-note/quick-note-date";
import { normalizeOutput, type QuickNote } from "@/domain/quick-note";
import { Button } from "@/components/ui/button";
import { QuickNoteFeedback } from "./QuickNoteFeedback";

export function QuickNoteOverview({ state, controller, onOpen }: {
  readonly state: QuickNoteState;
  readonly controller: QuickNoteController | null;
  readonly onOpen: (note: QuickNote) => void;
}) {
  const loading = state.status === "loading";
  const data = state.data;
  return <section className="quick-note-overview mist-glass-strong rounded-[24px] px-4 py-3 sm:px-7 sm:py-4" aria-label="速记日期概览" aria-busy={loading}>
    <header className="flex items-center justify-between gap-2 border-b border-primary/10 pb-2">
      <h2 className="text-base font-semibold">{state.date || "速记"}</h2>
      <Button variant="ghost" className="size-11 text-muted-strong" aria-label="刷新记录" title="刷新记录" disabled={!state.config || loading} onClick={() => void controller?.load()}><RefreshCw aria-hidden="true" /></Button>
    </header>
    <QuickNoteFeedback state={state} controller={controller} />
    {state.config && data && <>
      {!data.items.length && !loading && !state.error && <p className="py-10 text-center text-sm text-muted-foreground">这一天还没有留下速记。</p>}
      <div className="divide-y divide-primary/10">{data.items.map((note) => <article key={note.id}>
        <button type="button" className="group flex min-h-11 w-full min-w-0 items-center gap-3 rounded-xl py-5 text-left transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:py-6"
          data-quick-note-open={note.id} aria-label={`阅读全文：${note.periodLabel}，${formatPeriod(note.periodStart, note.periodEnd, state.config!.timeZone, true)}`}
          disabled={loading} onClick={() => onOpen(note)}>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="rounded-xl bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary-ink">{note.periodLabel}</h3>
              <span className="text-xs leading-5 text-muted-strong">{formatPeriod(note.periodStart, note.periodEnd, state.config!.timeZone, true)}</span>
            </div>
            <p className="line-clamp-3 whitespace-pre-wrap break-words text-[13px] leading-6 text-muted-strong" data-quick-note-preview="true">
              {note.output.trim() ? normalizeOutput(note.output) : "尚无已保存正文"}
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </article>)}</div>
    </>}
  </section>;
}
