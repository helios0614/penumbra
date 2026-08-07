import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownRenderer } from "./MarkdownRenderer";

describe("MarkdownRenderer code rendering", () => {
  it("distinguishes an unlabelled fenced block from inline code", () => {
    const blockHtml = renderToStaticMarkup(
      <MarkdownRenderer content={"```\nconst a = 1\n```"} />,
    );
    const inlineHtml = renderToStaticMarkup(
      <MarkdownRenderer content={"Use `const a = 1` inline."} />,
    );

    expect(blockHtml).toContain("ai-code-block");
    expect(blockHtml).toContain("<span>Code</span>");
    expect(blockHtml).toContain('<button type="button"');
    expect(blockHtml).toContain("overflow-x-auto whitespace-pre");
    expect(blockHtml).not.toContain("whitespace-pre-wrap");
    expect(blockHtml).not.toContain("break-all");

    expect(inlineHtml).toContain("rounded-sm border border-ai/20");
    expect(inlineHtml).not.toContain("ai-code-block");
  });

  it("previews Markdown fences once and keeps nested code as source code", () => {
    const html = renderToStaticMarkup(
      <MarkdownRenderer
        content={"````markdown\n# Preview\n\n```javascript\nconst a = 1\n```\n````"}
      />,
    );

    expect(html.match(/markdown-preview/g)).toHaveLength(1);
    expect(html).toContain("<span>Markdown</span>");
    expect(html).toContain("<h1>Preview</h1>");
    expect(html).toContain("<span>javascript</span>");
    expect(html).toContain("hljs-keyword");
    expect(html).toContain("const");
    expect(html).not.toContain("[object Object]");
  });
});
