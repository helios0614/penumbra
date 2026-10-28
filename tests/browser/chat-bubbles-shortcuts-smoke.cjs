/* Real ChatView + synthetic HTTP/SSE/WS; isolated profiles, assertions only. */
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const { fixture } = require('./chat-pr6-5-config-smoke.cjs');
const key = 'penumbra-chat-send-shortcut';
const row = (id, role, content) => ({ id, conv_id: 'a', role, content, created_at: 50,
  thinking: null, drift: null, attachments: [], is_carryover: 0, mcp_tool_calls: [], cache_region: null });

async function run(browser, width) {
  const { page, state, context, errors } = await fixture(browser, width);
  const mobile = width < 768;
  const input = page.getByRole('textbox', { name: '消息正文', exact: true });
  const send = page.getByRole('button', { name: '发送消息', exact: true });
  const setting = page.getByRole('combobox', { name: '发送快捷键', exact: true });
  const open = async () => { await page.getByRole('button', { name: '聊天设置', exact: true }).click(); await setting.waitFor(); };
  const selectMode = async label => {
    await open();
    if (label === 'Shift + Enter 发送' && !mobile) { await setting.focus(); await setting.press('Enter'); }
    else await setting.click();
    const menu = page.locator('[data-slot="select-content"]');
    await menu.waitFor();
    assert.deepEqual(await page.getByRole('option').allTextContents(), ['无快捷键', 'Enter 发送', 'Shift + Enter 发送']);
    assert(await menu.evaluate(el => {
      const box = el.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && el.scrollWidth <= el.clientWidth + 1;
    }));
    if (label === 'Shift + Enter 发送' && !mobile) { await page.keyboard.press('End'); await page.keyboard.press('Enter'); }
    else if (mobile) await page.getByRole('option', { name: label, exact: true }).tap();
    else await page.getByRole('option', { name: label, exact: true }).click();
    await menu.waitFor({ state: 'hidden' });
    assert.equal(await setting.locator('[data-slot="select-value"]').textContent(), label);
    assert(await setting.evaluate(el => {
      const row = el.closest('[data-chat-setting="send-shortcut"]'), label = row.querySelector('span');
      const box = el.getBoundingClientRect(), text = label.getBoundingClientRect();
      return row.getBoundingClientRect().height <= 52 && text.right <= box.left &&
        Math.abs(text.top + text.height / 2 - box.top - box.height / 2) < 2;
    }));
    await page.keyboard.press('Escape');
  };
  const idle = async () => { await input.fill(''); await page.waitForFunction(() => !document.querySelector('[aria-label="聊天设置"]').disabled); };
  try {
    await open();
    assert.equal(await setting.locator('[data-slot="select-value"]').textContent(), '无快捷键');
    await page.keyboard.press('Escape');
    await input.fill('默认'); await input.press('Enter'); await input.press('Shift+Enter');
    assert.equal(await input.inputValue(), '默认\n\n'); assert.equal(state.sends.length, 0);

    for (const [mode, label, trigger, newline] of [
      ['none', '无快捷键', null, 'Enter'],
      ['enter', 'Enter 发送', 'Enter', 'Shift+Enter'],
      ['shift-enter', 'Shift + Enter 发送', 'Shift+Enter', 'Enter'],
    ]) {
      await selectMode(label);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), key), mode);
      await input.fill('换行'); await input.press(newline); assert.equal(await input.inputValue(), '换行\n');
      const before = state.sends.length;
      for (const combo of ['Control+Enter', 'Meta+Enter', 'Alt+Enter', 'Control+Shift+Enter', 'Meta+Shift+Enter', 'Alt+Shift+Enter']) await input.press(combo);
      assert.equal(state.sends.length, before);
      await input.fill('候选确认');
      await input.dispatchEvent('compositionstart');
      await input.dispatchEvent('keydown', { key: 'Enter', shiftKey: mode === 'shift-enter', bubbles: true, cancelable: true });
      await input.dispatchEvent('compositionend');
      await input.dispatchEvent('keydown', { key: 'Enter', shiftKey: mode === 'shift-enter', keyCode: 229, bubbles: true, cancelable: true });
      assert.equal(state.sends.length, before);
      if (trigger) {
        await input.fill('键盘发送'); await input.press(trigger);
        if (mobile) { assert.equal(await input.inputValue(), '键盘发送\n'); assert.equal(state.sends.length, before); }
        else { await page.waitForFunction(n => window.__sendCountForTest() === n, before + 1); await idle(); }
      }
      const raw = `\n  ${mode} 一行 \n\n二行\n三行\n `;
      await input.fill(raw); await send.click();
      await page.waitForFunction(n => window.__sendCountForTest() === n, before + (trigger && !mobile ? 2 : 1));
      await idle();
      assert.equal(state.sends.at(-1).content, raw);
      const user = state.messages.a.filter(m => m.role === 'user').at(-1);
      const bubble = page.locator(`[data-message-id="${user.id}"]`);
      await bubble.waitFor(); assert.equal(await bubble.locator('[data-user-bubble]').count(), 3);
      assert.equal(await bubble.getByRole('button', { name: '复制消息', exact: true }).count(), 1);
      const copy = bubble.getByRole('button', { name: '复制消息', exact: true });
      await copy.focus(); await copy.press('Enter');
      await page.waitForFunction(raw => window.__copiedRaw.at(-1) === raw, raw);
    }
    assert.equal(state.saves.length, 0);
    await page.reload(); await input.waitFor(); await open();
    assert.equal(await setting.locator('[data-slot="select-value"]').textContent(), 'Shift + Enter 发送');
    await page.keyboard.press('Escape');
    await page.evaluate(key => localStorage.setItem(key, 'stale-value'), key); await page.reload(); await input.waitFor(); await open();
    assert.equal(await setting.locator('[data-slot="select-value"]').textContent(), '无快捷键');
    const panel = page.getByRole('dialog', { name: '聊天设置', exact: true });
    assert(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await page.keyboard.press('Escape');

    // Start a held stream and prove one optimistic message / one POST, then exact HTTP identity replacement.
    await page.evaluate(() => {
      const original = window.fetch.bind(window); window.__splitPosts = [];
      window.fetch = async (url, options) => {
        if (options?.method === 'POST' && /\/send$/.test(String(url))) {
          window.__splitPosts.push(JSON.parse(options.body));
          return new Response(new ReadableStream({ start(c) { window.__splitStream = c; } }), { headers: { 'content-type': 'text/event-stream' } });
        }
        return original(url, options);
      };
    });
    const raw = '\n 乐观第一行\n\n第二行\n第三行\n ';
    await input.fill(raw); await send.click(); await page.waitForFunction(() => window.__splitPosts.length === 1);
    const optimistic = page.locator('[data-message-id]:has(.chat-user-meta)').last();
    assert.equal(await optimistic.locator('[data-user-bubble]').count(), 3);
    assert.equal(await send.isDisabled(), true);
    const emit = async payload => page.evaluate(payload => window.__splitStream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`)), payload);
    await emit({ type: 'start', id: 'split-assistant' });
    const assistant = page.locator('[data-message-id]:has(.chat-ai-meta)').last();
    const chunks = ['[HE', 'ART:secret]\n\n', '第一段\n单行\n\n[TO', 'DO:hidden]\n\n\u200b\n\n[THINK', 'ING_START]safe thought[THINKING_END]\n\n[DRIFT:safe drift]\n\n', '第二段\n\n[MU', 'SIC:hidden]'];
    for (const content of chunks) {
      await emit({ type: 'chunk', content });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
      const body = assistant.locator('[data-message-body]');
      assert.equal(await body.locator(':scope > div:not(.chat-generation)').evaluateAll(nodes => nodes.filter(n => !n.textContent.replace(/[\s\u200b]/g, '')).length), 0);
      assert(!/secret|hidden|HEART:|TODO:|THINKING_START|DRIFT:/.test(await page.locator('body').textContent()));
    }
    const streamed = assistant.locator('[data-message-body] > div:not(.chat-generation)');
    assert.equal(await streamed.count(), 2);
    const streamedText = await streamed.allTextContents();
    const post = await page.evaluate(() => window.__splitPosts[0]); assert.equal(post.content, raw);
    state.messages.a.push(row('split-user', 'user', raw), row('split-assistant', 'assistant', chunks.join('')));
    await page.route('**/api/conversations/a/send-results/*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ conv_id: 'a', client_msg_id: post.client_msg_id, user_message_id: 'split-user', assistant_message_id: 'split-assistant' }) }));
    await page.evaluate(() => window.__splitStream.close());
    await page.locator('[data-message-id="split-user"]').waitFor();
    await page.locator('[data-message-id="split-assistant"]').getByRole('button', { name: '复制消息', exact: true }).waitFor();
    assert.deepEqual(await streamed.allTextContents(), streamedText);
    assert.equal(await page.locator('[data-message-id="split-user"] [data-user-bubble]').count(), 3);
    assert.equal(await page.locator('[data-message-id]:has(.chat-user-meta)').count(), state.messages.a.filter(m => m.role === 'user').length);
    assert.equal(await page.evaluate(() => window.__splitPosts.length), 1);
    const switchTo = async name => {
      if (mobile) await page.getByRole('button', { name: '打开会话列表', exact: true }).click();
      await page.getByRole('button', { name: `打开会话会话 ${name}`, exact: true }).filter({ visible: true }).click();
    };
    await switchTo('B'); await page.locator('[data-message-id="b-initial"]').waitFor();
    await switchTo('A'); await page.locator('[data-message-id="split-user"]').waitFor();
    assert.deepEqual(await streamed.allTextContents(), streamedText);
    await page.reload(); await page.locator('[data-message-id="split-user"]').waitFor();
    assert.deepEqual(await streamed.allTextContents(), streamedText);
    assert(await input.evaluate(el => el.getBoundingClientRect().right <= innerWidth && el.getBoundingClientRect().left >= 0));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    console.log(`${width}px: three preferences, native newlines/IME/modifiers, raw payload/copy, optimistic identity/receipt, SSE/HTTP bubbles, conversation switch and width passed`);
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  // The existing fixture owns synthetic state in Node; expose only its count and a clipboard sink.
  const original = browser.newContext.bind(browser);
  browser.newContext = async (...args) => {
    const context = await original(...args);
    await context.addInitScript(() => {
      window.__copiedRaw = []; window.__testSendCount = 0;
      window.__sendCountForTest = () => window.__testSendCount;
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => window.__copiedRaw.push(text) } });
      const fetch = window.fetch.bind(window);
      window.fetch = (url, options) => {
        if (options?.method === 'POST' && /\/send$/.test(String(url))) window.__testSendCount++;
        return fetch(url, options);
      };
    });
    return context;
  };
  try { for (const width of [320, 390, 1280]) await run(browser, width); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
