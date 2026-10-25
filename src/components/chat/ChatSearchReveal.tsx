import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { trackSearchOverlayPosition, type SearchOverlayGeometry } from "./search-overlay-position";

/** Keep only the outgoing paint for the 200ms overlay slide.
 * The body portal escapes Chat's glass backdrop; the local anchor keeps its bounds.
 * Search cancellation, focus restoration and navigation still happen immediately. */
export function ChatSearchReveal({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const [retained, setRetained] = useState(open);
  const [geometry, setGeometry] = useState<SearchOverlayGeometry | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const overlayId = useId();
  const snapshot = useRef<ReactNode>(null);
  const visible = open || retained;
  useLayoutEffect(() => {
    if (!anchorRef.current) return;
    const stop = trackSearchOverlayPosition(anchorRef.current, setGeometry);
    if (!visible) stop();
    else return stop;
  }, [visible]);
  if (open) snapshot.current = children;
  useEffect(() => {
    if (open) {
      setRetained(true);
      return;
    }
    if (!retained) return;
    const timeout = setTimeout(() => {
      snapshot.current = null;
      setRetained(false);
    }, 220);
    return () => clearTimeout(timeout);
  }, [open, retained]);
  const surface = (
    <div
      id={overlayId}
      className="chat-search-reveal"
      style={geometry ?? undefined}
      data-chat-search-overlay
      data-open={open}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="chat-search-reveal-clip">
        {(open || retained) && (open ? children : snapshot.current)}
      </div>
    </div>
  );
  if (typeof document === "undefined") return surface;
  return <>
    <div ref={anchorRef} className="chat-search-anchor" data-chat-search-anchor={overlayId} data-open={open} aria-hidden="true" />
    {geometry && anchorRef.current && createPortal(surface, anchorRef.current.ownerDocument.body)}
  </>;
}
