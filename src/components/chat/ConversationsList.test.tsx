import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ChatConversationItemViewModel } from "@/components/chat-workspace/presentation";
import { ConversationsList } from "@/components/chat/ConversationsList";

const conversations: readonly ChatConversationItemViewModel[] = [
  {
    id: "conv_a",
    title: "会话 A",
    subtitle: null,
    modelKey: "model-a",
    updatedAt: null,
    isSelected: true,
    isPending: false,
  },
  {
    id: "conv_b",
    title: "会话 B",
    subtitle: null,
    modelKey: "model-b",
    updatedAt: null,
    isSelected: false,
    isPending: false,
  },
];

describe("ConversationsList header", () => {
  it("keeps the count on desktop and removes it from the mobile drawer", () => {
    const desktop = renderToStaticMarkup(
      <ConversationsList conversations={conversations} onSelect={vi.fn()} />,
    );
    const mobile = renderToStaticMarkup(
      <ConversationsList
        conversations={conversations}
        onSelect={vi.fn()}
        mobileDrawer
      />,
    );

    expect(desktop).toContain("mist-solid");
    expect(desktop).toContain("tabular-nums");
    expect(desktop).toContain(">2</span>");
    expect(mobile).toContain("bg-transparent");
    expect(mobile).not.toContain("mist-solid");
    expect(mobile).not.toContain("tabular-nums");
  });
});
