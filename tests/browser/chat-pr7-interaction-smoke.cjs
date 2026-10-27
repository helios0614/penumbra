/* Real ChatView, synthetic HTTP/SSE/WS and isolated browser profile only. */
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const { fixture } = require('./chat-pr6-5-config-smoke.cjs');
const row = (id, conv, role, content, time) => ({ id, conv_id: conv, role, content, created_at: time, drift: null, thinking: null, attachments: [], is_carryover: 0, mcp_tool_calls: [], cache_region: null });
const failure = '[Anthropic API 错误 503] provider_request_failed\n上游信息：synthetic temporary provider failure';
async function run(browser, width) {
  const { page, context, state, errors } = await fixture(browser, width);
  const receipts = {};
  let uploads = 0;
  await page.route('**/api/upload', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ url: `/uploads/${1700000000040 + ++uploads}.png`, name: 'synthetic.png', type: 'image/png' }) }));
  await page.route('**/api/conversations/*/send-results/*', route => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop());
    return route.fulfill({ status: receipts[id] ? 200 : 404, contentType: 'application/json', body: JSON.stringify(receipts[id] || { detail: { code: 'send_result_not_found' } }) });
  });
  await page.evaluate(() => {
    const fetch = window.fetch.bind(window);
    window.__posts = []; window.__streams = []; window.__mode = 'stream';
    window.fetch = async (url, options) => {
      if (options?.method === 'POST' && /\/(send|regenerate)(?:\?|$)/.test(String(url))) {
        window.__posts.push({ url: String(url), body: options.body, snapshot: structuredClone(window.__snapshot) });
        if (window.__mode === '499' || window.__mode === '524') return new Response('<html>synthetic proxy</html>', { status: Number(window.__mode) });
        if (window.__mode === 'reject') return new Response(JSON.stringify({ detail: { code: 'invalid_generation_options', field: 'temperature' } }), { status: 422, headers: { 'content-type': 'application/json' } });
        return new Response(new ReadableStream({ start(c) { window.__streams.push(c); } }), { headers: { 'content-type': 'text/event-stream' } });
      }
      return fetch(url, options);
    };
  });
  const bubble = id => page.locator(`[data-message-id="${id}"]`);
  const composer = () => page.getByRole('textbox', { name: '消息正文', exact: true });
  const posts = () => page.evaluate(() => window.__posts);
  const emit = (payload, event, index = -1) => page.evaluate(({ payload, event, index }) => window.__streams.at(index).enqueue(new TextEncoder().encode(`${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(payload)}\n\n`)), { payload, event, index });
  const close = (index = -1) => page.evaluate(index => window.__streams.at(index).close(), index);
  const send = async (text, owner = "a") => {
    await page.evaluate(snapshot => { window.__snapshot = snapshot; }, { selection: structuredClone(state.selections[owner]), defaults: structuredClone(state.defaults) });
    await composer().fill(text); await page.getByRole('button', { name: '发送消息', exact: true }).click();
  };
  const select = async name => {
    if (width < 768) await page.getByRole('button', { name: '打开会话列表', exact: true }).click();
    await page.getByRole('button', { name: `打开会话会话 ${name}`, exact: true }).filter({ visible: true }).click();
    await bubble(`${name.toLowerCase()}-initial`).waitFor();
  };
  const ws = (id, conv = 'a', type = 'msg_created') => state.ws.send(JSON.stringify({ type, data: { id, conv_id: conv } }));
  const pending = () => page.locator('[data-chat-execution-feedback]').getByText('回复结果待确认', { exact: true });
  const saveEnd = async () => { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await page.waitForFunction(() => !document.querySelector('[data-slot="popover-content"]')?.textContent.includes('保存中')); };
  const settings = async () => { await page.getByRole('button', { name: '聊天设置', exact: true }).click(); await page.getByRole('slider', { name: 'Temperature', exact: true }).waitFor(); };

  const upload = async name => {
    await page.getByRole('button', { name: '会话工具', exact: true }).click();
    await page.getByLabel('选择图片或视频', { exact: true }).setInputFiles({ name, mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64') });
    await page.keyboard.press('Escape'); await page.locator('[data-upload-status="uploaded"]').waitFor();
  };
  await send('A is generating');
  await emit({ type: 'start', id: 'a-live' }); await emit({ type: 'chunk', content: 'A partial' });
  await page.getByText('A partial', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '返回桌面', exact: true }).isDisabled(), false);
  await composer().fill('next draft survives home'); await upload('next.png');
  await page.getByRole('button', { name: '返回桌面', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__chatHomeReturns), 1);
  await page.evaluate(() => window.__chatUnmount()); await page.locator('.chat-shell').waitFor({ state: 'hidden' });
  await page.evaluate(() => window.__chatMount()); await page.getByText('A partial', { exact: true }).waitFor();
  assert.equal(await composer().inputValue(), 'next draft survives home');
  assert.equal(await page.getByRole('button', { name: '移除 next.png', exact: true }).count(), 1);
  assert.equal((await posts()).length, 1);

  // Save a new model and protocol during this stream. Only later requests use it.
  await page.getByRole('button', { name: '会话工具', exact: true }).click();
  await page.getByText('手动调整', { exact: true }).click();
  const model = page.getByRole('textbox', { name: '模型名称', exact: true });
  const modelReadback = page.waitForResponse(async response => response.request().method() === 'GET' && response.url().includes('/api/main/configuration') && (await response.json()).connection_selection?.model === 'literal-after');
  await model.fill('literal-after'); await model.press('Enter'); await modelReadback; await saveEnd();
  await page.getByRole('combobox', { name: '接口格式', exact: true }).click();
  const protocolReadback = page.waitForResponse(async response => response.request().method() === 'GET' && response.url().includes('/api/main/configuration') && (await response.json()).connection_selection?.protocol === 'anthropic_messages');
  await page.getByRole('option', { name: 'Anthropic 格式', exact: true }).click(); await protocolReadback; await saveEnd();
  await page.keyboard.press('Escape');
  assert.equal(state.selections.a.model, 'literal-after'); assert.equal(state.selections.a.protocol, 'anthropic_messages');
  await settings();
  const temp = page.getByRole('slider', { name: 'Temperature', exact: true });
  await temp.focus(); await page.keyboard.press('Home'); await saveEnd();
  await page.getByRole('switch', { name: '扩展思考' }).click(); await saveEnd();
  for (const [name, key, field] of [['上下文消息数', 'context', 'context_limit'], ['记忆浮现间隔', 'float', 'float_interval'], ['新会话携带历史', 'carryover', 'carryover_count']]) {
    const committed = page.waitForResponse(response => response.url().includes('/api/main/chat-defaults') && response.request().method() === 'PATCH' && response.request().postDataJSON().field === field);
    await page.getByRole('slider', { name, exact: true }).focus(); await page.keyboard.press('End'); await committed; await saveEnd();
    assert(state.defaults[key] !== undefined);
  }
  state.failSave = true;
  await temp.focus(); await page.keyboard.press('End'); await saveEnd();
  await page.getByText('未确认保存，当前编辑已保留。', { exact: false }).waitFor();
  assert.equal((await posts()).length, 1); assert.equal((await posts())[0].snapshot.selection.model, 'literal-a');
  assert.equal((await posts())[0].snapshot.selection.protocol, 'openai_chat_completions');
  await page.keyboard.press('Escape');
  await emit({ type: 'chunk', content: ' still A original request' });
  await select('B');
  assert(!(await page.locator('.chat-message-scroll').textContent()).includes('A partial'));
  assert.equal(await page.locator('[data-chat-execution-feedback]').count(), 0);
  await page.getByRole('button', { name: '搜索聊天历史', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索当前会话', exact: true }).fill('B');
  await page.getByRole('button', { name: '关闭搜索', exact: true }).click();
  await composer().fill('B draft'); assert.equal(await page.getByRole('button', { name: '发送消息', exact: true }).isDisabled(), false);
  assert.equal(await page.locator('[aria-label="附件草稿"]').count(), 0);
  await send('B parallel request', 'b'); await emit({ type: 'start', id: 'b-parallel' }); await emit({ type: 'chunk', content: 'B independent reply' });
  state.messages.b.push(row('b-user', 'b', 'user', 'B parallel request', 16), row('b-parallel', 'b', 'assistant', 'B independent reply', 17));
  await close(); await bubble('b-parallel').waitFor(); await composer().fill('B draft');
  // Complete A while B is selected. Its read must never publish into B.
  state.messages.a.push(row('a-user', 'a', 'user', 'A is generating', 20), row('a-live', 'a', 'assistant', 'A authoritative', 21));
  await close(0); ws('a-live'); await select('A'); await bubble('a-live').waitFor();
  assert((await bubble('a-live').textContent()).includes('A authoritative'));
  assert.equal(await page.locator('[data-chat-execution-feedback]').count(), 0);

  await send('new settings apply'); await emit({ type: 'start', id: 'a-fail' });
  await emit({ type: 'chunk', content: 'kept partial\n' + failure });
  state.messages.a.push(row('a-user2', 'a', 'user', 'new settings apply', 22), row('a-fail', 'a', 'assistant', 'kept partial\n' + failure, 23));
  await close();
  await bubble('a-fail').getByRole('button', { name: '重新生成回复', exact: true }).waitFor();
  assert.equal(await page.locator('[data-chat-execution-feedback]').count(), 0);
  assert.equal(await page.getByText(/未完成或未确认的提交已暂存/).count(), 0);
  const later = (await posts()).find(p => JSON.parse(p.body || '{}').content === 'new settings apply');
  assert.equal(later.snapshot.selection.model, 'literal-after');
  assert.deepEqual(JSON.parse(later.body).attachments, ['/uploads/1700000000041.png']);
  assert.equal(later.snapshot.defaults.thinking.anthropic_messages.enabled, true);
  // One-click canonical retry, failure can be retried again, success replaces same ID.
  await bubble('a-fail').getByRole('button', { name: '重新生成回复', exact: true }).click();
  await emit({ type: 'start', id: 'a-fail' }); await emit({ type: 'chunk', content: 'retry partial\n' + failure }); await close();
  await bubble('a-fail').getByRole('button', { name: '重新生成回复', exact: true }).waitFor();
  await bubble('a-fail').getByRole('button', { name: '重新生成回复', exact: true }).click();
  await emit({ type: 'start', id: 'a-fail' }); await emit({ type: 'chunk', content: 'retry success' });
  state.messages.a.at(-1).content = 'retry success';
  await emit({ id: 'a-fail', content: 'retry success', thinking: null, drift: null }, 'persisted'); await close();
  await page.waitForFunction(() => !document.querySelector('[data-message-id="a-fail"] [role="alert"]'));
  assert.equal(state.messages.a.filter(m => m.role === 'user').length, 2);

  // Proven rejection returns original input to the editable Composer, with no extra recovery step.
  await upload('reject.png');
  await page.evaluate(() => { window.__mode = 'reject'; }); await send('rejected input');
  await page.getByText('当前生成参数无效。', { exact: false }).waitFor();
  assert.equal(await composer().inputValue(), 'rejected input');
  assert.equal(await composer().isEditable(), true);
  assert.equal(await page.getByRole('button', { name: '移除 reject.png', exact: true }).count(), 1);
  assert.equal(uploads, 2);
  assert.equal(await page.getByText(/未完成或未确认的提交已暂存/).count(), 0);
  await page.evaluate(status => { window.__mode = status; }, width === 1280 ? '499' : '524'); await send('unknown input');
  await pending().waitFor();
  const unknownPost = (await posts()).at(-1), client = JSON.parse(unknownPost.body).client_msg_id, count = (await posts()).length;
  receipts[client] = { conv_id: 'a', client_msg_id: client, user_message_id: 'unknown-user', assistant_message_id: null };
  state.messages.a.push(row('unknown-user', 'a', 'user', 'unknown input', 24));
  await composer().fill('next independent draft');
  assert.equal(await page.getByText(/未完成或未确认的提交已暂存/).count(), 0);
  assert.equal(await page.getByRole('button', { name: '已核对历史，返回编辑' }).count(), 0);
  await page.getByRole('button', { name: '返回桌面', exact: true }).click();
  await page.evaluate(() => window.__chatUnmount()); await page.locator('.chat-shell').waitFor({ state: 'hidden' });
  await page.evaluate(() => window.__chatMount()); await pending().waitFor();
  await select('B'); assert.equal(await page.locator('[data-chat-execution-feedback]').count(), 0);
  await composer().fill('B draft'); assert.equal(await page.getByRole('button', { name: '发送消息', exact: true }).isDisabled(), false);
  state.messages.a.push(row('unknown-reply', 'a', 'assistant', 'late authoritative', 25)); receipts[client].assistant_message_id = 'unknown-reply';
  ws('unknown-reply');
  await select('A'); await bubble('unknown-reply').waitFor(); await pending().waitFor({ state: 'hidden' });
  assert.equal(await composer().inputValue(), 'next independent draft');
  assert.equal((await posts()).length, count);
  assert.deepEqual(errors, []);
  await context.close(); console.log(`${width}px: home/remount, A/B ownership, model/settings while streaming, failure one-click regen, editable rejection, 499 receipt recovery passed`);
}
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  try { for (const width of [1280, 390]) await run(browser, width); } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
