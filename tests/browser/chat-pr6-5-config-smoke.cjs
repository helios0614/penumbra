/* Production Chat + synthetic HTTP/WS only. No real backend, config, upload or model. */
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const origin = process.env.CHAT_PR65_ORIGIN || 'http://127.0.0.1:45365';
const output = process.env.CHAT_PR65_OUTPUT || '/private/tmp/penumbra-chat-pr65';
const OPENAI = 'openai_chat_completions', ANTHROPIC = 'anthropic_messages';
const message = (id, conv, role, content, created) => ({ id, conv_id: conv, role, content, created_at: created,
  drift: null, thinking: null, attachments: [], is_carryover: 0, mcp_tool_calls: [], cache_region: null });
const frame = value => `data: ${JSON.stringify(value)}\n\n`;

async function fixture(browser, width) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768 });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const state = { requests: [], selections: {}, messages: {}, list: [], sends: [], regenerates: [], error: null, clock: 10 };
  for (const id of ['a', 'b']) {
    state.selections[id] = { connection_id: 'connection-a', protocol: OPENAI, model: `literal-${id}` };
    state.list.push({ id, title: `会话 ${id.toUpperCase()}`, model: 'legacy', main_selection: state.selections[id], main_selection_diagnostic: null,
      created_at: 1, updated_at: id === 'a' ? 3 : 2, message_count: 1 });
    state.messages[id] = [message(`${id}-initial`, id, 'assistant', `合成回复 ${id}`, ++state.clock)];
  }
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.routeWebSocket(url => url.pathname === '/ws', () => {});
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    state.requests.push({ method, path: url.pathname + url.search, body: req.postData() });
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/worldbook') return json({ user_name: '合成用户' });
    if (url.pathname === '/api/conversations') return json(state.list);
    const conv = url.searchParams.get('conv_id') || 'a';
    if (url.pathname === '/api/main/configuration') return json({
      connection_selection: state.selections[conv], selection: null, diagnostic: null, allowed_protocols: [OPENAI, ANTHROPIC],
      connections: ['a', 'b'].map(id => ({ id: `connection-${id}`, name: `合成连接 ${id}`, transport: 'direct', enabled: true,
        default_model: `preset-${id}`, credential_configured: true })) });
    if (url.pathname === '/api/chat/readiness') return json({ ready: true, model_key: state.selections[conv].model, reason_code: 'ready', setup_action_required: false });
    const conversation = url.pathname.match(/^\/api\/conversations\/([^/]+)$/);
    if (conversation && method === 'PUT') {
      const body = req.postDataJSON(); assert.deepEqual(Object.keys(body), ['main_selection']);
      state.selections[conversation[1]] = body.main_selection;
      state.list = state.list.map(c => c.id === conversation[1] ? { ...c, main_selection: body.main_selection } : c);
      return json({ ok: true });
    }
    const history = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages\/window$/);
    if (history) return json({ conversation_id: history[1], anchor_id: null, messages: state.messages[history[1]],
      older_cursor: null, newer_cursor: null, has_older: false, has_newer: false, reaches_latest: true });
    const send = url.pathname.match(/^\/api\/conversations\/([^/]+)\/send$/);
    if (send) {
      const body = req.postDataJSON(); state.sends.push(body);
      if (state.error === 'network') { state.error = null; return route.abort('failed'); }
      if (state.error === '422') { state.error = null; return json({ detail: { code: 'invalid_generation_options', field: 'temperature' } }, 422); }
      if (state.error === 'upstream') { state.error = null; return json({ detail: { code: 'provider_request_failed', upstream_status: 400, upstream_message: 'Synthetic model does not support temperature' } }, 400); }
      const id = `reply-${++state.clock}`, row = message(id, send[1], 'assistant', `回复 ${id}`, ++state.clock);
      state.messages[send[1]].push(message(`user-${id}`, send[1], 'user', body.content, row.created_at - 0.1), row);
      return route.fulfill({ contentType: 'text/event-stream', body: frame({ type: 'start', id }) + frame({ type: 'chunk', content: row.content }) });
    }
    const regen = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages\/([^/]+)\/regenerate$/);
    if (regen) {
      state.regenerates.push({ query: Object.fromEntries(url.searchParams), body: req.postData() });
      const row = state.messages[regen[1]].find(row => row.id === regen[2]); row.content += ' · 重新生成';
      return route.fulfill({ contentType: 'text/event-stream', body: frame({ type: 'start', id: row.id }) + frame({ type: 'chunk', content: row.content }) +
        `event: persisted\ndata: ${JSON.stringify({ id: row.id, content: row.content, thinking: null, drift: null })}\n\n` });
    }
    return json({ detail: 'Synthetic fixture: unsupported route' }, 404);
  });
  await page.goto(`${origin}/tests/browser/chat-pr3.html`);
  await page.locator('[data-message-id="a-initial"]').waitFor();
  return { page, state, errors, context };
}

