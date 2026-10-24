/** Observe the message viewport and its content, including expanded Thinking.
 * Read follow intent before geometry changes; never scroll an ancestor/page. */
export type ChatScrollAnchor = { readonly id: string; readonly offset: number };

export function captureChatScrollAnchor(viewport: HTMLElement): ChatScrollAnchor | null {
  if (!viewport.querySelectorAll || !viewport.getBoundingClientRect) return null;
  const top = viewport.getBoundingClientRect().top;
  const item = Array.from(viewport.querySelectorAll<HTMLElement>("[data-message-id]")).find((node) => node.getBoundingClientRect().bottom > top);
  return item ? { id: item.dataset.messageId!, offset: item.getBoundingClientRect().top - top } : null;
}

export function restoreChatScrollAnchor(viewport: HTMLElement, anchor: ChatScrollAnchor | null) {
  if (!anchor || !viewport.querySelectorAll) return;
  const item = Array.from(viewport.querySelectorAll<HTMLElement>("[data-message-id]")).find((node) => node.dataset.messageId === anchor.id);
  if (item) {
    const delta = item.getBoundingClientRect().top - viewport.getBoundingClientRect().top - anchor.offset;
    if (Math.abs(delta) > 0.5) viewport.scrollTop += delta;
  }
}

export function trackChatScroll(
  viewport: HTMLElement,
  content: HTMLElement,
  following: { current: boolean },
  anchor: { current: ChatScrollAnchor | null } = { current: null },
) {
  const updateFollow = () => {
    following.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 96;
    anchor.current = following.current ? null : captureChatScrollAnchor(viewport);
  };
  const followResize = () => {
    if (following.current) viewport.scrollTop = viewport.scrollHeight;
    else restoreChatScrollAnchor(viewport, anchor.current);
  };
  // Explicit detail reading takes precedence over automatic bottom following.
  // Capture before expansion changes geometry, including nested technical views.
  const readCapability = () => {
    following.current = false;
    anchor.current = captureChatScrollAnchor(viewport);
  };
  viewport.addEventListener("scroll", updateFollow, { passive: true });
  viewport.addEventListener("chat-capability-toggle", readCapability);
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(followResize);
  observer?.observe(viewport);
  observer?.observe(content);
  return () => {
    viewport.removeEventListener("scroll", updateFollow);
    viewport.removeEventListener("chat-capability-toggle", readCapability);
    observer?.disconnect();
  };
}
