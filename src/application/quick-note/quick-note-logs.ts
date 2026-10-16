import { streamQuickNoteLogs, type QuickNoteLog } from "@/domain/quick-note";
import { ApiError } from "@/lib/api";

export interface QuickNoteLogState {
  readonly connection: "connecting" | "connected" | "reconnecting" | "error";
  readonly entries: readonly QuickNoteLog[];
}

export const INITIAL_LOG_STATE: QuickNoteLogState = { connection: "connecting", entries: [] };

export function createQuickNoteLogSubscription(
  onChange: (state: QuickNoteLogState) => void,
  stream = streamQuickNoteLogs,
) {
  let disposed = false;
  let generation = 0;
  let abort: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;
  let state = INITIAL_LOG_STATE;
  const publish = (patch: Partial<QuickNoteLogState>) => {
    if (!disposed) { state = { ...state, ...patch }; onChange(state); }
  };

  async function connect() {
    if (disposed) return;
    const current = ++generation;
    abort?.abort();
    const controller = new AbortController();
    abort = controller;
    const seen = new Set<string>();
    let received = false;
    publish({ connection: attempts ? "reconnecting" : "connecting" });
    try {
      for await (const entry of stream(controller.signal, () => {
        if (!disposed && current === generation) publish({ connection: "connected", entries: [] });
      })) {
        if (disposed || current !== generation) return;
        if (!received) { attempts = 0; received = true; }
        const key = JSON.stringify([entry.seq, entry.ts, entry.level, entry.message]);
        if (seen.has(key)) continue;
        seen.add(key);
        // Bound session memory; a reconnect replays only what the server still retains.
        const entries = [...state.entries, entry].slice(-500);
        if (seen.size > 1000) { seen.clear(); entries.forEach((item) => seen.add(JSON.stringify([item.seq, item.ts, item.level, item.message]))); }
        publish({ entries });
      }
    } catch (error) {
      if (disposed || current !== generation) return;
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        publish({ connection: "error" });
        return;
      }
    }
    if (disposed || current !== generation) return;
    publish({ connection: "reconnecting" });
    timer = setTimeout(() => { timer = null; void connect(); }, Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 5)));
  }

  void connect();
  return {
    reconnect() {
      if (disposed) return;
      if (timer) clearTimeout(timer);
      timer = null; attempts = 0;
      void connect();
    },
    dispose() {
      disposed = true; ++generation;
      abort?.abort();
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
