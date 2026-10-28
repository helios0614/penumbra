import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { trackChatViewport } from "./chat-viewport";
import "./chat.css";

/** Geometry only; the caller supplies all business state and actions. */
export function ChatShell({ sidebar, header, notices, overlay, children, composer, rootRef: suppliedRootRef }: {
  readonly rootRef?: RefObject<HTMLDivElement | null>;
  readonly sidebar?: ReactNode;
  readonly header: ReactNode;
  readonly notices?: ReactNode;
  readonly overlay?: ReactNode;
  readonly children: ReactNode;
  readonly composer: ReactNode;
}) {
  const localRootRef = useRef<HTMLDivElement>(null);
  const rootRef = suppliedRootRef ?? localRootRef;
  useEffect(() => {
    if (rootRef.current) return trackChatViewport(rootRef.current, window.visualViewport);
  }, [rootRef]);

  return <div ref={rootRef} className="chat-shell flex min-h-0 w-full flex-1 overflow-hidden">
    {sidebar}
    <div className="relative flex min-h-0 w-0 min-w-0 flex-1 flex-col overflow-hidden">
      {header}
      <div className="relative flex min-h-0 flex-1 flex-col" data-chat-reading-region>
        {overlay && <div className="pointer-events-none absolute inset-0 z-20" data-slot="chat-overlay">{overlay}</div>}
        {notices}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
      {composer}
    </div>
  </div>;
}
