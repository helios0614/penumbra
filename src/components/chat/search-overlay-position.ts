export type SearchOverlayGeometry = {
  left: number;
  top: number;
  width: number;
  height: number;
  "--chat-visual-height": string;
};

/** Follow the reading region without making it a backdrop ancestor of the glass. */
export function trackSearchOverlayPosition(anchor: HTMLElement, update: (geometry: SearchOverlayGeometry) => void) {
  const view = anchor.ownerDocument.defaultView!;
  let previous = "";
  let frame = 0;
  const measure = () => {
    const rect = anchor.getBoundingClientRect();
    const geometry = { left: rect.left, top: rect.top, width: rect.width, height: rect.height,
      "--chat-visual-height": `${view.visualViewport?.height ?? view.innerHeight}px` };
    const key = JSON.stringify(geometry);
    if (key !== previous) { previous = key; update(geometry); }
  };
  const schedule = () => { if (!frame) frame = view.requestAnimationFrame(() => { frame = 0; measure(); }); };
  const observer = new ResizeObserver(schedule);
  observer.observe(anchor);
  view.addEventListener("resize", schedule);
  view.addEventListener("scroll", schedule, true);
  view.visualViewport?.addEventListener("resize", schedule);
  view.visualViewport?.addEventListener("scroll", schedule);
  measure();
  return () => {
    observer.disconnect();
    view.cancelAnimationFrame(frame);
    view.removeEventListener("resize", schedule);
    view.removeEventListener("scroll", schedule, true);
    view.visualViewport?.removeEventListener("resize", schedule);
    view.visualViewport?.removeEventListener("scroll", schedule);
  };
}
