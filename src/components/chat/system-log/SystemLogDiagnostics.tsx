import { useMemo } from "react";
import type { SystemLogEntry } from "@/application/chat-system-log/chat-system-log-types";
import { Button } from "@/components/ui/button";
import { JsonViewer } from "@/components/ui/json-viewer";
import { useCopyFeedback } from "@/components/ui/copy-feedback";
import { LogTextPreview } from "./LogTextPreview";
import { LogDisclosure } from "./LogDisclosure";
import { diagnosticPresentation, objectValue, type DetailField, type MemoryItem, type Body } from "./system-log-presentation";
export function LogFields({ fields }: { fields: readonly DetailField[] }) {
  return <dl className="system-log-fields">{fields.map(field => <div key={field.key} className="min-w-0" data-diagnostic-field={field.key}>
    <dt className="mb-0.5 text-[11px] text-muted-foreground">{field.label}</dt>
    <dd className="system-log-text text-xs text-foreground" data-log-reading-anchor>{field.text}</dd>
  </div>)}</dl>;
}
function BodyText({ body }: { body: Body }) {
  return body.kind === "text" ? <LogTextPreview text={body.text} />
    : <span className="text-[11px] text-muted-foreground">{body.kind === "hidden" ? "已隐藏" : body.kind === "empty" ? "正文为空" : "正文未提供"}</span>;
}
function MemoryItems({ list }: { list: { items: readonly MemoryItem[] } }) {
  return <div className="system-log-memory-list">{list.items.map(item => <div key={item.index} className="system-log-memory" data-memory-index={item.index}>
    <div className="system-log-memory-heading">
      <span>{String(item.index + 1).padStart(2, "0")}{item.type ? ` · ${item.type}` : ""}</span>
      {item.scores.find(field => field.key === "score") && <span className="system-log-score" data-diagnostic-field="score">score {item.scores.find(field => field.key === "score")!.text}</span>}
    </div>
    <BodyText body={item.body} />
    <dl className="system-log-scores">{item.scores.filter(field => field.key !== "score").map(field => <div key={field.key} data-diagnostic-field={field.key}>
      <dt>{field.label}</dt><dd>{field.text}</dd>
    </div>)}</dl>
  </div>)}</div>;
}
function MemoryList({ title, list, candidate = false }: { title: string; list: { count: number; items: readonly MemoryItem[] }; candidate?: boolean }) {
  return <section className="system-log-section" aria-label={title}>
    {candidate ? <>
      <LogDisclosure title={`${title} · ${list.count} 条`} keepMounted><MemoryItems list={list} /></LogDisclosure>
      <p className="system-log-hint">候选不代表实际注入 · score 与 vec_sim 为不同评分</p>
    </> : <>
      <h4 className="system-log-section-title">{title} <span className="system-log-hint">· {list.count} 条</span></h4>
      <MemoryItems list={list} />
    </>}
  </section>;
}
export function SystemLogDiagnostics({ entry }: { entry: SystemLogEntry }) {
  const view = useMemo(() => diagnosticPresentation(entry.details), [entry.details]);
  const notesHidden = !!view.notes?.length && view.notes.every(note => note.body.kind === "hidden");
  const hasDetails = view.fields.length || view.actual || view.candidates || view.notes?.length || view.metadata !== undefined || view.errorFields.length;
  const copy = useCopyFeedback(useMemo(() => JSON.stringify(entry.details ?? {}, null, 2), [entry.details]));
  return <div className="min-w-0" data-log-diagnostics>
    {!!view.fields.length && <section className="system-log-section" aria-label="本轮诊断"><LogFields fields={view.fields} /></section>}
    {view.actual && <MemoryList title="RAG 实际召回" list={view.actual} />}
    {view.candidates && <MemoryList title="RAG 候选评分" list={view.candidates} candidate />}
    {!!view.notes?.length && <section className="system-log-section" aria-label="生活速记">
      <h4 className="system-log-section-title">生活速记 <span className="system-log-hint font-normal">· {view.notes.length} 个时段{notesHidden && " · 正文已隐藏"}</span></h4>
      {view.notes.map(note => <div key={note.index} className={`system-log-note ${note.body.kind === "text" ? "system-log-note-with-body" : ""}`} data-quick-note={note.index}>
        <div className="system-log-note-context system-log-hint">
          {[note.date, note.period, note.range].filter(Boolean).map((value, index) => <span key={index}>{value}</span>)}
          {!note.date && !note.period && !note.range && <span>速记 {note.index + 1}</span>}
        </div>
        {note.body.kind === "text" ? <LogTextPreview text={note.body.text} copyable label={`速记 ${note.index + 1} 正文`} /> : !notesHidden && <BodyText body={note.body} />}
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
