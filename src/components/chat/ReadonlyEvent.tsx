import type { Message } from "@/domain/message/message-types";
import { LocateFixed } from "lucide-react";
import { CapabilityIcon } from "./capabilities/CapabilityIcon";
import { contextTime } from "./conversation-context";
import { readonlyEventPresentation } from "./readonly-event-presentation";
import { cn } from "@/lib/utils";

const preview = (text: string, limit: number) => {
  const chars = Array.from(text);
  return chars.length > limit ? `${chars.slice(0, limit).join("")}…` : text;
};
const comparable = (text: string) => text.normalize("NFC").replace(/\s+/gu, " ").trim();

/** Inert history facts, with native disclosure for the complete public record. */
export function ReadonlyEvent({ message, target = false, showTime = true }: {
  message: Message; target?: boolean; showTime?: boolean;
}) {
  const view = readonlyEventPresentation(message);
  const memoryBody = view.capability === "MEMORY_WRITE" || ["记忆正文", "记忆内容", "记忆正文（旧通知）"].includes(view.primary?.label.trim() ?? "");
  // Memory prose stays in the reading area for both targets and neighbors.
  // Other long results expand in place; details never take ownership of it.
  const primaryCanFold = !memoryBody && !target && !!view.primary && (Array.from(view.primary.text).length > 40 || view.primary.text.split("\n").length > 2);
  const completePrimary = view.primary && !primaryCanFold ? comparable(view.primary.text) : null;
  const metadata = view.metadata.filter(text => comparable(text) !== completePrimary);
  const completeFacts = new Set([...metadata.filter(text => Array.from(text).length <= 60).map(comparable), ...(completePrimary ? [completePrimary] : [])]);
  const repeatedFact = (label: string, text: string) => label.trim() === "重要度" &&
    [`重要度 ${text}`, `重要度：${text}`, `重要度: ${text}`].some(form => completeFacts.has(comparable(form)));
  const details = view.details.filter(row => row !== view.time || Array.from(row.text).length > 48)
    .filter(row => row !== view.primary)
    .filter(row => !repeatedFact(row.label, row.text) && !(row.key === "display.summary" && completeFacts.has(comparable(row.text))));
  return <section className="context-event min-w-0 [overflow-wrap:anywhere]" data-context-event>
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-5">
      <CapabilityIcon capability={view.capability} className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 font-medium text-muted-strong">{view.title}{view.time && <span className="font-normal"> · {view.timeLabel} {preview(view.time.text, 48)}</span>}</span>
      <span className={cn("text-[11px]", ["failed", "timeout", "partial"].includes(view.status) ? "text-destructive-foreground" : "text-muted-foreground")}>{view.statusText}</span>
    </div>
    {showTime && <div className="mt-0.5">
      <span data-context-reading-position={target || undefined} className="inline-flex min-w-0 max-w-full items-center gap-x-2 text-[11px] text-muted-foreground">
        <time className="min-w-0 flex-1 [overflow-wrap:anywhere]" dateTime={new Date(message.createdAt * 1000).toISOString()}>记录于 {contextTime(message.createdAt)}</time>
        {target && <span data-context-reading-target role="note" aria-label="阅读定位：当前关注" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-primary-ink">
          <LocateFixed className="size-3" aria-hidden="true" />当前关注
        </span>}
      </span>
    </div>}
    {view.primary && <p className={cn("mt-1 whitespace-pre-wrap text-[13px] leading-[1.7] text-foreground", primaryCanFold && "context-event-preview line-clamp-3")}>
      {target && !memoryBody && /^display\.field:/.test(view.primary.key) && <span className="text-muted-foreground">{view.primary.label}：</span>}
      {view.primary.text}
    </p>}
    {!!metadata.length && <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{metadata.map(text => preview(text, 60)).join(" · ")}</p>}
    {(view.callResult || !!view.warnings.length || !!view.notices.length) && <div className="mt-1 space-y-0.5 text-xs leading-5 text-muted-strong">
      {view.callResult && <p>调用层状态不代表业务操作已完成。</p>}
      {view.warnings.map((text, i) => <p key={i}>{text}</p>)}
      {view.notices.map(row => <p key={row.key} className="whitespace-pre-wrap">{/^display\.field:/.test(row.key) && `${row.label}：`}{row.text}</p>)}
    </div>}
    {!view.hasContent && <p className="mt-1 text-xs leading-5 text-muted-foreground">此消息没有可显示的公开文字。</p>}
    {(!!details.length || primaryCanFold) && <details key={message.id} open={target || undefined} className="context-event-details mt-1">
      <summary className="min-h-9 w-fit cursor-pointer rounded-md py-2 text-xs leading-5 text-muted-strong underline-offset-4 hover:underline">
        <span className="context-event-more">查看详情</span><span className="context-event-less">收起详情</span>
      </summary>
      {!!details.length && <dl className="space-y-1 border-t border-border/50 pt-2 text-xs leading-6 text-muted-strong">
        {details.map(row => <div key={row.key} className="whitespace-pre-wrap [overflow-wrap:anywhere]">
          <dt className="inline text-muted-foreground">{row.label}：</dt><dd className="inline">{row.text}</dd>
        </div>)}
      </dl>}
    </details>}
  </section>;
}
