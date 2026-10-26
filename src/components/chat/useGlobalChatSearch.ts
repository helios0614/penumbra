import { useCallback, useEffect, useRef, useState } from "react";
import { searchGlobalMessages, globalResultKey, GLOBAL_SEARCH_RANGE_SECONDS,
  type GlobalMessageSearchResult, type SearchTimeRange } from "@/domain/message/global-message-search";
import { normalizeSearch } from "./search-highlight";

type Plan = { range: SearchTimeRange | null; cursor: string | null };
type State = {
  scope: string;
  items: readonly GlobalMessageSearchResult[];
  range: SearchTimeRange | null;
  latest: number | null;
  completedStart: number | null;
  next: string | null;
  status: "idle" | "loading" | "ready" | "scan_pending" | "complete" | "error" | "paused";
};
const empty = (scope = ""): State => ({ scope, items: [], range: null, latest: null,
  completedStart: null, next: null, status: "idle" });
const firstPlan = (): Plan => {
  const end = Date.now() / 1000;
  return { range: { start: end - GLOBAL_SEARCH_RANGE_SECONDS, end }, cursor: null };
};

/** One HTTP request per manual action, including empty scan_pending pages. */
export function useGlobalChatSearch() {
  const [query, updateQuery] = useState("");
  const [composing, updateComposing] = useState(false);
  const [state, update] = useState<State>(() => empty());
  const current = useRef(state);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const retryPlan = useRef<Plan>({ range: null, cursor: null });
  const scope = normalizeSearch(query);
  const identity = useRef(scope);
  identity.current = scope;
  current.current = state.scope === scope ? state : empty(scope);
  const cancel = useCallback(() => {
    generation.current++;
    request.current?.abort();
    request.current = null;
  }, []);
  const load = useCallback(async (plan: Plan) => {
    if (!scope || composing || request.current) return;
    const sequence = ++generation.current;
    const controller = new AbortController();
    request.current = controller;
    retryPlan.current = plan;
    update(s => {
      const base = s.scope === scope ? s : empty(scope);
      return { ...base, range: plan.range ?? base.range, next: plan.cursor, status: "loading" };
    });
    try {
      const page = await searchGlobalMessages(query, plan.range, plan.cursor, { signal: controller.signal });
      if (controller.signal.aborted || sequence !== generation.current || identity.current !== scope) return;
      update(s => {
        const byId = new Map(s.items.map(item => [globalResultKey(item), item]));
        page.items.forEach(item => byId.set(globalResultKey(item), item));
        return { ...s, items: [...byId.values()], range: page.range, latest: s.latest ?? page.range.end,
          completedStart: page.pageStatus === "complete" ? page.range.start : s.completedStart,
          next: page.nextCursor, status: page.pageStatus };
      });
    } catch {
      if (!controller.signal.aborted && sequence === generation.current && identity.current === scope)
        update(s => ({ ...s, status: "error" }));
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [scope, query, composing]);
  useEffect(() => {
    cancel();
    update(empty(scope));
    const plan = firstPlan();
    retryPlan.current = plan;
    if (!scope || composing) return;
    const timer = setTimeout(() => void load(plan), 250);
    return () => { clearTimeout(timer); cancel(); };
  }, [scope, composing, load, cancel]);
  const proceed = () => {
    const s = current.current;
    if (s.status === "error" || s.status === "paused" || !s.range) return load(retryPlan.current);
    if (s.next) return load({ range: s.range, cursor: s.next });
    if (s.status === "complete") return load({ range: {
      start: s.range.start - GLOBAL_SEARCH_RANGE_SECONDS, end: s.range.start,
    }, cursor: null });
  };
  return { query, composing, state: current.current, proceed,
    setQuery: (value: string) => { cancel(); updateQuery(value); },
    setComposing: (value: boolean) => { if (value) cancel(); updateComposing(value); },
    stop: () => { cancel(); update(s => ({ ...s, status: "paused" })); },
    restart: () => { cancel(); update(empty(scope)); void load(firstPlan()); },
  };
}
