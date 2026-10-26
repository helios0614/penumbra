/* Synthetic HTTP/WS only. Run with Playwright available on NODE_PATH and a local Vite server. */
const { chromium } = require(process.env.CHAT_PR3_PLAYWRIGHT || process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const origin = process.env.CHAT_PR3_ORIGIN || 'http://127.0.0.1:45340';
const output = process.env.CHAT_PR3_OUTPUT || '/private/tmp/penumbra-chat-pr3';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const protocol = 'openai_chat_completions';
const body = '第一段 **局部文字**，其余正文。\n\n第二段含 [链接文字](https://example.invalid)。\n\n```js\nconst selected = 1;\n```\n\n尾段。<!-- private-comment -->[THINKING_START]private-inline-think[THINKING_END][DRIFT:private-inline-drift][HEART:private-command]';
const fullBody = '第一段 局部文字，其余正文。\n\n第二段含 链接文字。\n\nconst selected = 1;\n\n尾段。';
const wireMessage = (id, conv = 'a', content = `合成消息 ${id}。\n\n第二段。`) => ({
  id: `${conv}-m${id}`, conv_id: conv, role: 'assistant', content, created_at: id,
  thinking: 'private-thinking', drift: 'independent-drift', is_carryover: 0, attachments: [], mcp_tool_calls: [], cache_region: null,
});
function configuration(model) { return { connections: [{ id: 'connection-a', name: '合成连接', base_url: 'https://synthetic.invalid/v1', enabled: true,
  default_model: 'prefill-only', transport: 'direct', gateway_id: null, credential_configured: true }], allowed_protocols: [protocol], profiles: [], models: [], selection: null,
  connection_selection: { connection_id: 'connection-a', protocol, model }, diagnostic: null }; }
async function fixture(browser, mobile) {
  const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(8000); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const state = {
    list: ['a', 'b', 'c'].map((id, i) => ({ id, title: `会话 ${id.toUpperCase()}`, model: 'legacy', created_at: 1, updated_at: 30 - i, message_count: id === 'a' ? 120 : 1 })),
    messages: { a: Array.from({ length: 120 }, (_, i) => wireMessage(i + 1)), b: [wireMessage(1, 'b', 'B 正文')], c: [wireMessage(1, 'c', 'C 正文')] },
    failCreate: false, failRename: false, failDelete: false, failOlder: false, slowSwitch: false,
    counts: { create: 0, rename: 0, delete: 0, send: 0, older: 0 }, requests: [], ws: null,
  };
  state.messages.a[119] = wireMessage(120, 'a', body);
  await page.routeWebSocket(url => url.pathname === '/ws', socket => { state.ws = socket; });
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    state.requests.push({ path: url.pathname + url.search, method, body: request.postData() });
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname === '/api/conversations' && method === 'GET') return json(state.list);
    if (url.pathname === '/api/conversations' && method === 'POST') {
      state.counts.create++; assert.deepEqual(request.postDataJSON(), {}); await delay(180);
      if (state.failCreate) return json({ detail: 'synthetic failure' }, 503);
      const id = `new-${state.counts.create}`, item = { ...state.list[0], id, title: '新对话', message_count: 0, updated_at: 100 };
      state.list = [item, ...state.list]; state.messages[id] = [];
      return json(item);
    }
    const conv = url.pathname.match(/^\/api\/conversations\/([^/]+)$/);
    if (conv && method === 'PUT') {
      const input = request.postDataJSON(); assert.deepEqual(Object.keys(input), ['title']); state.counts.rename++;
      if (state.failRename) return json({ detail: 'synthetic failure' }, 503);
      state.list = state.list.map(item => item.id === conv[1] ? { ...item, title: input.title, updated_at: 200 } : item).sort((a, b) => b.updated_at - a.updated_at);
      return json({ ok: true });
    }
    if (conv && method === 'DELETE') {
      state.counts.delete++;
      if (state.failDelete) return json({ detail: 'synthetic failure' }, 503);
      state.list = state.list.filter(item => item.id !== conv[1]); delete state.messages[conv[1]];
      return json({ ok: true });
    }
    if (url.pathname === '/api/main/configuration') return json(configuration((url.searchParams.get('conv_id') || '').startsWith('new-') ? 'server-new-default' : 'literal-a'));
    if (url.pathname === '/api/chat/readiness') {
      const model = (url.searchParams.get('conv_id') || '').startsWith('new-') ? 'server-new-default' : 'literal-a';
      return json({ ready: true, model_key: model, reason_code: 'ready', setup_action_required: false });
    }
    const history = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages(?:\/window)?$/);
    if (history && method === 'GET') {
      const id = history[1], limit = Number(url.searchParams.get('limit') || 50);
      const before = url.searchParams.get('before') || url.searchParams.get('before_cursor')?.replace('synthetic-before-', '');
      const snapshot = [...(state.messages[id] || [])];
      if (before) { state.counts.older++; await delay(200); if (state.failOlder) return json({}, 503); }
      else if (state.slowSwitch) await delay(id === 'b' ? 350 : 40);
      assert.equal(limit, 50, 'page size must never grow');
      const messages = snapshot.filter(item => before == null || item.created_at < Number(before)).slice(-limit);
      if (!url.pathname.endsWith('/window')) return json(messages);
      const older = messages.length > 0 && snapshot.some(item => item.created_at < messages[0].created_at);
      const newer = messages.length > 0 && snapshot.some(item => item.created_at > messages.at(-1).created_at);
      return json({ conversation_id: id, anchor_id: null, messages, has_older: older, has_newer: newer,
        older_cursor: older ? `synthetic-before-${messages[0].created_at}` : null,
        newer_cursor: newer ? `synthetic-after-${messages.at(-1).created_at}` : null, reaches_latest: !newer });
    }
    if (url.pathname.endsWith('/send')) { state.counts.send++; return route.abort('failed'); }
    return json({ detail: 'Synthetic fixture: unsupported endpoint' }, 404);
  });
  await page.addInitScript(() => { window.__copies = []; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => window.__copies.push(text) } }); });
  await page.goto(`${origin}/tests/browser/chat-pr3.html`);
  await page.locator('[data-message-id="a-m120"]').waitFor();
  const title = async expected => { await page.waitForFunction(text => document.querySelector('header p')?.textContent === text, expected); };
  const nav = async () => { if (mobile) await page.getByRole('button', { name: '打开会话列表', exact: true }).click(); };
  const select = async id => { await nav(); await page.getByRole('button', { name: `打开会话会话 ${id.toUpperCase()}`, exact: true }).click(); await title(`会话 ${id.toUpperCase()}`); };
  const menu = async () => {
    const currentTitle = await page.locator('.chat-workspace-header p').textContent();
    await nav();
    await page.getByRole('button', { name: `会话操作：${currentTitle}`, exact: true }).filter({ visible: true }).click();
  };
  const insert = () => page.locator('[data-message-id="a-m120"]').getByRole('button', { name: '放入输入框', exact: true });
  const input = () => page.getByRole('textbox', { name: '消息正文', exact: true });
  return { page, context, state, errors, title, nav, select, menu, insert, input };
}
async function selection(page, mode) {
  return page.evaluate(mode => {
    const body = document.querySelector('[data-message-id="a-m120"] [data-message-body]');
    const paragraphs = body.querySelectorAll('p');
    const selection = getSelection(); selection.removeAllRanges();
    const range = document.createRange();
    if (mode === 'partial') range.selectNodeContents(body.querySelector('strong'));
    else if (mode === 'cross') { range.setStart(paragraphs[0].firstChild, 0); range.setEnd(paragraphs[1].lastChild, paragraphs[1].lastChild.textContent.length); }
    else if (mode === 'outside') { range.setStart(document.querySelector('header p').firstChild, 0); range.setEnd(paragraphs[0].firstChild, 2); }
    else if (mode === 'code') range.selectNodeContents(body.querySelector('pre code'));
    selection.addRange(range);
    return selection.toString();
  }, mode);
}
async function run(browser, mobile) {
  const s = await fixture(browser, mobile), { page, state } = s;
  const record = name => console.log(`${mobile ? 'mobile' : 'desktop'}: ${name}`);
  const home = () => page.getByRole('button', { name: '返回桌面', exact: true });
  await home().click(); assert.equal(await page.evaluate(() => window.__chatHomeReturns), 1);
  assert.equal(await page.getByRole('dialog', { name: '会话列表', exact: true }).count(), 0);
  if (mobile) {
    const header = page.locator('.chat-workspace-header');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const geometry = await header.evaluate(el => {
        const title = el.querySelector('p'), original = title.textContent;
        title.textContent = '很长的会话名称用于核对标题省略与四个触摸按钮不会互相挤压'.repeat(4);
        const buttons = [...el.querySelectorAll(':scope > button')].map(button => {
          const box = button.getBoundingClientRect(); return { left: box.left, right: box.right, width: box.width, height: box.height };
        });
        const clipped = title.scrollWidth > title.clientWidth, overflow = el.scrollWidth > el.clientWidth;
        title.textContent = original;
        return { buttons, clipped, overflow };
      });
      assert.equal(geometry.buttons.length, 4); assert(geometry.clipped); assert(!geometry.overflow);
      geometry.buttons.forEach((button, index) => { assert(button.width >= 44 && button.height >= 44); if (index) assert(button.left >= geometry.buttons[index - 1].right); });
    }
    await s.nav(); await page.getByRole('dialog', { name: '会话列表', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__chatHomeReturns), 1);
    await page.keyboard.press('Escape'); await page.getByRole('dialog', { name: '会话列表', exact: true }).waitFor({ state: 'hidden' });
  }
  record('home callback and conversation Sheet are independent; narrow header remains reachable');

  await s.input().fill('我还想问一个问题：');
  await selection(page, 'partial'); await s.insert().click();
  assert.equal(await s.input().inputValue(), '我还想问一个问题：\n\n局部文字');
  assert.equal(await s.input().evaluate(el => el === document.activeElement && el.selectionStart === el.value.length && el.selectionEnd === el.value.length), true);
  assert.equal(state.counts.send, 0);
  assert.deepEqual(await page.locator('[data-message-id="a-m120"] .chat-message-actions button').evaluateAll(items => items.map(item => item.getAttribute('aria-label'))), ['复制消息', '放入输入框', '重新生成回复']);
  record('partial selection, append, focus, cursor and direct action order');
  await s.input().fill(''); await selection(page, 'cross'); await s.insert().click();
  assert.equal(await s.input().inputValue(), '第一段 局部文字，其余正文。\n\n第二段含 链接文字。'); record('cross-paragraph Markdown selection');
  await s.input().fill(''); await selection(page, 'code'); await s.insert().click();
  assert.equal(await s.input().inputValue(), 'const selected = 1;'); record('code selection excludes toolbar');
  await s.input().fill(''); await page.evaluate(() => getSelection().removeAllRanges()); await s.insert().click();
  assert.equal(await s.input().inputValue(), fullBody); record('full public body excludes hidden context and HTML');
  await s.input().fill(''); await selection(page, 'outside'); await s.insert().click();
  assert.equal(await s.input().inputValue(), fullBody); record('cross-message selection rejected');
  await s.input().fill('A 草稿'); await s.select('b'); assert.equal(await s.input().inputValue(), '');
  await s.input().fill('B 草稿'); await s.select('a'); assert.equal(await s.input().inputValue(), 'A 草稿'); record('conversation draft isolation and restoration');
  state.slowSwitch = true; await s.nav(); await page.getByRole('button', { name: '打开会话会话 B', exact: true }).click();
  await s.nav(); await page.getByRole('button', { name: '打开会话会话 C', exact: true }).click(); await s.title('会话 C');
  await delay(450); await s.title('会话 C'); state.slowSwitch = false; await s.select('a');
  assert.equal(await s.input().inputValue(), 'A 草稿'); record('rapid B/C switching rejects stale responses');
  await s.menu(); await page.getByRole('menuitem', { name: '重命名', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-invalid') !== null && document.activeElement?.tagName === 'INPUT');
  await page.getByRole('textbox', { name: '会话名称', exact: true }).fill('取消编辑'); await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.waitForFunction(mobile => document.activeElement?.getAttribute('aria-label') === (mobile ? '打开会话列表' : '会话操作：会话 A'), mobile);
  await s.title('会话 A'); assert.equal(state.counts.rename, 0);
  await s.menu(); await page.getByRole('menuitem', { name: '重命名', exact: true }).click();
  await page.getByRole('textbox', { name: '会话名称', exact: true }).fill('  重命名保留  '); state.failRename = true;
  await page.getByRole('button', { name: '保存', exact: true }).click(); await page.getByText('重命名失败，编辑内容已保留，请重试。').waitFor();
  assert.equal(await page.getByRole('textbox', { name: '会话名称', exact: true }).inputValue(), '  重命名保留  ');
  state.failRename = false; await page.getByRole('button', { name: '保存', exact: true }).click(); await s.title('重命名保留'); record('rename cancel, failure retains edits, trim and save');
  await s.menu(); await page.getByRole('menuitem', { name: '删除会话', exact: true }).click();
  await page.getByText('确定删除「重命名保留」及其消息吗？此操作无法撤销。').waitFor();
  assert.equal(state.counts.delete, 0); await page.getByRole('button', { name: '取消', exact: true }).click();
  state.failDelete = true; await s.menu(); await page.getByRole('menuitem', { name: '删除会话', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click(); await page.getByText(/删除未确认/).waitFor();
  assert(state.list.some(item => item.id === 'a')); await page.getByRole('button', { name: '取消', exact: true }).click(); state.failDelete = false; record('delete confirmation, cancel and failure');
  await s.nav(); await page.getByRole('button', { name: '会话操作：会话 C', exact: true }).click();
  await page.getByRole('menuitem', { name: '删除会话', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await s.title('重命名保留'); assert.equal(await s.input().inputValue(), 'A 草稿'); assert(!state.list.some(item => item.id === 'c'));
  record('delete another conversation preserves current Chat and draft');
  state.failCreate = true; await s.nav(); await page.getByRole('button', { name: '新建会话', exact: true }).click();
  await page.getByText(/新建会话未确认/).waitFor();
  if (mobile) { await page.keyboard.press('Escape'); await page.getByRole('dialog', { name: '会话列表', exact: true }).waitFor({ state: 'hidden' }); }
  await s.title('重命名保留'); assert.equal(await s.input().inputValue(), 'A 草稿');
  state.failCreate = false; await s.nav(); const create = page.getByRole('button', { name: '新建会话', exact: true });
  await create.dblclick({ delay: 30 }); await s.title('新对话'); assert.equal(state.counts.create, 2); assert.equal(await s.input().inputValue(), '');
  assert.equal(await page.getByRole('button', { name: '会话工具', exact: true }).getAttribute('title'), '会话模型：server-new-default');
  assert.equal(state.requests.filter(req => req.method === 'PUT').length, 2); record('create failure, double-click lock, server default and empty draft');
  await s.menu(); await page.getByRole('menuitem', { name: '删除会话', exact: true }).click(); await page.getByRole('button', { name: '确认删除', exact: true }).click(); await s.title('重命名保留'); assert.equal(await s.input().inputValue(), 'A 草稿'); record('delete current selects server-first remaining conversation');
  // A user reading above the bottom must stay at the same canonical message/offset.
  const viewport = page.locator('.chat-message-scroll [data-slot="scroll-area-viewport"]');
  await viewport.evaluate(el => { el.scrollTop = 140; el.dispatchEvent(new Event('scroll')); });
  const anchor = await viewport.evaluate(el => { const top = el.getBoundingClientRect().top; const item = [...el.querySelectorAll('[data-message-id]')].find(item => item.getBoundingClientRect().bottom > top); return { id: item.dataset.messageId, offset: item.getBoundingClientRect().top - top }; });
  const oldCount = await page.locator('[data-message-id]').count();
  await page.getByRole('button', { name: '加载更早消息', exact: true }).evaluate(el => el.click());
  // Interleave a real coordinator notification and a canonical latest-window reread.
  state.messages.a.push(wireMessage(121, 'a', 'WS 新消息'));
  state.ws.send(JSON.stringify({ type: 'msg_created', data: { id: 'a-m121', conv_id: 'a' } }));
  await page.waitForFunction(count => document.querySelectorAll('[data-message-id]').length > count + 1, oldCount);
  await page.locator('[data-message-id="a-m121"]').waitFor();
  const offset = await page.locator(`[data-message-id="${anchor.id}"]`).evaluate(el => el.getBoundingClientRect().top - el.closest('[data-slot="scroll-area-viewport"]').getBoundingClientRect().top);
  assert(Math.abs(offset - anchor.offset) < 3, `prepend anchor moved: ${offset} / ${anchor.offset}`);
  assert.equal(await page.locator('[data-message-id]').evaluateAll(items => new Set(items.map(item => item.dataset.messageId)).size), await page.locator('[data-message-id]').count());
  await page.locator('[data-message-id="a-m21"]').evaluate(el => { el.style.minHeight = `${el.getBoundingClientRect().height + 150}px`; });
  await delay(150);
  const dynamicOffset = await page.locator(`[data-message-id="${anchor.id}"]`).evaluate(el => el.getBoundingClientRect().top - el.closest('[data-slot="scroll-area-viewport"]').getBoundingClientRect().top);
  assert(Math.abs(dynamicOffset - anchor.offset) < 3, 'dynamic content moved reading anchor'); record('HTTP paging, concurrent WS, canonical dedupe and resize anchor');
  const beforeMenu = await viewport.evaluate(el => el.scrollTop); await s.menu(); await page.keyboard.press('Escape'); await page.getByRole('menu').waitFor({ state: 'hidden' });
  if (mobile) { await page.keyboard.press('Escape'); await page.getByRole('dialog', { name: '会话列表', exact: true }).waitFor({ state: 'hidden' }); }
  assert(Math.abs(await viewport.evaluate(el => el.scrollTop) - beforeMenu) < 3); record('menu does not move reading position');
  await page.screenshot({ path: `${output}/${mobile ? 'mobile' : 'desktop'}.png` });
  await s.input().fill('结果未知保护'); await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await page.getByRole('button', { name: '回复结果待确认，查看详情', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '聊天设置', exact: true }).isDisabled(), true);
  assert.equal(await home().isDisabled(), true);
  await home().evaluate(el => el.click());
  assert.equal(await page.evaluate(() => window.__chatHomeReturns), 1);

  await s.nav(); assert.equal(await page.getByRole('button', { name: '当前无法切换到会话 B', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: /^会话操作：/ }).filter({ visible: true }).first().isDisabled(), true);
  assert.equal(state.counts.send, 1); record('unknown-result navigation/delete guards and no automatic retry');

  // Exercise the real parent navigation callbacks from direct Chat routes.
  for (const [chatRoute, homeRoute] of [['/app/chat', '/'], ['/editorial/app/chat', '/editorial']]) {
    await page.goto(origin + chatRoute);
    await page.locator('.chat-shell [data-message-id="a-m121"]').waitFor();
    if (mobile) {
      await page.getByRole('button', { name: '打开会话列表', exact: true }).click();
      await page.getByRole('dialog', { name: '会话列表', exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, chatRoute);
      await page.keyboard.press('Escape');
      await page.getByRole('dialog', { name: '会话列表', exact: true }).waitFor({ state: 'hidden' });
    }
    await home().click();
    await page.waitForFunction(path => location.pathname === path && !document.querySelector('.chat-shell'), homeRoute);
  }
  record('original Desktop and Editorial home navigation callbacks restore their real home routes');
  await page.goto(`${origin}/tests/browser/chat-pr3.html`); await page.locator('[data-message-id="a-m121"]').waitFor();
  for (const item of [...state.list]) {
    await s.nav(); await page.getByRole('button', { name: `会话操作：${item.title}`, exact: true }).filter({ visible: true }).click();
    await page.getByRole('menuitem', { name: '删除会话', exact: true }).click();
    await page.getByRole('button', { name: '确认删除', exact: true }).click();
    await page.getByRole('dialog', { name: '删除会话', exact: true }).waitFor({ state: 'hidden' });
  }
  await page.getByText('从会话列表新建会话，开始聊天。', { exact: true }).waitFor();
  assert.equal(state.list.length, 0); await s.nav(); assert.equal(await page.getByRole('button', { name: '新建会话', exact: true }).filter({ visible: true }).isEnabled(), true);
  record('delete the final conversation through shared sidebar/drawer preserves empty state and create entry');
  assert.deepEqual(s.errors, []); await s.context.close();
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...((process.env.CHAT_PR3_CHROMIUM || process.argv[3]) ? { executablePath: process.env.CHAT_PR3_CHROMIUM || process.argv[3] } : {}) });
  try { await run(browser, false); await run(browser, true); console.log('PR3 browser smoke passed'); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
