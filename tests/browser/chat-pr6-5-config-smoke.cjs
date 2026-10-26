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
  const state = { requests: [], selections: {}, messages: {}, list: [], sends: [], regenerates: [], error: null, clock: 10, defaults: { revision: 0, context: undefined, temperatures: {}, thinking: {}, float: undefined, carryover: undefined }, saves: [], effective: [], failSave: false, saveDelay: 0 };
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
    const defaults = protocol => ({ revision: state.defaults.revision, protocol,
      context_limit: { value: state.defaults.context ?? 30, source: state.defaults.context === undefined ? 'backend_default' : 'saved', default_value: 30, min: 1, max: 100 },
      temperature: { value: state.defaults.temperatures[protocol] ?? 1, source: protocol in state.defaults.temperatures ? 'saved' : 'backend_default', default_value: 1, min: 0, max: protocol === ANTHROPIC ? 1 : 2 },
      thinking: { value: state.defaults.thinking[protocol] ?? { enabled: false, effort: 'medium' }, source: protocol in state.defaults.thinking ? 'saved' : 'backend_default', default_value: { enabled: false, effort: 'medium' },
        capability: { status: protocol === ANTHROPIC ? 'unknown' : 'unsupported', reason: protocol === ANTHROPIC ? 'model_capability_unknown' : 'protocol_unsupported', allowed_efforts: protocol === ANTHROPIC ? ['low', 'medium', 'high', 'xhigh', 'max'] : [] } },
      float_interval: { value: state.defaults.float ?? 12, source: state.defaults.float === undefined ? 'backend_default' : 'saved', default_value: 12, min: 1, max: 15 },
      carryover_count: { value: state.defaults.carryover ?? 0, source: state.defaults.carryover === undefined ? 'backend_default' : 'saved', default_value: 0, min: 0, max: 50 } });
    if (url.pathname === '/api/main/chat-defaults' && method === 'GET') return json({ ...defaults(state.selections[conv].protocol), selection: state.selections[conv], conversation_id: conv });
    if (url.pathname === '/api/main/chat-defaults' && method === 'PATCH') {
      const body = req.postDataJSON(); state.saves.push(body);
      assert.deepEqual(Object.keys(body).sort(), ['expected_revision', 'field', 'protocol', 'value']);
      if (state.failSave) { state.failSave = false; return json({ detail: { code: 'persistence_failed' } }, 503); }
      if (body.expected_revision !== state.defaults.revision) return json({ detail: { code: 'chat_defaults_conflict' } }, 409);
      if (body.field === 'context_limit') state.defaults.context = body.value === null ? undefined : body.value;
      else if (body.field === 'float_interval') state.defaults.float = body.value === null ? undefined : body.value;
      else if (body.field === 'carryover_count') state.defaults.carryover = body.value === null ? undefined : body.value;
      else if (body.field === 'thinking') { if (body.value === null) delete state.defaults.thinking[body.protocol]; else state.defaults.thinking[body.protocol] = body.value; }
      else if (body.value === null) delete state.defaults.temperatures[body.protocol];
      else state.defaults.temperatures[body.protocol] = body.value;
      state.defaults.revision++;
      const result = defaults(body.protocol); if (state.saveDelay) await new Promise(r => setTimeout(r, state.saveDelay));
      return json(result);
    }
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
      const body = req.postDataJSON(); state.sends.push(body); state.effective.push({ context: body.context_limit ?? state.defaults.context ?? 30, temperature: body.temperature ?? state.defaults.temperatures[state.selections[send[1]].protocol] ?? 1 });
      if (state.error === 'network') { state.error = null; return route.abort('failed'); }
      if (state.error === '422') { state.error = null; return json({ detail: { code: 'invalid_generation_options', field: 'temperature' } }, 422); }
      if (state.error === 'upstream') { state.error = null; return json({ detail: { code: 'provider_request_failed', upstream_status: 400, upstream_message: 'Synthetic model does not support temperature' } }, 400); }
      const id = `reply-${++state.clock}`, row = message(id, send[1], 'assistant', `回复 ${id}`, ++state.clock);
      state.messages[send[1]].push(message(`user-${id}`, send[1], 'user', body.content, row.created_at - 0.1), row);
      return route.fulfill({ contentType: 'text/event-stream', body: frame({ type: 'start', id }) + frame({ type: 'chunk', content: row.content }) });
    }
    const regen = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages\/([^/]+)\/regenerate$/);
    if (regen) {
      state.regenerates.push({ query: Object.fromEntries(url.searchParams), body: req.postData() }); state.effective.push({ context: Number(url.searchParams.get('context_limit') ?? state.defaults.context ?? 30), temperature: Number(url.searchParams.get('temperature') ?? state.defaults.temperatures[state.selections[regen[1]].protocol] ?? 1) });
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
  const quick = () => page.getByRole('button', { name: '聊天设置', exact: true });
  const panel = () => page.locator('[data-slot="popover-content"]').filter({ has: page.getByText('聊天设置', { exact: true }) });
  const slider = name => page.getByRole('slider', { name, exact: true });
  const idle = () => page.waitForFunction(() => !document.querySelector('[aria-label="聊天设置"]').disabled);
  const open = async () => { if (!(await panel().isVisible())) await quick().click(); await slider('上下文消息数').waitFor(); };
  const close = async () => { await page.keyboard.press('Escape'); await panel().waitFor({ state: 'hidden' }); };
  const saveEnd = async () => {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForFunction(() => !document.querySelector('[data-slot="popover-content"]')?.textContent.includes('保存中'));
  };
  const send = async text => { await page.getByRole('textbox', { name: '消息正文', exact: true }).fill(text); await page.getByRole('button', { name: '发送消息', exact: true }).click(); await idle(); };
  assert.equal(await page.locator('.chat-workspace-header').getByRole('button', { name: /^会话操作/ }).count(), 0);
  await page.getByRole('button', { name: '搜索聊天历史', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索当前会话', exact: true }).waitFor();
  await open(); assert.equal(await page.locator('[data-slot="dialog-content"], [data-slot="dialog-overlay"]').count(), 0);
  assert.equal(await slider('上下文消息数').getAttribute('aria-valuenow'), '30');
  assert.equal(await slider('Temperature').getAttribute('aria-valuenow'), '1');
  assert.equal(await page.getByRole('switch', { name: '扩展思考' }).isDisabled(), true);
  assert.equal(await slider('记忆浮现间隔').getAttribute('aria-valuenow'), '12');
  assert.equal(await slider('新会话携带历史数量').getAttribute('aria-valuenow'), '0');
  await close(); assert.equal(await page.getByRole('textbox', { name: '搜索当前会话', exact: true }).isVisible(), true);
  await page.getByRole('button', { name: '关闭搜索', exact: true }).click();
  await open(); await slider('上下文消息数').focus(); await page.keyboard.press('End');
  await page.waitForFunction(() => document.querySelector('[data-chat-setting="context_limit"] output')?.textContent === '100'); await saveEnd();
  const before = state.saves.length;
  await page.keyboard.down('ArrowLeft'); await page.keyboard.down('ArrowLeft'); await page.keyboard.down('ArrowLeft');
  assert.equal(state.saves.length, before); await page.keyboard.up('ArrowLeft'); await saveEnd();
  assert.equal(state.saves.length, before + 1); assert.equal(state.defaults.context, 97);
  await slider('Temperature').focus(); await page.keyboard.press('Home'); await saveEnd(); assert.equal(state.defaults.temperatures[OPENAI], 0);
  const track = page.locator('[data-chat-setting="temperature"] [data-slot="slider-control"]'), rect = await track.boundingBox();
  if (width < 768) {
    const taps = state.saves.length; await page.touchscreen.tap(rect.x + rect.width * .4, rect.y + rect.height / 2); await saveEnd();
    assert.equal(state.saves.length, taps + 1);
  }
  const writes = state.saves.length;
  await page.mouse.move(rect.x + 10, rect.y + rect.height / 2); await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * .7, rect.y + rect.height / 2, { steps: 20 });
  assert.equal(state.saves.length, writes); await page.mouse.up(); await saveEnd(); assert.equal(state.saves.length, writes + 1);
  state.failSave = true; await slider('Temperature').focus(); await page.keyboard.press('Home'); await saveEnd();
  await page.getByText('未确认保存，当前编辑已保留。', { exact: false }).waitFor();
  assert.equal(await slider('Temperature').getAttribute('aria-valuenow'), '0'); assert.notEqual(state.defaults.temperatures[OPENAI], 0);
  await page.getByRole('button', { name: '重试', exact: true }).click(); await saveEnd(); assert.equal(state.defaults.temperatures[OPENAI], 0);
  await close(); assert.equal(await quick().evaluate(el => el === document.activeElement), true);
  await send('服务端持久默认');
  assert.deepEqual(Object.keys(state.sends.at(-1)).sort(), ['client_msg_id', 'content']); assert.deepEqual(state.effective.at(-1), { context: 97, temperature: 0 });
  await page.getByRole('button', { name: '重新生成回复', exact: true }).last().click(); await idle();
  assert.deepEqual(state.regenerates.at(-1), { query: {}, body: null }); assert.deepEqual(state.effective.at(-1), { context: 97, temperature: 0 });
  await page.reload(); await page.locator('[data-message-id="reply-13"]').waitFor(); await open();
  assert.equal(await slider('上下文消息数').getAttribute('aria-valuenow'), '97'); assert.equal(await slider('Temperature').getAttribute('aria-valuenow'), '0');
  await page.setViewportSize({ width, height: 260 });
  await panel().evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {}))));
  await page.waitForTimeout(250); // Let Floating UI's resize/flip observers settle, beyond the 100 ms entrance animation.
  await page.waitForFunction(() => { const r = document.querySelector('[data-slot="popover-content"]').getBoundingClientRect(); return r.bottom <= innerHeight + 1; });
  const geometry = await panel().evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight, overflow: el.scrollWidth > el.clientWidth + 1 }; });
  assert(geometry.left >= 0 && geometry.right <= geometry.width + 1 && geometry.top >= 0 && geometry.bottom <= geometry.height + 1 && !geometry.overflow, JSON.stringify(geometry));
  await slider('Temperature').scrollIntoViewIfNeeded(); await close();
  await page.setViewportSize({ width, height: 844 }); await open();
  await panel().evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {}))));
  await page.screenshot({ path: `${output}/persistent-${width}.png` });
  await close();
  if (width < 768) await page.getByRole('button', { name: '打开会话列表', exact: true }).click();
  await page.getByRole('button', { name: '搜索全部聊天', exact: true }).filter({ visible: true }).click();
  await page.getByRole('dialog', { name: '搜索全部聊天', exact: true }).waitFor(); await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: '搜索全部聊天', exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '打开会话会话 B', exact: true }).filter({ visible: true }).click();
  await page.locator('[data-message-id="b-initial"]').waitFor(); await open();
  assert.equal(await slider('上下文消息数').getAttribute('aria-valuenow'), '97'); assert.equal(await slider('Temperature').getAttribute('aria-valuenow'), '0');
  await close(); await page.getByRole('button', { name: '会话工具', exact: true }).click(); await page.getByText('手动调整', { exact: true }).click();
  await page.getByRole('combobox', { name: '接口格式', exact: true }).click(); await page.getByRole('option', { name: 'Anthropic 格式', exact: true }).click(); await idle();
  await page.keyboard.press('Escape'); await page.locator('[data-slot="popover-content"]').waitFor({ state: 'hidden' }); await open();
  assert.equal(await slider('Temperature').getAttribute('max'), '1'); assert.equal(await slider('Temperature').getAttribute('aria-valuenow'), '1');
  assert.equal(state.defaults.temperatures[OPENAI], 0); assert.equal(state.selections.b.protocol, ANTHROPIC);
  await page.getByText('模型能力尚未验证；开启即手动尝试。', { exact: true }).waitFor();
  await panel().evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {}))));
  await page.getByRole('switch', { name: '扩展思考' }).click(); await saveEnd();
  for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) {
    await page.getByRole('button', { name: effort, exact: true }).click(); await saveEnd();
    assert.deepEqual(state.defaults.thinking[ANTHROPIC], { enabled: true, effort });
    assert.equal(await page.getByRole('button', { name: effort, exact: true }).getAttribute('aria-pressed'), 'true');
  }
  await slider('记忆浮现间隔').focus(); await page.keyboard.press('Home'); await saveEnd();
  await slider('新会话携带历史数量').focus(); await page.keyboard.press('End'); await saveEnd();
  assert.equal(state.defaults.float, 1); assert.equal(state.defaults.carryover, 50);
  await close(); await page.reload(); await page.locator('[data-message-id="a-initial"]').waitFor();
  if (width < 768) await page.getByRole('button', { name: '打开会话列表', exact: true }).click();
  await page.getByRole('button', { name: '打开会话会话 B', exact: true }).filter({ visible: true }).click();
  await page.locator('[data-message-id="b-initial"]').waitFor(); await open();
  assert.equal(await page.getByRole('switch', { name: '扩展思考' }).getAttribute('aria-checked'), 'true');
  assert.equal(await page.getByRole('button', { name: 'max', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await slider('记忆浮现间隔').getAttribute('aria-valuenow'), '1');
  assert.equal(await slider('新会话携带历史数量').getAttribute('aria-valuenow'), '50');
  const effortGeometry = await page.getByRole('group', { name: '思考强度' }).evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth,
    children: [...el.children].map(button => ({ scroll: button.scrollWidth, client: button.clientWidth })) }));
  assert(effortGeometry.scroll <= effortGeometry.client && effortGeometry.children.every(button => button.scroll <= button.client));
  await panel().evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {}))));
  await page.screenshot({ path: `${output}/thinking-${width}.png` });
  await page.setViewportSize({ width, height: 260 }); await page.waitForTimeout(250);
  await slider('新会话携带历史数量').scrollIntoViewIfNeeded();
  assert(await panel().evaluate(el => el.scrollHeight > el.clientHeight && el.scrollWidth <= el.clientWidth + 1));
  await page.setViewportSize({ width, height: 844 });
  await page.getByRole('switch', { name: '扩展思考' }).click(); await saveEnd();
  assert.deepEqual(state.defaults.thinking[ANTHROPIC], { enabled: false, effort: 'max' });
  await page.mouse.click(12, 80); await panel().waitFor({ state: 'hidden' });
  assert.equal(state.requests.filter(r => /\/api\/settings/.test(r.path)).length, 0); assert.deepEqual(errors, []);
  await context.close(); console.log(`${width}px: real values, automatic commit/keyboard grouping, drag batching, failure/retry, refresh/conversation persistence, protocol isolation, default send/regen, short Popover/focus/search passed`);
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try { for (const width of [320, 390, 1280]) await run(browser, width); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
