import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "./button";
import { observePageScroll, scrollPageToTop } from "./page-scroll";
import { cn } from "@/lib/utils";

/** Place below a stable header in a bounded flex column; no window scrolling. */
export function PageScrollArea({ children, label, topLabel, className, contentClassName, scrollRef, hidden = false, syncKey, resetKey }: {
  readonly children: ReactNode;
  readonly label: string;
  readonly topLabel: string;
  readonly className?: string;
  readonly contentClassName?: string;
  readonly scrollRef?: RefObject<HTMLDivElement | null>;
  readonly hidden?: boolean;
  /** Re-read positions restored by feature navigation; does not reset them. */
  readonly syncKey?: string;
  /** Opt in only for feature navigation that already resets its content. */
  readonly resetKey?: string;
}) {
  const ownRef = useRef<HTMLDivElement>(null), regionRef = scrollRef ?? ownRef;
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const region = regionRef.current;
    if (hidden || !region) return;
    if (resetKey !== undefined) region.scrollTop = 0;
    return observePageScroll(region, setShowTop);
  }, [regionRef, hidden, syncKey, resetKey]);

  return <div hidden={hidden} className={cn("relative isolate min-h-0 flex-1", className)} data-page-scroll-area="true">
    <div ref={regionRef} role="region" tabIndex={0} aria-label={label}
      data-page-scroll-region="true" data-back-to-top={showTop && !hidden || undefined}
      className={cn("scrollbar-none page-scroll-region h-full overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-ring", contentClassName)}>
      {children}
    </div>
    <PageTopButton visible={showTop && !hidden} label={topLabel} onClick={() => scrollPageToTop(regionRef.current, window.matchMedia("(prefers-reduced-motion: reduce)").matches)} />
  </div>;
}

/** Also usable by independent readers with their own established threshold. */
export function PageTopButton({ visible, label, onClick }: { readonly visible: boolean; readonly label: string; readonly onClick: () => void }) {
  if (!visible) return null;
  return <Button type="button" variant="ghost" className="mist-glass page-back-to-top absolute right-3 z-10 size-11 rounded-full text-foreground"
    data-toast-obstacle="true" aria-label={label} title={label} onClick={onClick}><ArrowUp aria-hidden="true" /></Button>;
}
