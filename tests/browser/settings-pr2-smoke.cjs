/* Real production UI in fresh browser contexts; every API/WS response is synthetic.
 * npm run build
 * node tests/browser/settings-pr2-smoke.cjs [playwright module] [Chromium executable]
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.argv[2] || 'playwright');
const root = path.resolve(__dirname, '../..');
const output = process.env.SETTINGS_PR2_OUTPUT || '/private/tmp/penumbra-settings-pr2-browser';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1l8AAAAASUVORK5CYII=', 'base64');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (!pathname.startsWith('/penumbra/') || pathname.startsWith('/api/')) { res.writeHead(404); return res.end(); }
  const local = pathname.slice('/penumbra/'.length);
  const relative = local.startsWith('assets/') ? local : 'index.html';
  const file = path.resolve(root, 'dist', relative);
  if (!file.startsWith(path.join(root, 'dist') + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
const wire = (id, extra = {}) => ({ id, name: `合成连接 ${id}`, base_url: 'https://synthetic.invalid/v1', enabled: true, default_model: 'literal-manual', transport: 'direct', gateway_id: null, ...extra });
async function run(browser, origin, layout, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const f = { connections: new Map([['a', wire('a')], ['b', wire('b')]]), keys: { a: 'synthetic-old-key', b: '' }, revisions: { a: 1, b: 1 },
    references: { a: [], b: [] }, unresolved: { a: [], b: [] }, requests: [], writes: [], reveals: 0, tests: 0, discovers: 0,
    fail: null, empty: false, paginated: false, pending: [], delay: false, persisted: false, created: 0 };
  const errors = [], escaped = []; page.on('pageerror', error => errors.push(error.message));
  const project = id => ({ ...f.connections.get(id), credential: { configured: !!f.keys[id], masked: f.keys[id] ? '••••1234' : '', secret_ref: f.keys[id] ? `ref-${id}-${f.revisions[id]}` : null } });
  await context.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); escaped.push('external-request'); return route.abort(); });
  await page.routeWebSocket(/.*/, socket => socket.close());
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname, method = req.method();
    f.requests.push(`${method} ${p}`);
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) }).catch(() => {});
    const fail = code => json({ detail: { code, input: 'private-synthetic-error-input' } }, code === 'provider_probe_failed' ? 502 : code === 'selection_references_unavailable' ? 503 : 409);
    if (!p.startsWith('/api/registry/')) {
      if (p === '/api/session') return json({ authenticated: true });
      if (p === '/api/chat/readiness') return json({ ready: true, model_key: 'literal', reason_code: 'ready', setup_action_required: false });
      if (p === '/api/conversations') return json([]);
      return json({});
    }
    if (p === '/api/registry/connections') {
      if (method === 'GET') return json({ schema_version: 2, authority_state: f.persisted ? 'persisted_v2' : 'projected_v2', migration_required: !f.persisted,
        connections: [...f.connections.keys()].map(project), diagnostics: [], deferred_usages: [] });
      assert.equal(method, 'POST'); const body = req.postDataJSON();
      assert(!('protocol' in body) && !('reusable_protocols' in body));
      const id = `created-${++f.created}`; f.writes.push({ operation: 'create', id });
      const { credential, ...fields } = body; f.connections.set(id, wire(id, fields)); f.keys[id] = credential || ''; f.revisions[id] = 1;
      f.references[id] = []; f.unresolved[id] = []; f.persisted = true;
      return json(project(id), 201);
    }
    const match = p.match(/^\/api\/registry\/connections\/([^/]+)(.*)$/); assert(match, p);
    const id = decodeURIComponent(match[1]), action = match[2];
    if (action === '/references') {
      if (f.fail === 'references') return fail('selection_references_unavailable');
      return json({ references: f.references[id], unresolved: f.unresolved[id] });
    }
    if (action === '/credential/reveal') {
      f.reveals++; assert.equal(method, 'POST');
      if (req.postDataJSON().secret_ref !== `ref-${id}-${f.revisions[id]}`) return fail('stale_secret_ref');
      return json({ secret: f.keys[id] });
    }
    if (action === '/credential/clear') {
      if (req.postDataJSON().secret_ref !== `ref-${id}-${f.revisions[id]}`) return fail('stale_secret_ref');
      f.writes.push({ operation: 'clear', id }); f.keys[id] = ''; f.revisions[id]++; return json(project(id));
    }
    if (action === '/test') {
      f.tests++; const body = req.postDataJSON(); assert.equal(body.connection_id, id); assert(body.protocol && body.model);
      if (f.fail === 'test') return fail('provider_probe_failed');
      if (body.protocol === 'minimax_chatcompletion_v2' && f.fail === 'unsupported') return fail('unsupported_protocol');
      return json({ ok: true, ...body, test_type: 'basic_nonstream', validates_full_chat: false });
    }
    if (action === '/fetch-models') {
      f.discovers++; const protocol = url.searchParams.get('protocol'); assert(protocol);
      if (f.fail === 'discover') return fail('provider_probe_failed');
      if (f.delay) { f.pending.push({ route, id, protocol }); return; }
      const after = url.searchParams.get('after_id');
      return json({ connection_id: id, protocol, operation: 'model_list', models: f.empty ? [] : after ? ['remote/second'] : ['remote/first'],
        truncated: f.paginated && !after, next_page: f.paginated && !after ? 'next/id' : null });
    }
    assert.equal(action, '');
    if (method === 'GET') return f.connections.has(id) ? json(project(id)) : fail('missing_profile');
    if (method === 'DELETE') {
      if (f.references[id].length) return fail('connection_in_use'); if (f.unresolved[id].length) return fail('unresolved_selection_references');
      f.writes.push({ operation: 'delete', id }); f.connections.delete(id); return json({ ok: true });
    }
    assert.equal(method, 'PATCH'); const body = req.postDataJSON();
    assert(!('protocol' in body) && !('reusable_protocols' in body));
    if (f.fail === 'save') { f.fail = null; return fail('persistence_failed'); }
    if (body.credential && f.keys[id] && body.secret_ref !== `ref-${id}-${f.revisions[id]}`) return fail('stale_secret_ref');
    if (body.credential !== undefined) assert(body.credential.trim() && !body.credential.includes('••••'));
    f.writes.push({ operation: 'patch', id, fields: Object.keys(body) });
    const { credential, secret_ref, ...fields } = body;
    f.connections.set(id, { ...f.connections.get(id), ...fields }); if (credential) f.keys[id] = credential;
    f.revisions[id]++; f.persisted = true;
    if (f.fail === 'network-save') { f.fail = null; return route.abort('failed'); }
    return json(project(id));
  });
  const location = `/penumbra/${layout === 'editorial' ? 'editorial' : ''}`;
  const click = name => page.getByRole('button', { name, exact: true }).click();
  const waitRead = async () => { await page.getByLabel('连接名称', { exact: true }).waitFor(); await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(el => el.textContent === '保存连接' && !el.disabled) || !document.body.textContent.includes('正在读取连接…')); };
  const open = async () => { await page.getByRole('button', { name: '打开设置', exact: true }).last().click(); await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: /^API 与连接/ }).click(); await page.getByRole('button', { name: `管理连接：${f.connections.get('a').name}`, exact: true }).waitFor(); };
  const manage = async id => { await page.getByRole('button', { name: `管理连接：${f.connections.get(id).name}`, exact: true }).click(); await waitRead(); };
  const confirm = async () => { const consent = page.getByRole('checkbox', { name: /^已核对引用影响/ }); if (await consent.count()) await consent.check(); await click('确认操作'); };
  const save = async () => { await click('保存连接'); await confirm(); await page.getByText('操作已保存并读回。已有绑定和模型选择未修改。', { exact: true }).waitFor(); };
  const waitPending = async () => { for (let attempt = 0; attempt < 300; attempt++) { if (f.pending.length) return; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error('delayed fixture request did not arrive'); };
  const noOverflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('[data-page-scroll-region]')].filter(el => el.getBoundingClientRect().width).every(el => el.scrollWidth <= el.clientWidth + 1)));
  try {
    await page.goto(origin + location); await open();
    assert.equal(f.reveals, 0); assert.equal(f.tests, 0); assert.equal(f.discovers, 0);
    await page.getByText('只读投影 v2', { exact: false }).waitFor();
    await noOverflow(); await page.screenshot({ path: path.join(output, `${layout}-${width}-list.png`) });
    await manage('a');
    assert(!await page.getByLabel('临时 Key 明文').count());
    await click('显式查看 Key'); await page.getByLabel('临时 Key 明文').waitFor();
    await click('关闭明文'); assert.equal(await page.getByLabel('临时 Key 明文').count(), 0);
    await page.getByLabel('连接名称', { exact: true }).fill('改名连接'); await save();
    assert(!f.writes.at(-1).fields.includes('credential')); assert.equal(f.keys.a, 'synthetic-old-key');
    await page.getByLabel('新 API Key', { exact: true }).fill('synthetic-new-key'); await save();
    assert(f.writes.at(-1).fields.includes('secret_ref')); assert.equal(f.keys.a, 'synthetic-new-key');
    // Stale ref auto-reads once and requires explicit user acknowledgement, never auto-reveals.
    f.revisions.a++; const revealsBefore = f.reveals;
    await click('显式查看 Key'); await page.getByRole('button', { name: '已核对，继续编辑', exact: true }).waitFor();
    await page.getByRole('button', { name: '已核对，继续编辑', exact: true }).click();
    assert.equal(f.reveals, revealsBefore + 1); assert.equal(await page.getByLabel('临时 Key 明文').count(), 0);
    // Save failure retains non-secret drafts, makes no automatic retry, and forces readback.
    f.fail = 'save'; await page.getByLabel('连接名称', { exact: true }).fill('保留草稿');
    await click('保存连接'); await confirm(); await page.getByRole('button', { name: '读取核对', exact: true }).waitFor();
    assert.equal(await page.getByLabel('连接名称', { exact: true }).inputValue(), '保留草稿');
    await click('读取核对'); await click('已核对，继续编辑'); await save();
    // An applied write with a lost response is verified, never replayed.
    f.fail = 'network-save'; const appliedBefore = f.writes.length;
    await page.getByLabel('连接名称', { exact: true }).fill('请求结果核对'); await click('保存连接'); await confirm();
    await page.getByRole('button', { name: '读取核对', exact: true }).waitFor();
    await click('读取核对'); await click('已核对，继续编辑');
    assert.equal(f.writes.length, appliedBefore + 1); assert(await page.getByRole('button', { name: '保存连接', exact: true }).isDisabled());
    await page.getByLabel('连接名称', { exact: true }).fill('保留草稿'); await save();
    // Tests and discovery use saved facts and never alter literal inputs or bindings.
    const model = page.getByLabel('测试模型', { exact: true }); await model.fill('manual/keep');
    f.fail = 'unsupported'; await page.getByLabel('本次协议').selectOption('minimax_chatcompletion_v2'); await click('基础非流式测试');
    await page.getByRole('alert').filter({ hasText: '不支持此操作所选的协议' }).waitFor(); f.fail = null;
    await page.getByLabel('本次协议').selectOption('openai_chat_completions');
    await click('基础非流式测试'); await page.getByText('基础非流式测试成功 · manual/keep', { exact: true }).waitFor();
    f.fail = 'test'; await click('基础非流式测试'); await page.getByRole('alert').filter({ hasText: '本次上游请求失败' }).last().waitFor(); f.fail = null;
    await page.getByLabel('default_model', { exact: true }).fill('manual/prefill-draft');
    await click('获取远端模型'); await page.getByText('remote/first', { exact: true }).waitFor(); assert.equal(await model.inputValue(), 'manual/keep');
    assert.equal(await page.getByLabel('default_model', { exact: true }).inputValue(), 'manual/prefill-draft');
    const writesBefore = f.writes.length;
    await click('填入预填草稿'); assert.equal(await page.getByLabel('default_model', { exact: true }).inputValue(), 'remote/first'); assert.equal(f.writes.length, writesBefore);
    await page.getByLabel('default_model', { exact: true }).fill('literal-manual');
    f.empty = true; await click('获取远端模型'); await page.getByText('远端返回空模型列表；保留手动输入。', { exact: true }).waitFor(); f.empty = false;
    f.fail = 'discover'; await click('获取远端模型'); await page.getByRole('alert').filter({ hasText: '本次上游请求失败' }).last().waitFor(); f.fail = null;
    f.paginated = true; await click('获取远端模型');
    await page.getByText('OpenAI 当前不支持分页，请手动输入。', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: '读取下一页', exact: true }).count(), 0);
    await page.getByLabel('本次协议').selectOption('anthropic_messages'); await click('获取远端模型'); await click('读取下一页'); await page.getByText('remote/second', { exact: true }).waitFor();
    assert.equal(await model.inputValue(), 'manual/keep'); f.paginated = false;
    // Late protocol response is discarded.
    f.delay = true; await click('获取远端模型'); await waitPending();
    await page.getByLabel('本次协议').selectOption('openai_chat_completions');
    f.delay = false; await click('获取远端模型'); await page.getByText('remote/first', { exact: true }).waitFor();
    for (const pending of f.pending.splice(0)) await pending.route.fulfill({ contentType: 'application/json', body: JSON.stringify({ connection_id: pending.id, protocol: pending.protocol, operation: 'model_list', models: ['late/must-not-show'], truncated: false, next_page: null }) }).catch(() => {});
    assert.equal(await page.getByText('late/must-not-show', { exact: true }).count(), 0);
    // Late Connection response is discarded, and transient credentials leave with detail.
    f.delay = true; await click('获取远端模型'); await waitPending(); await page.getByLabel('新 API Key', { exact: true }).fill('synthetic-unsaved'); await click('返回连接列表'); await manage('b');
    assert.equal(await page.getByLabel('新 API Key', { exact: true }).inputValue(), ''); f.delay = false;
    for (const pending of f.pending.splice(0)) await pending.route.fulfill({ contentType: 'application/json', body: JSON.stringify({ connection_id: pending.id, protocol: pending.protocol, operation: 'model_list', models: ['late/other-connection'], truncated: false, next_page: null }) }).catch(() => {});
    assert.equal(await page.getByText('late/other-connection', { exact: true }).count(), 0);
    // Unreferenced delete. Creation does not bind protocol or modify a Feature.
    await click('返回连接列表'); await click('新增连接');
    await page.getByLabel('连接名称', { exact: true }).fill('新建连接'); await page.getByLabel('Base URL', { exact: true }).fill('https://new.synthetic.invalid/v1');
    await click('创建连接'); await confirm(); await waitRead();
    const createdId = `created-${f.created}`; assert(f.connections.has(createdId)); assert.equal(f.keys[createdId], '');
    await click('删除连接'); await confirm(); await page.getByRole('button', { name: '新增连接', exact: true }).waitFor(); assert(!f.connections.has(createdId));
    await manage('a');
    f.references.a = [{ scope: 'feature', id: 'main_chat' }, { scope: 'main', id: 'conversation-synthetic' }, { scope: 'diary', id: 'entry-synthetic' }, { scope: 'theater', id: 'theater-synthetic' }, { scope: 'theater_persona', id: 'persona-synthetic' }, { scope: 'game', id: 'game-synthetic' }, { scope: 'legacy_compatibility', id: 'legacy-synthetic' }];
    await click('重新读取引用'); await page.getByText('7 项引用 · 0 项无法解析', { exact: true }).waitFor();
    assert(await page.getByRole('button', { name: '删除连接', exact: true }).isDisabled());
    await page.getByRole('checkbox', { name: '启用此连接', exact: true }).uncheck(); await save(); assert.equal(f.connections.get('a').enabled, false);
    await page.getByRole('checkbox', { name: '启用此连接', exact: true }).check(); await save();
    f.references.a = []; f.unresolved.a = [{ scope: 'diary', id: 'broken', code: 'invalid_selection' }];
    await click('重新读取引用'); await page.getByText('0 项引用 · 1 项无法解析', { exact: true }).waitFor(); assert(await page.getByRole('button', { name: '删除连接', exact: true }).isDisabled());
    f.fail = 'references'; await click('重新读取引用'); await page.getByRole('alert').filter({ hasText: '无法核对连接引用' }).waitFor(); assert(await page.getByRole('button', { name: '删除连接', exact: true }).isDisabled());
    f.fail = null; f.unresolved.a = []; await click('重新读取引用'); await page.getByText('0 项引用 · 0 项无法解析', { exact: true }).waitFor();
    await page.getByLabel('Transport', { exact: true }).selectOption('cloudflare_rest'); await page.getByLabel('Gateway ID').fill('synthetic-gateway'); await save();
    assert.equal(f.connections.get('a').gateway_id, 'synthetic-gateway');
    assert(await page.getByRole('button', { name: '获取远端模型', exact: true }).isDisabled());
    assert(await page.getByRole('button', { name: '基础非流式测试', exact: true }).isDisabled());
    await page.getByLabel('本次协议').selectOption('anthropic_messages'); await page.getByLabel('测试模型', { exact: true }).fill('literal'); await click('基础非流式测试');
    await page.getByText('基础非流式测试成功 · literal', { exact: true }).waitFor();
    await page.getByLabel('Transport', { exact: true }).selectOption('cloudflare_anthropic'); await save();
    f.revisions.a++; await click('显式清除 Key'); await confirm();
    await page.getByRole('button', { name: '已核对，继续编辑', exact: true }).waitFor();
    await click('已核对，继续编辑'); assert(f.keys.a);
    await click('显式清除 Key'); await confirm(); await page.getByRole('button', { name: '显式查看 Key', exact: true }).waitFor({ state: 'hidden' }); assert.equal(f.keys.a, '');
    await noOverflow();
    await page.getByRole('region', { name: '连接详情', exact: true }).evaluate(el => { el.scrollTop = 0; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(output, `${layout}-${width}-detail.png`) });
    await page.getByRole('button', { name: '返回上级设置', exact: true }).click(); await page.getByRole('button', { name: /^管理连接：/ }).first().waitFor();
    await page.getByRole('button', { name: '返回设置分类', exact: true }).click();
    await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: /^系统状态/ }).click();
    await page.getByText('Session 可达 · 已登录', { exact: true }).waitFor(); assert.equal(await page.getByRole('region', { name: '模型目录', exact: true }).count(), 0);
    assert(!f.requests.includes('GET /api/models'));
    await click('返回桌面'); await open(); assert.equal(await page.getByLabel('临时 Key 明文').count(), 0);
    await page.reload(); await open(); await manage('a'); assert.equal(await page.getByLabel('连接名称', { exact: true }).inputValue(), '保留草稿');
    assert(!f.requests.some(req => /migrate|feature-bindings|\/selections\//.test(req)));
    assert(!f.requests.some(req => /^(?:PATCH|POST|DELETE) \/api\/(?:main|conversations|diary)/.test(req)));
    assert(!(await page.evaluate(() => JSON.stringify({ ...localStorage }))).includes('synthetic-new-key'));
    assert(!(await page.evaluate(() => JSON.stringify({ ...localStorage }))).includes('synthetic-unsaved'));
    assert.deepEqual(escaped, []); assert.deepEqual(errors, []);
    return { layout, width, passed: true, crud: 'passed', credentials: 'passed', references: 'passed', probes: 'passed', discoveryAndIsolation: 'passed', overviewCatalogRemoved: true, pageErrors: errors.length };
  } finally { await context.close(); }
}
(async () => {
  fs.mkdirSync(output, { recursive: true }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try { const results = []; for (const layout of ['classic', 'editorial']) for (const width of [320, 390, 1440]) results.push(await run(browser, origin, layout, width));
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); server.closeAllConnections(); server.close(); process.exitCode = 1; });
