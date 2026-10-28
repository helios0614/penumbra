import { useEffect, useLayoutEffect, useRef } from "react";
import { systemLog } from "@/application/chat-system-log/chat-system-log-store";
/** Preserve the visible detail through prepends; this hook never observes execution. */
export function useSystemLogReading(open: boolean, version: object) {
  const body = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ element: HTMLElement; top: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    return systemLog.beforeChange(() => {
      const root = body.current; if (!root || root.scrollTop < 4 && !root.querySelector('[aria-expanded="true"]')) { anchor.current = null; return; }
      const top = root.getBoundingClientRect().top;
      const elements = [...root.querySelectorAll<HTMLElement>("[data-log-reading-anchor], [data-log-id], [data-request-id], .json-viewer-raw, .json-viewer-toolbar")];
      const visible = elements.filter(element => { const rect = element.getBoundingClientRect(); return rect.bottom > top + 8 && rect.top < top + root.clientHeight; });
      const reading = visible.filter(element => element.matches("[data-log-reading-anchor], .json-viewer-raw, .json-viewer-toolbar"));
      const element = (reading.length ? reading : visible).sort((a, b) => Math.abs(a.getBoundingClientRect().top - top) - Math.abs(b.getBoundingClientRect().top - top))[0];
      anchor.current = element ? { element, top: element.getBoundingClientRect().top } : null;
    });
  }, [open]);
  useLayoutEffect(() => {
    const saved = anchor.current, root = body.current; anchor.current = null;
    if (!root) return;
    // Remove the previous reserve first; growing content can now provide its own range.
    root.style.removeProperty("--system-log-reading-room");
    if (open && saved?.element.isConnected && root.contains(saved.element)) {
      const target = Math.max(0, root.scrollTop + saved.element.getBoundingClientRect().top - saved.top);
      // scrollHeight is at least clientHeight even when the real content is
      // shorter. Measure that content end so the reserve includes unused space.
      const end = root.lastElementChild?.getBoundingClientRect().bottom;
      const naturalRange = end === undefined ? root.scrollHeight - root.clientHeight
        : end - root.getBoundingClientRect().top + root.scrollTop + parseFloat(getComputedStyle(root).paddingBottom) - root.clientHeight;
      const missing = target - naturalRange;
      // Short panels otherwise have no scroll range to compensate a prepend.
      // This reserve is below the content and disappears on clear/next update.
      if (missing > 0) root.style.setProperty("--system-log-reading-room", `${Math.ceil(missing)}px`);
      root.scrollTop = target;
    }
  }, [version, open]);
  return body;
}
