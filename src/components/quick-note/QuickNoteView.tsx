import { useState } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal, RefreshCw, X } from "lucide-react";
import type { QuickNoteController } from "@/application/quick-note/quick-note-controller";
import type { QuickNoteState } from "@/application/quick-note/quick-note-state";
import type { QuickNote, TriggerConfig } from "@/domain/quick-note";
import { Button } from "@/components/ui/button";
import { PageHeader, PageHeaderAction } from "@/components/ui/page-header";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { QuickNoteDateNavigation } from "./QuickNoteControls";
import { QuickNoteBackfillDialog, QuickNoteConfirmDialog, QuickNoteRetryDialog, type QuickNoteConfirmation } from "./QuickNoteDialogs";
import { QuickNoteEditor } from "./QuickNoteEditor";
import { QuickNoteLogs } from "./QuickNoteLogs";
import { QuickNoteSection, type NoteAction } from "./QuickNoteSection";
import { useQuickNoteLogs, useQuickNotes } from "./useQuickNotes";

export function QuickNoteView({ onBack }: { readonly onBack?: () => void }) {
  const { state, controller } = useQuickNotes();
  const logs = useQuickNoteLogs();
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
      <main className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden px-4 pb-4 pt-5 sm:px-0 sm:pb-8 sm:pt-8" aria-labelledby="quick-note-page-title">
        <PageHeader eyebrow="QUICK NOTES" title="速记" titleId="quick-note-page-title" description="那些散落的时段，会被整理成可以回看的记录。" actions={<>
          <Tooltip><TooltipTrigger render={<PageHeaderAction aria-label="重试近期未完成时段" disabled={!state.config || Boolean(state.pending)} onClick={() => { setRetryOpen(true); void controller?.loadCandidates(); }} />}><RefreshCw aria-hidden="true" /></TooltipTrigger><TooltipContent>重试近期未完成时段</TooltipContent></Tooltip>
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <Tooltip><TooltipTrigger render={<PopoverTrigger render={<PageHeaderAction aria-label="更多速记操作" disabled={!state.config} />} />}><MoreHorizontal aria-hidden="true" /></TooltipTrigger><TooltipContent>更多速记操作</TooltipContent></Tooltip>
            <PopoverContent align="end" className="w-44"><Button variant="ghost" className="h-11 justify-start" disabled={Boolean(state.pending)} onClick={() => { setMenuOpen(false); setBackfillOpen(true); }}>补写历史时段</Button></PopoverContent>
          </Popover>
          {onBack && <Tooltip><TooltipTrigger render={<PageHeaderAction aria-label="返回桌面" onClick={onBack} />}><X aria-hidden="true" /></TooltipTrigger><TooltipContent>返回桌面</TooltipContent></Tooltip>}
        </>} />
        <div className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pb-2 sm:mt-4" aria-label="速记页面内容">
          {state.configLoading && <p role="status" className="mist-glass rounded-[24px] p-5 text-sm text-muted-foreground">正在读取时段与日期配置…</p>}
          {state.configError && <div role="alert" className="mist-glass rounded-[24px] p-5 text-sm"><p>{state.configError}</p><Button variant="outline" className="mt-3 h-11" onClick={() => void controller?.loadConfig()}>重新读取配置</Button></div>}
          {state.config && <QuickNoteDateNavigation config={state.config} date={state.date} onChange={(date) => void controller?.selectDate(date)} />}
          <QuickNoteLogs state={logs.state} timeZone={state.config?.timeZone} onReconnect={logs.reconnect} />
          <QuickNoteReadingSurface state={state} controller={controller} onAction={action} />
          {state.config && <QuickNoteConfig config={state.config} loading={state.configLoading} onReload={() => void controller?.loadConfig()} />}
        </div>
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
      </main>
    </TooltipProvider>
  );
}

export function QuickNoteReadingSurface({ state, controller, onAction }: {
  readonly state: QuickNoteState; readonly controller: QuickNoteController | null; readonly onAction: (kind: NoteAction, note: QuickNote) => void;
}) {
  const loading = state.status === "loading";
  const data = state.data;
  return (
    <section className="mist-solid rounded-[24px] px-4 py-5 sm:px-7 sm:py-6" aria-label="速记阅读区" aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
        <div><h2 className="text-lg font-semibold">{state.date || "业务日期"}</h2><p className="mt-1 text-xs text-muted-foreground">按创建时间倒序 · 分页阅读</p></div>
        <Button variant="ghost" className="h-11 text-xs text-muted-strong" disabled={!state.config || loading} onClick={() => void controller?.load()}>刷新记录</Button>
      </div>
      {state.notice && <p role={state.notice.tone === "error" ? "alert" : "status"} className={`mt-4 text-sm leading-6 ${state.notice.tone === "error" ? "text-destructive" : "text-muted-strong"}`}>{state.notice.text}</p>}
      {state.pending && <p role="status" className="mt-3 text-sm text-muted-foreground">{state.pending.kind === "backfill" ? "正在提交补写请求…" : "正在处理所选操作…"}</p>}
      {loading && <p role="status" className="py-8 text-sm text-muted-foreground">正在读取速记…</p>}
      {state.error && <div role="alert" className="py-5 text-sm"><p className="text-destructive">{state.error}</p><Button variant="outline" className="mt-3 h-11" onClick={() => void controller?.load()}>重新读取记录</Button></div>}
      {state.config && data && <>
        {!data.items.length && !loading && <p className="py-12 text-center text-sm text-muted-foreground">这个业务日期还没有速记记录。</p>}
        <div className="divide-y divide-border">{data.items.map((note) => <QuickNoteSection key={note.id} note={note} timeZone={state.config!.timeZone} disabled={Boolean(state.pending || state.editor) || loading} pending={state.pending?.target === note.id ? state.pending.kind : undefined} onAction={onAction} />)}</div>
        {data.total > 0 && <nav className="flex flex-wrap items-center justify-center gap-3 border-t border-border pt-4" aria-label="速记分页">
          <Button variant="ghost" className="h-11 px-3" disabled={loading || data.page <= 1} onClick={() => void controller?.setPage(data.page - 1)}><ChevronLeft aria-hidden="true" />上一页</Button>
          <span className="text-xs text-muted-foreground">第 {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))} 页，共 {data.total} 条</span>
          <Button variant="ghost" className="h-11 px-3" disabled={loading || !data.hasMore} onClick={() => void controller?.setPage(data.page + 1)}>下一页<ChevronRight aria-hidden="true" /></Button>
        </nav>}
      </>}
    </section>
  );
}

function QuickNoteConfig({ config, loading, onReload }: { readonly config: TriggerConfig; readonly loading: boolean; readonly onReload: () => void }) {
  return <details className="mist-glass rounded-[24px] px-4 py-2 sm:px-5">
    <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">时段配置</summary>
    <div className="space-y-3 pb-3 text-sm text-muted-strong">
      <p>业务时区：{config.timeZone} · 日界：{String(config.dayBoundaryHour).padStart(2, "0")}:00</p>
      <ul className="space-y-2">{config.hours.map((h) => <li key={h}>{config.labels[String(h)]} · 截止 {String(h).padStart(2, "0")}:00</li>)}</ul>
      <p className="text-xs leading-5 text-muted-foreground">当前为只读配置入口。时段名称与截止小时沿用服务端规则，历史记录使用保存时的名称。</p>
      <Button variant="outline" className="h-11" disabled={loading} onClick={onReload}>重新读取配置</Button>
    </div>
  </details>;
}
