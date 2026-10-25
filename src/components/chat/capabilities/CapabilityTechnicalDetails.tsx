import { useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { notifyCapabilityToggle, useCapabilityExpansion } from "./CapabilityDisclosure";
import { CapabilityReveal } from "./CapabilityReveal";

export function CapabilityTechnicalDetails({ identity, title, children }: { identity: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useCapabilityExpansion(`${identity}:technical`);
  const regionId = useId();
  return <div className="capability-technical">
    <button type="button" className="capability-technical-toggle text-left text-[11px] text-muted-strong"
      aria-expanded={open} aria-controls={open ? regionId : undefined} onClick={event => {
        notifyCapabilityToggle(event.currentTarget); setOpen(!open);
      }}>
      <ChevronDown aria-hidden="true" className="capability-chevron size-3.5" />{title}
    </button>
    <CapabilityReveal key={identity} open={open}>
      <div id={regionId} className="capability-technical-fields">{children}</div>
    </CapabilityReveal>
  </div>;
}
