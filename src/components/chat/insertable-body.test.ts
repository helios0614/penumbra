import { describe, expect, it } from "vitest";
import { appendComposerText } from "./composer-draft";
import { insertableBody } from "./insertable-body";
import { presentChatMessage } from "@/components/chat-workspace/presentation/chat-message-presenter";
import { mapMessage } from "@/domain/message/message-mappers";
import { messageWire } from "@/test-fixtures/main-chat-wire";

describe("PR3 visible body insertion", () => {
  it.each([
    ["", "第一行\n第二行", "第一行\n第二行"],
    ["已有", "新增", "已有\n\n新增"],
    ["已有\n", "新增", "已有\n\n新增"],
    ["已有\n\n", "新增", "已有\n\n新增"],
    ["已有", "\n新增", "已有\n\n新增"],
    ["已有", "  ", "已有"],
  ])("preserves sources and supplies natural separators", (draft, body, expected) => {
    expect(appendComposerText(draft, body)).toBe(expected);
  });
  it("keeps paragraphs, Markdown node text and code, excluding invisible HTML and destinations", () => {
    expect(insertableBody("第一段 **强调**\n\n[链接文字](https://private.invalid)\n\n<!-- hidden prompt -->\n\n```js\nconst x = 1;\n```\n\n![图](secret.png)"))
      .toBe("第一段 强调\n\n链接文字\n\nconst x = 1;");
    expect(insertableBody("```markdown\n# 可见标题\n\n正文\n```"))
      .toBe("可见标题\n\n正文");
    expect(insertableBody("<!-- invisible -->\n\n---\n\n![图](hidden.png)")).toBe("");
  });
  it("uses only the public Main presentation and never DRIFT/thinking/internal execution payloads", () => {
    const vm = presentChatMessage(mapMessage(messageWire({
      content: "允许正文\n\n[THINKING_START]private think[THINKING_END][DRIFT:private drift][HEART:secret heart]",
      thinking: "独立隐藏思考", drift: "独立随想",
    })));
    expect(vm?.kind).toBe("assistant"); expect(insertableBody(vm!.content)).toBe("允许正文");
  });
  it("preserves long bodies without truncation", () => {
    const text = "长正文\n".repeat(10000).trim(); expect(insertableBody(text)).toBe(text);
  });
});
