import { ApiError, apiPost } from "@/lib/api";
import { traceChatPage } from "@/lib/chat-timeline";
import { assistantFailureIndex, safeHttpErrorContent } from "@/domain/message/assistant-failure";
import { isDefiniteChatRejection } from "@/application/chat-send/chat-send-rejection";
import { publicText, publicHttpMetadata, record } from "./chat-system-log-projection";
import { systemLog } from "./chat-system-log-store";
import type { LogContext } from "./chat-system-log-types";
import { createRequestSnapshotDrain } from "./request-snapshot-drain";
let page: string | null = null;
const collector = createRequestSnapshotDrain(readRequestSnapshots);
let localSequence = 0;
const localId = () => { try { return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${++localSequence}`; } catch { return `local-${Date.now()}-${++localSequence}`; } };
function pageScope() {
  try { return page ??= globalThis.crypto?.randomUUID?.().replace(/-/g, "") ?? null; } catch { return null; }
}
export function debugExecution(conversationId: string, kind: "send" | "regenerate", clientId?: string, targetId?: string) {
  const context: LogContext = { conversationId, kind, targetId, executionId: `${kind}:${clientId && /^[A-Za-z0-9._-]{8,100}$/.test(clientId) ? clientId : localId()}` };
  try { systemLog.begin(context); } catch { /* Debug allocation cannot reject a real request. */ }
  const scope = pageScope();
  const headers: Record<string, string> = scope ? { "X-Penumbra-Debug-Page": scope, "X-Penumbra-Debug-Execution": context.executionId } : {};
  const finish = scope ? collector.start() : () => {};
  return { context, headers, finish };
}
/** A bounded destructive mailbox, not a history reader or generation poll. */
export function drainRequestSnapshots() { return collector.drain(); }
async function readRequestSnapshots() {
  if (!page) return "unauthorized" as const;
  const epoch = systemLog.getState().clearedAt;
  try {
    traceChatPage("log.drain.begin");
    const response = await apiPost<unknown>("/api/chat/debug/drain", undefined, { headers: { "X-Penumbra-Debug-Page": page }, timeoutMs: 5000, cache: "no-store" });
    traceChatPage("log.drain.received");
    const result = record(response);
    traceChatPage("log.snapshots.begin", { size: Array.isArray(result?.records) ? result.records.length : 0 });
    if (epoch === systemLog.getState().clearedAt && Array.isArray(result?.records)) systemLog.snapshots(result.records, typeof result.dropped === "number" ? result.dropped : 0);
    traceChatPage("log.snapshots.end");
    return Array.isArray(result?.records) ? result.records.length : 0;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) { systemLog.clear(); page = null; return "unauthorized" as const; }
    if (error instanceof ApiError && [403, 404, 405].includes(error.status)) return "unavailable" as const;
    throw error;
  } finally { traceChatPage("log.drain.end"); }
}
export function observeDebugStream(input: unknown, context: LogContext) {
  const row = record(input); if (!row) return;
  if (row.type === "start" && typeof row.id === "string") systemLog.bindMessage(context, row.id);
  if (row.type === "debug") systemLog.diagnostic(row, "sse", context);
  if (["debug", "mcp_loading", "poi_search", "cam_check", "location_check", "activity_check"].includes(String(row.type))) collector.request();
}
export function observeDebugRealtime(input: unknown) {
  const root = record(input);
  if (root?.type === "debug") systemLog.diagnostic(root.data, "ws");
  if (!page || !root || !["debug", "msg_created", "msg_updated", "mcp_loading", "poi_search", "web_search_result", "cam_check", "location_check", "activity_check"].includes(String(root.type))) return;
  const data = record(root.data);
  const message = data?.msg_id ?? data?.source_message_id ?? data?.id;
  const conversation = data?.conv_id;
  // A global WS can include other devices/tasks. Only our origins (or an
  // unassociated tool signal during existing demand) may renew the mailbox.
  const own = typeof message === "string" && systemLog.ownsMessage(message) || systemLog.getState().entries.some(entry => entry.executionId && (
    typeof message === "string" && (entry.messageId === message || entry.targetId === message)
    || typeof conversation === "string" && entry.conversationId === conversation));
  if (own || !message && !conversation && collector.hasDemand()) collector.request();
}
export function observeDebugHttpError(error: unknown, context: LogContext) {
  try {
    const detail = error instanceof ApiError ? safeHttpErrorContent(error.data) ?? publicHttpMetadata(error.data) : null;
    const status = error instanceof ApiError && error.status ? `HTTP ${error.status}` : "连接中断";
    systemLog.issue(context, publicText(`${status}${detail ? `\n${detail}` : ""}`) ?? status, isDefiniteChatRejection(error, context.kind));
    collector.request();
  } catch { /* Keep the original execution error. */ }
}
/** Only a bounded error suffix is retained, never the accumulated body/Thinking. */
export function streamErrorObserver(context: LogContext) {
  let tail = "", errorText = "";
  return (input: unknown) => {
    const row = record(input); if (row?.type !== "chunk" || typeof row.content !== "string") return;
    const candidate = (errorText || tail) + row.content;
    const index = assistantFailureIndex(candidate);
    if (errorText || index >= 0) {
      errorText = candidate.slice(index >= 0 ? index : 0).slice(0, 8192);
      systemLog.diagnostic({ msg_id: context.targetId, has_error: true, error_text: errorText }, "sse", context);
    } else tail = candidate.slice(-64);
  };
}
export function observeSystemLogPage() {
  collector.resume();
  return () => { /* Execution/grace reads survive navigation and archive in flight. */ };
}
