import { useEffect, useRef } from "react";

export function hasOpenChatDialog() {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="dialog"], [role="alertdialog"]',
    ),
  ).some(
    (node) =>
      !node.hasAttribute("data-closed") &&
      !node.hidden &&
      node.getAttribute("aria-hidden") !== "true" &&
      node.getClientRects().length > 0,
  );
}

/** A same-URL entry lets browser/Android Back close the search before leaving Chat. */
export function useSearchBack(open: boolean, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const url = location.href,
      token = crypto.randomUUID();
    const state = { ...history.state, __penumbraChatSearch: token };
    let consumed = false;
    history.pushState(state, "", url);
    const pop = () => {
      if (consumed || history.state?.__penumbraChatSearch === token) return;
      if (hasOpenChatDialog()) {
        history.pushState(state, "", url);
        (document.activeElement ?? document).dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true,
          }),
        );
        return;
      }
      consumed = true;
      close.current();
    };
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("popstate", pop);
      if (
        !consumed &&
        location.href === url &&
        history.state?.__penumbraChatSearch === token
      ) {
        consumed = true;
        history.back();
      }
    };
  }, [open]);
}
