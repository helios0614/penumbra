import { useMemo, useState } from "react";
import type { RequestSnapshot } from "@/application/chat-system-log/chat-system-log-types";
import { Button } from "@/components/ui/button";
import { useCopyFeedback } from "@/components/ui/copy-feedback";
import { JsonViewer } from "@/components/ui/json-viewer";
import { LogDisclosure } from "./LogDisclosure";
import { LogViewSwitch } from "./LogViewSwitch";
import { objectValue, requestParameters, requestPresentation, wireStructure } from "./system-log-presentation";
import { WireField, WireMessages, WireSystem, WireTools } from "./SystemLogWire";
export function SystemLogRequestBody({ request }: { request: RequestSnapshot }) {
  const [allowLarge, setAllowLarge] = useState(false);
  const view = useMemo(() => requestPresentation(request.payloadJson, allowLarge), [request.payloadJson, allowLarge]);
  const parameters = useMemo(() => view.kind === "grouped" ? requestParameters(view.sections.filter(section => section.kind === "parameters").flatMap(section => section.entries), request.protocol) : null, [view, request.protocol]);
  const copy = useCopyFeedback(request.payloadJson);
  return <div className="min-w-0" data-private-request-body>
    <LogViewSwitch label="请求阅读方式" action={<Button size="xs" variant="ghost" onClick={copy} aria-label="复制安全请求投影">复制完整投影</Button>} views={[
      { id: "grouped", label: "分组", content: <>
      {view.kind === "deferred" ? <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>请求较大，按需加载分组。</span><Button size="xs" variant="outline" onClick={() => setAllowLarge(true)}>加载分组</Button></div>
        : view.kind === "raw" ? <JsonViewer rawText={request.payloadJson} label="安全请求投影" showCopy={false} defaultMode="raw" /> : <>
          {parameters && <section className="system-log-section" aria-label="生成参数" data-wire-section="parameters">
            {parameters.groups.map(group => <div key={group.label} className="system-log-parameter-group">
              <h4 className="system-log-section-title">{group.label}</h4>
              <dl className="system-log-parameter-fields">{group.fields.map(field => <div key={field.path} data-parameter-path={field.path} title={field.path}>
                <dt>{field.label}</dt><dd className="system-log-text" data-log-reading-anchor>{field.value === null ? "null" : String(field.value)}</dd>
              </div>)}</dl>
            </div>)}
            {!!parameters.other.length && <LogDisclosure title="其他请求字段" keepMounted>
              {parameters.other.map(([name, value]) => <WireField key={name} name={name} value={value} />)}
            </LogDisclosure>}
          </section>}
          {view.sections.filter(section => section.kind !== "parameters").flatMap(section => section.entries.map(([name, value]) => {
            const count = Array.isArray(value) ? value.length : Array.isArray(objectValue(value)?.parts) ? (objectValue(value)!.parts as unknown[]).length : 1;
            const tools = Array.isArray(value) ? value.slice(0, 4).map(tool => { const row = objectValue(tool); return row?.name ?? objectValue(row?.function)?.name ?? row?.type; }).filter(item => typeof item === "string").join(" · ") : wireStructure(value);
            return <section key={name} className="system-log-section" data-wire-section={name}>
              {section.kind === "messages" ? <>
                <h4 className="system-log-section-title">Messages <span className="system-log-hint">· {name}</span></h4>
                <WireMessages name={name} value={value} />
              </> : <LogDisclosure title={`${section.kind === "system" ? "System" : "Tools"} · ${count} ${section.kind === "system" ? "块" : "项"} · ${name}`} keepMounted
                preview={<p className="system-log-text system-log-hint system-log-clamp">{section.kind === "system" ? wireStructure(value) : tools}</p>}>
                {section.kind === "system" ? <WireSystem name={name} value={value} /> : <WireTools name={name} value={value} />}
              </LogDisclosure>}
            </section>;
          }))}
        </>}
      </> },
      { id: "json", label: "原始 JSON", content: <JsonViewer rawText={request.payloadJson} label="安全请求投影" showCopy={false} defaultMode="raw" /> },
    ]} />
  </div>;
}
const requestLabel = (request: RequestSnapshot, ordinal: number) => `${String(ordinal).padStart(2, "0")} · ${new Date(request.time).toLocaleTimeString("zh-CN", { hour12: false })} · ${request.model || "模型未提供"}${request.source ? ` · ${request.source}` : ""}`;
export function SystemLogRequest({ request }: { request: RequestSnapshot }) {
  return <div className="system-log-request" data-request-id={request.id}>
    {!request.complete && <p role="status" className="mb-1 text-xs text-warning">未完整捕获：{request.limitations.join("、") || "内容受限"}</p>}
    <SystemLogRequestBody request={request} />
    <LogDisclosure title="请求辅助信息" className="system-log-request-meta" keepMounted>
      <dl>
        <div><dt>协议</dt><dd className="system-log-text">{request.protocol.toUpperCase()}</dd></div>
        <div><dt>捕获阶段</dt><dd className="system-log-text">{request.stage}</dd></div>
        {request.endpoint && <div><dt>请求 URL</dt><dd className="system-log-text">{request.endpoint}</dd></div>}
      </dl>
    </LogDisclosure>
  </div>;
}
export function SystemLogRequests({ requests }: { requests: readonly RequestSnapshot[] }) {
  return <section aria-label="本次模型请求">
    <h4 className="system-log-section-title">本次 Provider 请求 · {requests.length} 次</h4>
    {requests.length === 1 && <p className="system-log-hint system-log-text mb-1">{requestLabel(requests[0], 1)}</p>}
    <LogViewSwitch label="选择 Provider 请求" className="system-log-request-switch" views={requests.map((request, index) => ({
      id: request.id, label: requestLabel(request, index + 1), content: <SystemLogRequest request={request} />,
    }))} />
  </section>;
}
