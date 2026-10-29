/* Real /app/quick-notes with synthetic HTTP only. No production config or model calls.
 * VITE_API_BASE_URL= VITE_API_BASE= PENUMBRA_DEV_PROXY_TARGET= npm run dev -- --host 127.0.0.1 --port 45424
 * node tests/browser/quick-note-config-smoke.cjs <playwright module> [chromium executable]
 */
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const origin = process.env.QUICK_NOTE_SMOKE_ORIGIN || 'http://127.0.0.1:45424';
const output = '/private/tmp/penumbra-quick-note-config';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function run(browser, width) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768 });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const state = { hours: [5, 12, 20], labels: { '5': '夜晚', '12': '上午', '20': '下午' }, requests: [], failLoad: false, failPut: false, failReadback: false, delay: 0 };
  const note = { id: 'synthetic-qn', period_start: 1792098000, period_end: 1792126800, period_label: '历史上午', summary: '{"事件归纳":"合成摘要"}', output: '保留的速记正文\n[HEART:合成内容]', created_at: 1792130000 };
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'));
  await page.routeWebSocket(url => url.pathname === '/ws', () => {});
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method();
    const body = req.postData() ? req.postDataJSON() : undefined;
    state.requests.push({ path, method, body });
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (path === '/api/quick-notes/trigger-config') {
      if (method === 'PUT') {
        if (state.delay) await wait(state.delay);
        if (state.failPut) { state.failPut = false; return json({ detail: 'invalid config' }, 400); }
        state.hours = body.hours; state.labels = body.labels;
        return json({ hours: state.hours, labels: state.labels });
      }
      if (state.failLoad || state.failReadback) { state.failReadback = false; return json({ detail: 'unavailable' }, 503); }
      return json({ hours: state.hours, labels: state.labels, day_boundary_hour: state.hours[0], time_zone: 'Asia/Shanghai', date_contract_error: null });
    }
    if (path === '/api/quick-notes/logs') return route.fulfill({ contentType: 'text/event-stream', body: 'data: {"seq":1,"ts":1792130000,"level":"info","msg":"合成日志 Step 1"}\n\n' });
    if (path === '/api/quick-notes' && method === 'GET') return json({ items: [note], page: Number(url.searchParams.get('page')), page_size: Number(url.searchParams.get('page_size')), total: 1, has_more: false });
    if (path === '/api/quick-notes/synthetic-qn' && method === 'PUT') { note.output = body.output; return json({ ok: true }); }
    if (/\/re_step[12]$/.test(path)) { note.output = path.endsWith('re_step1') ? '' : 'Step 2 的合成正文'; return json({ ok: true }); }
    if (path === '/api/session') return json({ authenticated: true });
    if (path === '/api/worldbook') return json({ user_name: '合成用户' });
    return json([]);
  });
  const form = () => page.getByRole('form', { name: '编辑时段配置' });
  const name = index => page.getByRole('textbox', { name: `时段 ${index} 名称`, exact: true });
  const puts = () => state.requests.filter(r => r.path.endsWith('/trigger-config') && r.method === 'PUT');
  const open = async () => { await page.getByRole('button', { name: '编辑配置', exact: true }).click(); await name(1).waitFor(); };
  const hour = async (index, value) => {
    await form().getByRole('combobox', { name: `时段 ${index} 截止小时`, exact: true }).click();
    await page.getByRole('option', { name: `${String(value).padStart(2, '0')}:00`, exact: true }).click();
  };
  try {
    await page.goto(`${origin}/app/quick-notes`);
    await page.getByText('时段配置', { exact: true }).click();
    await open();
    assert.equal(await name(1).inputValue(), '夜晚');
    await name(1).fill('取消的名称'); await form().getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(puts().length, 0);
    state.failLoad = true;
    await page.getByRole('button', { name: '编辑配置', exact: true }).click();
    await form().getByRole('alert').waitFor(); assert.equal(await name(1).count(), 0);
    state.failLoad = false;
    await form().getByRole('button', { name: '重试加载', exact: true }).click(); await name(1).waitFor();
    await hour(1, 12); await form().getByRole('button', { name: '保存配置', exact: true }).click();
    await form().getByText('截止小时不能重复', { exact: false }).waitFor(); assert.equal(puts().length, 0);
    await hour(1, 21); await form().getByRole('button', { name: '保存配置', exact: true }).click();
    await form().getByText('须按当前行顺序递增', { exact: false }).waitFor(); assert.equal(puts().length, 0);
    await hour(1, 6); await hour(2, 13); await name(1).fill('记录'); await name(2).fill('记录');
    const geometry = await form().evaluate(el => ({ width: el.getBoundingClientRect().width, left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right,
      overflow: el.scrollWidth > el.clientWidth + 1, fields: [...el.querySelectorAll('input[data-slot="input"],button[role="combobox"]')].map(field => { const r = field.getBoundingClientRect(); return { width: r.width, height: r.height, left: r.left, right: r.right }; }) }));
    assert(!geometry.overflow && geometry.left >= 0 && geometry.right <= width);
    assert(geometry.fields.every(r => r.height >= 44 && r.left >= 0 && r.right <= width));
    await form().scrollIntoViewIfNeeded(); await page.screenshot({ path: `${output}/editor-${width}.png` });
    state.failPut = true; await form().getByRole('button', { name: '保存配置', exact: true }).click();
    await form().getByText('保存失败', { exact: false }).waitFor(); assert.equal(await name(1).inputValue(), '记录');
    state.delay = 300;
    await form().getByRole('button', { name: '保存配置', exact: true }).click();
    const saving = form().getByRole('button', { name: '保存中…', exact: true }); assert(await saving.isDisabled());
    await form().evaluate(el => el.requestSubmit()); assert.equal(puts().length, 2);
    await form().getByText('配置已保存，并已重新读取服务端结果。', { exact: true }).waitFor();
    assert.deepEqual(state.hours, [6, 13, 20]); assert.deepEqual(state.labels, { '6': '记录', '13': '记录', '20': '下午' });
    const lastPut = state.requests.findLastIndex(r => r.method === 'PUT');
    assert(state.requests.slice(lastPut + 1).some(r => r.method === 'GET' && r.path.endsWith('/trigger-config')));
    await name(3).fill('读回测试'); state.failReadback = true;
    await form().getByRole('button', { name: '保存配置', exact: true }).click();
    await form().getByText('保存请求已成功，但重新读取失败', { exact: false }).waitFor();
    assert.equal(await name(3).inputValue(), '读回测试');
    const beforeVerify = puts().length;
    await form().getByRole('button', { name: '核对保存结果', exact: true }).click();
    await form().getByText('配置已保存，并已重新读取服务端结果。', { exact: true }).waitFor(); assert.equal(puts().length, beforeVerify);
    await form().getByRole('button', { name: '完成', exact: true }).click();
    await page.reload(); await page.getByText('时段配置', { exact: true }).click(); await open();
    assert.equal(await name(3).inputValue(), '读回测试'); assert.equal(await name(1).inputValue(), '记录');
    await form().getByRole('button', { name: '取消', exact: true }).click();
    const logs = page.getByRole('region', { name: '详细原始日志', exact: true });
    await page.getByText('运行日志', { exact: true }).click();
    await logs.getByText('合成日志 Step 1', { exact: true }).waitFor();
    await page.getByRole('button', { name: /阅读全文/ }).click();
    await page.locator('[data-quick-note-output]').getByText('保留的速记正文', { exact: true }).waitFor();
    await page.getByRole('button', { name: '本篇速记操作', exact: true }).click();
    await page.getByRole('button', { name: '历史上午：编辑正文', exact: true }).click();
    const editor = page.getByRole('dialog', { name: /编辑正文/ });
    await editor.getByRole('textbox', { name: '正文', exact: true }).fill('浏览器编辑后正文');
    await editor.getByRole('button', { name: '保存正文', exact: true }).click();
    await page.locator('[data-quick-note-output]').getByText('浏览器编辑后正文', { exact: true }).waitFor();
    for (const step of [1, 2]) {
      await page.getByRole('button', { name: '本篇速记操作', exact: true }).click();
      await page.getByRole('button', { name: step === 1 ? '历史上午：Step 1 重跑辅助模型（清空正文）' : '历史上午：Step 2 重跑主模型（重新生成正文）', exact: true }).click();
      await page.getByRole('button', { name: `确认重跑 Step ${step}`, exact: true }).click();
      await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => !document.querySelector('[aria-label="本篇速记操作"]')?.disabled);
    }
    await page.locator('[data-quick-note-output]').getByText('Step 2 的合成正文', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    return { viewport: width, ...geometry, configPuts: puts().length, checks: 'load/edit/cancel/validation/failure/dedup/readback/reload/reader/body/step1/step2/logs' };
  } finally { await context.close(); }
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try { const results = []; for (const width of [320, 390, 1280]) results.push(await run(browser, width)); fs.writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2)); console.log(results); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
