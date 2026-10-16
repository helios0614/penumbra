import type { QuickNoteLogState } from "@/application/quick-note/quick-note-logs";
import { Button } from "@/components/ui/button";

const CONNECTION_LABELS = { connecting: "日志连接中", connected: "日志已连接", reconnecting: "日志连接中断，正在重连", error: "日志连接失败，请检查登录状态" };

export function QuickNoteLogs({ state, timeZone, onReconnect }: {
  readonly state: QuickNoteLogState; readonly timeZone?: string; readonly onReconnect: () => void;
}) {
  const latest = state.entries[state.entries.length - 1];
  const preview = latest ? { ...latest, message: latest.message.replace(/\s+/g, " ").slice(0, 120) + (latest.message.length > 120 ? "…" : "") } : null;
  return (
    <section className="mist-glass rounded-[24px] px-4 py-3 sm:px-5" aria-label="速记运行日志">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">最近运行日志</h2>
        <span className="text-xs text-muted-foreground" role="status">{CONNECTION_LABELS[state.connection]}</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">连接状态仅表示日志通道；生成结果请以已保存正文为准。</p>
      <details className="mt-2">
        <summary className="min-h-11 cursor-pointer py-3 text-sm text-muted-strong focus-visible:outline-ring">
          {preview ? <><LogLine entry={preview} timeZone={timeZone} /> · 展开日志</> : "暂无收到的日志 · 展开日志"}
        </summary>
        <p className="mb-3 text-xs text-muted-foreground">重新连接会读取服务端当前保留的日志；本页不持久化日志。</p>
        {state.entries.length === 0 ? <p className="py-3 text-sm text-muted-foreground">服务端尚未推送日志。</p> : (
          <ol className="space-y-3 border-l border-border pl-4 text-xs leading-6">
            {state.entries.map((entry) => <li key={JSON.stringify([entry.seq, entry.ts, entry.level, entry.message])} className="whitespace-pre-wrap break-words"><LogLine entry={entry} timeZone={timeZone} /></li>)}
          </ol>
        )}
      </details>
      <Button variant="ghost" className="mt-1 h-11 px-2 text-xs text-muted-strong" onClick={onReconnect}>重新读取日志</Button>
    </section>
  );
}

function LogLine({ entry, timeZone }: { readonly entry: QuickNoteLogState["entries"][number]; readonly timeZone?: string }) {
  const timestamp = timeZone ? new Intl.DateTimeFormat("zh-CN", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(entry.ts * 1000) : new Date(entry.ts * 1000).toISOString();
  return <><time dateTime={new Date(entry.ts * 1000).toISOString()} className="text-muted-foreground">{timestamp}</time> <span className="text-muted-strong">[{entry.level}]</span> <span className="whitespace-pre-wrap break-words text-foreground">{entry.message}</span></>;
}
