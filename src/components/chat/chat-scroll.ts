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
  let settlingUntil = 0, userScrollIntent = false;
  let restoredScrollTop: number | null = null;
  const updateFollow = () => {
    // Resize/anchor corrections can emit scroll events at the bottom. They are
    // not a request to resume following, including on the last animation frame.
    if (restoredScrollTop !== null && Math.abs(viewport.scrollTop - restoredScrollTop) < .5) return;
    restoredScrollTop = null;
    if (Date.now() < settlingUntil && !userScrollIntent) return;
    following.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 96;
    anchor.current = following.current ? null : captureChatScrollAnchor(viewport);
  };
  const followResize = () => {
    if (following.current) viewport.scrollTop = viewport.scrollHeight;
    else {
      const before = viewport.scrollTop;
      restoreChatScrollAnchor(viewport, anchor.current);
      if (viewport.scrollTop !== before) restoredScrollTop = viewport.scrollTop;
    }
  };
  // Explicit detail reading takes precedence over automatic bottom following.
  // Capture before expansion changes geometry, including nested technical views.
  const readCapability = () => {
    following.current = false;
    anchor.current = captureChatScrollAnchor(viewport);
    // Slightly longer than the shared 200ms transition and 220ms exit cleanup.
    settlingUntil = Date.now() + 240;
    userScrollIntent = false;
    restoredScrollTop = null;
  };
  const scrollIntent = (event: Event) => {
    // Wheel/touch/key input in the bounded detail reader belongs to that reader.
    const target = event.target as HTMLElement | null;
    if (target?.closest?.(".capability-detail-scroll")) return;
    userScrollIntent = true; restoredScrollTop = null;
  };
  const keyIntent = (event: KeyboardEvent) => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) scrollIntent(event);
  };
  viewport.addEventListener("scroll", updateFollow, { passive: true });
  viewport.addEventListener("chat-capability-toggle", readCapability);
  viewport.addEventListener("chat-media-preview", readCapability);
  viewport.addEventListener("wheel", scrollIntent, { passive: true });
  viewport.addEventListener("touchmove", scrollIntent, { passive: true });
  viewport.addEventListener("keydown", keyIntent);
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(followResize);
  observer?.observe(viewport);
  observer?.observe(content);
  return () => {
    viewport.removeEventListener("scroll", updateFollow);
    viewport.removeEventListener("chat-capability-toggle", readCapability);
    viewport.removeEventListener("chat-media-preview", readCapability);
    viewport.removeEventListener("wheel", scrollIntent);
    viewport.removeEventListener("touchmove", scrollIntent);
    viewport.removeEventListener("keydown", keyIntent);
    observer?.disconnect();
  };
}
