/** Opt-in, development-only timing evidence. Never accepts message/request bodies. */
export type TimelineIdentity = { executionId: string; conversationId: string };
type Detail = { event?: string; phase?: string; size?: number; duration?: number; startedAt?: number; source?: "sse" | "history" | "waiting" };
type Entry = TimelineIdentity & Detail & { stage: string; at: number; wall: number };
const LIMIT = 2000;
let enabled = false;
let entries: Entry[] = [];
let signals = new WeakMap<AbortSignal, TimelineIdentity>();
const aliases = new Map<string, TimelineIdentity>();
let observer: PerformanceObserver | undefined;
let stopPageObservation: (() => void) | undefined;
const page = { executionId: "page", conversationId: "page" };
export function isChatTraceEnabled() { return import.meta.env.DEV && enabled; }
export function traceChatPage(stage: string, detail: Detail = {}) { traceChat(stage, page, detail); }

export function traceChat(stage: string, identity?: TimelineIdentity, detail: Detail = {}) {
  if (!import.meta.env.DEV || !enabled || !identity) return;
  entries.push({ executionId: identity.executionId, conversationId: identity.conversationId,
    event: detail.event, phase: detail.phase, size: detail.size, duration: detail.duration,
    startedAt: detail.startedAt, source: detail.source, stage, at: performance.now(), wall: Date.now() });
  if (entries.length > LIMIT) entries.splice(0, entries.length - LIMIT);
}
export function bindChatTrace(signal: AbortSignal, identity: TimelineIdentity) {
  if (import.meta.env.DEV && enabled) signals.set(signal, { executionId: identity.executionId, conversationId: identity.conversationId });
}
export function chatTraceIdentity(signal?: AbortSignal | null) { return signal ? signals.get(signal) : undefined; }
export function aliasChatTrace(id: string, identity: TimelineIdentity) {
  if (!import.meta.env.DEV || !enabled) return;
  aliases.set(id, { executionId: identity.executionId, conversationId: identity.conversationId });
  if (aliases.size > 200) aliases.delete(aliases.keys().next().value!);
}
export function traceChatMessage(stage: string, id: string, detail: Detail = {}) {
  traceChat(stage, aliases.get(id), detail);
}

// No storage, network, console logging, timer or observer until explicitly enabled.
if (import.meta.env.DEV && typeof window !== "undefined") {
  Object.assign(window, { __penumbraChatTimeline: {
    enable(value = true) {
      enabled = value;
      observer?.disconnect(); observer = undefined;
      stopPageObservation?.(); stopPageObservation = undefined;
      if (!value) { entries = []; aliases.clear(); signals = new WeakMap(); return; }
      traceChat("page.enabled", page);
      if (typeof document !== "undefined") {
        const visibility = () => traceChatPage("page.visibility", { phase: document.visibilityState });
        document.addEventListener("visibilitychange", visibility);
        stopPageObservation = () => document.removeEventListener("visibilitychange", visibility);
        visibility();
      }
      if (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes.includes("longtask")) {
        observer = new PerformanceObserver(list => {
          for (const task of list.getEntries()) traceChat("page.longtask", page, { duration: task.duration, startedAt: task.startTime });
        });
        observer.observe({ type: "longtask" });
      }
    },
    clear() { entries = []; },
    read() { return entries.map(entry => ({ ...entry })); },
  } });
}
