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
    if (open && saved?.element.isConnected && root?.contains(saved.element)) root.scrollTop += saved.element.getBoundingClientRect().top - saved.top;
  }, [version, open]);
  return body;
}
