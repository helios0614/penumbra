import { useEffect, type RefObject } from "react";
import { isMobileSenderKeyboard } from "./Sender";
import { receiveClipboardImages } from "./image-paste";
import { hasOpenChatDialog } from "./search-history";

function ownsPaste(element: Element): boolean {
  return element instanceof HTMLElement && element.isContentEditable ||
    element.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], [role="combobox"]') !== null;
}

/** Page-owned fallback for desktop paste when the Composer does not own focus. */
export function useDesktopChatImagePaste(
  scopeRef: RefObject<HTMLDivElement | null>,
  onFiles: ((files: readonly File[]) => void) | undefined,
) {
  useEffect(() => {
    if (!onFiles || typeof document === "undefined" || isMobileSenderKeyboard()) return;
    const paste = (event: ClipboardEvent) => {
      const scope = scopeRef.current;
      if (!scope || event.defaultPrevented || hasOpenChatDialog()) return;
      const doc = scope.ownerDocument;
      // A click on ordinary chat content can leave body as both target and focus.
      // Portalled controls and other page regions must keep their own paste behavior.
      const target = event.composedPath()[0] ?? event.target;
      for (const node of [target, doc.activeElement]) {
        if (node === null || node === doc || node === doc.body || node === doc.documentElement) continue;
        if (!(node instanceof Element) || ownsPaste(node) || !scope.contains(node)) return;
      }
      receiveClipboardImages(event, onFiles);
    };
    // Bubble after the focused Sender/other React handlers have had first refusal.
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, [scopeRef, onFiles]);
}
