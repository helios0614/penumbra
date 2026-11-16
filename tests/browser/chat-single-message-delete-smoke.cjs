/* Real Classic/Editorial Chat; synthetic HTTP/WS, no real backend data. */
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const { fixture } = require('./chat-pr6-5-config-smoke.cjs');
const origin = process.env.CHAT_PR65_ORIGIN || 'http://127.0.0.1:45365';
let timestamp = 50;
const row = (id, role, content, extra = {}) => ({ id, conv_id: 'a', role, content, created_at: ++timestamp,
  attachments: [], mcp_tool_calls: [], thinking: null, drift: null, is_carryover: 0, cache_region: null, ...extra });
async function run(browser, layout, width) {
  let loadingPage;
  const observedBrowser = { newContext: async options => {
    const context = await browser.newContext(options);
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    context.on('page', page => {
      loadingPage = page;
      const goto = page.goto.bind(page);
      page.goto = (url, options) => goto(url.endsWith('/tests/browser/chat-pr3.html') ? origin + '/penumbra/app/chat' : url, options);
    }); return context;
  } };
  const { page, state, context, errors } = await fixture(observedBrowser, width).catch(async error => {
    console.error(await loadingPage.locator('body').innerText()); throw error;
  });
  const writes = []; let fail = false, noDelete = false, delay = false, finish;
  const rows = [row('delete-user', 'user', 'first\n\nsecond'), row('delete-assistant', 'assistant', 'reply'),
    row('notice-legacy', 'system', '[delayed]历史通知'),
    row('notice-structured', 'system', '', { public_view_version: 1, public_display: { version: 1, kind: 'operation', capability: 'MEMORY_WRITE', title: '记忆写入', status: 'success', fields: [{ label: '内容', text: '合成记忆' }] } }),
    row('notice-mcp', 'system', '', { mcp_tool_calls: [{ server: 'test', tool: 'test', args: {}, result: 'synthetic', status: 'success' }] }),
    row('notice-empty', 'system', ''), row('notice-trigger', 'system', '', { public_view_version: 1, public_display: { version: 1, kind: 'trigger', capability: 'activity', title: '活动触发', status: 'success' } }),
    row('neighbor', 'assistant', '保留相邻消息')];
  state.messages.a.push(...rows);
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/session') return json({ authenticated: true });
    if (url.pathname === '/api/appearance') return json({ version: 1, themeMode: 'light', themeColor: null, aiColor: null,
      wallpaper: { mode: 'ambient', fit: 'cover', position: 'center', shade: 'medium', textTone: 'auto', image: null }, avatars: { user: null, assistant: null }, stickerImage: null, stickers: [] });
    const publicRead = url.pathname.match(/^\/api\/messages\/([^/]+)\/public$/);
    if (publicRead) {
      const m = state.messages.a.find(m => m.id === publicRead[1]); return m ? json(m) : json({ detail: 'message not found' }, 404);
    }
    const deletion = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
    if (deletion && req.method() === 'DELETE') {
      writes.push(deletion[1]); assert.equal(req.postData(), null);
      if (delay) await new Promise(resolve => { finish = resolve; });
      if (fail) { fail = false; return json({ detail: 'synthetic delete denied' }, 503); }
      if (!noDelete) state.messages.a = state.messages.a.filter(m => m.id !== deletion[1]);
      noDelete = false; return json({ ok: true });
    }
    return route.fallback();
  });
  const bubble = id => page.locator(`[data-message-id="${id}"]`);
  const dialog = page.getByRole('dialog', { name: /^删除(消息|系统通知)$/ });
  const open = async id => {
    const button = bubble(id).getByRole('button', { name: /^删除(消息|系统通知)$/ });
    assert(await button.isEnabled()); await button.click(); await dialog.waitFor();
  };
  const submit = () => dialog.getByRole('button', { name: '确认删除', exact: true }).click();
  try {
    const path = layout === 'editorial' ? '/penumbra/editorial/app/chat' : '/penumbra/app/chat';
    await page.goto(origin + path); await bubble('neighbor').waitFor();
    await open('delete-user'); await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' }); assert.equal(writes.length, 0);
    fail = true; await open('delete-user'); await submit();
    await dialog.getByRole('alert').waitFor(); assert.match(await dialog.getByRole('alert').innerText(), /synthetic delete denied/);
    assert.equal(await bubble('delete-user').count(), 1);
    await submit(); await dialog.waitFor({ state: 'hidden' }); await bubble('delete-user').waitFor({ state: 'detached' });
    noDelete = true; await open('delete-assistant'); await submit(); await dialog.getByRole('alert').waitFor();
    assert.match(await dialog.getByRole('alert').innerText(), /仍能读到/); assert.equal(await bubble('delete-assistant').count(), 1);
    await submit(); await dialog.waitFor({ state: 'hidden' }); await bubble('delete-assistant').waitFor({ state: 'detached' });
    for (const id of ['notice-legacy', 'notice-structured', 'notice-mcp', 'notice-empty', 'notice-trigger']) {
      await open(id); await submit(); await dialog.waitFor({ state: 'hidden' }); await bubble(id).waitFor({ state: 'detached' });
    }
    await page.reload(); await bubble('neighbor').waitFor();
    assert.equal(await bubble('delete-user').count(), 0); assert.equal(await bubble('notice-mcp').count(), 0);
    // Keep a surviving reading anchor when deleting a neighboring row above it.
    state.messages.a = [state.messages.a[0], ...Array.from({ length: 25 }, (_, i) => row(`long-${i}`, i % 2 ? 'user' : 'assistant', `长消息 ${i}\n\n第二段`)), ...state.messages.a.slice(1).map(m => ({ ...m, created_at: ++timestamp }))];
    await page.reload(); await bubble('neighbor').waitFor();
    const viewport = page.locator('.chat-message-scroll [data-slot="scroll-area-viewport"]');
    await viewport.evaluate(el => { el.dispatchEvent(new WheelEvent('wheel', { deltaY: -500, bubbles: true })); el.scrollTop = 300; el.dispatchEvent(new Event('scroll')); });
    const anchor = await viewport.evaluate(el => {
      const top = el.getBoundingClientRect().top;
      const row = [...el.querySelectorAll('[data-message-id]')].find(n => n.getBoundingClientRect().bottom > top);
      return { id: row.dataset.messageId, offset: row.getBoundingClientRect().top - top };
    });
    // Delete an earlier neighbor while the reader is anchored to a surviving row.
    // Native touch clicking has already been exercised for every message type above.
    await bubble('a-initial').getByRole('button', { name: '删除消息', exact: true }).evaluate(el => el.click());
    await dialog.waitFor(); delay = true; await submit();
    await dialog.getByRole('button', { name: '正在删除…', exact: true }).waitFor();
    assert(await dialog.getByRole('button', { name: '取消', exact: true }).isDisabled());
    assert.equal(await bubble('a-initial').count(), 1); delay = false; finish();
    await dialog.waitFor({ state: 'hidden' }); await bubble('a-initial').waitFor({ state: 'detached' });
    await page.waitForFunction(({ id, offset }) => {
      const viewport = document.querySelector('.chat-message-scroll [data-slot="scroll-area-viewport"]');
      const row = [...viewport.querySelectorAll('[data-message-id]')].find(n => n.dataset.messageId === id);
      return row && Math.abs(row.getBoundingClientRect().top - viewport.getBoundingClientRect().top - offset) < 2;
    }, anchor);
    assert.equal(await bubble('neighbor').count(), 1);
    await page.screenshot({ path: `/private/tmp/chat-delete-${layout}-${width}.png` });
    assert.equal(state.sends.length, 0); assert.equal(state.regenerates.length, 0); assert.deepEqual(errors, []);
    assert(writes.every(id => !id.includes(':tools')));
    console.log(`${layout} ${width}px passed: all roles, historical/structured/MCP/trigger/empty system cards, cancel, failure/retry, false acknowledgment, pending lock, reload, mixed rows and reading scroll`);
  } catch (error) { console.error(page.url(), await page.locator('body').innerText(), errors, state.requests.slice(-8)); throw error; } finally { await context.close(); }
}
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try { for (const layout of ['classic', 'editorial']) for (const width of [320, 390, 1280]) await run(browser, layout, width); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
