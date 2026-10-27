import { ApiError, apiPost } from "@/lib/api";
import { assistantFailureIndex, safeHttpErrorContent } from "@/domain/message/assistant-failure";
import { isDefiniteChatRejection } from "@/application/chat-send/chat-send-rejection";
import { publicText, publicHttpMetadata, record } from "./chat-system-log-projection";
import { systemLog } from "./chat-system-log-store";
import type { LogContext } from "./chat-system-log-types";
let page: string | null = null;
let polling: ReturnType<typeof setInterval> | null = null;
let readers = 0;
let inFlight = false;
let unavailable = false;
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
  return { context, headers };
}
/** A bounded destructive mailbox, not a history reader or generation poll. */
export async function drainRequestSnapshots() {
  if (!page || !readers || inFlight || unavailable) return;
  inFlight = true;
  const epoch = systemLog.getState().clearedAt;
  try {
    const response = await apiPost<unknown>("/api/chat/debug/drain", undefined, { headers: { "X-Penumbra-Debug-Page": page }, timeoutMs: 5000, cache: "no-store" });
    const result = record(response);
    if (epoch === systemLog.getState().clearedAt && Array.isArray(result?.records)) systemLog.snapshots(result.records, typeof result.dropped === "number" ? result.dropped : 0);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) { systemLog.clear(); page = null; }
    if (error instanceof ApiError && [403, 404, 405].includes(error.status)) unavailable = true;
  } finally { inFlight = false; }
}
export function observeDebugStream(input: unknown, context: LogContext) {
  const row = record(input); if (!row) return;
  if (row.type === "start" && typeof row.id === "string") systemLog.bindMessage(context, row.id);
  if (row.type === "debug") { systemLog.diagnostic(row, "sse", context); void drainRequestSnapshots(); }
}
export function observeDebugRealtime(input: unknown) {
  const root = record(input);
  if (root?.type === "debug") systemLog.diagnostic(root.data, "ws");
  if (root && ["debug", "msg_created", "msg_updated"].includes(String(root.type))) void drainRequestSnapshots();
}
export function observeDebugHttpError(error: unknown, context: LogContext) {
  try {
    const detail = error instanceof ApiError ? safeHttpErrorContent(error.data) ?? publicHttpMetadata(error.data) : null;
    const status = error instanceof ApiError && error.status ? `HTTP ${error.status}` : "连接中断";
    systemLog.issue(context, publicText(`${status}${detail ? `\n${detail}` : ""}`) ?? status, isDefiniteChatRejection(error, context.kind));
    void drainRequestSnapshots();
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
  readers++;
  if (!polling) polling = setInterval(() => { void drainRequestSnapshots(); }, 2000);
  void drainRequestSnapshots();
  return () => { if (--readers === 0 && polling) { clearInterval(polling); polling = null; } };
}
