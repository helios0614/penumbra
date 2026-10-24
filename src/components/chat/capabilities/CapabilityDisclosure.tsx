import { createContext, useContext, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { CapabilityStatus } from "@/domain/message/capability-types";
import { cn } from "@/lib/utils";
import { CapabilityIcon } from "./CapabilityIcon";
import "../chat.css";

const ExpansionContext = createContext<Map<string, boolean> | null>(null);
export function CapabilityExpansionProvider({ children }: { children: ReactNode }) {
  const expanded = useRef(new Map<string, boolean>());
  return <ExpansionContext value={expanded.current}>{children}</ExpansionContext>;
}
export const statusLabel: Record<CapabilityStatus, string> = {
  success: "已完成", failed: "失败", partial: "部分完成", skipped: "已跳过", timeout: "超时", cancelled: "已中断", unknown: "结果未知", sent: "已发出",
};

export function useCapabilityExpansion(identity: string) {
  const cache = useContext(ExpansionContext);
  const [state, setState] = useState(() => ({ identity, open: cache?.get(identity) === true }));
  const open = state.identity === identity ? state.open : cache?.get(identity) === true;
  return [open, (next: boolean) => { cache?.set(identity, next); setState({ identity, open: next }); }] as const;
}

export function notifyCapabilityToggle(target: HTMLElement) {
  target.dispatchEvent(new Event("chat-capability-toggle", { bubbles: true }));
}

export function CapabilityDisclosure({ identity, title, summary, preview, previewLines, status, capability, contained = false, children, hasDetails = true }: {
  identity: string; title: string; summary?: string; preview?: string; previewLines?: 2; status?: CapabilityStatus; capability?: string; contained?: boolean; children?: ReactNode; hasDetails?: boolean;
}) {
  const regionId = useId();
  const [open, setOpen] = useCapabilityExpansion(identity);
  const stacked = previewLines === 2;
  const limit = stacked ? 240 : 96;
  const shortPreview = preview && preview.length > limit ? preview.slice(0, limit) + "…" : preview;
  const header = <>
    <CapabilityIcon capability={capability} className="capability-icon size-3.5 text-ai/80" />
    <span className="min-w-0">
      <span className="block break-words font-medium [overflow-wrap:anywhere]">{title}{summary && <span className="font-normal text-muted-foreground">{` · ${summary}`}</span>}</span>
      {shortPreview && <span data-capability-preview className={cn("block whitespace-normal break-words text-muted-foreground [overflow-wrap:anywhere]", stacked ? "line-clamp-2" : "line-clamp-1")}>{shortPreview}</span>}
    </span>
    {status && <span className={cn("capability-status text-[11px]", ["failed", "timeout", "partial"].includes(status) ? "text-destructive-foreground" : "text-muted-foreground")}>
      {statusLabel[status]}
    </span>}
    {hasDetails && <ChevronDown aria-hidden="true" className={cn("capability-chevron size-3.5 transition-transform motion-reduce:transition-none", open && "rotate-180")} />}
  </>;
  const headerClass = "capability-header text-left text-xs leading-5 text-muted-strong";
  return <section data-capability={identity} data-contained={contained || undefined} className="capability-disclosure w-full min-w-0 max-w-full">
    {hasDetails ? <button type="button" className={cn(headerClass, "outline-none hover:bg-ai/5 focus-visible:ring-2 focus-visible:ring-ring/40")}
      aria-expanded={open} aria-controls={open ? regionId : undefined} onClick={event => {
        notifyCapabilityToggle(event.currentTarget); setOpen(!open);
      }}>{header}</button> : <div className={headerClass}>{header}</div>}
    {hasDetails && open && <div id={regionId} role="region" aria-label={`${title}详情`} tabIndex={contained ? undefined : 0}
      className={contained ? "capability-contained-details" : "capability-detail-scroll capability-detail-surface"}>
      {children}
    </div>}
  </section>;
}