async function run(browser, width) {
  const { page, state, errors, context } = await fixture(browser, width);
  const quick = () => page.getByRole('button', { name: '聊天快捷配置', exact: true });
  const form = () => page.getByRole('form', { name: '聊天快捷参数' });
  const input = () => page.getByRole('textbox', { name: '消息正文', exact: true });
  const open = async () => { await quick().click(); await form().waitFor(); };
  const close = async () => { await form().getByRole('button', { name: '取消', exact: true }).click(); await form().waitFor({ state: 'hidden' }); };
  const idle = () => page.waitForFunction(() => !document.querySelector('[aria-label="聊天快捷配置"]').disabled);
  const send = async text => { await input().fill(text); await page.getByRole('button', { name: '发送消息', exact: true }).click(); await idle(); };
  const regenerate = async () => { await page.getByRole('button', { name: '重新生成回复', exact: true }).filter({ visible: true }).last().click(); await idle(); };
  assert.equal(await page.locator('.chat-workspace-header').getByRole('button', { name: /^会话操作/ }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '搜索聊天历史', exact: true }).count(), 1);
  await page.getByRole('button', { name: '搜索聊天历史', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索当前会话', exact: true }).waitFor();
  await open(); await page.keyboard.press('Escape'); await form().waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('textbox', { name: '搜索当前会话', exact: true }).isVisible(), true);
  await page.getByRole('button', { name: '关闭搜索', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索当前会话', exact: true }).waitFor({ state: 'hidden' });
  if (width < 768) await page.getByRole('button', { name: '打开会话列表', exact: true }).click();
  await page.getByRole('button', { name: '搜索全部聊天', exact: true }).filter({ visible: true }).click();
  await page.getByRole('dialog', { name: '搜索全部聊天', exact: true }).waitFor();
  await page.keyboard.press('Escape'); await page.getByRole('dialog', { name: '搜索全部聊天', exact: true }).waitFor({ state: 'hidden' });
  if (width < 768) { await page.keyboard.press('Escape'); await page.getByRole('dialog', { name: '会话列表', exact: true }).waitFor({ state: 'hidden' }); }
  await send('默认请求'); await regenerate();
  assert.deepEqual(Object.keys(state.sends[0]).sort(), ['client_msg_id', 'content']);
  assert.deepEqual(state.regenerates[0], { query: {}, body: null });
  await open(); assert.equal(await form().getByRole('button', { name: '应用到后续请求' }).isDisabled(), true);
  for (const bad of ['0', '1.5', '101', 'NaN']) {
    await form().getByLabel('上下文消息数', { exact: true }).fill(bad);
    assert.equal(await form().getByRole('button', { name: '应用到后续请求' }).isDisabled(), true);
  }
  await form().getByLabel('上下文消息数', { exact: true }).fill('100');
  await form().getByLabel('Temperature', { exact: true }).fill('0');
  const geometry = await form().evaluate(el => {
    const panel = el.closest('[data-slot="dialog-content"], [data-slot="popover-content"]'), rect = panel.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: innerWidth, overflow: panel.scrollWidth > panel.clientWidth + 1 };
  });
  assert(geometry.left >= 0 && geometry.right <= geometry.width + 1 && !geometry.overflow, JSON.stringify(geometry));
  await form().evaluate(el => Promise.all(el.closest('[data-slot="dialog-content"], [data-slot="popover-content"]')
    .getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))));
  await page.screenshot({ path: `${output}/parameters-${width}.png` });
  await form().getByRole('button', { name: '应用到后续请求' }).click();
  await send('显式零温度'); await regenerate();
  assert.equal(state.sends.at(-1).temperature, 0); assert.equal(state.sends.at(-1).context_limit, 100);
  assert.deepEqual(state.regenerates.at(-1), { query: { context_limit: '100', temperature: '0' }, body: null });
  await open(); await form().getByLabel('上下文消息数', { exact: true }).fill('1'); await close();
  await open(); assert.equal(await form().getByLabel('上下文消息数', { exact: true }).inputValue(), '100');
  await form().getByRole('button', { name: '恢复后端默认' }).click(); await send('恢复默认请求'); await regenerate();
  assert(!('temperature' in state.sends.at(-1))); assert(!('context_limit' in state.sends.at(-1))); assert.deepEqual(state.regenerates.at(-1).query, {});
  await open(); await page.keyboard.press('Escape'); await form().waitFor({ state: 'hidden' });
  assert.equal(await quick().evaluate(el => el === document.activeElement), true);
  await open(); await form().getByLabel('上下文消息数', { exact: true }).fill('1'); await form().getByLabel('Temperature', { exact: true }).fill('2');
  await form().getByRole('button', { name: '应用到后续请求' }).click();
  await page.getByRole('button', { name: '会话工具', exact: true }).click(); await page.getByText('手动调整', { exact: true }).click();
  await page.getByRole('textbox', { name: '模型名称', exact: true }).fill('updated-literal');
  await page.getByRole('textbox', { name: '模型名称', exact: true }).press('Enter'); await idle();
  await page.getByRole('combobox', { name: '接口格式', exact: true }).click(); await page.getByRole('option', { name: 'Anthropic 格式', exact: true }).click(); await idle();
  await page.keyboard.press('Escape'); await open();
  assert.equal(await form().getByLabel('上下文消息数', { exact: true }).inputValue(), '');
  assert.equal(await form().getByLabel('Temperature', { exact: true }).inputValue(), '');
  await form().getByLabel('Temperature', { exact: true }).fill('1.1'); assert.equal(await form().getByRole('button', { name: '应用到后续请求' }).isDisabled(), true);
  await form().getByLabel('Temperature', { exact: true }).fill('1'); await form().getByRole('button', { name: '应用到后续请求' }).click();
  await send('Anthropic范围'); assert.equal(state.sends.at(-1).temperature, 1); assert.equal(state.selections.a.protocol, ANTHROPIC);
  if (width < 768) await page.getByRole('button', { name: '打开会话列表', exact: true }).click();
  await page.getByRole('button', { name: '打开会话会话 B', exact: true }).filter({ visible: true }).click();
  await page.locator('[data-message-id="b-initial"]').waitFor(); await open();
  assert.equal(await form().getByLabel('Temperature', { exact: true }).inputValue(), ''); await close();
  state.error = '422'; await input().fill('失败后保留草稿'); await page.getByRole('button', { name: '发送消息', exact: true }).click(); await idle();
  await page.getByText('未完成或未确认的提交已暂存（1）', { exact: true }).click();
  await page.getByRole('button', { name: '恢复本次提交到草稿', exact: true }).click();
  assert.equal(await input().inputValue(), '失败后保留草稿'); assert.equal(state.selections.b.model, 'literal-b');
  // Existing manual selection clears a terminal send error; parameter apply must not rewrite recovery policy.
  if (width < 768) await page.getByRole('button', { name: '打开会话列表', exact: true }).click();
  await page.getByRole('button', { name: '打开会话会话 B', exact: true }).filter({ visible: true }).click();
  state.error = 'network'; await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await page.getByRole('button', { name: '回复结果待确认，查看详情', exact: true }).waitFor();
  assert.equal(await quick().isDisabled(), true);
  assert.equal(state.requests.filter(r => /\/api\/(settings|registry)/.test(r.path)).length, 0);
  assert.equal(new Set(state.sends.map(row => row.client_msg_id)).size, state.sends.length);
  assert.deepEqual(errors, []); await context.close(); console.log(`${width}px: defaults, bounds, zero, send/regen, reset/cancel/focus, model/protocol/conversation reset, 422 and unknown-result lock passed`);
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try { for (const width of [320, 390, 1280]) await run(browser, width); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
