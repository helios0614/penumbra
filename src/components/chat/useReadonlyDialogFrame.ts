import { useEffect, useRef } from "react";

/** Same-URL Back entry and existing dialog viewport variables. Base UI owns the modal. */
export function useReadonlyDialogFrame(open: boolean, onClose: () => void, name: string) {
  const contentRef = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const entry = useRef<{ key: string; token: string; url: string; live: boolean; consumed: boolean } | null>(null);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const resize = () => {
      const height = viewport?.height ?? window.innerHeight;
      contentRef.current?.style.setProperty("--dialog-viewport-height", `${height}px`);
      contentRef.current?.style.setProperty("--dialog-viewport-top", `${viewport?.offsetTop ?? 0}px`);
      contentRef.current?.toggleAttribute("data-compact-viewport", height < 500);
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    return () => { viewport?.removeEventListener("resize", resize); viewport?.removeEventListener("scroll", resize); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const key = `__penumbra_${name}`;
    const prior = entry.current;
    const frame = prior && !prior.consumed && prior.key === key && history.state?.[key] === prior.token ? prior
      : { key, token: crypto.randomUUID(), url: location.href, live: true, consumed: false };
    if (frame !== prior) history.pushState({ ...history.state, [key]: frame.token }, "", frame.url);
    frame.live = true;
    entry.current = frame;
    const pop = (event: PopStateEvent) => {
      if (frame.consumed || history.state?.[key] === frame.token) return;
      frame.consumed = true;
      // The outer dialog still has its own token when the inner one consumes Back.
      event.stopImmediatePropagation();
      close.current();
    };
    window.addEventListener("popstate", pop, true);
    return () => {
      window.removeEventListener("popstate", pop, true);
      frame.live = false;
      // StrictMode replays effect setup synchronously; reuse its entry instead
      // of scheduling a stale history.back() against the new setup.
      queueMicrotask(() => {
        if (!frame.live && !frame.consumed && location.href === frame.url && history.state?.[key] === frame.token) {
          frame.consumed = true;
          history.back();
        }
      });
    };
  }, [open, name]);
  return contentRef;
}
