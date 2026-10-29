import { createElement, Fragment, type ReactNode } from "react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Message } from "@/domain/message/message-types";
import { insertableBody } from "./insertable-body";
import { ReadonlyEvent } from "./ReadonlyEvent";
import { ReadonlyMessageBubble } from "./ReadonlyMessageBubble";

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

export function ReadonlyPublicBody({ message, target = false }: { message: Message; target?: boolean }) {
  const segments = message.searchSegments ?? [];
  const body = segments.find(s => s.segmentKey === "body")?.text;
  const eventSegments = segments.filter(s => /^(display\.|tool:|web:|url:)/.test(s.segmentKey));
  // Canonical content can contain hidden controls or unredacted secrets. Only
  // render its Markdown if all visible text agrees with the server whitelist.
  const markdown = body && comparable(insertableBody(message.content)) === comparable(body);
  return <div className="context-public-body space-y-2 [overflow-wrap:anywhere]">
    {body && (markdown
      ? <div className="context-markdown">{markdownNodes(parser.parse(message.content) as Node, 0)}</div>
      : <p className="whitespace-pre-wrap">{body}</p>)}
    {!!eventSegments.length && <ReadonlyEvent message={{ ...message, searchSegments: eventSegments }} target={target} showTime={false} />}
    {segments.filter(s => s.segmentKey.startsWith("music:")).map(s =>
      <p key={s.segmentKey} className="whitespace-pre-wrap text-[13px] leading-6 text-muted-strong">{s.text}</p>)}
    {!segments.length && <p className="text-muted-foreground">此消息没有可显示的公开文字。</p>}
  </div>;
}

export function ReadonlyConversation({ messages, targetId }: {
  messages: readonly Message[]; targetId: string;
}) {
  return <ol className="space-y-2" aria-label="原文对话消息">
    {messages.filter(m => ["user", "assistant", "system"].includes(m.roleKind)).map(message =>
      <ReadonlyMessageBubble key={message.id} messageId={message.id} role={message.roleKind as "user" | "assistant" | "system"}
        name={message.roleKind === "user" ? "你" : "知远"} createdAt={message.createdAt} target={message.id === targetId}>
        {message.roleKind === "system" ? <ReadonlyEvent message={message} target={message.id === targetId} />
          : <ReadonlyPublicBody message={message} target={message.id === targetId} />}
      </ReadonlyMessageBubble>)}
  </ol>;
}
