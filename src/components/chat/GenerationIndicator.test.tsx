import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Bubble } from "./Bubble";
import type { ChatMessageViewModel } from "./chat-ui-types";

function bubble(patch: Partial<Extract<ChatMessageViewModel, { kind: "assistant" }>> = {}) {
  return renderToStaticMarkup(<Bubble message={{ id: "same-target", kind: "assistant", content: "", createdAt: 1,
    thinking: null, simpleThink: null, attachments: [], executionStatus: "streaming", ...patch }} />);
}
describe("assistant generation bubble", () => {
  it("shows a small truthful waiting state without an empty body bubble", () => {
    const html = bubble();
    expect(html).toContain("正在生成"); expect(html).toContain('data-message-id="same-target"');
    expect(html).toContain("min-h-9"); expect(html).toContain("bg-ai/[0.06]");
    expect(html).toContain("rounded-md"); expect(html).toContain("px-4 py-2"); expect(html).not.toContain("思考中");
    expect(html).toContain('aria-hidden="true"'); expect(html).toContain('role="status"');
  });
  it("transitions to visible streaming text while keeping Thinking and DRIFT separate", () => {
    const html = bubble({ content: "可见正文", thinking: "扩展思考", simpleThink: "独立 DRIFT" });
    expect(html).toContain("可见正文"); expect(html).not.toContain("chat-generation"); expect(html).toContain("独立 DRIFT");
    expect(html).not.toContain("正在生成"); expect(html).not.toContain('aria-label="复制消息"');
  });
  it.each([["finalizing", "正在确认保存"], ["unconfirmed", "结果待确认"]] as const)("does not claim success for %s", (executionStatus, label) => {
    const html = bubble({ executionStatus });
    expect(html).toContain(label); expect(html).not.toContain("正在输入");
    if (executionStatus === "unconfirmed") expect(html).not.toContain("chat-generation-dots");
  });
  it("restores normal content/actions after authoritative reconciliation", () => {
    const html = bubble({ content: "持久化正文", executionStatus: undefined });
    expect(html).toContain("持久化正文"); expect(html).not.toContain("chat-generation"); expect(html).toContain("复制");
  });
  it.each([["finalizing", "正在确认保存"], ["unconfirmed", "结果待确认"]] as const)("keeps %s feedback beside metadata when body is visible", (executionStatus, label) => {
    const html = bubble({ executionStatus, content: "正文" });
    expect(html).toContain(label); expect(html).toContain("正文");
    expect(html).not.toContain("chat-generation"); expect(html.split(label)).toHaveLength(2);
  });
});
