import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { AI_BUBBLE_SURFACE, BUBBLE_SURFACE } from "./bubble-surface";

export function GenerationIndicator({ label, active, rotating = false }: {
  readonly label: string;
  readonly active: boolean;
  readonly rotating?: boolean;
}) {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (!active || !rotating) {
      setTyping(false);
      return;
    }
    // Match AionHome's decorative waiting text; this does not infer execution stages.
    const timer = setInterval(() => setTyping(value => !value), 2500);
    return () => clearInterval(timer);
  }, [active, rotating]);
  const text = active && rotating ? (typing ? "正在输入" : "思考中") : label;

  return <div className={cn(BUBBLE_SURFACE, AI_BUBBLE_SURFACE, "chat-generation")} data-active={active} role="status" aria-live="polite">
    <span key={text} className={rotating ? "chat-generation-label" : undefined}>{text}</span>
    {active && <span className="chat-generation-dots" aria-hidden="true"><i /><i /><i /></span>}
  </div>;
}
