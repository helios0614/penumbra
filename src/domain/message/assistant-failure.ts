/** Display adapter for AionHome's existing provider error text contract.
 * Provider diagnostics are allowlisted/redacted at ai_providers.py. Never echo
 * arbitrary HTTP/debug bodies here; old stored diagnostics fail closed as well.
 */
export const ASSISTANT_FAILURE_PREFIXES = [
  "[硅基流动错误", "[Gemini错误", "[中转站错误", "[自定义 API 错误",
  "[Anthropic API 错误", "[模型服务错误", "[请求出错:", "[错误]",
] as const;

export function assistantFailureIndex(text: string): number {
  const indices = ASSISTANT_FAILURE_PREFIXES.map(prefix => text.indexOf(prefix)).filter(index => index >= 0);
  if (indices.length) return Math.min(...indices);
  const legacy = text.search(/provider_(?:request|execution)_failed/);
  return legacy < 0 ? -1 : text.lastIndexOf("\n", legacy) + 1;
}

export function assistantFailureCode(text: string): "provider_request_failed" | "provider_execution_failed" | null {
  if (text.includes("provider_request_failed") || text.startsWith("[错误]")) return "provider_request_failed";
  if (text.includes("provider_execution_failed")) return "provider_execution_failed";
  return null;
}

/** Neutral headings add source facts without interpreting the upstream cause. */
export function formatAssistantFailure(text: string): string {
  const provider = text.match(/^\[(硅基流动|Gemini|中转站|自定义 API|Anthropic API|模型服务)\s*错误\s+(\d{3})\]\s*provider_request_failed/);
  const marker = provider?.[0] ?? text.match(/^\[请求出错:\s*[a-z0-9_]+\]/)?.[0] ?? text.match(/^\[错误\]/)?.[0];
  const heading = provider ? `模型服务请求失败（${provider[1]}，HTTP ${provider[2]}）` : "当前回复生成失败。";
  const tail = marker ? text.slice(marker.length).trim() : "";
  const details = tail.split(/\r?\n/).filter(line => line.trim() && safeDiagnosticLine(line)).join("\n").slice(0, 1536);
  return details ? `${heading}\n${details}` : heading;
}

/** HTTP bodies have no server-side redaction guarantee (e.g. a proxy response).
 * Project only common scalar error fields and reject unsafe text, never dump
 * arbitrary JSON, HTML, headers, request payloads or debug objects.
 */
export function safeHttpErrorContent(value: unknown, depth = 0): string | null {
  if (depth > 4) return null;
  if (typeof value === "string") {
    const text = value.trim();
    return text && !text.startsWith("<") && safeDiagnosticLine(text.replace(/\r?\n/g, " ")) ? text.slice(0, 1536) : null;
  }
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    const text = value.slice(0, 8).map(item => safeHttpErrorContent(item, depth + 1)).filter(Boolean).join("\n");
    return text || null;
  }
  const record = value as Record<string, unknown>;
  const details = ["message", "msg", "detail", "reason", "error_description", "description", "error_message", "title", "error", "errors"]
    .map(key => safeHttpErrorContent(record[key], depth + 1)).filter((text): text is string => text !== null);
  const body = [...new Set(details)].join("\n");
  if (!body) return null;
  const metadata = [["type", "错误类型"], ["code", "错误代码"], ["request_id", "请求 ID"], ["requestid", "请求 ID"]]
    .flatMap(([key, label]) => {
      const value = record[key];
      if (typeof value !== "string" && typeof value !== "number") return [];
      const text = `${label}：${value}`;
      return safeDiagnosticLine(text) ? [text] : [];
    });
  return [body, ...metadata].join("\n").slice(0, 1536);
}

function safeDiagnosticLine(line: string): boolean {
  // This is a rejection guard, not a second redactor. Only the server owns
  // credential replacement. Reject unsanitized legacy lines in their entirety.
  const checked = line.replace(/(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[_-]?key|[\w-]*token|secret)\s*["']?\s*[:=]\s*["']?(?:Bearer\s*)?<redacted>/gi, "");
  const urls = checked.match(/https?:\/\/[^\s<>]+/gi) ?? [];
  if (urls.some(value => {
    try {
      const url = new URL(value);
      return !!url.username || !!url.password || [...url.searchParams.keys()].some(key => /^(?:key)$|api[_-]?key|authorization|token|secret|password|credential|cookie/i.test(key));
    } catch { return true; }
  })) return false;
  return !/(?:\b(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[_-]?key|[\w-]*token|secret)\b["']?\s*[:=]|\bBearer\s+(?!<redacted>)\S+|\bsk-[A-Za-z0-9_-]{8,}|\[THINKING|\[HEART:|\[MCP:|<meta>|[\x00-\x1f\x7f])/i.test(checked);
}
