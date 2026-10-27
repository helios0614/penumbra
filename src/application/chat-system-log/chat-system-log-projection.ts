import type { JsonValue } from "@/domain/message";
import type { RequestSnapshot } from "./chat-system-log-types";
import { assistantFailureIndex, formatAssistantFailure } from "@/domain/message/assistant-failure";
export const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
export const string = (value: unknown): string | undefined => typeof value === "string" && value.length > 0 ? value : undefined;
const privateContent = /\[(?:HEART|DRIFT|SIMPLETHINK|THINKING|MCP)[:_]|<meta>/i;
const unsafeKeys = /^(?:authorization|proxy.?authorization|cookie|set.?cookie|api.?key|x.?api.?key|secret|credential|password|token|access.?token|refresh.?token)$/i;
/** Public diagnostics only. Private wire projections never pass through this adapter. */
export function publicText(value: unknown, limit = 8192): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.slice(0, limit);
  if (privateContent.test(text)) return "[私有内容已隐藏]";
  return text.replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "<redacted>")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/\b(?:authorization|proxy-authorization|cookie|set-cookie)["']?\s*[:=][^\r\n]+/gi, "credential=<redacted>")
    .replace(/\b(api[_-]?key|token|secret|password)["']?\s*[:=]\s*["']?[^"'\s,}<]+/gi, "$1=<redacted>")
    .replace(/https?:\/\/[^\s<>"']+/g, value => {
      try {
        const url = new URL(value); url.username = ""; url.password = ""; url.hash = "";
        for (const key of [...url.searchParams.keys()]) if (/key|token|auth|sign|sig|credential|password|secret|^x-amz-|^policy$|^expires$/i.test(key)) url.searchParams.set(key, "<redacted>");
        return url.toString();
      } catch { return "<redacted-url>"; }
    });
}
const metadataKeys = new Set(["events", "event", "data", "message", "delta", "type", "id", "model", "role", "usage", "stop_reason", "stop_sequence", "input_tokens", "output_tokens", "prompt_tokens", "completion_tokens", "total_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "cache_creation", "ephemeral_5m_input_tokens", "ephemeral_1h_input_tokens", "format", "transport", "request_id", "request_ids", "request-id", "x-request-id", "cf-ray", "x-correlation-id", "code", "status", "status_code", "upstream_status", "error", "errors", "reason", "detail", "msg", "description", "upstream_message", "body_kind", "body_truncated", "body_preview"]);
function metadata(value: unknown, depth = 0): JsonValue {
  if (depth > 8) return "[详情深度受限]";
  if (Array.isArray(value)) return value.slice(0, 100).map(item => metadata(item, depth + 1));
  const object = record(value);
  if (object) return Object.fromEntries(Object.entries(object).filter(([key]) => metadataKeys.has(key) && !unsafeKeys.test(key)).map(([key, item]) => [key, metadata(item, depth + 1)]));
  if (typeof value === "string") return publicText(value) ?? "";
  return value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value) ? value : null;
}
export function projectDiagnostic(input: unknown) {
  const root = record(input); if (!root) return null;
  const data = record(root.system_log) ?? root;
  const usage = record(data.usage);
  const safeUsage: Record<string, number> = {};
  for (const key of ["prompt_tokens", "completion_tokens", "total_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "cache_write_tokens"]) {
    const value = usage?.[key]; if (typeof value === "number" && Number.isFinite(value) && value >= 0) safeUsage[key] = value;
  }
  const details: Record<string, JsonValue> = {};
  for (const [key, label] of [["recall_keywords", "关键词"], ["recall_topic", "话题"], ["recall_query", "召回查询"]]) {
    const text = publicText(data[key]); if (text) details[label] = text;
  }
  if (typeof data.is_search_needed === "boolean") details["哨兵需要搜索"] = data.is_search_needed;
  for (const [key, label] of [["recalled_memories", "RAG 实际召回"], ["debug_top6", "RAG 候选评分"], ["quick_notes", "生活速记"]]) {
    if (Array.isArray(data[key])) details[label] = (data[key] as unknown[]).slice(0, 30).flatMap(item => {
      const row = record(item); return row ? [Object.fromEntries(Object.entries(row).filter(([k]) => ["content", "type", "score", "vec_sim", "kw_score", "importance", "period_label", "date", "time_range", "output"].includes(k)).flatMap<[string, JsonValue]>(([k, v]) => typeof v === "string" ? [[k, publicText(v) ?? ""]] : typeof v === "number" && Number.isFinite(v) ? [[k, v]] : [])) as JsonValue] : [];
    });
  }
  for (const [key, label] of [["api_response", "Provider 返回 metadata"], ["provider_error", "安全上游错误"]]) if (data[key]) details[label] = metadata(data[key]);
  for (const key of ["status", "reason", "source", "retries", "error_code", "protocol_source"]) if (typeof data[key] === "string" || typeof data[key] === "number") details[key] = publicText(String(data[key])) ?? "";
  if (typeof data.prompt_count === "number") details["上下文消息数"] = data.prompt_count;
  const rawError = string(data.error_text) ?? string(root.error_text);
  const index = rawError ? assistantFailureIndex(rawError) : -1;
  const error = rawError ? index >= 0 ? publicText(formatAssistantFailure(rawError.slice(index)))
    : rawError.startsWith("[Anthropic 未返回正文") || typeof data.task_id === "string" || !data.msg_id && data.has_error === true ? publicText(rawError) : undefined : undefined;
  const protocol = string(data.api_format);
  return {
    data, messageId: string(data.msg_id), taskId: string(data.task_id), model: publicText(data.model, 256),
    protocol: protocol && ["openai", "anthropic", "gemini"].includes(protocol) ? protocol : undefined,
    hasError: data.has_error === true, error, usage: Object.keys(safeUsage).length ? safeUsage : undefined,
    recallCount: Array.isArray(data.recalled_memories) ? data.recalled_memories.length : undefined,
    details: Object.keys(details).length ? details : undefined,
  };
}
export function projectSnapshot(value: unknown): RequestSnapshot | null {
  const row = record(value);
  if (!row || typeof row.id !== "string" || typeof row.execution_id !== "string" || typeof row.conversation_id !== "string" || typeof row.payload_json !== "string" || row.payload_json.length > 1024 * 1024 || typeof row.created_at !== "number" || !Number.isFinite(new Date(row.created_at * 1000).getTime())) return null;
  return { id: row.id, executionId: row.execution_id, conversationId: row.conversation_id, kind: row.kind === "regenerate" ? "regenerate" : "send",
    time: row.created_at * 1000, model: publicText(row.model, 256) ?? "", protocol: publicText(row.protocol, 64) ?? "",
    source: publicText(row.source, 128) ?? "", endpoint: publicText(row.endpoint, 2048) ?? "",
    payloadJson: row.payload_json, stage: publicText(row.stage, 128) ?? "未提供捕获阶段",
    complete: row.complete === true, limitations: Array.isArray(row.limitations) ? row.limitations.flatMap(v => typeof v === "string" ? [publicText(v, 128)!] : []) : [] };
}

/** Proxy HTTP data has no private capture authority; only known error metadata. */
export function publicHttpMetadata(input: unknown): string | undefined {
  const visit = (value: unknown, depth = 0): JsonValue | undefined => {
    if (depth > 4) return undefined;
    const object = record(value); if (!object) return undefined;
    const projected: Record<string, JsonValue> = {};
    for (const key of ["error", "errors", "detail"]) {
      const nested = visit(object[key], depth + 1); if (nested) projected[key] = nested;
    }
    for (const key of ["type", "code", "status", "status_code", "request_id", "requestid", "upstream_status", "upstream_message"]) {
      const value = object[key];
      if (typeof value === "string" && !value.trim().startsWith("<") && !privateContent.test(value)) projected[key] = publicText(value, 1536) ?? "";
      else if (typeof value === "number" && Number.isFinite(value)) projected[key] = value;
    }
    return Object.keys(projected).length ? projected : undefined;
  };
  const safe = visit(input); return safe ? JSON.stringify(safe, null, 2) : undefined;
}
