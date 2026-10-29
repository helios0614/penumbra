/* Real ChatView with synthetic storage/HTTP/SSE/WS. Never contacts AionHome. */
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { fixture } = require('./chat-pr6-5-config-smoke.cjs');
const output = '/private/tmp/penumbra-chat-message-edit';
const row = (id, role, content) => ({ id, conv_id: 'a', role, content, created_at: 50,
  thinking: null, drift: null, attachments: [], is_carryover: 0, mcp_tool_calls: [], cache_region: null });

async function run(browser, width) {
  let loadingPage;
  const observedBrowser = { newContext: async options => {
    const context = await browser.newContext(options);
    context.on('page', page => {
      loadingPage = page;
      page.on('pageerror', error => console.error(error.message));
    });
    return context;
  } };
  const { page, state, context, errors } = await fixture(observedBrowser, width).catch(async error => {
    console.error(await loadingPage.locator('body').innerText());
    throw error;
  });
  const original = '\n  第一行  \n\n第二行\n第三行\n ';
  const user = row('edit-user', 'user', original);
  const assistant = { ...row('edit-assistant', 'assistant', '**原回复**\n\n第二段'), thinking: '独立 Thinking', drift: '独立 DRIFT',
    attachments: [{ type: 'file', url: '/synthetic/kept.txt', name: 'kept.txt' }], has_heart: true, heart_revision: 'synthetic' };
  state.messages.a.push(user, row('system', 'system', '合成系统事件'), row('legacy', 'assistant', '[THINKING_START]legacy[THINKING_END]body'), assistant);
  const writes = []; let fail = false, loseResponse = false, noUpdate = false;
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const publicRead = url.pathname.match(/^\/api\/messages\/([^/]+)\/public$/);
    if (publicRead) {
      const message = Object.values(state.messages).flat().find(m => m.id === publicRead[1]);
      return message ? json(message) : json({ detail: 'missing synthetic message' }, 404);
    }
    const edit = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
    if (edit && request.method() === 'PUT') {
      const body = request.postDataJSON(); writes.push({ id: edit[1], body });
      assert.deepEqual(Object.keys(body), ['content']);
      if (fail) { fail = false; return json({ detail: 'synthetic failure' }, 503); }
      if (!noUpdate) Object.values(state.messages).flat().find(m => m.id === edit[1]).content = body.content;
      noUpdate = false;
      if (loseResponse) { loseResponse = false; return route.abort('failed'); }
      return json({ ok: true });
    }
    const regenerate = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages\/([^/]+)\/regenerate$/);
    if (regenerate) {
      const message = state.messages[regenerate[1]].find(m => m.id === regenerate[2]);
      state.regenerates.push({ target: message.id }); message.content += ' · 重新生成';
      const frame = value => `data: ${JSON.stringify(value)}\n\n`;
      return route.fulfill({ contentType: 'text/event-stream', body: frame({ type: 'start', id: message.id }) + frame({ type: 'chunk', content: message.content }) +
        `event: persisted\ndata: ${JSON.stringify({ id: message.id, content: message.content, thinking: message.thinking, drift: message.drift })}\n\n` });
    }
    const history = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages\/window$/);
    if (history) return json({ conversation_id: history[1], anchor_id: url.searchParams.get('anchor_id'), messages: state.messages[history[1]],
      older_cursor: null, newer_cursor: null, has_older: false, has_newer: false, reaches_latest: true });
    return route.fallback();
  });
  const bubble = id => page.locator(`[data-message-id="${id}"]`);
  const dialog = page.getByRole('dialog', { name: '编辑消息', exact: true });
  const editor = page.getByRole('textbox', { name: '编辑消息正文', exact: true });
  const open = async id => { await bubble(id).getByRole('button', { name: '编辑消息', exact: true }).click(); await editor.waitFor(); };
  const save = () => dialog.getByRole('button', { name: '保存', exact: true }).click();
  const cancel = async () => { await dialog.getByRole('button', { name: '取消', exact: true }).click(); await dialog.waitFor({ state: 'hidden' }); };
  const switchTo = async name => {
    if (width < 768) await page.getByRole('button', { name: '打开会话列表', exact: true }).click();
    await page.getByRole('button', { name: `打开会话会话 ${name}`, exact: true }).filter({ visible: true }).click();
  };
  try {
    await page.reload(); await bubble('edit-assistant').waitFor();
    assert.equal(await bubble('edit-user').locator('[data-user-bubble]').count(), 3);
    assert.equal(await bubble('edit-user').getByRole('button', { name: '编辑消息', exact: true }).count(), 1);
    assert.equal(await bubble('system').getByRole('button', { name: '编辑消息', exact: true }).count(), 0);
    assert(await bubble('legacy').getByRole('button', { name: '编辑消息', exact: true }).isDisabled());
    await open('edit-user'); assert.equal(await editor.inputValue(), original);
    await editor.fill('cancelled'); await cancel(); assert.equal(writes.length, 0); assert.equal(user.content, original);

    for (const shortcut of ['enter', 'shift-enter']) {
      await page.evaluate(value => localStorage.setItem('penumbra-chat-send-shortcut', value), shortcut);
      await open('edit-user'); await editor.fill('换行'); await editor.press('Enter'); await editor.press('Shift+Enter');
      assert.equal(await editor.inputValue(), '换行\n\n');
      await editor.dispatchEvent('compositionstart');
      await editor.dispatchEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229, bubbles: true });
      await editor.dispatchEvent('compositionend');
      assert.equal(state.sends.length, 0); assert.equal(writes.length, 0); await cancel();
    }
    const updatedUser = '\n  编辑后第一行  \n\n最后一行\n ';
    await open('edit-user'); await editor.fill(updatedUser);
    await page.setViewportSize({ width, height: 340 });
    await dialog.evaluate(el => Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))));
    await dialog.getByRole('button', { name: '保存', exact: true }).scrollIntoViewIfNeeded();
    assert(await dialog.evaluate(el => {
      const r = el.getBoundingClientRect(), b = [...el.querySelectorAll('button')].find(b => b.textContent === '保存').getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && b.bottom <= innerHeight && el.scrollWidth <= el.clientWidth + 1;
    }));
    await page.screenshot({ path: `${output}/editor-short-${width}.png` });
    await save(); await dialog.waitFor({ state: 'hidden' }); assert.equal(user.content, updatedUser);
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await bubble('edit-user').locator('[data-user-bubble]').count(), 2);
    await open('edit-user'); assert.equal(await editor.inputValue(), updatedUser); await cancel();

    const preserved = structuredClone(assistant); delete preserved.content;
    await open('edit-assistant'); assert.equal(await editor.inputValue(), assistant.content);
    const markdown = '# 编辑标题\n\n**加粗**\n\n```js\nconst value = 1;\n```';
    await editor.fill(markdown); fail = true; await save();
    await dialog.getByRole('alert').waitFor(); assert.equal(await editor.inputValue(), markdown);
    assert.equal(assistant.content, '**原回复**\n\n第二段');
    await save(); await dialog.waitFor({ state: 'hidden' });
    assert.equal(await bubble('edit-assistant').getByRole('heading', { name: '编辑标题', exact: true }).count(), 1);
    assert.equal(await bubble('edit-assistant').locator('strong').textContent(), '加粗');
    assert.equal(await bubble('edit-assistant').locator('code').textContent(), 'const value = 1;\n');
    const after = structuredClone(assistant); delete after.content; assert.deepEqual(after, preserved);
    assert((await bubble('edit-assistant').textContent()).includes('独立 Thinking'));
    assert((await bubble('edit-assistant').textContent()).includes('独立 DRIFT'));
    await page.reload(); await bubble('edit-assistant').waitFor();
    await open('edit-assistant'); assert.equal(await editor.inputValue(), markdown); await cancel();
    await switchTo('B'); await bubble('b-initial').waitFor();
    await open('b-initial'); await editor.fill('B 会话的新内容'); await save(); await dialog.waitFor({ state: 'hidden' });
    assert.equal(state.messages.b[0].content, 'B 会话的新内容'); assert.equal(user.content, updatedUser);
    await switchTo('A'); await bubble('edit-user').waitFor(); await open('edit-user'); assert.equal(await editor.inputValue(), updatedUser); await cancel();

    // A lost response is never shown as success; retry reads the persisted value without a second PUT.
    await open('edit-user'); await editor.fill('response lost'); loseResponse = true; await save();
    await dialog.getByRole('alert').waitFor(); assert.equal(await editor.inputValue(), 'response lost');
    const count = writes.length; await save(); await dialog.waitFor({ state: 'hidden' }); assert.equal(writes.length, count);
    // Legacy PUT returns ok for nonexistent/no-op writes. Verify via HTTP rather than trust ok.
    await open('edit-user'); await editor.fill('must not claim saved'); noUpdate = true; await save();
    await dialog.getByRole('alert').waitFor(); assert.equal(await editor.inputValue(), 'must not claim saved'); await cancel();
    await open('edit-user'); user.content = 'edited on another client'; await editor.fill('stale draft');
    state.ws.send(JSON.stringify({ type: 'msg_updated', data: user }));
    await page.waitForFunction(() => document.querySelector('[data-message-id="edit-user"]').textContent.includes('edited on another client'));
    assert.equal(await editor.inputValue(), 'stale draft');
    const beforeConflict = writes.length; await save(); await dialog.getByRole('alert').waitFor();
    assert.equal(writes.length, beforeConflict); assert.equal(await editor.inputValue(), 'stale draft'); await cancel();

    assert.equal(state.sends.length, 0); assert.equal(state.regenerates.length, 0);
    // Existing canonical regenerate retains the original target ID after an edit.
    await bubble('edit-assistant').getByRole('button', { name: '重新生成回复', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[aria-label="聊天设置"]').disabled);
    assert.equal(state.regenerates.length, 1); assert.equal(state.regenerates[0].target, 'edit-assistant');

    // Optimistic rows never get an edit action; the execution lock remains until receipt/HTTP agree.
    await page.evaluate(() => {
      const fetch = window.fetch.bind(window); window.__editPosts = [];
      window.fetch = (url, options) => {
        if (options?.method === 'POST' && /\/send$/.test(String(url))) {
          window.__editPosts.push(JSON.parse(options.body));
          return Promise.resolve(new Response(new ReadableStream({ start(c) { window.__editStream = c; } }), { headers: { 'content-type': 'text/event-stream' } }));
        }
        return fetch(url, options);
      };
    });
    const composer = page.getByRole('textbox', { name: '消息正文', exact: true });
    const rawSent = '\n  刚发送第一行\n\n第二行  \n';
    await composer.fill(rawSent); await page.getByRole('button', { name: '发送消息', exact: true }).click();
    await page.waitForFunction(() => window.__editPosts.length === 1);
    const optimistic = page.locator('[data-message-id]:has(.chat-user-meta)').last();
    assert.equal(await optimistic.getByRole('button', { name: '编辑消息', exact: true }).count(), 0);
    assert(await bubble('edit-user').getByRole('button', { name: '编辑消息', exact: true }).isDisabled());
    const emit = value => page.evaluate(value => window.__editStream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`)), value);
    await emit({ type: 'start', id: 'just-sent-reply' }); await emit({ type: 'chunk', content: '已生成旧回复' });
    await switchTo('B'); await bubble('b-initial').waitFor();
    await open('b-initial'); await editor.fill('A 生成时 B 可独立编辑'); await save(); await dialog.waitFor({ state: 'hidden' });
    await switchTo('A'); await bubble('edit-user').waitFor();
    assert(await bubble('edit-user').getByRole('button', { name: '编辑消息', exact: true }).isDisabled());
    const post = await page.evaluate(() => window.__editPosts[0]);
    state.messages.a.push({ ...row('just-sent-user', 'user', rawSent), created_at: 100 }, { ...row('just-sent-reply', 'assistant', '已生成旧回复'), created_at: 101 });
    await page.route('**/api/conversations/a/send-results/*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ conv_id: 'a', client_msg_id: post.client_msg_id, user_message_id: 'just-sent-user', assistant_message_id: 'just-sent-reply' }) }));
    await page.evaluate(() => window.__editStream.close());
    await bubble('just-sent-user').waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-message-id="just-sent-user"] [aria-label="编辑消息"]').disabled);
    assert.equal(await page.locator('[data-message-id]:has(.chat-user-meta)').count(), state.messages.a.filter(m => m.role === 'user').length);
    await open('just-sent-user'); assert.equal(await editor.inputValue(), rawSent);
    await editor.fill('\n  立即改正错字\n\n第二行  \n'); await save(); await dialog.waitFor({ state: 'hidden' });
    assert.equal(state.messages.a.find(m => m.id === 'just-sent-reply').content, '已生成旧回复');
    assert.equal(await page.evaluate(() => window.__editPosts.length), 1); assert.equal(state.regenerates.length, 1);
    assert.deepEqual(errors, []);
    console.log(`${width}px: full source, cancel/save/failure/retry, verified HTTP, Markdown, independent fields, refresh, A/B ownership, conflict, shortcuts/IME, small viewport, regenerate, optimistic/receipt dedupe and immediate post-send edit passed`);
  } finally { await context.close(); }
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try { for (const width of [320, 390, 1280]) await run(browser, width); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
