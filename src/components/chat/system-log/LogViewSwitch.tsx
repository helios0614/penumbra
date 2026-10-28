import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Lazy first visit, then retained panels: switches never reset a disclosure or JSON reader. */
export function LogViewSwitch({ label, views, className = "", action }: {
  label: string; views: readonly { id: string; label: string; content: ReactNode }[]; className?: string; action?: ReactNode;
}) {
  const [selected, setSelected] = useState(views[0]?.id);
  const [visited, setVisited] = useState(() => new Set([views[0]?.id]));
  const root = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const restoring = useRef(false);
  const switchTop = useRef(0);
  const active = views.some(view => view.id === selected) ? selected : views[0]?.id;
  const panels = () => [...(root.current?.children ?? [])].filter((node): node is HTMLElement => node instanceof HTMLElement && node.hasAttribute("data-log-panel"));
  const choose = (id: string) => {
    if (id === active) return;
    const body = root.current?.closest<HTMLElement>('[data-slot="dialog-body"]');
    const panel = panels().find(node => node.dataset.logPanel === active);
    if (body && panel) positions.current.set(active!, body.getBoundingClientRect().top - panel.getBoundingClientRect().top);
    switchTop.current = root.current?.getBoundingClientRect().top ?? 0;
    restoring.current = true;
    setVisited(value => new Set([...value, id])); setSelected(id);
  };
  useLayoutEffect(() => {
    if (!restoring.current) return;
    restoring.current = false;
    const body = root.current?.closest<HTMLElement>('[data-slot="dialog-body"]');
    const panel = panels().find(node => node.dataset.logPanel === active);
    if (!body || !panel) return;
    const offset = positions.current.get(active!);
    body.scrollTop += offset === undefined ? root.current!.getBoundingClientRect().top - switchTop.current
      : panel.getBoundingClientRect().top - body.getBoundingClientRect().top + offset;
  }, [active]);
  return <div ref={root} className={`system-log-views ${className}`}>
    {views.length > 1 && <div role="group" aria-label={label} className="system-log-view-switch">
      {views.map(view => <Button key={view.id} size="xs" variant="ghost" aria-pressed={active === view.id} onClick={() => choose(view.id)}>{view.label}</Button>)}
      {action && <div className="ml-auto">{action}</div>}
    </div>}
    {views.map(view => (visited.has(view.id) || view.id === active) && <div key={view.id} data-log-panel={view.id} hidden={view.id !== active}>{view.content}</div>)}
  </div>;
}
