import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
export function LogDisclosure({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return <div className={className}>
    <Button variant="ghost" size="compact" className="max-w-full justify-start gap-2 text-left text-xs" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <ChevronDown aria-hidden="true" className={`size-3.5 shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      <span className="min-w-0 whitespace-normal">{title}</span>
    </Button>
    {open && <div className="min-w-0 py-2 pl-2 sm:pl-4">{children}</div>}
  </div>;
}
