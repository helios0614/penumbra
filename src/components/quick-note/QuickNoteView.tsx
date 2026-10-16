import { useState } from "react";
import { MoreHorizontal, RefreshCw, X } from "lucide-react";
import type { QuickNote, TriggerConfig } from "@/domain/quick-note";
import { Button } from "@/components/ui/button";
import { PageHeader, PageHeaderAction } from "@/components/ui/page-header";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { QuickNoteDateNavigation } from "./QuickNoteControls";
import { QuickNoteBackfillDialog, QuickNoteConfirmDialog, QuickNoteRetryDialog, type QuickNoteConfirmation } from "./QuickNoteDialogs";
import { QuickNoteEditor } from "./QuickNoteEditor";
import { QuickNoteLogs } from "./QuickNoteLogs";
import { QuickNoteOverview } from "./QuickNoteOverview";
import { QuickNoteReader } from "./QuickNoteReader";
import type { NoteAction } from "./QuickNoteSection";
import { useQuickNoteNavigation } from "./useQuickNoteNavigation";
import { useQuickNoteLogs, useQuickNotes } from "./useQuickNotes";
import "./quick-note.css";

export function QuickNoteView({ onBack }: { readonly onBack?: () => void }) {
  const { state, controller } = useQuickNotes();
  const logs = useQuickNoteLogs();
  const navigation = useQuickNoteNavigation(state, controller);
  const selectedNote = navigation.reader && (state.data ? state.data.items.find((note) => note.id === navigation.reader!.id) ?? null : navigation.reader);
  const [retryOpen, setRetryOpen] = useState(false);
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<QuickNoteConfirmation | null>(null);
  const action = (kind: NoteAction, note: QuickNote) => {
    if (kind === "edit") controller?.beginEdit(note);
    else setConfirmation({ kind, note });
  };
  return (
    <TooltipProvider>
      <main className="mx-auto flex h-full max-h-dvh min-h-0 w-full max-w-5xl flex-col overflow-hidden px-4 pb-4 pt-5 sm:px-0 sm:pb-8 sm:pt-8" aria-labelledby="quick-note-page-title">
        <PageHeader eyebrow="QUICK NOTES" title="速记" titleId="quick-note-page-title" description="那些散落的时段，会被整理成可以回看的记录。" actions={<>
          {!navigation.reader && <Tooltip><TooltipTrigger render={<PageHeaderAction aria-label="重试近期未完成时段" disabled={!state.config || Boolean(state.pending)} onClick={() => { setRetryOpen(true); void controller?.loadCandidates(); }} />}><RefreshCw aria-hidden="true" /></TooltipTrigger><TooltipContent>重试近期未完成时段</TooltipContent></Tooltip>}
          {!navigation.reader && <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <Tooltip><TooltipTrigger render={<PopoverTrigger render={<PageHeaderAction aria-label="更多速记操作" disabled={!state.config} />} />}><MoreHorizontal aria-hidden="true" /></TooltipTrigger><TooltipContent>更多速记操作</TooltipContent></Tooltip>
            <PopoverContent align="end" className="w-44"><Button variant="ghost" className="h-11 justify-start" disabled={Boolean(state.pending)} onClick={() => { setMenuOpen(false); setBackfillOpen(true); }}>补写历史时段</Button></PopoverContent>
          </Popover>}
          {onBack && <Tooltip><TooltipTrigger render={<PageHeaderAction aria-label="返回桌面" onClick={() => navigation.exit(onBack)} />}><X aria-hidden="true" /></TooltipTrigger><TooltipContent>返回桌面</TooltipContent></Tooltip>}
        </>} />
        <div ref={navigation.overviewRef} hidden={Boolean(navigation.reader)} className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-2 sm:mt-4" aria-label="速记页面内容">
          {state.configLoading && <p role="status" className="mist-glass rounded-[24px] p-5 text-sm text-muted-foreground">正在读取时段与日期配置…</p>}
          {state.configError && <div role="alert" className="mist-glass rounded-[24px] p-5 text-sm"><p>{state.configError}</p><Button variant="outline" className="mt-3 h-11" onClick={() => void controller?.loadConfig()}>重新读取配置</Button></div>}
          {state.config && <QuickNoteDateNavigation config={state.config} date={state.date} onChange={(date) => void controller?.selectDate(date)} />}
          <QuickNoteLogs state={logs.state} timeZone={state.config?.timeZone} onReconnect={logs.reconnect} />
          <QuickNoteOverview state={state} controller={controller} onOpen={navigation.open} />
          {state.config && <QuickNoteConfig config={state.config} loading={state.configLoading} onReload={() => void controller?.loadConfig()} />}
        </div>
        {navigation.reader && <div ref={navigation.readerRef} tabIndex={-1} className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden pb-2 focus:outline-none sm:mt-4" aria-label="单篇速记阅读">
          {state.config ? <QuickNoteReader note={selectedNote} timeZone={state.config.timeZone} state={state} controller={controller} onBack={navigation.back} onAction={action} /> : <div className="mist-glass rounded-[24px] p-4">
            <Button variant="ghost" className="h-11" onClick={navigation.back}>返回日期概览</Button>
            <p role={state.configError ? "alert" : "status"} className="py-3 text-sm">{state.configError || "正在读取时段与日期配置…"}</p>
            {state.configError && <Button variant="outline" className="h-11" onClick={() => void controller?.loadConfig()}>重新读取配置</Button>}
          </div>}
        </div>}
        <QuickNoteRetryDialog open={retryOpen} state={state} controller={controller} onClose={() => setRetryOpen(false)} />
        {state.config && <QuickNoteBackfillDialog open={backfillOpen} config={state.config} initialDate={state.date} disabled={Boolean(state.pending)} onClose={() => setBackfillOpen(false)} onSubmit={(input) => {
          setBackfillOpen(false);
          if (input.overwrite) setConfirmation({ kind: "backfill", input });
          else void controller?.mutate("backfill", `${input.date}:${input.endHour}`, input);
        }} />}
        <QuickNoteConfirmDialog value={confirmation} onCancel={() => setConfirmation(null)} onConfirm={(value) => {
          setConfirmation(null);
          if (value.kind === "backfill") void controller?.mutate("backfill", `${value.input.date}:${value.input.endHour}`, value.input);
          else void controller?.mutate(value.kind, value.note.id);
        }} />
        <QuickNoteEditor editor={state.editor} busy={Boolean(state.pending)} controller={controller} />
        <AlertDialog open={Boolean(navigation.discardAction)} onOpenChange={(next) => { if (!next) navigation.cancelDiscard(); }}>
          <AlertDialogContent>
            <AlertDialogTitle>放弃当前草稿？</AlertDialogTitle>
            <AlertDialogDescription>尚未保存的正文修改会被放弃。</AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11">返回编辑</AlertDialogCancel>
              <AlertDialogAction className="h-11" variant="destructive" onClick={navigation.confirmDiscard}>放弃草稿并返回</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </TooltipProvider>
  );
}

export function QuickNoteConfig({ config, loading, onReload }: { readonly config: TriggerConfig; readonly loading: boolean; readonly onReload: () => void }) {
  return <details className="mist-glass rounded-[24px] px-4 sm:px-5">
    <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">时段配置</summary>
    <div className="space-y-3 pb-3 text-sm text-muted-strong">
      <p>业务时区：{config.timeZone} · 日界：{String(config.dayBoundaryHour).padStart(2, "0")}:00</p>
      <ul className="space-y-2">{config.hours.map((h) => <li key={h}>{config.labels[String(h)]} · 截止 {String(h).padStart(2, "0")}:00</li>)}</ul>
      <Button variant="outline" className="h-11" disabled={loading} onClick={onReload}>重新读取配置</Button>
    </div>
  </details>;
}
