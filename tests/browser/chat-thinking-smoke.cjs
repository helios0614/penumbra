/* Real ChatView; synthetic HTTP/SSE/WS only. Assertions, no screenshots. */
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const { fixture } = require('./chat-pr6-5-config-smoke.cjs');
const row = (id, role, content, thinking = null, drift = null) => ({ id, conv_id: 'a', role, content, thinking, drift,
  created_at: 50, attachments: [], is_carryover: 0, mcp_tool_calls: [], cache_region: null });

async function run(browser, width) {
  const { page, context, state, errors } = await fixture(browser, width);
  try {
    await page.evaluate(() => {
      const original = window.fetch.bind(window);
      window.__thinkingStreams = [];
      window.__thinkingPosts = [];
      window.__thinkingCopies = [];
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async value => window.__thinkingCopies.push(value) } });
      window.fetch = async (url, options) => {
        if (options?.method === 'POST' && /\/(send|regenerate)(?:\?|$)/.test(String(url))) {
          window.__thinkingPosts.push(String(url));
          return new Response(new ReadableStream({ start(controller) { window.__thinkingStreams.push(controller); } }),
            { headers: { 'content-type': 'text/event-stream' } });
        }
        return original(url, options);
      };
    });
    const emit = (payload, event) => page.evaluate(({ payload, event }) => window.__thinkingStreams.at(-1).enqueue(
      new TextEncoder().encode(`${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(payload)}\n\n`)), { payload, event });
    const close = () => page.evaluate(() => window.__thinkingStreams.at(-1).close());
    const select = async name => {
      if (width < 768) await page.getByRole('button', { name: '打开会话列表', exact: true }).click();
      await page.getByRole('button', { name: `打开会话会话 ${name}`, exact: true }).filter({ visible: true }).click();
    };
    const thinking = () => page.getByRole('button', { name: /^思考过程/ });
    const noPrivate = async () => assert(!/SYNTH_PRIVATE|THINKING_START|THINKING_END|HEART:|DRIFT:/.test(await page.locator('body').textContent()));
    const checkWidth = async () => {
      const dimensions = await thinking().evaluate(button => {
        const block = button.parentElement;
        return { blockScroll: block.scrollWidth, blockWidth: block.clientWidth,
          pageScroll: document.documentElement.scrollWidth, viewport: innerWidth };
      });
      assert(dimensions.blockScroll <= dimensions.blockWidth + 1, JSON.stringify(dimensions));
      assert(dimensions.pageScroll <= dimensions.viewport + 1, JSON.stringify(dimensions));
    };

    await page.getByRole('textbox', { name: '消息正文', exact: true }).fill('synthetic question');
    await page.getByRole('button', { name: '发送消息', exact: true }).click();
    await page.waitForFunction(() => window.__thinkingStreams.length === 1);
    await emit({ type: 'start', id: 'thinking-saved', drift_enabled: true, include_drift: false });
    await emit({ type: 'chunk', content: '[THINKING_START]safe[HEART:SYNTH_PRIVATE]' });
    await thinking().waitFor(); assert.equal(await thinking().getAttribute('aria-expanded'), 'false');
    await thinking().focus(); await page.keyboard.press('Enter');
    assert.equal(await thinking().getAttribute('aria-expanded'), 'true');
    await emit({ type: 'chunk', content: ' more' });
    await page.getByText('safe more', { exact: true }).waitFor();
    const long = '长内容\n'.repeat(2000) + 'https://synthetic.invalid/' + 'A'.repeat(1000) + '\n```js\nconst synthetic = 1;\n```';
    await emit({ type: 'chunk', content: `[THINKING_END][DRIFT:authorized drift]body[THINKING_START]${long}[THINKING_END]` });
    await page.getByText('authorized drift', { exact: true }).waitFor(); // Feature on + echo off still streams.
    await noPrivate(); await checkWidth();
    assert.equal(await thinking().getAttribute('aria-expanded'), 'true');
    await thinking().click(); assert.equal(await thinking().getAttribute('aria-expanded'), 'false');
    await select('B'); await page.locator('[data-message-id="b-initial"]').waitFor();
    assert.equal(await thinking().count(), 0);
    await select('A'); await thinking().waitFor();
    await page.getByText('authorized drift', { exact: true }).waitFor();
    state.messages.a.push(row('thinking-user', 'user', 'synthetic question'), row('thinking-saved', 'assistant', 'body', `safe more\n\n${long}`, 'authorized drift'));
    await close();
    const saved = page.locator('[data-message-id="thinking-saved"]');
    await saved.getByRole('button', { name: '复制消息', exact: true }).waitFor();
    await saved.getByRole('button', { name: '复制消息', exact: true }).click({ force: true });
    await page.waitForFunction(() => window.__thinkingCopies.length === 1);
    assert.deepEqual(await page.evaluate(() => window.__thinkingCopies), ['body']);
    await page.reload(); await thinking().waitFor();
    assert.equal(await thinking().getAttribute('aria-expanded'), 'false');
    await thinking().click(); await checkWidth(); await noPrivate();
    await page.getByText('authorized drift', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(`${width}px: keyboard toggle, live update, feature-on/echo-off DRIFT, A/B isolation, HTTP refresh, copy isolation and long text width passed`);
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try { for (const width of [320, 390, 1280]) await run(browser, width); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
