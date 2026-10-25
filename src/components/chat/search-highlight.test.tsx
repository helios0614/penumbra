import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SearchHighlightContext,
  highlightSearchText,
  normalizeSearch,
  searchTextRanges,
} from "./search-highlight";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { insertableBody } from "./insertable-body";
import { CapabilityMessage } from "./capabilities/CapabilityMessage";
import { mapCapabilityRecord } from "@/domain/message/capability-mappers";
import { SearchableBubbleSegments } from "./BubbleSegment";

describe("PR6 visible text highlighting", () => {
  it.each([
    ["Café", "CAFE\u0301"],
    ["Straße", "strasse"],
    ["😀 中文", "😀"],
    ["a\n\t b", "A B"],
    ["ΟΣ", "οσ"],
    ["%_\\.*", "%_\\.*"],
  ])("matches normalized public text %s", (text, q) => {
    const ranges = searchTextRanges(text, q);
    expect(ranges.length).toBeGreaterThan(0);
    for (const [start, end] of ranges)
      expect(normalizeSearch(text.slice(start, end))).toBe(normalizeSearch(q));
    expect(renderToStaticMarkup(<>{highlightSearchText(text, q)}</>)).toContain(
      '<mark class="chat-search-term">',
    );
  });
  it("does not duplicate original characters when folding expands them", () => {
    expect(renderToStaticMarkup(<>{highlightSearchText("ß", "s")}</>)).toBe(
      '<mark class="chat-search-term">ß</mark>',
    );
  });
  it("highlights a phrase across paragraphs and existing assistant bubbles", () => {
    const content = "**Hello**\n\n_world_";
    const context = { query: "hello world", active: true };
    const paragraph = renderToStaticMarkup(
      <SearchHighlightContext value={context}>
        <MarkdownRenderer content={content} />
      </SearchHighlightContext>,
    );
    const bubbles = renderToStaticMarkup(
      <SearchHighlightContext value={context}>
        <SearchableBubbleSegments
          chunks={["**Hello**", "_world_"]}
          kind="assistant"
          identity="persisted"
        />
      </SearchHighlightContext>,
    );
    for (const html of [paragraph, bubbles]) {
      expect(html).toContain('<mark class="chat-search-term">Hello</mark>');
      expect(html).toContain('<mark class="chat-search-term">world</mark>');
    }
    expect(insertableBody(content)).toBe("Hello\n\nworld");
  });
  it("highlights across Markdown formatting and code spans without changing copy source or destinations", () => {
    const content =
      "**Hello** _world_ [shown](https://example.test/private)\n\n```js\nconst hello = 1;\n```";
    const copy = insertableBody(content);
    const html = renderToStaticMarkup(
      <SearchHighlightContext value={{ query: "hello world", active: true }}>
        <MarkdownRenderer content={content} />
      </SearchHighlightContext>,
    );
    expect(html).toContain('<mark class="chat-search-term">Hello</mark>');
    expect(html).toContain('<mark class="chat-search-term">world</mark>');
    const hidden = renderToStaticMarkup(
      <SearchHighlightContext value={{ query: "private", active: true }}>
        <MarkdownRenderer content={content} />
      </SearchHighlightContext>,
    );
    expect(hidden).not.toContain('<mark class="chat-search-term">private');
    expect(insertableBody(content)).toBe(copy);
    const code = renderToStaticMarkup(
      <SearchHighlightContext value={{ query: "hello", active: true }}>
        <MarkdownRenderer content={content} />
      </SearchHighlightContext>,
    );
    expect(code).toContain('<mark class="chat-search-term">hello</mark>');
  });
  it("opens readable system text without opening technical parameters or model context", () => {
    const record = mapCapabilityRecord({
      version: 1,
      kind: "operation",
      capability: "TODO",
      title: "通知",
      status: "success",
      fields: [
        { label: "内容", text: "公开关键词" },
        { label: "调用参数", text: "PRIVATE-ARG" },
        { label: "模型上下文 evidence", text: "PRIVATE-CONTEXT" },
      ],
      notices: [],
    })!;
    const html = renderToStaticMarkup(
      <SearchHighlightContext
        value={{ query: "关键词", active: true, segments: ["display.field:0"] }}
      >
        <CapabilityMessage record={record} identity="target" />
      </SearchHighlightContext>,
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("公开");
    expect(html).toContain('<mark class="chat-search-term">关键词</mark>');
    expect(html).not.toContain("PRIVATE-ARG");
    expect(html).not.toContain("PRIVATE-CONTEXT");
  });
});
