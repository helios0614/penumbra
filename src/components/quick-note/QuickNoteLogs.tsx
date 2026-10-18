import type { QuickNoteLogState } from "@/application/quick-note/quick-note-logs";
import { Button } from "@/components/ui/button";
import { QUICK_NOTE_LOG_COLORS, quickNoteLogTime, quickNoteLogTone } from "./quick-note-log-presentation";

const CONNECTION_LABELS = { connecting: "日志连接中", connected: "日志已连接", reconnecting: "日志连接中断，正在重连", error: "日志连接失败，请检查登录状态" };

export function QuickNoteLogs({ state, timeZone, onReconnect }: {
  readonly state: QuickNoteLogState; readonly timeZone?: string; readonly onReconnect: () => void;
}) {
  const latest = state.entries[state.entries.length - 1];
  const preview = latest?.message.replace(/\s+/g, " ").slice(0, 120);
  const failed = state.connection === "error" || state.connection === "reconnecting";
  const previewColor = !failed && latest ? QUICK_NOTE_LOG_COLORS[quickNoteLogTone(latest)] : "text-muted-foreground";
  return (
    <section className="mist-glass rounded-[24px] px-4 sm:px-5" aria-label="速记运行日志">
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm text-muted-strong focus-visible:outline-ring">
          <span className="ml-1 inline-flex w-[calc(100%_-_1.5rem)] min-w-0 items-center gap-3 align-middle">
            <span className="shrink-0 font-medium text-foreground">运行日志</span>
            <span className={`min-w-0 truncate text-[11px] ${previewColor}`} role="status">{failed ? CONNECTION_LABELS[state.connection] : preview || (state.connection === "connecting" ? "日志连接中" : "暂无日志")}</span>
          </span>
        </summary>
        <div className="scrollbar-none max-h-64 overflow-y-auto overscroll-contain border-t border-primary/10 py-3" role="region" tabIndex={0} aria-label="详细原始日志">
          <p className="mb-3 text-xs text-muted-foreground">{CONNECTION_LABELS[state.connection]}</p>
          {state.entries.length === 0 ? <p className="py-2 text-sm text-muted-foreground">暂无日志</p> : (
            <ol className="space-y-2 border-l border-border pl-4 text-[11px] leading-5">
              {state.entries.map((entry) => <li key={JSON.stringify([entry.seq, entry.ts, entry.level, entry.message])} className="whitespace-pre-wrap break-words"><LogLine entry={entry} timeZone={timeZone} /></li>)}
            </ol>
          )}
        </div>
        {!failed && <Button variant="ghost" className="mb-1 h-11 px-2 text-xs text-muted-strong" onClick={onReconnect}>重新读取日志</Button>}
      </details>
      {failed && <Button variant="ghost" className="mb-1 h-11 px-2 text-xs text-muted-strong" onClick={onReconnect}>重新连接日志</Button>}
    </section>
  );
}

export function LogLine({ entry, timeZone }: { readonly entry: QuickNoteLogState["entries"][number]; readonly timeZone?: string }) {
  const timestamp = quickNoteLogTime(entry.ts, timeZone);
  const tone = quickNoteLogTone(entry);
  return <span className={QUICK_NOTE_LOG_COLORS[tone]} data-quick-note-log-tone={tone}><time dateTime={timestamp.iso} title={timestamp.full} className="text-muted-foreground">{timestamp.clock}</time> <span>[{entry.level}]</span> <span className="whitespace-pre-wrap break-words">{entry.message}</span></span>;
}
