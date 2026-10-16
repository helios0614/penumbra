import { useCallback } from "react";

type DialogViewport = Pick<VisualViewport, "height" | "offsetTop" | "addEventListener" | "removeEventListener">;

// Some mobile keyboards resize only the visual viewport, leaving dvh unchanged.
// Update geometry in place so typing, selection and textarea scroll stay native.
export function trackQuickNoteDialogViewport(popup: Pick<HTMLElement, "style">, viewport: DialogViewport | null) {
  if (!viewport) return () => {};
  const update = () => {
    popup.style.setProperty("--quick-note-viewport-height", `${viewport.height}px`);
    popup.style.setProperty("--quick-note-viewport-top", `${viewport.offsetTop}px`);
  };
  update();
  viewport.addEventListener("resize", update);
  viewport.addEventListener("scroll", update);
  return () => {
    viewport.removeEventListener("resize", update);
    viewport.removeEventListener("scroll", update);
    popup.style.removeProperty("--quick-note-viewport-height");
    popup.style.removeProperty("--quick-note-viewport-top");
  };
}

export function useQuickNoteDialogViewport() {
  return useCallback((popup: HTMLDivElement | null) => {
    if (popup) return trackQuickNoteDialogViewport(popup, window.visualViewport);
  }, []);
}
