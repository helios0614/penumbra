import type { SearchTimeRange } from "@/domain/message/global-message-search";
import type { useGlobalChatSearch } from "./useGlobalChatSearch";

type SearchStatus = ReturnType<typeof useGlobalChatSearch>["state"]["status"];

/** Local calendar display only; never feeds a query or changes its Unix bounds. */
export function formatGlobalSearchRange(range: SearchTimeRange) {
  const start = new Date(range.start * 1000), end = new Date(range.end * 1000);
  const crossYear = start.getFullYear() !== end.getFullYear();
  const date = (value: Date) => `${crossYear ? `${value.getFullYear()}/` : ""}${value.getMonth() + 1}/${value.getDate()}`;
  return `${date(start)} — ${date(end)}`;
}

export function GlobalSearchSummary({ range, count, status }: {
  range: SearchTimeRange | null; count: number; status: SearchStatus;
}) {
  const emptyStatus = status === "loading" ? "查找中…" : status === "scan_pending" ? "尚未查完"
    : status === "complete" ? "本段未找到" : status === "paused" ? "已停止"
    : status === "error" ? "查找未完成" : "尚未查完";
  return <div data-global-search-summary className="text-xs leading-5 text-muted-foreground" aria-live="polite">
    {range ? <div className="flex min-w-0 items-center justify-between gap-2">
      <span data-global-search-range className="min-w-0 tabular-nums [overflow-wrap:anywhere]">{formatGlobalSearchRange(range)}</span>
      <span data-global-search-count className="shrink-0 whitespace-nowrap tabular-nums">{count ? `已找到 ${count} 条` : emptyStatus}</span>
    </div> : <p>每次继续只查一批，找到后可以随时停止。</p>}
  </div>;
}
