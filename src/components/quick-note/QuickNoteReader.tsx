import { useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUp, MoreHorizontal } from "lucide-react";
import type { QuickNoteController } from "@/application/quick-note/quick-note-controller";
import type { QuickNoteState } from "@/application/quick-note/quick-note-state";
import { formatPeriod } from "@/application/quick-note/quick-note-date";
import type { QuickNote } from "@/domain/quick-note";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NOTE_ACTIONS, QuickNoteOutput, QuickNoteSummary, type NoteAction } from "./QuickNoteSection";
import { QuickNoteFeedback } from "./QuickNoteFeedback";
import { scrollQuickNoteToTop, showQuickNoteTopButton } from "./quick-note-reader-scroll";

export function QuickNoteReader({ note, timeZone, state, controller, onBack, onAction }: {
  readonly note: QuickNote | null; readonly timeZone: string;
  readonly state: QuickNoteState; readonly controller: QuickNoteController | null;
  readonly onBack: () => void; readonly onAction: (kind: NoteAction, note: QuickNote) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setShowTop(false);
  }, [note?.id]);
  const disabled = Boolean(state.pending || state.editor || state.configLoading || state.status === "loading" || state.error);
  return <section className="quick-note-reader mist-glass-strong flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px]" aria-label="速记完整阅读">
    <header className="shrink-0 px-4 pt-3 sm:px-7 sm:pt-5" data-quick-note-reader-header="true">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button variant="ghost" className="h-11 px-2 text-muted-strong" onClick={onBack}><ArrowLeft aria-hidden="true" />返回日期概览</Button>
        {note && <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger render={<Button variant="ghost" className="size-11" aria-label="本篇速记操作" title="本篇速记操作" disabled={disabled} />}><MoreHorizontal aria-hidden="true" /></PopoverTrigger>
          <PopoverContent align="end" className="w-72 max-w-[calc(100vw-2rem)]">
            <QuickNoteActions note={note} disabled={disabled} onAction={(kind, selected) => { setMenuOpen(false); onAction(kind, selected); }} />
          </PopoverContent>
        </Popover>}
      </div>
      {note && <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary/10 pb-4">
        <h2 className="rounded-xl bg-primary/10 px-3 py-2 text-sm font-medium text-primary-ink">{note.periodLabel}</h2>
        <p className="text-xs leading-6 text-muted-strong">{formatPeriod(note.periodStart, note.periodEnd, timeZone)}</p>
      </div>}
    </header>
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain px-4 pb-16 pt-5 sm:px-7" role="region" aria-label="速记正文与摘要" tabIndex={0}
        data-quick-note-reader-scroll="true" onScroll={(event) => setShowTop(showQuickNoteTopButton(event.currentTarget.scrollTop))}>
        <QuickNoteFeedback state={state} controller={controller} />
        {note ? <article aria-label={`${note.periodLabel}速记`} aria-busy={Boolean(state.pending)}>
          <QuickNoteOutput output={note.output} />
          <QuickNoteSummary key={note.id} summary={note.summary} />
        </article> : <p className="py-8 text-sm leading-7 text-muted-strong">这一天已不包含这条速记，请返回概览查看。</p>}
      </div>
      <QuickNoteTopButton visible={showTop} onClick={() => scrollQuickNoteToTop(scrollRef.current, window.matchMedia("(prefers-reduced-motion: reduce)").matches)} />
    </div>
  </section>;
}

export function QuickNoteTopButton({ visible, onClick }: { readonly visible: boolean; readonly onClick: () => void }) {
  if (!visible) return null;
  return <Button variant="ghost" className="mist-glass absolute bottom-3 right-3 size-11 rounded-full text-foreground" aria-label="回到正文顶部" title="回到正文顶部" onClick={onClick}><ArrowUp aria-hidden="true" /></Button>;
}

export function QuickNoteActions({ note, disabled, onAction }: {
  readonly note: QuickNote; readonly disabled: boolean; readonly onAction: (kind: NoteAction, note: QuickNote) => void;
}) {
  return <div className="flex flex-col gap-1" role="group" aria-label={`${note.periodLabel}操作`}>
    {NOTE_ACTIONS.map(({ action, label, icon: Icon }) => <Button key={action} variant="ghost" className={`min-h-11 h-auto justify-start whitespace-normal py-2 text-left text-xs ${action === "delete" ? "text-destructive" : "text-muted-strong"}`} disabled={disabled} aria-label={`${note.periodLabel}：${label}`} onClick={() => onAction(action, note)}><Icon aria-hidden="true" />{label}</Button>)}
  </div>;
}
