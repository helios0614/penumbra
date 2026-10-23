type ChatViewport = Pick<VisualViewport, "height" | "offsetTop" | "addEventListener" | "removeEventListener">;

/** Compensate only for the part of this embedded shell covered by the keyboard.
 * A browser that already resized the layout viewport needs no second inset. */
export function trackChatViewport(root: HTMLElement, viewport: ChatViewport | null) {
  if (!viewport) return () => {};
  const update = () => {
    const bounds = root.getBoundingClientRect();
    const inset = Math.max(0, Math.min(bounds.height, bounds.bottom - viewport.offsetTop - viewport.height));
    root.style.setProperty("--chat-viewport-inset", `${inset}px`);
    root.style.setProperty("--chat-visual-height", `${viewport.height}px`);
  };
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
  observer?.observe(root);
  update();
  viewport.addEventListener("resize", update);
  viewport.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  return () => {
    observer?.disconnect();
    viewport.removeEventListener("resize", update);
    viewport.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
    root.style.removeProperty("--chat-viewport-inset");
    root.style.removeProperty("--chat-visual-height");
  };
}
