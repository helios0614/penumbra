/* Real ChatView with synthetic HTTP/SSE/WS; never reaches a backend. */
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const origin = process.env.CHAT_STABILITY_ORIGIN || 'http://127.0.0.1:45340';
const failure = '[Anthropic API 错误 524] provider_request_failed\n上游类型：bad_response_status_code\n上游信息：Proxy Read Timeout\n请求 ID：req-synthetic';
const msg = (id, role, content, time, conv = 'a') => ({ id, conv_id: conv, role, content, created_at: time, thinking: null, drift: null, is_carryover: 0, attachments: [], mcp_tool_calls: [], cache_region: 'slide' });
async function run(browser, mobile) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  const page = await context.newPage(); page.setDefaultTimeout(7000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const state = { a: [msg('u0', 'user', '初始合成问题', 1), msg('a0', 'assistant', '初始正文', 2)], b: [msg('b0', 'assistant', 'B 正文', 1, 'b')], ws: null, requests: [], receipts: {} };
  await page.routeWebSocket(url => url.pathname === '/ws', ws => { state.ws = ws; });
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()); state.requests.push([req.method(), url.pathname]);
    const json = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname === '/api/conversations') return json(['a', 'b'].map(id => ({ id, title: `会话 ${id.toUpperCase()}`, model: 'legacy', created_at: 1, updated_at: id === 'a' ? 2 : 1, message_count: state[id].length })));
    if (url.pathname === '/api/main/configuration') return json({ connections: [{ id: 'connection-a', name: '合成连接', base_url: 'https://synthetic.invalid/v1', enabled: true, default_model: 'literal-a', transport: 'direct', gateway_id: null, credential_configured: true }], allowed_protocols: ['openai_chat_completions'], profiles: [], models: [], selection: null, connection_selection: { connection_id: 'connection-a', protocol: 'openai_chat_completions', model: 'literal-a' }, diagnostic: null });
    if (url.pathname === '/api/chat/readiness') return json({ ready: true, model_key: 'literal-a', reason_code: 'ready', setup_action_required: false });
    const result = url.pathname.match(/\/conversations\/([^/]+)\/send-results\/([^/]+)$/);
    if (result) return state.receipts[result[2]] ? json(state.receipts[result[2]]) : route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":{"code":"send_result_not_found"}}' });
    const window = url.pathname.match(/\/conversations\/([^/]+)\/messages\/window$/);
    if (window) return json({ conversation_id: window[1], anchor_id: null, messages: state[window[1]], older_cursor: null, newer_cursor: null, has_older: false, has_newer: false, reaches_latest: true });
    const history = url.pathname.match(/\/conversations\/([^/]+)\/messages$/);
    if (history) return json(state[history[1]]);
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await page.addInitScript(() => {
    const realFetch = window.fetch.bind(window);
    window.__posts = []; window.__streams = []; window.__mode = 'sse';
    window.fetch = async (url, options) => {
      if (options?.method === 'POST' && /\/(send|regenerate)(?:\?|$)/.test(String(url))) {
        window.__posts.push({ url: String(url), body: options.body });
        if (window.__mode === '524') return new Response('<html>Cookie=synthetic-secret</html>', { status: 524 });
        const stream = new ReadableStream({ start(controller) { window.__streams.push(controller); } });
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
      }
      return realFetch(url, options);
    };
  });
  await page.goto(origin + '/tests/browser/chat-pr3.html'); await page.locator('[data-message-id="a0"]').waitFor();
  const emit = async (payload, event) => page.evaluate(({ payload, event }) => window.__streams.at(-1).enqueue(new TextEncoder().encode(`${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(payload)}\n\n`)), { payload, event });
  const close = () => page.evaluate(() => window.__streams.at(-1).close());
  const send = async text => { await page.getByRole('textbox', { name: '消息正文', exact: true }).fill(text); await page.getByRole('button', { name: '发送消息', exact: true }).click(); };
  const bubble = id => page.locator(`[data-message-id="${id}"]`);
  const regen = id => bubble(id).getByRole('button', { name: '重新生成回复', exact: true });
  const ws = id => state.ws.send(JSON.stringify({ type: 'msg_created', data: { id, conv_id: 'a' } }));

  await send('两段后失败');
  await emit({ type: 'start', id: 'failed' });
  await emit({ type: 'chunk', content: '第一段。\n\n第二段。[THINKING_START]hidden-thinking[THINKING_END][HEART:hidden-command]\n' });
  for (let index = 0; index < failure.length; index += 7) await emit({ type: 'chunk', content: failure.slice(index, index + 7) });
  await page.getByText('Proxy Read Timeout', { exact: false }).waitFor();
  assert((await page.locator('[data-message-body]').allTextContents()).join('').includes('第二段。'));
  state.a.push(msg('u1', 'user', '两段后失败', 3), msg('failed', 'assistant', '第一段。\n\n第二段。\n' + failure, 4)); await close();
  await bubble('failed').waitFor(); await page.waitForFunction(() => !document.querySelector('[data-message-id="failed"] button[aria-label="重新生成回复"]').disabled);
  assert((await bubble('failed').textContent()).includes('第一段。')); assert((await bubble('failed').textContent()).includes('bad_response_status_code'));
  assert(!(await page.locator('.chat-message-scroll').textContent()).includes('hidden-command'));
  await page.reload(); await bubble('failed').waitFor(); assert((await bubble('failed').textContent()).includes('Proxy Read Timeout'));

  // Identical status and type must retain distinct real causes after WS and
  // an HTTP history reread, without a locally inferred authentication reason.
  const reasons = ['Adaptive thinking disabled by workspace policy.', 'Deployment region not enabled.'];
  for (let index = 0; index < reasons.length; index++) {
    const id = `cause-${index}`;
    state.a.push(msg(id, 'assistant', `[Anthropic API 错误 403] provider_request_failed\n上游类型：permission_error\n上游信息：${reasons[index]}`, 4.1 + index / 10));
    ws(id); await bubble(id).waitFor();
    const text = await bubble(id).textContent();
    assert(text.includes(reasons[index])); assert(!text.includes('鉴权失败')); assert(!text.includes('检查 API Key'));
  }
  await page.reload(); await bubble('cause-1').waitFor();
  for (let index = 0; index < reasons.length; index++) assert((await bubble(`cause-${index}`).textContent()).includes(reasons[index]));

  // A completed tool result and a no-body follow-up failure arrive over WS/HTTP.
  state.a.push({ ...msg('tool-result', 'system', 'PRIVATE_TOOL_WRAPPER', 5), public_display: {
    version: 1, kind: 'result', capability: 'tools', title: '工具执行', status: 'success', fields: [], notices: [],
    calls: [{ server: 'location', tool: 'POI_SEARCH', capability: 'POI_SEARCH', command_type: 'POI_SEARCH', status: 'success', result: '合成地点结果', ai_delivery: 'response_received' }],
  } }, msg('tool-failed', 'assistant', failure, 6));
  ws('tool-failed'); await bubble('tool-failed').waitFor();
  assert((await bubble('tool-failed').textContent()).includes('HTTP 524'));
  await regen('tool-failed').click(); await page.waitForFunction(() => window.__posts.length === 1);
  assert((await page.evaluate(() => window.__posts[0].url)).endsWith('/conversations/a/messages/tool-failed/regenerate'));
  await emit({ type: 'start', id: 'tool-failed' }); await emit({ type: 'chunk', content: '恢复成功，沿用已保存的地点结果。' });
  state.a[state.a.length - 1].content = '恢复成功，沿用已保存的地点结果。';
  await emit({ id: 'tool-failed', content: state.a.at(-1).content, thinking: null, drift: null }, 'persisted'); await close();
  await page.waitForFunction(() => document.querySelector('[data-message-id="tool-failed"]')?.textContent.includes('恢复成功') && !document.querySelector('[data-message-id="tool-failed"] [role="alert"]'));
  assert((await bubble('failed').textContent()).includes('HTTP 524')); // Other assistant unchanged.
  assert.equal(await bubble('tool-result').count(), 1);
  await bubble('tool-result').getByRole('button', { name: /工具执行/ }).click();
  assert((await page.locator('body').textContent()).includes('合成地点结果'));
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  assert(!(await bubble('tool-result').textContent()).includes('PRIVATE_TOOL_WRAPPER'));

  // A canceled stream retains a temporary body until a late WS invalidation
  // causes an authoritative HTTP reread. No automatic mutation is issued.
  await send('断流合成问题'); await emit({ type: 'start', id: 'late' }); await emit({ type: 'chunk', content: '临时正文' });
  await page.evaluate(() => window.__streams.at(-1).error(new TypeError('Synthetic network canceled')));
  await page.getByRole('button', { name: '回复结果待确认，查看详情', exact: true }).waitFor();
  assert.equal(await regen('tool-failed').isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '发送消息', exact: true }).isDisabled(), true);
  state.a.push(msg('u2', 'user', '断流合成问题', 7), msg('late', 'assistant', 'HTTP 已保存的正文', 8)); ws('late');
  await bubble('late').waitFor(); assert((await bubble('late').textContent()).includes('HTTP 已保存的正文'));
  assert(!(await page.locator('.chat-message-scroll').textContent()).includes('临时正文'));
  assert.equal((await page.evaluate(() => window.__posts)).length, 2);
  await page.getByRole('button', { name: '回复状态需要处理，查看详情', exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '回复结果待确认，查看详情', exact: true }).waitFor({ state: 'hidden' });

  await page.evaluate(() => window.__mode = '524'); await send('直接524');
  await page.getByRole('button', { name: '回复结果待确认，查看详情', exact: true }).waitFor();
  assert((await page.locator('.chat-message-scroll').textContent()).includes('HTTP 524'));
  assert(!(await page.locator('.chat-message-scroll').textContent()).includes('synthetic-secret'));
  assert.equal(await regen('late').isDisabled(), true);
  assert.equal((await page.evaluate(() => window.__posts)).length, 3);
  // A user-only receipt and unrelated/duplicate/out-of-order WS notifications
  // cannot resolve this 524. The linked primary assistant can, in this same UI.
  const client = await page.evaluate(() => JSON.parse(window.__posts.at(-1).body).client_msg_id);
  state.receipts[client] = { conv_id: 'a', client_msg_id: client, user_message_id: 'u524', assistant_message_id: null };
  state.a.push(msg('u524', 'user', '直接524', 9), msg('unrelated', 'assistant', '无关后台追加回复', 10));
  ws('unrelated'); ws('late');
  await bubble('unrelated').waitFor();
  assert.equal(await page.getByRole('button', { name: '发送消息', exact: true }).isDisabled(), true);
  await page.getByText('未完成或未确认的提交已暂存（1）', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: '消息正文', exact: true }).fill('下一条草稿');
  state.a.push(msg('late524', 'assistant', '524 后持久化成功', 11));
  state.receipts[client].assistant_message_id = 'late524';
  ws('late524'); ws('unrelated'); ws('late524');
  await bubble('late524').waitFor();
  await page.getByRole('button', { name: '回复结果待确认，查看详情', exact: true }).waitFor({ state: 'hidden' });
  await page.getByText('未完成或未确认的提交已暂存（1）', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await page.locator('[data-chat-execution-feedback]').count(), 0);
  assert(!(await page.locator('.chat-message-scroll').textContent()).includes('连接返回 HTTP 524'));
  assert.equal(await page.getByRole('textbox', { name: '消息正文', exact: true }).inputValue(), '下一条草稿');
  assert.equal(await bubble('late524').count(), 1);
  assert.equal((await page.evaluate(() => window.__posts)).length, 3);

  await page.evaluate(() => window.__mode = 'sse'); await send('正常合成请求');
  await emit({ type: 'start', id: 'normal' }); await emit({ type: 'start', id: 'normal' });
  await emit({ type: 'chunk', content: '正常回复' });
  state.a.push(msg('unormal', 'user', '正常合成请求', 12), msg('normal', 'assistant', '正常回复', 13)); await close();
  await bubble('normal').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-message-id="normal"] button[aria-label="重新生成回复"]').disabled);
  assert.equal(await page.locator('[data-chat-execution-feedback]').count(), 0);

  // Receipt received, body transport lost, target still unchanged in HTTP.
  await regen('normal').click();
  await emit({ type: 'start', id: 'normal' }); await emit({ type: 'chunk', content: '重新生成部分正文' });
  await emit({ id: 'normal', content: '重新生成完整正文', thinking: null, drift: null }, 'persisted');
  await page.evaluate(() => window.__streams.at(-1).error(new TypeError('Synthetic regenerate disconnect')));
  await page.getByRole('button', { name: '回复结果待确认，查看详情', exact: true }).waitFor();
  assert((await bubble('normal').textContent()).includes('正常回复'));
  assert((await page.locator('.chat-message-scroll').textContent()).includes('重新生成部分正文'));
  state.a.at(-1).content = '重新生成完整正文';
  state.ws.send(JSON.stringify({ type: 'msg_updated', data: { id: 'normal', conv_id: 'a' } }));
  await page.getByRole('button', { name: '回复结果待确认，查看详情', exact: true }).waitFor({ state: 'hidden' });
  assert((await bubble('normal').textContent()).includes('重新生成完整正文'));
  assert(!(await page.locator('.chat-message-scroll').textContent()).includes('重新生成部分正文'));
  assert.equal(await bubble('normal').count(), 1);
  assert.equal((await page.evaluate(() => window.__posts)).length, 5);
  // Remount the real ChatView without a page reload. The pending execution
  // remains in memory, rebinds history ownership and never opens another POST.
  await send('卸载期间生成');
  await emit({ type: 'start', id: 'remount' }); await emit({ type: 'chunk', content: '卸载前部分正文' });
  await page.getByText('卸载前部分正文', { exact: false }).first().waitFor();
  await page.evaluate(() => window.__chatUnmount());
  await page.locator('.chat-shell').waitFor({ state: 'hidden' });
  await close();
  await page.evaluate(() => window.__chatMount());
  await page.getByRole('button', { name: '回复结果待确认，查看详情', exact: true }).waitFor();
  assert((await page.locator('.chat-message-scroll').textContent()).includes('卸载前部分正文'));
  state.a.push(msg('umount', 'user', '卸载期间生成', 14), msg('remount', 'assistant', '重新进入后权威正文', 15)); ws('remount');
  await bubble('remount').waitFor();
  await page.getByRole('button', { name: '回复结果待确认，查看详情', exact: true }).waitFor({ state: 'hidden' });
  assert(!(await page.locator('.chat-message-scroll').textContent()).includes('卸载前部分正文'));
  assert.equal((await page.evaluate(() => window.__posts)).length, 6);
  await page.screenshot({ path: `${process.env.CHAT_STABILITY_OUTPUT || '.tmp'}/chat-stability-${mobile ? 'mobile' : 'desktop'}.png` });
  assert.deepEqual(errors, []); await context.close(); console.log(`${mobile ? 'mobile' : 'desktop'} stability E2E passed`);
}
(async () => { const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] }); try { await run(browser, false); await run(browser, true); } finally { await browser.close(); } })().catch(error => { console.error(error); process.exitCode = 1; });
