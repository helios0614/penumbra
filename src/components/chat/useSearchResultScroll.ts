import { useLayoutEffect, useRef } from "react";

/** Center only inside the result list. Never focus or scroll an ancestor. */
export function centerSelectedSearchResult(list: HTMLElement | null) {
  if (!list || list.clientHeight <= 0) return;
  const selected = list.querySelector<HTMLElement>(
    '[role="listitem"][aria-current="true"]',
  );
  if (!selected) return;
  const row = selected.getBoundingClientRect();
  const inset = Math.max(4, (list.clientHeight - row.height) / 2);
  const top =
    list.scrollTop +
    row.top -
    list.getBoundingClientRect().top -
    list.clientTop -
    inset;
  list.scrollTop = Math.max(
    0,
    Math.min(top, list.scrollHeight - list.clientHeight),
  );
}

export function useSearchResultScroll(
  open: boolean,
  selectedId: string | null,
) {
  const listRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (open && selectedId) centerSelectedSearchResult(listRef.current);
    // Appending results and unrelated renders must preserve manual list scrolling.
  }, [open, selectedId]);
  return listRef;
}
