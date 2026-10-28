import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
export function LogDisclosure({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return <div className={`system-log-disclosure ${className}`}>
    <Button variant="ghost" size="compact" className="system-log-toggle max-w-full justify-start gap-1.5 text-left text-xs" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <ChevronDown aria-hidden="true" className={`size-3.5 shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      <span className="system-log-text whitespace-normal">{title}</span>
    </Button>
    {open && <div className="system-log-disclosure-body min-w-0">{children}</div>}
  </div>;
}
