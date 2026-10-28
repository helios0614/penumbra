import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Bubble } from "./Bubble";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { splitAssistantBubbles, splitUserBubbles } from "./bubble-chunks";
import { TooltipProvider } from "@/components/ui/tooltip";
import { markdownCases } from "@/components/dev/chat-markdown-cases";
import { mapMessage } from "@/domain/message";
import { messageWire } from "@/test-fixtures/main-chat-wire";
import { presentChatMessage } from "@/components/chat-workspace/presentation/chat-message-presenter";
import { appendAssistantChunk, createStreamingAssistantAccumulator, flushAssistantAccumulator } from "@/application/chat-send/chat-send-accumulator";

const present = (content: string) => presentChatMessage(mapMessage(messageWire({ content, thinking: null, drift: null })))!;
const html = (content: string) => renderToStaticMarkup(<TooltipProvider><Bubble message={present(content)} /></TooltipProvider>);
const preset = (id: string) => markdownCases.find(item => item.id === id)!.content;
const surfaces = (value: string) => (value.match(/class="relative min-w-0 max-w-full/g) ?? []).length;

describe("Markdown PR1 boundaries and actual Bubble output", () => {
  it.each(markdownCases)("dev case $id has $bubbles body bubbles", item => {
    const message = present(item.content);
    expect(splitAssistantBubbles(message.content)).toHaveLength(item.bubbles);
    expect(surfaces(html(item.content))).toBe(item.bubbles);
  });

  it.each(['`', '~'])("protects %s fences with every legal indentation and keeps source", character => {
    for (const indentation of [0, 1, 2, 3]) {
      const prefix = ' '.repeat(indentation), fence = character.repeat(3);
      const source = `${prefix}${fence}ts\n${prefix}const a=1;\n \t\n\u200b\n${prefix}const b=2;\n${prefix}${fence}`;
      expect(splitAssistantBubbles(source + '\n\nTail\n\nEnd')).toEqual([source, 'Tail', 'End']);
    }
  });

  it.each(['long-fence', 'short-close', 'open-fence', 'indent-code', 'nested-list', 'quote-code', 'quote-list'])("preserves the complete source of %s", id => {
    expect(splitAssistantBubbles(preset(id))).toEqual([preset(id)]);
  });

  it("accepts longer closing fences, rejects mismatched characters and illegal info without guessing", () => {
    expect(splitAssistantBubbles('```ts\na\n\nb\n````\n\nTail')).toHaveLength(2);
    expect(splitAssistantBubbles('```ts\na\n~~~\n\nb')).toHaveLength(1);
    expect(splitAssistantBubbles(preset('invalid-info'))).toEqual(['```ts`invalid\none', 'two']);
  });

  it("keeps a code block inside a loose list, including bare blank lines", () => {
    const list = '- item\n\n  ```ts\n  const a=1;\n\n  const b=2;\n  ```';
    expect(splitAssistantBubbles(list + '\n\nOutside')).toEqual([list, 'Outside']);
    expect(html(list).match(/<pre /g)).toHaveLength(1);
  });

  it("keeps one ordered list, nested paragraph semantics, and separate outer paragraphs", () => {
    const ordered = html(preset('loose-list'));
    expect(ordered.match(/<ol>/g)).toHaveLength(1);
    expect(ordered.match(/<li>/g)).toHaveLength(2);
    const nested = html(preset('nested-list'));
    expect(nested.match(/<ul>/g)).toHaveLength(2);
    expect(nested).toContain('<p>continuation</p>');
    expect(nested).not.toContain('ai-code-block');
    expect(splitAssistantBubbles(preset('list-paragraph'))).toHaveLength(2);
    expect(splitAssistantBubbles(preset('separate-quotes'))).toHaveLength(2);
  });

  it.each(['#', '>'])("does not leave a surface for hidden-only syntax %j", source => {
    expect(splitAssistantBubbles(source)).toEqual([]);
    expect(surfaces(html(source))).toBe(0);
  });

  it("checks the actual slice when an invisible boundary changes paragraph/definition parsing", () => {
    const raw = '\u200b\n[doc]: https://example.org';
    expect(splitAssistantBubbles(raw)).toEqual([]);
    expect(surfaces(html(raw))).toBe(0);
  });

  it.each(['Title\n---', '--- ordinary text', '![image](https://example.org/synthetic.png)', '- [x] task', '```\n```', '` `', '<b>synthetic</b>', '[link](https://example.org)'])("retains visible output %j", source => {
    expect(splitAssistantBubbles(source)).toEqual([source]);
    expect(surfaces(html(source))).toBe(1);
  });

  it("preserves CRLF in the message while using the existing LF display slices", () => {
    const raw = preset('backtick').replace(/\n/g, '\r\n') + '\r\n\r\nTail';
    const message = present(raw);
    expect(message.content).toBe(raw);
    expect(splitAssistantBubbles(message.content)).toEqual([preset('backtick'), 'Tail']);
    expect(splitUserBubbles(' a \r\n\r\n b ')).toEqual([' a ', ' b ']);
  });

  it("adds a local accessible table scroll region while preserving table semantics", () => {
    const rendered = renderToStaticMarkup(<MarkdownRenderer content={preset('wide-table')} />);
    expect(rendered).toContain('data-markdown-table-scroll');
    expect(rendered).toContain('max-w-full overflow-x-auto');
    expect(rendered).toContain('aria-label="表格，可横向滚动"');
    expect(rendered.match(/<th[ >]/g)).toHaveLength(12);
    expect(rendered.match(/<table/g)).toHaveLength(1);
  });

  it("keeps MD-03 unresolved while removing its definition-only bubble", () => {
    const rendered = html(preset('reference-link'));
    expect(surfaces(rendered)).toBe(1);
    expect(rendered).toContain('Read [guide][doc].');
    expect(rendered).not.toContain('<a ');
  });
});

describe("filtered SSE prefixes and HTTP restore", () => {
  const ids = ['backtick', 'tilde', 'indented-fence', 'long-fence', 'short-close', 'invalid-info', 'open-fence', 'indent-code', 'loose-list', 'nested-list', 'quote-code', 'quote-list', 'separate-quotes', 'filtered'];
  it.each(ids)("matches HTTP at every two-chunk cut: %s", id => {
    const raw = preset(id), expected = present(raw).content;
    for (let cut = 0; cut <= raw.length; cut++) {
      let state = createStreamingAssistantAccumulator('markdown-test', 50);
      state = appendAssistantChunk(state, raw.slice(0, cut));
      // Every partial prefix must be safe to segment, including open containers.
      expect(() => splitAssistantBubbles(state.message.content)).not.toThrow();
      state = appendAssistantChunk(state, raw.slice(cut));
      const final = flushAssistantAccumulator(state).message.content;
      expect(final).toBe(expected);
      expect(splitAssistantBubbles(final)).toEqual(splitAssistantBubbles(expected));
    }
  });

  it("never restores hidden commands even inside code; final structure follows the filtered body", () => {
    const raw = 'Before\n\n~~~text\n[HEART:SYNTHETIC]\n\n[TODO:SYNTHETIC]\n~~~\n\nAfter';
    let state = createStreamingAssistantAccumulator('markdown-test', 50);
    for (const character of raw) {
      state = appendAssistantChunk(state, character);
      const chunks = splitAssistantBubbles(state.message.content);
      expect(chunks.join('\n')).not.toMatch(/SYNTHETIC|HEART:|TODO:/);
    }
    expect(splitAssistantBubbles(flushAssistantAccumulator(state).message.content)).toEqual(splitAssistantBubbles(present(raw).content));
    expect(splitAssistantBubbles(present(raw).content)).toHaveLength(3); // Empty code toolbar is intentional.
    expect(splitAssistantBubbles(present(preset('filtered')).content)).toEqual(['----']);
  });
});
