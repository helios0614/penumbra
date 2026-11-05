import { useId, type ComponentProps, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shared presentation only. Resource owners supply state, actions, and all details. */
export function ResourceRow({ title, expanded, onToggle, toggleLabel, status, description, controls, detailsLabel, feedback, children, ...props }: ComponentProps<"article"> & {
  title: string; expanded: boolean; onToggle: () => void; toggleLabel: string;
  status?: ReactNode; description?: ReactNode; controls: ReactNode; detailsLabel: string; feedback?: ReactNode;
}) {
  const detailsId = useId();
  return <article {...props} className={cn("min-w-0", props.className)}>
    <div data-resource-heading className={cn("flex min-h-11 items-center gap-1 px-3 transition-colors duration-150 motion-reduce:transition-none sm:px-4", expanded && "bg-background/15")}>
      <Button variant="ghost" aria-expanded={expanded} aria-controls={detailsId} aria-label={toggleLabel} onClick={onToggle}
        className="min-h-11 min-w-0 flex-1 justify-start gap-2 rounded-none px-0 py-1 text-left hover:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent">
        <ChevronDown aria-hidden="true" data-resource-chevron className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none", expanded && "rotate-180 text-primary-ink", description && "self-start mt-[3px]")} />
        <span className="min-w-0 flex-1"><span data-resource-title className="block truncate text-sm font-semibold" title={title}>{title}</span>
          {description && <span className="mt-0.5 block text-xs font-normal leading-relaxed text-muted-strong">{description}</span>}</span>
        {status}
      </Button>
      <div data-resource-controls className="flex size-11 shrink-0 items-center justify-center">{controls}</div>
    </div>
    {expanded && <div id={detailsId} data-resource-details role="region" aria-label={detailsLabel}
      className="space-y-2 border-t border-border/60 px-3 py-2 text-xs animate-in fade-in-0 duration-150 motion-reduce:animate-none sm:px-4">{children}</div>}
  </article>;
}

export function ResourceField({ label, children, actions }: { label: string; children: ReactNode; actions?: ReactNode }) {
  return <div data-resource-field={label} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 leading-relaxed">
    <dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 text-right [overflow-wrap:anywhere]">{actions ? <><span data-resource-field-value>{children}</span><div data-resource-field-actions className="mt-0.5 flex justify-end">{actions}</div></> : children}</dd>
  </div>;
}

export function ResourceStatus({ active, label, stateLabel }: { active: boolean; label: string; stateLabel: string }) {
  return <span data-resource-status className="inline-flex shrink-0 items-center gap-1.5 text-xs font-normal text-muted-strong">
    <span aria-label={stateLabel} title={stateLabel} className={cn("size-1.5 shrink-0 rounded-full", active ? "bg-success" : "bg-muted-foreground/50")} />{label}
  </span>;
}

export function ResourceAction({ icon: Icon, label, danger = false, iconOnly = false, compactIcon = false, className, ...props }: ComponentProps<typeof Button> & {
  icon: LucideIcon; label: string; danger?: boolean; iconOnly?: boolean; compactIcon?: boolean;
}) {
  return <Button {...props} variant="ghost" size={iconOnly ? "icon-lg" : "compact"} aria-label={props["aria-label"] ?? label} title={iconOnly ? label : props.title}
    className={cn("min-h-9 gap-1.5 px-0 text-xs", iconOnly && (compactIcon ? "size-7 min-h-7" : "size-11"), danger && "text-destructive hover:bg-destructive/8 hover:text-destructive", className)}>
    <Icon className={compactIcon ? "size-3.5" : "size-4"} aria-hidden="true" />{!iconOnly && label}
  </Button>;
}

export function ResourceActions({ separated = true, className, ...props }: ComponentProps<"div"> & { separated?: boolean }) {
  return <div {...props} role="group" className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", separated && "border-t border-border/60 pt-2", className)} />;
}
