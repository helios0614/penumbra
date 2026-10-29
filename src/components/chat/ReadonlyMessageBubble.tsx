import type { ReactNode } from "react";
import { contextTime } from "./conversation-context";
import { cn } from "@/lib/utils";

export function ReadonlyMessageBubble({ role, name, createdAt, messageId, target = false, children }: {
  role: "user" | "assistant" | "system"; name: string; createdAt: number;
  messageId?: string; target?: boolean; children: ReactNode;
}) {
  return <li data-context-message={messageId} aria-current={target ? "true" : undefined}
    className={cn("context-message rounded-2xl px-3 py-2.5 text-sm leading-[1.65] text-foreground",
      role === "user" ? "ml-2 bg-primary/8" : role === "assistant" ? "mr-2 bg-ai/12" : "rounded-xl bg-background/25 py-2",
      target && "context-target")}>
    {role !== "system" && <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-5 text-muted-foreground">
      <span className="font-medium text-muted-strong">{name}</span>
      <time dateTime={new Date(createdAt * 1000).toISOString()}>{contextTime(createdAt)}</time>
      {target && <span className="text-primary-ink">当前关注</span>}
    </div>}
    {children}
  </li>;
}
