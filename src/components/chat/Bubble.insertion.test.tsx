import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Bubble } from "./Bubble";
import { TooltipProvider } from "@/components/ui/tooltip";
import { presentChatMessage } from "@/components/chat-workspace/presentation/chat-message-presenter";
import { mapMessage } from "@/domain/message/message-mappers";
import { messageWire } from "@/test-fixtures/main-chat-wire";

describe("PR3 eligible message bodies", () => {
  it.each(["", "  ", "<!-- technical -->\n\n---", "provider_execution_failed: private data"])("hides insertion for empty or status-only content: %s", content => {
    const message = presentChatMessage(mapMessage(messageWire({ content })))!;
    const html = renderToStaticMarkup(<TooltipProvider><Bubble message={message} onInsert={vi.fn()} /></TooltipProvider>);
    expect(html).not.toContain('aria-label="放入输入框"');
    expect(html).toContain('aria-label="复制消息"');
  });
  it("orders copy, insertion and regeneration and never adds insertion to user messages", () => {
    const assistant = presentChatMessage(mapMessage(messageWire({ content: "**可见正文**" })))!;
    const html = renderToStaticMarkup(<TooltipProvider><Bubble message={assistant} onInsert={vi.fn()} onRegenerate={vi.fn()} /></TooltipProvider>);
    expect(html.indexOf('aria-label="复制消息"')).toBeLessThan(html.indexOf('aria-label="放入输入框"'));
    expect(html.indexOf('aria-label="放入输入框"')).toBeLessThan(html.indexOf('aria-label="重新生成回复"'));
    const user = presentChatMessage(mapMessage(messageWire({ role: "user" })))!;
    expect(renderToStaticMarkup(<TooltipProvider><Bubble message={user} onInsert={vi.fn()} /></TooltipProvider>)).not.toContain('aria-label="放入输入框"');
  });
});
