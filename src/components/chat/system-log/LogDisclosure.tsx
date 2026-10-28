import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
export function LogDisclosure({ title, children, className = "", keepMounted = false, preview }: { title: string; children: ReactNode; className?: string; keepMounted?: boolean; preview?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [visited, setVisited] = useState(false);
  return <div className={`system-log-disclosure ${className}`}>
    <Button variant="ghost" size="compact" className="system-log-toggle w-full max-w-full justify-between gap-2 text-left text-xs" aria-expanded={open} onClick={() => { setVisited(true); setOpen(value => !value); }}>
      <span className="system-log-text system-log-toggle-label whitespace-normal">{title}</span>
      <ChevronRight aria-hidden="true" className={`system-log-chevron size-3.5 shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} />
    </Button>
    {!open && preview}
    {(open || keepMounted && visited) && <div className="system-log-disclosure-body min-w-0" hidden={!open}>{children}</div>}
  </div>;
}
