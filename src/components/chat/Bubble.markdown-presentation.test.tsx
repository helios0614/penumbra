import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Bubble } from "./Bubble";
import { TooltipProvider } from "@/components/ui/tooltip";
import { splitAssistantBubbles } from "./bubble-chunks";
import { definitionLinks, markdownSurface } from "./markdown-presentation";
import { presentChatMessage } from "@/components/chat-workspace/presentation/chat-message-presenter";
import { mapMessage } from "@/domain/message";
import { messageWire } from "@/test-fixtures/main-chat-wire";
import type { ChatMessageViewModel } from "./chat-ui-types";

const message = (content: string) => presentChatMessage(mapMessage(messageWire({ content, thinking: null, drift: null })))!;
const render = (content: string, patch: Partial<Extract<ChatMessageViewModel, { kind: 'assistant' }>> = {}) =>
  renderToStaticMarkup(<TooltipProvider><Bubble message={{ ...message(content), ...patch } as ChatMessageViewModel} /></TooltipProvider>);

describe('Markdown PR2 display', () => {
  it.each(['---', '***', '----', '* * *', '_ _ _', '___\n***'])('shows thematic breaks %j without a padded surface', source => {
    expect(splitAssistantBubbles(source)).toEqual([source]);
    const html = render(source);
    expect(html).toContain('<hr/>');
    expect(html).toContain('data-markdown-segment="rule"');
    expect(html).not.toContain('min-h-9');
  });
  it('preserves Setext and code semantics and ordinary multi bubbles', () => {
    expect(markdownSurface('Title\n---')).toBe('body');
    expect(render('Title\n---')).toContain('<h2>Title</h2>');
    expect(render('```\n---\n```')).not.toContain('<hr');
    expect(splitAssistantBubbles('one\n\n---\n\ntwo')).toEqual(['one', '---', 'two']);
    expect(splitAssistantBubbles('one\ntwo\n\nthree')).toEqual(['one\ntwo', 'three']);
  });
  it('uses one surface for standalone code and keeps embedded/quoted code inside its container', () => {
    const standalone = render('```ts\nconst a=1;\n```');
    expect(standalone).toContain('data-markdown-segment="code"');
    expect(standalone).not.toContain('min-h-9');
    for (const source of ['intro\n```ts\nconst a=1;\n```\nend', '> ```ts\n> const a=1;\n> ```', '- item\n\n  ```ts\n  const a=1;\n  ```']) {
      const html = render(source);
      expect(html).toContain('data-markdown-segment="body"');
      expect(html).toContain('min-h-9');
      expect(html).toContain('ai-code-toolbar');
    }
  });
  it('shows a safe whole-message definition fallback and preserves its original content', () => {
    const raw = '[doc]: https://example.org/guide\n\n[help]: https://example.org/help';
    expect(message(raw).content).toBe(raw);
    expect(splitAssistantBubbles(raw)).toEqual([raw]);
    const html = render(raw);
    expect(html).toContain('href="https://example.org/guide"');
    expect(html).toContain('href="https://example.org/help"');
    expect(html).not.toContain('data-message-empty');
    expect(html.match(/aria-label="复制消息"/g)).toHaveLength(1);
  });
  it.each(['javascript:alert(1)', 'data:text/html,unsafe', 'file:///private/synthetic'])('blocks fallback destination %s', url => {
    const raw = `[doc]: ${url}`;
    expect(definitionLinks(raw)[0].href).toBe('');
    const html = render(raw);
    expect(html).toContain('链接不可用');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain(url);
  });
  it.each(['https://example.org', 'http://example.org', 'mailto:synthetic@example.org', '/synthetic-guide'])('uses the existing react-markdown URL policy for %s', url => {
    expect(definitionLinks(`[doc]: ${url}`)[0].href).toBe(url);
  });
  it('does not repeat definitions alongside visible body or implement MD-03 sharing', () => {
    const raw = 'Read [guide][doc].\n\n[doc]: https://example.org/guide';
    expect(splitAssistantBubbles(raw)).toEqual(['Read [guide][doc].']);
    expect(render(raw)).not.toContain('href=');
    expect(render(raw)).not.toContain('chat-definition-link');
  });
  it.each(['', ' \n\u200b', '#', '>'])('avoids an avatar-only final shell for %j', raw => {
    const html = render(raw);
    expect(html).toContain('data-message-empty');
    expect(html).toContain('暂无可显示内容');
    expect(html).not.toContain('min-h-9');
    expect(html).toContain('data-chat-non-body');
  });
  it.each([
    { thinking: 'synthetic thought' }, { simpleThink: 'synthetic drift' },
    { error: 'synthetic error' }, { toolPending: true },
    { attachments: [{ kind: 'image' as const, url: 'https://example.invalid/synthetic.png', label: 'synthetic' }] },
    { capabilities: { conversationId: 'synthetic', display: null, reaction: null, hasHeart: true, heartRevision: null, results: [] } },
    { executionStatus: 'streaming' as const }, { executionStatus: 'finalizing' as const },
  ])('preserves independent public content/status without an empty-body notice: %j', patch => {
    expect(render('', patch)).not.toContain('data-message-empty');
  });
  it('never turns hidden commands into a link or fallback label', () => {
    const html = render('[HEART:SYNTH_PRIVATE]\n\n[doc]: https://example.org/guide');
    expect(html).toContain('href="https://example.org/guide"');
    expect(html).not.toContain('SYNTH_PRIVATE');
  });
});
