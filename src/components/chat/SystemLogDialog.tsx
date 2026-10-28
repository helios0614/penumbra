import { useEffect, useState, useSyncExternalStore } from "react";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { systemLog } from "@/application/chat-system-log/chat-system-log-store";
import { observeSystemLogPage } from "@/application/chat-system-log/chat-system-log-client";
import type { SystemLogEntry } from "@/application/chat-system-log/chat-system-log-types";
import { useReadonlyDialogFrame } from "./useReadonlyDialogFrame";
import { useSystemLogReading } from "./useSystemLogReading";
import { LogDisclosure as Disclosure } from "./system-log/LogDisclosure";
import { SystemLogDiagnostics, SystemLogError } from "./system-log/SystemLogDiagnostics";
import { SystemLogRequest } from "./system-log/SystemLogRequest";
import "./system-log.css";
const token = (value: number | undefined) => value === undefined ? "—" : value.toLocaleString("zh-CN");
const time = (stamp: number) => new Date(stamp).toLocaleTimeString("zh-CN", { hour12: false });
function LogEntry({ entry }: { entry: SystemLogEntry }) {
  const usage = entry.usage;
  const hasDetail = !!entry.error || !!entry.details || !!entry.executionId || !!entry.requests.length || entry.requestsRemoved;
  return <article className="system-log-entry" data-log-id={entry.id} data-log-error={entry.hasError || undefined}>
    <div className="system-log-summary text-xs text-muted-foreground">
      <div className="system-log-identity">
        <time dateTime={new Date(entry.time).toISOString()} className="tabular-nums">{time(entry.time)}</time>
        <span className="system-log-protocol">{entry.protocol?.toUpperCase() || "协议未提供"}</span>
        {entry.kind === "regenerate" && <span>重新生成</span>}
        {entry.hasError && <span className="font-medium text-error">错误</span>}
        {entry.connectionUnknown && <span className="text-warning">连接结果未确认</span>}
      </div>
      <div className="system-log-model font-medium text-foreground">{entry.model || "模型未提供"}</div>
      <div className="system-log-metrics tabular-nums">
        <span>输入 <b>{token(usage?.prompt_tokens)}</b></span><span>输出 <b>{token(usage?.completion_tokens)}</b></span><span>总计 <b>{token(usage?.total_tokens)}</b></span>
        {usage?.cache_read_input_tokens !== undefined && <span className="text-primary-ink">缓存读 <b>{token(usage.cache_read_input_tokens)}</b></span>}
        {(usage?.cache_creation_input_tokens ?? usage?.cache_write_tokens) !== undefined && <span className="text-primary-ink">缓存写 <b>{token(usage?.cache_creation_input_tokens ?? usage?.cache_write_tokens)}</b></span>}
        <span>RAG <b>{token(entry.recallCount)}</b></span>
      </div>
    </div>
    {hasDetail && <Disclosure title="详情" className="mt-1">
      <SystemLogError entry={entry} />
      {!!entry.requests.length && <section className="system-log-section" aria-label="本次模型请求">
        <h4 className="system-log-section-title">本次模型请求 <span className="font-normal text-muted-foreground">（{entry.requests.length}）</span></h4>
        {entry.requests.map((request, index) => <SystemLogRequest key={request.id} request={request} ordinal={index + 1} />)}
      </section>}
      {entry.executionId && !entry.requests.length && !entry.requestsRemoved && <p className="mb-2 text-xs text-muted-foreground">本次模型请求未提供快照。</p>}
      {entry.requestsRemoved && <p className="my-2 text-xs text-muted-foreground" role="status">部分请求快照已因页面内存预算移除。</p>}
      {!entry.executionId && <p className="mb-2 text-xs text-muted-foreground">未关联具体执行 · {entry.source === "ws" ? "WebSocket 诊断" : "即时诊断"}</p>}
      <SystemLogDiagnostics entry={entry} />
    </Disclosure>}
  </article>;
}
export function SystemLogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useSyncExternalStore(systemLog.subscribe, systemLog.getState, systemLog.getState);
  const frame = useReadonlyDialogFrame(open, onClose, "systemLog");
  const body = useSystemLogReading(open, state);
  useEffect(() => { if (open) systemLog.markRead(); }, [open]);
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent ref={frame} initialFocus={frame} className="mist-paper system-log-dialog" data-system-log-dialog>
      <DialogHeader>
        <DialogTitle>系统日志 <span className="ml-2 text-xs font-normal text-muted-foreground">{state.entries.length} 条{state.entries.length === 200 ? " · 仅最近 200 条" : ""}</span></DialogTitle>
        <DialogDescription className="sr-only">本页即时诊断与模型请求快照。</DialogDescription>
      </DialogHeader>
      <DialogBody ref={body} className="system-log-body">
        {state.removedRequests > 0 && <p className="mb-3 text-xs text-muted-foreground" role="status">已移除 {state.removedRequests} 次请求快照（最近 20 次 / 4 MiB 页面预算）。</p>}
        {state.entries.length ? state.entries.map(entry => <LogEntry key={entry.id} entry={entry} />) : <p className="py-8 text-center text-sm text-muted-foreground">暂无日志</p>}
      </DialogBody>
      <DialogFooter>
        <Button size="sm" variant="ghost" onClick={() => systemLog.clear()} disabled={!state.entries.length}>清空</Button>
        <Button size="sm" variant="outline" onClick={onClose}>关闭</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
export function SystemLogAccess() {
  const [open, setOpen] = useState(false);
  const state = useSyncExternalStore(systemLog.subscribe, systemLog.getState, systemLog.getState);
  useEffect(observeSystemLogPage, []);
  return <div className="shrink-0 border-t border-border p-2">
    <Button variant="ghost" className="w-full justify-start gap-2 text-muted-strong" onClick={() => setOpen(true)} aria-label={state.unread ? "系统日志，有未读错误" : "系统日志"}>
      <ClipboardList className="size-4" aria-hidden="true" />系统日志
      {state.unread && <span className="ml-auto size-1.5 rounded-full bg-error" aria-hidden="true" />}
    </Button>
    <SystemLogDialog open={open} onClose={() => setOpen(false)} />
  </div>;
}
