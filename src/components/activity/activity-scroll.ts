export function showActivityTopButton(scrollTop: number, viewportHeight: number): boolean {
  return viewportHeight > 0 && scrollTop > Math.max(720, viewportHeight * 1.5);
}

export function scrollActivityToTop(region: Pick<HTMLElement, "scrollTo" | "focus"> | null, reducedMotion: boolean) {
  if (!region) return;
  region.focus({ preventScroll: true });
  region.scrollTo({ top: 0, behavior: reducedMotion ? "instant" : "smooth" });
}
