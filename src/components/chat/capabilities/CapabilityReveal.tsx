import { useEffect, useState, type ReactNode } from "react";

/** Retain content only for the exit transition. Reopening cancels its cleanup. */
export function CapabilityReveal({ open, children }: { open: boolean; children: ReactNode }) {
  const [retained, setRetained] = useState(open);
  useEffect(() => {
    if (open) { setRetained(true); return; }
    if (!retained) return;
    const timeout = setTimeout(() => setRetained(false), 220);
    return () => clearTimeout(timeout);
  }, [open, retained]);
  return <div className="capability-reveal" data-open={open} aria-hidden={!open} inert={!open}>
    <div className="capability-reveal-clip">{(open || retained) && children}</div>
  </div>;
}
