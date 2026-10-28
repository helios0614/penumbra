import { useMemo, useState } from "react";
import type { RequestSnapshot } from "@/application/chat-system-log/chat-system-log-types";
import { Button } from "@/components/ui/button";
import { useCopyFeedback } from "@/components/ui/copy-feedback";
import { JsonViewer } from "@/components/ui/json-viewer";
import { LogDisclosure } from "./LogDisclosure";
import { requestPresentation } from "./system-log-presentation";
import { WireField, WireMessages, WireSystem, WireTools } from "./SystemLogWire";
export function SystemLogRequestBody({ request }: { request: RequestSnapshot }) {
  const [mode, setMode] = useState<"grouped" | "json">("grouped");
  const [allowLarge, setAllowLarge] = useState(false);
  const view = useMemo(() => mode === "grouped" ? requestPresentation(request.payloadJson, allowLarge) : null, [mode, request.payloadJson, allowLarge]);
  const copy = useCopyFeedback(request.payloadJson);
  return <div className="min-w-0" data-private-request-body>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
      <div role="group" aria-label="请求阅读方式" className="flex flex-wrap gap-1">
        <Button size="xs" variant="ghost" aria-pressed={mode === "grouped"} onClick={() => setMode("grouped")}>分组</Button>
        <Button size="xs" variant="ghost" aria-pressed={mode === "json"} onClick={() => setMode("json")}>原始 JSON</Button>
      </div>
      <Button size="xs" variant="ghost" onClick={copy} aria-label="复制安全请求投影">复制完整投影</Button>
    </div>
    {mode === "json" ? <JsonViewer rawText={request.payloadJson} label="安全请求投影" showCopy={false} defaultMode="raw" />
      : view?.kind === "deferred" ? <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>请求较大，按需加载分组。</span><Button size="xs" variant="outline" onClick={() => setAllowLarge(true)}>加载分组</Button></div>
      : view?.kind === "raw" ? <div><p className="mb-2 text-xs text-muted-foreground">此请求结构使用原始 JSON 查看。</p><JsonViewer rawText={request.payloadJson} label="安全请求投影" showCopy={false} defaultMode="raw" /></div>
      : view?.sections.map((section, index) => section.kind === "parameters" ? <div role="group" key={index} className="system-log-parameters" aria-label="生成参数" data-wire-section="parameters">
        {section.entries.map(([name, value]) => <WireField key={name} name={name} value={value} />)}
      </div> : section.entries.map(([name, value]) => <div key={name} className="system-log-section" data-wire-section={name}>
        <LogDisclosure title={`${section.kind === "system" ? "System" : section.kind === "messages" ? "Messages" : "Tools"} · ${name}${Array.isArray(value) ? `（${value.length}）` : ""}`}>
          {section.kind === "system" ? <WireSystem name={name} value={value} /> : section.kind === "messages" ? <WireMessages name={name} value={value} /> : <WireTools name={name} value={value} />}
        </LogDisclosure>
      </div>))}
  </div>;
}
export function SystemLogRequest({ request, ordinal }: { request: RequestSnapshot; ordinal: number }) {
  const stamp = new Date(request.time).toLocaleTimeString("zh-CN", { hour12: false });
  return <div className="system-log-request" data-request-id={request.id}><LogDisclosure title={`${String(ordinal).padStart(2, "0")} · ${stamp} · ${request.source === "provider" ? "模型请求" : request.source} · ${request.model || "模型未提供"}`}>
    <div className="mb-1 space-y-0.5 text-[11px] text-muted-foreground">
      <p>{request.protocol.toUpperCase()} · {request.stage === "http_json_before_send" ? "HTTP JSON 提交前" : request.stage}</p>
      {request.endpoint && <p className="break-all">{request.endpoint}</p>}
      {!request.complete && <p role="status" className="text-warning">未完整捕获：{request.limitations.join("、") || "内容受限"}</p>}
    </div>
    <SystemLogRequestBody request={request} />
  </LogDisclosure></div>;
}
