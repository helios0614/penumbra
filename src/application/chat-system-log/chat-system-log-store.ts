import { projectDiagnostic, projectSnapshot, string } from "./chat-system-log-projection";
import type { LogContext, SystemLogEntry, SystemLogState } from "./chat-system-log-types";
export const REQUEST_MEMORY_BYTES = 4 * 1024 * 1024;
export const REQUEST_COUNT = 20;
export function createSystemLogStore() {
  let state: SystemLogState = { entries: [], unread: false, removedRequests: 0, clearedAt: 0 };
  let sequence = 0;
  const listeners = new Set<() => void>();
  const beforeChange = new Set<() => void>();
  const before = () => beforeChange.forEach(listener => { try { listener(); } catch { /* Reading observation is optional. */ } });
  const messageOwners = new Map<string, string>();
  const publish = (entries: readonly SystemLogEntry[], unread = state.unread, removedRequests = state.removedRequests) => {
    before();
    state = { ...state, entries: [...entries].sort((a, b) => b.time - a.time).slice(0, 200), unread, removedRequests };
    const live = new Set(state.entries.map(row => row.id));
    for (const [message, owner] of messageOwners) if (!live.has(owner)) messageOwners.delete(message);
    listeners.forEach(listener => { try { listener(); } catch { /* Observers never own generation. */ } });
  };
  const write = (entry: SystemLogEntry) => {
    const prior = state.entries.find(row => row.id === entry.id);
    const next = prior ? { ...prior, ...entry, time: prior.time,
      hasError: prior.hasError || entry.hasError, error: entry.error ?? prior.error,
      usage: entry.usage ? { ...prior.usage, ...entry.usage } : prior.usage,
      details: entry.details ? { ...(prior.details as object), ...(entry.details as object) } : prior.details,
      requests: entry.requests.length ? entry.requests : prior.requests } : entry;
    publish([next, ...state.entries.filter(row => row.id !== entry.id)], state.unread || entry.hasError && !prior?.hasError || !!entry.connectionUnknown && !prior?.connectionUnknown);
  };
  return {
    getState: () => state,
    beforeChange(listener: () => void) { beforeChange.add(listener); return () => { beforeChange.delete(listener); }; },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    begin(context: LogContext) {
      write({ id: context.executionId, ...context, time: Date.now(), source: "sse", hasError: false, requests: [] });
    },
    bindMessage(context: LogContext, messageId: string) {
      if (context.kind === "send") messageOwners.set(messageId, context.executionId);
      const pending = state.entries.find(row => row.id === `ws:${messageId}`);
      if (context.kind === "send" && pending) {
        publish(state.entries.filter(row => row !== pending));
        write({ ...pending, ...context, id: context.executionId, messageId, source: "sse" });
      }
    },
    diagnostic(input: unknown, source: "sse" | "ws", context?: LogContext) {
      try {
        const d = projectDiagnostic(input); if (!d) return;
        if (!context && !d.messageId && !d.taskId && !d.hasError) return;
        if (context && d.messageId) this.bindMessage(context, d.messageId);
        const id = context?.executionId ?? (d.taskId ? `task:${d.taskId}` : d.messageId ? messageOwners.get(d.messageId) ?? `ws:${d.messageId}` : `unassociated:${++sequence}`);
        const prior = state.entries.find(row => row.id === id);
        const reported = typeof d.data.created_at === "number" ? d.data.created_at * 1000 : Date.now();
        write({ id, ...(context ?? {}), messageId: d.messageId, conversationId: context?.conversationId ?? string(d.data.conv_id) ?? prior?.conversationId,
          executionId: context?.executionId ?? prior?.executionId, kind: context?.kind ?? prior?.kind,
          time: Number.isFinite(new Date(reported).getTime()) ? reported : Date.now(), source, model: d.model ?? prior?.model,
          protocol: d.protocol ?? prior?.protocol, hasError: d.hasError, error: d.error, usage: d.usage, recallCount: d.recallCount ?? prior?.recallCount,
          details: d.details, requests: [] });
      } catch { /* Optional diagnostics never escape into execution. */ }
    },
    issue(context: LogContext, error: string, rejected = false) {
      const prior = state.entries.find(row => row.id === context.executionId);
      if (prior?.hasError && prior.error) error = `${prior.error}\n连接观察：${error}`;
      write({ ...context, id: context.executionId, time: Date.now(), source: "http", hasError: rejected,
        connectionUnknown: !rejected, error, requests: [] });
    },
    snapshots(input: unknown[], dropped = 0) {
      const captures = input.flatMap(value => { const row = projectSnapshot(value); return row && row.time > state.clearedAt ? [row] : []; });
      let entries = [...state.entries];
      for (const snapshot of captures) {
        const prior = entries.find(row => row.id === snapshot.executionId);
        if (entries.some(row => row.requests.some(request => request.id === snapshot.id))) continue;
        const entry: SystemLogEntry = { id: snapshot.executionId, time: snapshot.time, source: "request", hasError: false,
          executionId: snapshot.executionId, conversationId: snapshot.conversationId, kind: snapshot.kind,
          model: snapshot.model || undefined, protocol: snapshot.protocol || undefined, requests: [], ...prior };
        entries = [{ ...entry, requests: [...entry.requests, snapshot].sort((a, b) => a.time - b.time) }, ...entries.filter(row => row.id !== entry.id)];
      }
      const all = entries.flatMap(row => row.requests).sort((a, b) => b.time - a.time);
      let bytes = 0; const keep = new Set<string>();
      for (const row of all) if (keep.size < REQUEST_COUNT && bytes + row.payloadJson.length * 2 <= REQUEST_MEMORY_BYTES) { keep.add(row.id); bytes += row.payloadJson.length * 2; }
      const removed = all.length - keep.size;
      entries = entries.map(row => ({ ...row, requestsRemoved: row.requestsRemoved || row.requests.some(request => !keep.has(request.id)), requests: row.requests.filter(request => keep.has(request.id)) }));
      if (captures.length || dropped) publish(entries, state.unread, state.removedRequests + removed + dropped);
    },
    markRead() { if (state.unread) publish(state.entries, false); },
    clear() {
      before(); messageOwners.clear(); state = { entries: [], unread: false, removedRequests: 0, clearedAt: Math.max(Date.now(), state.clearedAt + 1) };
      listeners.forEach(listener => { try { listener(); } catch { /* Observers never own generation. */ } });
    },
  };
}
export const systemLog = createSystemLogStore();
