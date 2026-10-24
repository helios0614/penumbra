import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mapMessage } from "@/domain/message";
import { messageWire } from "@/test-fixtures/main-chat-wire";
import { presentChatMessage } from "@/components/chat-workspace/presentation/chat-message-presenter";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Bubble } from "./Bubble";

describe("user Reaction sticker", () => {
  const reaction = { id: "r", type: "reaction", conv_id: "conv_a", target_message_id: "target", source_message_id: "source", emoji: "🛒" };
  const render = (patch = {}) => renderToStaticMarkup(<TooltipProvider><Bubble message={presentChatMessage(mapMessage(messageWire({
    id: "target", conv_id: "conv_a", role: "user", content: "第一段\n\n最后一段", reaction, ...patch,
  })))!} /></TooltipProvider>);
  it("places the true emoji once on the final user bubble and uses the existing AI surface", () => {
    const html = render();
    expect(html.match(/data-reaction-target=/g)).toHaveLength(1);
    expect(html).toContain('data-reaction-anchor="target"');
    expect(html.indexOf('data-reaction-target=')).toBeGreaterThan(html.indexOf("最后一段"));
    expect(html).toMatch(/chat-reaction-sticker border border-ai\/10 bg-ai\/\[0\.06\]/);
    expect(html).toContain("🛒");
    expect(html).toContain('data-reaction-source="source"');
  });
  it("keeps cross-message/cross-conversation identities off the bubble after history mapping", () => {
    expect(render({ id: "other" })).not.toContain("chat-reaction-sticker");
    expect(render({ conv_id: "other" })).not.toContain("chat-reaction-sticker");
    expect(render({ role: "assistant" })).not.toContain("chat-reaction-sticker");
  });
});
