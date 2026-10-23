export type ComposerMenuAnchor = {
  contextElement: HTMLElement;
  getBoundingClientRect: () => DOMRect;
};

/** Base UI's keepMounted autoUpdate observes the trigger, not a separate anchor.
 * Track the moving Composer top while open, including its 200ms transition and
 * viewport pan. Publish only changed geometry; always return a live rect. */
export function trackComposerMenuAnchor(element: HTMLElement, update: (anchor: ComposerMenuAnchor) => void) {
  let previous = "";
  let frame = 0;
  const measure = () => {
    const rect = element.getBoundingClientRect();
    const viewport = window.visualViewport;
    const key = [rect.x, rect.y, rect.width, rect.height,
      viewport?.offsetTop, viewport?.offsetLeft, viewport?.height, viewport?.width,
      window.innerHeight, window.innerWidth].join(":");
    if (key !== previous) {
      previous = key;
      update({ contextElement: element, getBoundingClientRect: () => element.getBoundingClientRect() });
    }
    frame = requestAnimationFrame(measure);
  };
  measure();
  return () => cancelAnimationFrame(frame);
}
