import { useMemo } from "react";
import type { SystemLogEntry } from "@/application/chat-system-log/chat-system-log-types";
import { Button } from "@/components/ui/button";
import { JsonViewer } from "@/components/ui/json-viewer";
import { useCopyFeedback } from "@/components/ui/copy-feedback";
import { LogDisclosure } from "./LogDisclosure";
import { diagnosticPresentation, objectValue, type DetailField, type MemoryItem, type Body } from "./system-log-presentation";
export function LogFields({ fields }: { fields: readonly DetailField[] }) {
  return <dl className="system-log-fields">{fields.map(field => <div key={field.key} className="min-w-0" data-diagnostic-field={field.key}>
    <dt className="mb-0.5 text-[11px] text-muted-foreground">{field.label}</dt>
    <dd className="system-log-text text-xs text-foreground" data-log-reading-anchor>{field.text}</dd>
  </div>)}</dl>;
}
function BodyText({ body }: { body: Body }) {
  return body.kind === "text" ? <p className="system-log-text text-xs leading-relaxed" data-log-reading-anchor>{body.text}</p>
    : <span className="text-[11px] text-muted-foreground">{body.kind === "hidden" ? "已隐藏" : body.kind === "empty" ? "正文为空" : "正文未提供"}</span>;
}
function MemoryList({ title, list, candidate = false }: { title: string; list: { count: number; items: readonly MemoryItem[] }; candidate?: boolean }) {
  return <section className="system-log-section" aria-label={title}>
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h4 className="text-xs font-medium">{title}</h4><span className="text-[11px] text-muted-foreground">{list.count} 条{candidate && " · 候选不代表实际注入"}</span></div>
    {list.items.map(item => <LogDisclosure key={item.index} title={`${candidate ? "候选" : "召回"} ${String(item.index + 1).padStart(2, "0")}${item.type ? ` · ${item.type}` : ""}${item.scores[0]?.key === "score" ? ` · ${item.scores[0].text}` : ""}`}>
      <BodyText body={item.body} />
      {!!item.scores.length && <div className="mt-2"><LogFields fields={item.scores} /></div>}
    </LogDisclosure>)}
  </section>;
}
export function SystemLogDiagnostics({ entry }: { entry: SystemLogEntry }) {
  const view = useMemo(() => diagnosticPresentation(entry.details), [entry.details]);
  const hasDetails = view.fields.length || view.actual || view.candidates?.count || view.notes?.length || view.metadata !== undefined || view.errorFields.length;
  const copy = useCopyFeedback(useMemo(() => JSON.stringify(entry.details ?? {}, null, 2), [entry.details]));
  return <div className="min-w-0" data-log-diagnostics>
    {!!view.fields.length && <section className="system-log-section" aria-label="本轮诊断"><LogFields fields={view.fields} /></section>}
    {view.actual && <MemoryList title="RAG 实际召回" list={view.actual} />}
    {!!view.candidates?.count && <MemoryList title="RAG 候选评分" list={view.candidates} candidate />}
    {!!view.notes?.length && <section className="system-log-section" aria-label="生活速记">
      <h4 className="mb-1 text-xs font-medium">生活速记 <span className="ml-1 font-normal text-muted-foreground">{view.notes.length} 个时段</span></h4>
      {view.notes.map(note => <div key={note.index} className="py-1" data-quick-note={note.index}>
        {note.body.kind === "text" ? <LogDisclosure title={[note.date, note.period, note.range].filter(Boolean).join(" · ") || `速记 ${note.index + 1}`}><BodyText body={note.body} /></LogDisclosure>
          : <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 px-2 py-1 text-xs">
            <span>{[note.date, note.period, note.range].filter(Boolean).join(" · ") || `速记 ${note.index + 1}`}</span><BodyText body={note.body} />
          </div>}
      </div>)}
    </section>}
    {view.metadata !== undefined && <section className="system-log-section" aria-label="Provider 返回 metadata">
      <LogDisclosure title="Provider 返回 metadata"><JsonViewer data={view.metadata} label="Provider 返回 metadata" /></LogDisclosure>
    </section>}
    {hasDetails && <div className="mt-2 flex justify-end"><Button variant="ghost" size="xs" onClick={copy} aria-label="复制日志诊断">复制诊断</Button></div>}
  </div>;
}
export function SystemLogError({ entry }: { entry: SystemLogEntry }) {
  const { errorFields } = useMemo(() => diagnosticPresentation(entry.details), [entry.details]);
  const details = objectValue(entry.details);
  const source = JSON.stringify({
    ...(entry.error ? { message: entry.error } : {}),
    ...(details?.error_code !== undefined ? { error_code: details.error_code } : {}),
    ...(details?.["安全上游错误"] !== undefined ? { provider_error: details["安全上游错误"] } : {}),
  }, null, 2);
  const copy = useCopyFeedback(source);
  if (!entry.error && !errorFields.length) return null;
  return <section className="system-log-section text-error" aria-label="错误详情" data-log-error-detail>
    <div className="mb-2 flex items-center justify-between gap-2"><h4 className="text-xs font-medium">错误详情</h4><Button variant="ghost" size="xs" onClick={copy} aria-label="复制安全错误详情">复制</Button></div>
    {entry.error && <p className="system-log-text mb-2 text-xs leading-relaxed" data-log-reading-anchor>{entry.error}</p>}
    {!!errorFields.length && <LogFields fields={errorFields} />}
  </section>;
}
