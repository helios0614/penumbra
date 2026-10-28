import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Bubble } from "./Bubble";
import { splitAssistantBubbles, splitUserBubbles } from "./bubble-chunks";
import { TooltipProvider } from "@/components/ui/tooltip";
import { mapMessage } from "@/domain/message";
import { messageWire } from "@/test-fixtures/main-chat-wire";
import { presentChatMessage } from "@/components/chat-workspace/presentation/chat-message-presenter";
import { appendAssistantChunk, createStreamingAssistantAccumulator, flushAssistantAccumulator } from "@/application/chat-send/chat-send-accumulator";
import type { ChatMessageViewModel } from "./chat-ui-types";

const render = (message: ChatMessageViewModel) => renderToStaticMarkup(<TooltipProvider><Bubble message={message} /></TooltipProvider>);
const countBubbles = (html: string) => (html.match(/class="relative min-w-0 max-w-full/g) ?? []).length;
const present = (content: string, role = "assistant") => presentChatMessage(mapMessage(messageWire({ content, role })))!;

describe("display-only bubble boundaries", () => {
  it.each(["", "\n\n", " \t\r\n\u200b\u0000\u2060\uFE0F", "---\n\n***\n\n___"])("renders no assistant surface for invisible body %j", content => {
    expect(splitAssistantBubbles(content)).toEqual([]);
    expect(countBubbles(render(present(content)))).toBe(0);
  });
  it("splits assistant blank lines, keeps ordinary newlines and the existing fence exception", () => {
    expect(splitAssistantBubbles("\n \n一\n二\n\t\n\n\u200b\n三\n\n")).toEqual(["一\n二", "三"]);
    expect(splitAssistantBubbles("一\r\n\r\n二")).toEqual(["一", "二"]);
    expect(splitAssistantBubbles("```js\nconst a = 1;\n\nconst b = 2;\n```\n\n尾段")).toEqual(["```js\nconst a = 1;\n\nconst b = 2;\n```", "尾段"]);
  });
  it.each([
    "[HEART:secret]\n\n一\n\n[TODO:hidden]\n\n[ALARM:hidden]\n\n二\n\n[MUSIC:hidden]",
    "[HEART:secret]\n\n[TODO:hidden]",
    "一\n\n[THINKING_START]safe thought[THINKING_END]\n\n[DRIFT:safe drift]\n\n二",
  ])("filters every partial SSE prefix before bubble rendering and matches HTTP history: %s", raw => {
    let accumulator = createStreamingAssistantAccumulator("test", 10);
    for (const character of raw) {
      accumulator = appendAssistantChunk(accumulator, character);
      const chunks = splitAssistantBubbles(accumulator.message.content);
      expect(chunks.every(chunk => chunk.trim().length > 0)).toBe(true);
      const html = render({ kind: "assistant", id: "stream", ...accumulator.message, attachments: [], executionStatus: "streaming" });
      expect(countBubbles(html)).toBe(chunks.length);
      expect(html.replace(/<[^>]*>/g, "")).not.toMatch(/secret|hidden|HEART:|TODO:|THINKING_START|DRIFT:/);
    }
    const final = flushAssistantAccumulator(accumulator).message;
    expect(splitAssistantBubbles(final.content)).toEqual(splitAssistantBubbles(present(raw).content));
  });
  it("retains independent Thinking, DRIFT and HEART alongside a filtered body", () => {
    const message = presentChatMessage(mapMessage(messageWire({ content: "[HEART:secret]", has_heart: true })))!;
    const html = render(message);
    expect(countBubbles(html)).toBe(0);
    expect(html).toContain("思考过程"); expect(html).toContain("独立随想");
    expect(html).not.toContain("secret");
    expect(message.capabilities?.hasHeart).toBe(true);
  });
  it.each(["一行", "一\n二", "\n  一 \r\n\n\t\n二\n三\n", "\n \n\u200b\n"])("keeps one user identity, raw actions and consistent optimistic/history bubbles: %j", raw => {
    const message = present(raw, "user"), html = render(message);
    expect(countBubbles(html)).toBe(splitUserBubbles(raw).length);
    expect(html.match(/data-message-id=/g)).toHaveLength(1);
    expect(html.match(/aria-label="复制消息"/g)).toHaveLength(1);
    expect(message.content).toBe(raw);
    expect(countBubbles(render({ ...message, executionStatus: "optimistic" }))).toBe(countBubbles(html));
  });
});
