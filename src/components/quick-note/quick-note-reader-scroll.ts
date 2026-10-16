export const QUICK_NOTE_TOP_THRESHOLD = 360;

export function showQuickNoteTopButton(scrollTop: number): boolean {
  return scrollTop > QUICK_NOTE_TOP_THRESHOLD;
}

export function scrollQuickNoteToTop(region: Pick<HTMLElement, "scrollTo" | "focus"> | null, reducedMotion: boolean) {
  if (!region) return;
  region.focus({ preventScroll: true });
  region.scrollTo({ top: 0, behavior: reducedMotion ? "instant" : "smooth" });
}
