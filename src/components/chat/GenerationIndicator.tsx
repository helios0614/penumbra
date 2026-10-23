import { cn } from "@/lib/utils";
import { AI_BUBBLE_SURFACE, BUBBLE_SURFACE } from "./bubble-surface";

export function GenerationIndicator({ label, active }: {
  readonly label: string;
  readonly active: boolean;
}) {
  return <div className={cn(BUBBLE_SURFACE, AI_BUBBLE_SURFACE, "chat-generation")} data-active={active} role="status" aria-live="polite">
    <span>{label}</span>
    {active && <span className="chat-generation-dots" aria-hidden="true"><i /><i /><i /></span>}
  </div>;
}
