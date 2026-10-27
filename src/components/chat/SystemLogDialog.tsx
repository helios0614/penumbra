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
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <time dateTime={new Date(entry.time).toISOString()} className="tabular-nums">{time(entry.time)}</time>
      {entry.kind === "regenerate" && <span>重新生成</span>}
      {entry.hasError && <span className="font-medium text-error">错误</span>}
      {entry.connectionUnknown && <span className="text-warning">连接结果未确认</span>}
      <span className="min-w-0 break-all font-medium text-foreground">{entry.model || "模型未提供"}</span>
      <span>{entry.protocol?.toUpperCase() || "协议未提供"}</span>
      <span className="tabular-nums">输入 {token(usage?.prompt_tokens)} · 输出 {token(usage?.completion_tokens)} · 总计 {token(usage?.total_tokens)}</span>
      {!!usage?.cache_read_input_tokens && <span className="text-primary-ink">缓存读 {token(usage.cache_read_input_tokens)}</span>}
      {!!(usage?.cache_creation_input_tokens ?? usage?.cache_write_tokens) && <span className="text-primary-ink">缓存写 {token(usage?.cache_creation_input_tokens ?? usage?.cache_write_tokens)}</span>}
      <span>{entry.recallCount === undefined ? "召回未提供" : `RAG 召回 ${entry.recallCount} 条`}</span>
    </div>
    {hasDetail && <Disclosure title="详情" className="mt-1">
      <SystemLogError entry={entry} />
      {!!entry.requests.length && <Disclosure title={`本次模型请求（${entry.requests.length}）`}>
        {entry.requests.map(request => <SystemLogRequest key={request.id} request={request} />)}
      </Disclosure>}
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
        <DialogDescription>本页即时诊断；后台失败可在重连后恢复。</DialogDescription>
      </DialogHeader>
      <DialogBody ref={body} className="system-log-body">
        {state.removedRequests > 0 && <p className="mb-3 text-xs text-muted-foreground" role="status">已移除 {state.removedRequests} 次请求快照（最近 20 次 / 4 MiB 页面预算）。</p>}
        {state.entries.length ? state.entries.map(entry => <LogEntry key={entry.id} entry={entry} />) : <p className="py-8 text-center text-sm text-muted-foreground">暂无日志</p>}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => systemLog.clear()} disabled={!state.entries.length}>清空</Button>
        <Button variant="outline" onClick={onClose}>关闭</Button>
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
