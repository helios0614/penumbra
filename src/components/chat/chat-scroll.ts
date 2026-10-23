/** Observe the message viewport and its content, including expanded Thinking.
 * Read follow intent before geometry changes; never scroll an ancestor/page. */
export function trackChatScroll(
  viewport: HTMLElement,
  content: HTMLElement,
  following: { current: boolean },
) {
  const updateFollow = () => {
    following.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 96;
  };
  const followResize = () => {
    if (following.current) viewport.scrollTop = viewport.scrollHeight;
  };
  viewport.addEventListener("scroll", updateFollow, { passive: true });
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(followResize);
  observer?.observe(viewport);
  observer?.observe(content);
  return () => {
    viewport.removeEventListener("scroll", updateFollow);
    observer?.disconnect();
  };
}
