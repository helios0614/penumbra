import { useCallback, useEffect, useRef, useState } from "react";
import {
  searchConversationMessages,
  type MessageSearchResult,
} from "@/domain/message";
import { normalizeSearch } from "./search-highlight";

type SearchState = {
  scope?: string;
  items: readonly MessageSearchResult[];
  next: string | null;
  status: "idle" | "loading" | "scanning" | "ready" | "complete" | "error";
  error: string | null;
  selected: string | null;
  paused: boolean;
};
const empty: SearchState = {
  items: [],
  next: null,
  status: "idle",
  error: null,
  selected: null,
  paused: false,
};
export function useChatSearch(owner: string | null, revision = 0) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [composing, setComposing] = useState(false);
  const [state, setState] = useState<SearchState>(empty);
  const request = useRef<AbortController | null>(null),
    generation = useRef(0),
    identity = useRef("");
  const stateRef = useRef(state);
  stateRef.current = state;
  const key =
    owner && open ? `${owner}\0${normalizeSearch(query)}\0${revision}` : "";
  if (identity.current !== key) {
    identity.current = key;
    generation.current++;
    request.current?.abort();
  }
  const load = useCallback(
    async (append = false) => {
      if (!owner || !open || composing || !normalizeSearch(query)) return;
      if (append && request.current) return;
      const sequence = ++generation.current,
        currentKey = identity.current;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      const next = append ? stateRef.current.next : null;
      setState((s) => ({
        ...s,
        scope: currentKey,
        ...(!append ? { items: [], next: null } : {}),
        status: append ? "scanning" : "loading",
        error: null,
        paused: false,
      }));
      try {
        const page = await searchConversationMessages(owner, query, next, {
          signal: controller.signal,
        });
        if (
          controller.signal.aborted ||
          sequence !== generation.current ||
          currentKey !== identity.current
        )
          return;
        setState((s) => {
          const byId = new Map(
            (append ? s.items : []).map((m) => [m.messageId, m]),
          );
          page.items.forEach((m) => byId.set(m.messageId, m));
          return {
            ...s,
            items: [...byId.values()],
            next: page.nextCursor,
            status:
              page.pageStatus === "complete"
                ? "complete"
                : page.pageStatus === "scan_pending"
                  ? "scanning"
                  : "ready",
            error: null,
          };
        });
        return page;
      } catch {
        if (
          !controller.signal.aborted &&
          sequence === generation.current &&
          currentKey === identity.current
        )
          setState((s) => ({
            ...s,
            status: "error",
            error: "搜索未能完成，请重试。当前阅读位置已保留。",
          }));
      } finally {
        if (request.current === controller) request.current = null;
      }
    },
    [owner, open, query, composing, revision],
  );
  useEffect(() => {
    request.current?.abort();
    setState((s) => ({ ...empty, scope: key, selected: s.selected }));
    if (!owner || !open || composing || !normalizeSearch(query)) return;
    const timer = setTimeout(() => void load(), 250);
    return () => {
      clearTimeout(timer);
      request.current?.abort();
    };
  }, [owner, open, query, composing, revision, load]);
  useEffect(() => {
    if (state.status !== "scanning" || state.paused || !state.next) return;
    const timer = setTimeout(() => void load(true), 120);
    return () => clearTimeout(timer);
  }, [state.status, state.next, state.paused, load]);
  useEffect(() => {
    setOpen(false);
    setQuery("");
    setState(empty);
    return () => {
      generation.current++;
      request.current?.abort();
    };
  }, [owner]);
  const stop = () => {
    generation.current++;
    request.current?.abort();
    setState((s) => ({ ...s, paused: true, status: "ready" }));
  };
  return {
    open,
    query,
    composing,
    state: state.scope === key ? state : empty,
    setComposing,
    show: () => setOpen(true),
    dismiss: () => {
      generation.current++;
      request.current?.abort();
      setOpen(false);
    },
    setQuery: (value: string) => {
      generation.current++;
      request.current?.abort();
      if (normalizeSearch(value) !== normalizeSearch(query))
        setState((s) => ({ ...s, selected: null }));
      setQuery(value);
    },
    select: (selected: string) => setState((s) => ({ ...s, selected })),
    loadMore: () => load(true),
    retry: () => load(false),
    stop,
  };
}
