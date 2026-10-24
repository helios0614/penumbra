import { createContext, useContext, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, CircleDot, Wrench } from "lucide-react";
import type { CapabilityStatus } from "@/domain/message/capability-types";
import { cn } from "@/lib/utils";

const ExpansionContext = createContext<Map<string, boolean> | null>(null);
export function CapabilityExpansionProvider({ children }: { children: ReactNode }) {
  const expanded = useRef(new Map<string, boolean>());
  return <ExpansionContext value={expanded.current}>{children}</ExpansionContext>;
}
export const statusLabel: Record<CapabilityStatus, string> = {
  success: "已完成", failed: "失败", partial: "部分完成", skipped: "已跳过", timeout: "超时", cancelled: "已中断", unknown: "结果未知", sent: "已发出",
};

export function CapabilityDisclosure({ identity, title, summary, preview, previewLines, status, result = false, children, hasDetails = true }: {
  identity: string; title: string; summary?: string; preview?: string; previewLines?: 2; status?: CapabilityStatus; result?: boolean; children?: ReactNode; hasDetails?: boolean;
}) {
  const cache = useContext(ExpansionContext), regionId = useId();
  const [open, setOpen] = useState(() => cache?.get(identity) === true);
  const Icon = result ? Wrench : CircleDot;
  const stacked = previewLines === 2;
  const limit = stacked ? 240 : 96;
  const shortPreview = preview && preview.length > limit ? preview.slice(0, limit) + "…" : preview;
  const header = <>
    <Icon className={cn("size-3.5 shrink-0 text-ai", stacked && "mt-0.5 self-start")} aria-hidden="true" />
    {stacked ? <span className="min-w-0 flex-1">
      <span className="block break-words font-medium [overflow-wrap:anywhere]">{title}{summary && ` · ${summary}`}</span>
      {shortPreview && <span data-capability-preview className="line-clamp-2 whitespace-normal break-words text-muted-foreground [overflow-wrap:anywhere]">{shortPreview}</span>}
    </span> : <>
      <span className="shrink-0 font-medium">{title}{summary && ` · ${summary}`}</span>
      {shortPreview && <span className="min-w-0 flex-1 truncate text-muted-foreground">{shortPreview}</span>}
    </>}
    {status && <span className={cn("ml-auto shrink-0 text-[11px]", stacked && "self-start", ["failed", "timeout", "partial"].includes(status) ? "text-destructive" : "text-muted-foreground")}>
      {statusLabel[status]}
    </span>}
    {hasDetails && <ChevronDown aria-hidden="true" className={cn("size-3.5 shrink-0 transition-transform motion-reduce:transition-none", !status && "ml-auto", stacked && "mt-0.5 self-start", open && "rotate-180")} />}
  </>;
  const headerClass = "flex min-h-9 w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left text-xs leading-5 text-muted-strong";
  return <section data-capability={identity} className={cn("w-full min-w-0 max-w-full", result && "rounded-xl border border-border/45 bg-surface-secondary/20")}>
    {hasDetails ? <button type="button" className={cn(headerClass, "outline-none hover:bg-ai/5 focus-visible:ring-2 focus-visible:ring-ring/40")}
      aria-expanded={open} aria-controls={open ? regionId : undefined} onClick={() => {
        cache?.set(identity, !open); setOpen(!open);
      }}>{header}</button> : <div className={headerClass}>{header}</div>}
    {hasDetails && open && <div id={regionId} className={cn("mist-solid mt-1 min-w-0 rounded-xl px-3 py-2", result && "mt-0 rounded-t-none bg-transparent")}>
      {children}
    </div>}
  </section>;
}
