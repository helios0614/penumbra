import { createElement, Fragment, type ReactNode } from "react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Message } from "@/domain/message/message-types";
import { insertableBody } from "./insertable-body";
import { contextTime } from "./conversation-context";
import { cn } from "@/lib/utils";

type Node = { type: string; value?: string; depth?: number; ordered?: boolean;
  lang?: string | null; children?: Node[] };
const parser = unified().use(remarkParse).use(remarkGfm);
const comparable = (text: string) => text.normalize("NFC").replace(/\s+/gu, " ").trim();

// Only inert semantic elements. No href/src, raw HTML, media, code toolbar or actions.
function markdownNodes(node: Node, key: number, preview = true): ReactNode {
  if (["image", "imageReference", "html", "definition", "thematicBreak"].includes(node.type)) return null;
  if (node.type === "text") return node.value;
  if (node.type === "break") return <br key={key} />;
  if (node.type === "code") {
    if (preview && /^(md|markdown)$/i.test(node.lang ?? ""))
      return <div key={key}>{markdownNodes(parser.parse(node.value ?? "") as Node, 0, false)}</div>;
    return <pre key={key} className="scrollbar-none my-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-background/40 p-3"><code>{node.value}</code></pre>;
  }
  const children = node.children?.map((child, index) => markdownNodes(child, index, preview));
  const tag = ({ paragraph: "p", emphasis: "em", strong: "strong", delete: "del", inlineCode: "code",
    blockquote: "blockquote", listItem: "li", table: "table", tableRow: "tr", tableCell: "td" } as Record<string, string>)[node.type];
  if (node.type === "heading") return createElement(`h${Math.max(1, Math.min(6, node.depth ?? 3))}`, { key }, children);
  if (node.type === "list") return createElement(node.ordered ? "ol" : "ul", { key }, children);
  if (node.type === "table") return <div key={key} className="scrollbar-none overflow-x-auto"><table><tbody>{children}</tbody></table></div>;
  if (tag) return createElement(tag, { key }, node.type === "inlineCode" ? node.value : children);
  // Link labels remain readable, without making their destinations interactive.
  return <Fragment key={key}>{children}</Fragment>;
}

export function ReadonlyPublicBody({ message }: { message: Message }) {
  const segments = message.searchSegments ?? [];
  const body = segments.find(s => s.segmentKey === "body")?.text;
  // Canonical content can contain hidden controls or unredacted secrets. Only
  // render its Markdown if all visible text agrees with the server whitelist.
  const markdown = body && comparable(insertableBody(message.content)) === comparable(body);
  return <div className="context-public-body space-y-2 [overflow-wrap:anywhere]">
    {body && (markdown
      ? <div className="context-markdown">{markdownNodes(parser.parse(message.content) as Node, 0)}</div>
      : <p className="whitespace-pre-wrap">{body}</p>)}
    {segments.filter(s => s.segmentKey !== "body").map(s =>
      <p key={s.segmentKey} className="whitespace-pre-wrap text-[13px] leading-6 text-muted-strong">{s.text}</p>)}
    {!segments.length && <p className="text-muted-foreground">此消息没有可显示的公开文字。</p>}
  </div>;
}

export function ReadonlyConversation({ messages, targetId }: {
  messages: readonly Message[]; targetId: string;
}) {
  return <ol className="space-y-3" aria-label="原文对话消息">
    {messages.filter(m => ["user", "assistant", "system"].includes(m.roleKind)).map(message =>
      <li key={message.id} data-context-message={message.id} aria-current={message.id === targetId ? "true" : undefined}
        className={cn("rounded-2xl px-4 py-3 text-sm leading-7 text-foreground",
          message.roleKind === "user" ? "bg-primary/8" : message.roleKind === "assistant" ? "bg-ai/12" : "bg-background/35",
          message.id === targetId && "context-target")}>
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-muted-strong">{message.roleKind === "user" ? "你" : message.roleKind === "assistant" ? "知远" : "系统通知"}</span>
          <time dateTime={new Date(message.createdAt * 1000).toISOString()}>{contextTime(message.createdAt)}</time>
          {message.id === targetId && <span className="text-primary-ink">当前关注</span>}
        </div>
        <ReadonlyPublicBody message={message} />
      </li>)}
  </ol>;
}
