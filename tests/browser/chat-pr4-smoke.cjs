/* Real Chromium layout, synthetic HTTP/WS. Never executes a remote capability. */
const { chromium } = require(process.env.CHAT_PR4_PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const origin = process.env.CHAT_PR4_ORIGIN || 'http://127.0.0.1:45340';
const output = process.env.CHAT_PR4_OUTPUT || '.tmp/chat-pr4-browser';
const longResult = '实际安全结果\n' + '长正文与长 JSON 的安全结果，应能完整复制。'.repeat(6000);
const msg = (n, role = 'assistant', extra = {}) => ({ id: `m${n}`, conv_id: 'a', role, content: `合成对话 ${n}`, created_at: 1792800000 + n,
  drift: null, thinking: null, is_carryover: 0, attachments: [], mcp_tool_calls: [], cache_region: 'slide', ...extra });
const display = (capability, title, kind = 'operation', fields = [], extra = {}) => ({ version: 1, kind, capability, title, status: 'success', fields, notices: [], ...extra });
const field = (label, text) => ({ label, text });
function messages() {
  const rows = Array.from({ length: 60 }, (_, i) => msg(i + 1));
  rows[1] = msg(2, 'user', { content: '更早的真实锚点' });
  for (let n = 30; n < 42; n++) rows[n - 1] = msg(n, 'system', { content: 'PRIVATE_SYSTEM_PROMPT', public_display: display('MEMORY_WRITE', '写入记忆', 'operation', [field('记忆正文', `真实记忆正文 ${n}。`), field('重要度', '0.8'), field('记忆 ID', `opaque-${n}`)]) });
  rows[41] = msg(42, 'system', { content: 'PRIVATE_TRIGGER_PROMPT', public_display: display('keepalive_day', '自由活动时间', 'trigger', [], {
    facts: { last_assistant_ts: 1792797000, last_user_ts: 1792796000, elapsed_seconds: 3000, threshold_minutes: 50 } }) });
  rows[42] = msg(43, 'system', { content: 'PRIVATE_SENTINEL_PROMPT', public_display: display('location_sentinel', '位置变化唤醒', 'trigger', [field('状态变化', '在家 → 在外面'), field('触发依据', '位置哨兵请求主动联系')]) });
  rows[43] = msg(44, 'system', { content: 'PRIVATE_UNKNOWN_SYSTEM_PROMPT' });
  rows[44] = msg(45, 'system', { content: 'PRIVATE_ACTIVITY_WRAPPER', public_display: display('ACTIVITY_CHECK', '查看动态', 'operation', [field('动态结果', '10:00–10:10：阅读文档；部分时段缺少数据。')]) });
  rows[45] = msg(46, 'system', { public_display: display('CAM_CHECK', '查看监控', 'operation', [field('原因', '摄像头未开启')], { status: 'skipped' }) });
  rows[46] = msg(47, 'system', { public_display: display('TODO', '添加待办', 'operation', [field('内容', '整理明天要讨论的材料。')]) });
  rows[47] = msg(48, 'system', { public_display: display('Location', '查询位置', 'operation', [field('位置状态', '在外面'), field('地址', '合成地点地址')]) });
  rows[55] = msg(56, 'user', { content: '请帮我整理这件事。', url_read_results: [{ id: 'url1', sequence: 0, domain: 'example.org', status: 'failed', reason: 'timeout', evidence: 'PRIVATE_EVIDENCE' }] });
  rows[56] = msg(57, 'assistant', { content: '我已经查看了本次执行记录。', has_heart: true, heart_revision: 'heart-v1', web_search_results: [
    { id: 'search1', conv_id: 'a', source_message_id: 'm57', query: '合成查询', status: 'partial', candidate_count: 4, fetched_count: 2, source_count: 1,
      sources: [{ title: '真实来源标题', domain: 'example.org' }], follow_up_status: 'generation_failed', created_at: 1792800057, evidence: 'PRIVATE_EVIDENCE' },
  ] });
  rows[57] = msg(58, 'system', { content: 'PRIVATE_MCP_WRAPPER', public_display: display('tools', '工具执行', 'result', [], { status: 'unknown', calls: [
    { server: 'forum', tool: 'submit', status: 'success', args: { title: '实际标题', content: '实际提交的论坛正文。', token: '[已隐藏]' }, executed_args: { content: '实际提交的论坛正文。' },
      result: longResult, ai_result: 'AI 有界结果', ai_truncated: true, storage_truncated: true, result_version: 1, ai_delivery: 'response_received' },
    { server: 'opaque', tool: 'unknown-schema', status: 'failed', args: { xyz: [1, { nested: '参数' }] }, result: '{"error":"真实安全错误"}', error: '真实安全错误', ai_delivery: 'prepared' },
    { server: 'opaque', tool: 'skipped-call', status: 'skipped', result: '当前条件不满足', ai_delivery: 'not_included', ai_truncated: true },
  ] }) });
  rows[58] = msg(59, 'assistant', { content: '结果仍然保留。\n\n[请求出错: provider_execution_failed]\n上游信息：合成续写错误' });
  return rows;
}
async function run(browser, mobile) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, timezoneId: 'Asia/Shanghai', ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const state = { rows: messages(), ws: null, requests: [], heartReads: 0 }, errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.routeWebSocket(url => url.pathname === '/ws', socket => { state.ws = socket; });
  await page.route('**/api/**', route => {
    const req = route.request(), url = new URL(req.url()); state.requests.push({ path: url.pathname, method: req.method() });
    const json = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname === '/api/conversations') return json([{ id: 'a', title: 'PR4 能力展示验收', model: 'legacy', created_at: state.rows[0].created_at, updated_at: state.rows.at(-1).created_at, message_count: 60 }]);
    if (url.pathname === '/api/chat/readiness') return json({ ready: true, model_key: 'model', reason_code: 'ready', setup_action_required: false });
    if (url.pathname === '/api/main/configuration') return json({ connections: [], profiles: [], models: [], allowed_protocols: [], selection: null, connection_selection: null, diagnostic: null });
    if (url.pathname === '/api/conversations/a/messages') {
      assert.equal(url.searchParams.get('public_view'), 'true');
      const before = Number(url.searchParams.get('before') || Infinity);
      return json(state.rows.filter(m => m.created_at < before).slice(-50));
    }
    const single = url.pathname.match(/^\/api\/messages\/(m\d+)\/public$/);
    if (single) return json(state.rows.find(m => m.id === single[1]));
    if (url.pathname === '/api/heart-whispers/by-msg/m57') { state.heartReads++; return json([
      { id: 'heart', conv_id: 'a', msg_id: 'm57', content: '按需读取的真实心声。', created_at: 1 },
      { id: 'orphan', conv_id: 'a', msg_id: 'wrong', content: 'PRIVATE_WRONG_HEART', created_at: 1 },
    ]); }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await page.addInitScript(() => { window.__copies = []; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => window.__copies.push(t) } }); });
  await page.goto(`${origin}/tests/browser/chat-pr3.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const root = page.locator('[data-message-id="m58"]'); await root.waitFor();
  assert.equal(state.heartReads, 0);
  assert.equal(await page.getByText('实际提交的论坛正文。', { exact: true }).count(), 0);
  assert(!(await page.locator('body').innerText()).includes('PRIVATE'));
  assert.equal(await page.locator('[data-message-id="m30"] button[aria-expanded="false"]').count(), 1);
  assert.equal(await page.locator('[data-message-id="m30"] section').evaluate(el => getComputedStyle(el).boxShadow), 'none');
  assert((await page.locator('[data-message-id="m30"]').boundingBox()).height < 45);
  assert.equal(await page.locator('[data-message-id="m42"]').getByText(/触发阈值 50 分钟/).count(), 1);
  await page.locator('[data-message-id="m30"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/${mobile ? 'mobile' : 'desktop'}-collapsed.png` });
  const memory = page.locator('[data-message-id="m30"]');
  await memory.getByRole('button', { name: /写入记忆/ }).click();
  await memory.getByRole('button', { name: '复制记忆正文', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__copies.at(-1)), '真实记忆正文 30。');
  await root.getByRole('button', { name: /工具执行/ }).click();
  await root.getByRole('button', { name: /远程调用.*forum:submit/ }).click();
  await root.getByText('实际提交的论坛正文。', { exact: true }).waitFor();
  await root.getByRole('button', { name: '复制已保存结果', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__copies.at(-1)), longResult);
  const pre = root.getByLabel('已保存结果', { exact: true });
  assert(await pre.evaluate(el => el.scrollHeight > el.clientHeight && el.clientHeight <= 289));
  assert(await pre.evaluate(el => { el.scrollTop = 1000; return el.scrollTop > 0; }));
  await root.getByRole('button', { name: /远程调用.*opaque:unknown-schema/ }).click();
  await root.getByText('真实安全错误', { exact: true }).waitFor();
  assert((await root.innerText()).includes('实际执行参数'));
  assert((await root.innerText()).includes('未确认') || (await root.innerText()).includes('尚无法确认'));
  await page.screenshot({ path: `${output}/${mobile ? 'mobile' : 'desktop'}-expanded.png` });
  // HTTP replacement from replayed WS preserves identities and expansion.
  const reaction = { id: 'r', type: 'reaction', conv_id: 'a', target_message_id: 'm56', source_message_id: 'm57', emoji: '💙' };
  state.rows[55].reaction = reaction;
  for (let i = 0; i < 3; i++) state.ws.send(JSON.stringify({ type: 'reaction', data: reaction }));
  await page.locator('[data-message-id="m56"] [data-reaction-target="m56"]').waitFor();
  assert.equal(await page.locator('[data-reaction-target]').count(), 1);
  assert.equal(await memory.getByRole('button', { name: /写入记忆/ }).getAttribute('aria-expanded'), 'true');
  await page.getByRole('button', { name: '查看心声', exact: true }).click();
  await page.getByText('按需读取的真实心声。', { exact: true }).waitFor(); assert.equal(state.heartReads, 1);
  assert(!(await page.locator('body').innerText()).includes('PRIVATE'));
  // A canonical regenerate can retain the Assistant ID but replace its HEART.
  // New persisted HEART identities close the old disclosure instead of showing stale text.
  state.rows[56].heart_revision = 'heart-v2';
  state.ws.send(JSON.stringify({ type: 'heart_whisper', data: { msg_id: 'm57' } }));
  await page.waitForFunction(() => document.querySelector('button[aria-label="查看心声"]')?.getAttribute('aria-expanded') === 'false');
  assert.equal(await page.getByText('按需读取的真实心声。', { exact: true }).count(), 0);
  // Native scroll-to-click can trigger the existing automatic paging and
  // replace this button first. Invoke the same callback without that race.
  await page.getByRole('button', { name: '加载更早消息', exact: true }).evaluate(el => el.click());
  await page.locator('[data-message-id="m2"]').waitFor();
  const oldReaction = { ...reaction, id: 'r-old', target_message_id: 'm2' }; state.rows[1].reaction = oldReaction;
  state.ws.send(JSON.stringify({ type: 'reaction', data: oldReaction }));
  await page.locator('[data-message-id="m2"] [data-reaction-target="m2"]').waitFor();
  const ids = await page.locator('[data-message-id]').evaluateAll(els => els.map(el => el.dataset.messageId));
  assert.equal(new Set(ids).size, 60);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert(state.requests.every(r => r.method === 'GET'));
  await page.reload(); await page.locator('[data-message-id="m58"]').waitFor();
  await page.locator('[data-reaction-target="m56"]').waitFor();
  assert.equal(await page.locator('[data-message-id="m58"] button[aria-expanded="false"]').count(), 1);
  assert.equal(state.heartReads, 1);
  assert(!(await page.locator('body').innerText()).includes('PRIVATE'));
  assert.deepEqual(errors, []);
  console.log(`${mobile ? 'mobile 390×844' : 'desktop 1440×1000'}: safe projections, compact rows, expansion/copy/scroll, exact anchors, replay, paging and reload passed`);
  await context.close();
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.CHAT_PR4_CHROMIUM ? { executablePath: process.env.CHAT_PR4_CHROMIUM } : {}) });
  try { await run(browser, false); await run(browser, true); } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
