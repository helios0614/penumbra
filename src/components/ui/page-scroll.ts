export function showPageTopButton(scrollTop: number, viewportHeight: number): boolean {
  return viewportHeight > 0 && scrollTop > Math.max(720, viewportHeight * 1.5);
}

export function scrollPageToTop(region: Pick<HTMLElement, "scrollTo" | "focus"> | null, reducedMotion: boolean) {
  if (!region) return;
  region.focus({ preventScroll: true });
  region.scrollTo({ top: 0, behavior: reducedMotion ? "instant" : "smooth" });
}

/** Observe only the actual owner. Safe to dispose and subscribe again in StrictMode. */
export function observePageScroll(region: HTMLElement, onVisible: (visible: boolean) => void) {
  const update = () => onVisible(showPageTopButton(region.scrollTop, region.clientHeight));
  region.addEventListener("scroll", update, { passive: true });
  const resize = new ResizeObserver(update);
  resize.observe(region);
  update();
  return () => {
    region.removeEventListener("scroll", update);
    resize.disconnect();
  };
}
