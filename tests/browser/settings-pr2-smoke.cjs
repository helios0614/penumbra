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
async function run(browser, origin, layout, width, dark = width === 390) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: dark ? 'dark' : 'light' });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const f = { connections: new Map([['a', wire('a')], ['b', wire('b', { default_model: null })], ['c', wire('c', { transport: 'cloudflare_rest', gateway_id: 'gateway-c' })], ['d', wire('d', { transport: 'cloudflare_anthropic', gateway_id: 'gateway-d' })]]), keys: { a: 'synthetic-old-key', b: '', c: 'synthetic-c', d: 'synthetic-d' }, revisions: { a: 1, b: 1, c: 1, d: 1 },
    references: { a: [], b: [], c: [], d: [] }, unresolved: { a: [], b: [], c: [], d: [] }, requests: [], writes: [], reveals: 0, tests: 0, discovers: 0,
    fail: null, empty: false, paginated: false, pending: [], delay: false, persisted: false, created: 0, delayReveal: false, pendingReveals: [] };
  await context.addInitScript(() => { window.__fakeCopies = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__fakeCopies.push(text); } } }); });
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
      if (method === 'GET' && f.fail === 'list') return fail('invalid_registry_configuration');
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
      if (f.delayReveal) { f.pendingReveals.push({ route, id }); return; }
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
  const label = `${layout}-${width}${dark ? '-dark' : ''}`;
  const panel = () => page.getByRole('region', { name: '连接管理面板', exact: true });
  const row = id => page.locator(`[data-connection-id="${id}"]`);
  const click = (name, root = page) => root.getByRole('button', { name, exact: true }).click();
  const open = async () => { await page.getByRole('button', { name: '打开设置', exact: true }).last().click(); await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: /^API 与连接/ }).click(); await row('a').waitFor(); };
  const edit = async id => { await click(`编辑：${f.connections.get(id).name}`); await page.getByLabel('连接名称', { exact: true }).waitFor(); };
  const dialog = () => page.getByRole('dialog', { name: /编辑连接|新增连接/ });
  const choose = async (name, value, root = dialog()) => {
    await root.getByRole('combobox', { name, exact: true }).click(); await page.getByRole('option', { name: value, exact: true }).click();
  };
  const confirm = async () => { const consent = dialog().getByRole('switch', { name: '确认共享影响', exact: true }); if (await consent.count()) await consent.click(); await click('确认操作', dialog()); };
  const save = async () => { await click('保存连接', dialog()); await confirm(); await dialog().waitFor({ state: 'hidden' }); await row('a').waitFor(); };
  const noOverflow = async () => {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    for (const popup of await page.getByRole('dialog').all()) assert(await popup.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1 && el.scrollWidth <= el.clientWidth + 1; }));
  };
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const waitPending = async name => { for (let i = 0; i < 300; i++) { if (f[name].length) return; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error('fixture delay timeout'); };
  try {
    await page.goto(origin + location); await open();
    assert.equal(await panel().locator('[data-connection-id]').count(), 4);
    assert.equal(await panel().locator('[aria-expanded="true"]').count(), 0);
    assert(!(await row('a').textContent()).match(/direct|直连|Direct/));
    assert((await row('c').textContent()).includes('Cloudflare REST'));
    assert((await row('d').textContent()).includes('Cloudflare Anthropic'));
    assert((await row('a').textContent()).includes('模型预填：literal-manual'));
    assert(!(await row('b').textContent()).includes('模型预填'));
    assert(await row('b').getByRole('button', { name: '复制 Key：合成连接 b', exact: true }).isDisabled());
    assert.equal(f.reveals, 0); assert.equal(f.tests, 0); assert.equal(f.discovers, 0);
    await click('展开连接：合成连接 a'); await row('a').getByRole('region', { name: '引用关系' }).waitFor();
    await click('展开连接：合成连接 c'); await row('c').getByText('Gateway ID：gateway-c', { exact: true }).waitFor();
    assert.equal(await panel().locator('[aria-expanded="true"]').count(), 1);
    assert.equal(await row('a').getByRole('region', { name: '引用关系' }).count(), 0);
    await click('收起连接：合成连接 c');
    await noOverflow(); await settle(); await page.screenshot({ path: path.join(output, `${label}-panel.png`) });
    // Copy is deliberate; plaintext never enters the DOM or product storage.
    await click('复制 Key：合成连接 a'); await row('a').getByText('Key 已复制', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.__fakeCopies), ['synthetic-old-key']);
    assert(!(await panel().textContent()).includes('synthetic-old-key'));
    f.revisions.a++; const revealsBefore = f.reveals;
    await click('复制 Key：合成连接 a'); await row('a').getByRole('button', { name: '已核对，允许重新复制' }).click();
    assert.equal(f.reveals, revealsBefore + 1); await click('复制 Key：合成连接 a');
    await page.waitForFunction(() => window.__fakeCopies.length === 2);
    f.revisions.a++; f.fail = 'list'; await click('复制 Key：合成连接 a');
    await row('a').getByRole('button', { name: '重新读取凭据状态', exact: true }).waitFor();
    f.fail = null; await click('重新读取凭据状态', row('a')); await click('已核对，允许重新复制', row('a'));
    // Editor: existing system controls, Key preservation/replacement, reveal/clear, readback.
    await edit('a');
    assert.equal(await dialog().locator('select, input[type="checkbox"]').count(), 0);
    assert.equal(await dialog().locator('[data-slot="input"]').count(), 4);
    await page.getByLabel('连接名称', { exact: true }).fill('改名连接'); await save();
    assert(!f.writes.at(-1).fields.includes('credential')); assert.equal(f.keys.a, 'synthetic-old-key');
    await edit('a'); await page.getByLabel('新 API Key', { exact: true }).fill('synthetic-new-key'); await save();
    assert(f.writes.at(-1).fields.includes('secret_ref')); assert.equal(f.keys.a, 'synthetic-new-key');
    await edit('a'); await click('显式查看 Key', dialog()); await page.getByLabel('临时 Key 明文').waitFor();
    await click('关闭明文', dialog()); assert.equal(await page.getByLabel('临时 Key 明文').count(), 0);
    // Discovery sits next to the hint, never edits a saved selection or the user's literal.
    await page.getByLabel('default_model', { exact: true }).fill('manual/prefill-draft');
    await click('获取远端模型', dialog()); await dialog().getByText('remote/first', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('default_model', { exact: true }).inputValue(), 'manual/prefill-draft');
    const writesBefore = f.writes.length;
    await click('填入预填草稿', dialog()); assert.equal(f.writes.length, writesBefore);
    f.empty = true; await click('获取远端模型', dialog()); await dialog().getByText('远端返回空模型列表；保留手动输入。', { exact: true }).waitFor(); f.empty = false;
    f.fail = 'discover'; await click('获取远端模型', dialog()); await dialog().getByRole('alert').filter({ hasText: '本次上游请求失败' }).waitFor(); f.fail = null;
    f.paginated = true; await click('获取远端模型', dialog()); await dialog().getByText('OpenAI 当前不支持分页，请手动输入。', { exact: false }).waitFor();
    await choose('发现协议', 'anthropic_messages'); await click('获取远端模型', dialog()); await click('读取下一页', dialog()); await dialog().getByText('remote/second', { exact: true }).waitFor(); f.paginated = false;
    f.delay = true; await click('获取远端模型', dialog()); await waitPending('pending');
    await choose('发现协议', 'openai_chat_completions'); f.delay = false; await click('获取远端模型', dialog());
    await dialog().getByText('remote/first', { exact: true }).waitFor();
    for (const pending of f.pending.splice(0)) await pending.route.fulfill({ contentType: 'application/json', body: JSON.stringify({ connection_id: pending.id, protocol: pending.protocol, operation: 'model_list', models: ['late/must-not-show'], truncated: false, next_page: null }) }).catch(() => {});
    assert.equal(await page.getByText('late/must-not-show', { exact: true }).count(), 0);
    await noOverflow(); await settle(); await page.screenshot({ path: path.join(output, `${label}-editor.png`) });
    // Closing drops unsaved literals, secrets, and in-flight discovery.
    f.delay = true; await click('获取远端模型', dialog()); await waitPending('pending');
    await page.getByLabel('新 API Key', { exact: true }).fill('synthetic-unsaved'); await click('取消', dialog());
    await edit('b'); f.delay = false;
    assert.equal(await page.getByLabel('新 API Key', { exact: true }).inputValue(), '');
    for (const pending of f.pending.splice(0)) await pending.route.fulfill({ contentType: 'application/json', body: JSON.stringify({ connection_id: pending.id, protocol: pending.protocol, operation: 'model_list', models: ['late/other-connection'], truncated: false, next_page: null }) }).catch(() => {});
    assert.equal(await page.getByText('late/other-connection', { exact: true }).count(), 0); await click('取消', dialog());
    // Shared-impact save and unknown write outcome recovery preserve PR2 behavior.
    await edit('a'); f.revisions.a++; await click('显式查看 Key', dialog()); await click('已核对，继续编辑', dialog());
    f.fail = 'save'; await page.getByLabel('连接名称', { exact: true }).fill('保留草稿'); await click('保存连接', dialog()); await confirm();
    await click('读取核对', dialog()); await click('已核对，继续编辑', dialog());
    assert.equal(await page.getByLabel('连接名称', { exact: true }).inputValue(), '保留草稿'); await save();
    await edit('a'); f.fail = 'network-save'; const appliedBefore = f.writes.length;
    await page.getByLabel('连接名称', { exact: true }).fill('请求结果核对'); await click('保存连接', dialog()); await confirm();
    await click('读取核对', dialog()); await click('已核对，继续编辑', dialog());
    assert.equal(f.writes.length, appliedBefore + 1); assert(await dialog().getByRole('button', { name: '保存连接', exact: true }).isDisabled());
    await click('取消', dialog());
    // Independent test dialog retains explicit protocol/model and narrow results.
    await click(`测试：${f.connections.get('a').name}`);
    const testDialog = page.getByRole('dialog', { name: '连接测试', exact: true });
    const model = testDialog.getByLabel('测试模型', { exact: true }); await model.fill('manual/keep');
    assert.equal(await testDialog.getByRole('button', { name: '获取远端模型', exact: true }).count(), 0);
    await click('基础非流式测试', testDialog); await testDialog.getByText('基础非流式测试成功 · manual/keep', { exact: true }).waitFor();
    f.fail = 'test'; await click('基础非流式测试', testDialog); await testDialog.getByRole('alert').waitFor(); f.fail = null;
    await choose('本次协议', 'anthropic_messages', testDialog); assert.equal(await model.inputValue(), 'manual/keep');
    f.fail = 'unsupported'; await choose('本次协议', 'minimax_chatcompletion_v2', testDialog); await click('基础非流式测试', testDialog);
    await testDialog.getByRole('alert').filter({ hasText: '不支持此操作所选的协议' }).waitFor(); f.fail = null;
    await noOverflow(); await settle(); await page.screenshot({ path: path.join(output, `${label}-test.png`) }); await click('关闭', testDialog);
    // New and edit share one modal; successful create must GET before closing.
    await click('新增连接'); await page.getByLabel('连接名称', { exact: true }).fill('新建连接');
    await page.getByLabel('Base URL', { exact: true }).fill('https://new.synthetic.invalid/v1'); await click('创建连接', dialog()); await confirm();
    await dialog().waitFor({ state: 'hidden' }); const createdId = `created-${f.created}`; await row(createdId).waitFor();
    assert(f.requests.includes(`GET /api/registry/connections/${createdId}`));
    await click('删除：新建连接'); const deletion = () => page.getByRole('alertdialog', { name: '删除连接', exact: true });
    await click('确认删除', deletion()); await deletion().waitFor({ state: 'hidden' }); await row(createdId).waitFor({ state: 'hidden' });
    // Delete checks references on click, refuses known/unknown references and errors.
    f.references.a = ['feature', 'main', 'diary', 'theater', 'theater_persona', 'game', 'legacy_compatibility'].map(scope => ({ scope, id: `synthetic-${scope}` }));
    await click(`删除：${f.connections.get('a').name}`); await deletion().getByText('7 项引用 · 0 项无法解析', { exact: true }).waitFor();
    assert(await deletion().getByRole('button', { name: '确认删除', exact: true }).isDisabled()); await click('取消', deletion());
    await edit('a'); await dialog().getByRole('switch', { name: '启用此连接', exact: true }).click(); await save(); assert.equal(f.connections.get('a').enabled, false);
    await edit('a'); await dialog().getByRole('switch', { name: '启用此连接', exact: true }).click(); await save();
    f.references.a = []; f.unresolved.a = [{ scope: 'diary', id: 'broken', code: 'invalid_selection' }];
    await click(`删除：${f.connections.get('a').name}`); await deletion().getByText('0 项引用 · 1 项无法解析', { exact: true }).waitFor();
    assert(await deletion().getByRole('button', { name: '确认删除', exact: true }).isDisabled()); await click('取消', deletion());
    f.fail = 'references'; await click(`删除：${f.connections.get('a').name}`); await deletion().getByRole('alert').waitFor(); assert(await deletion().getByRole('button', { name: '确认删除', exact: true }).isDisabled()); await click('取消', deletion()); f.fail = null; f.unresolved.a = [];
    // Both CF modes remain fully editable; list badges hide the default transport.
    await edit('a'); await choose('Transport', 'Cloudflare REST'); await page.getByLabel('Gateway ID').fill('synthetic-gateway'); await save();
    assert.equal(f.connections.get('a').gateway_id, 'synthetic-gateway');
    await edit('a'); assert(await dialog().getByRole('button', { name: '获取远端模型', exact: true }).isDisabled());
    await choose('Transport', 'Cloudflare Anthropic'); await save();
    await edit('a'); f.revisions.a++; await click('显式清除 Key', dialog()); await confirm(); await click('已核对，继续编辑', dialog()); assert(f.keys.a);
    await click('显式清除 Key', dialog()); await confirm(); await dialog().getByRole('button', { name: '显式查看 Key', exact: true }).waitFor({ state: 'hidden' }); assert.equal(f.keys.a, ''); await click('取消', dialog());
    // Leaving the category while a copy reveal is pending must not write to clipboard.
    f.delayReveal = true; const copyCount = await page.evaluate(() => window.__fakeCopies.length);
    await click('复制 Key：合成连接 c'); await waitPending('pendingReveals'); await click('返回设置分类');
    for (const pending of f.pendingReveals.splice(0)) await pending.route.fulfill({ contentType: 'application/json', body: JSON.stringify({ secret: f.keys[pending.id] }) }).catch(() => {});
    await openAfterCategory(); assert.equal(await page.evaluate(() => window.__fakeCopies.length), copyCount);
    async function openAfterCategory() { await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: /^API 与连接/ }).click(); await row('a').waitFor(); }
    assert.equal(await panel().locator('[aria-expanded="true"]').count(), 0);
    await click('返回桌面'); await open(); await page.reload(); await open();
    assert(!f.requests.some(req => /migrate|feature-bindings|\/selections\//.test(req)));
    assert(!(await page.evaluate(() => JSON.stringify({ ...localStorage }))).includes('synthetic-new-key'));
    assert(!(await panel().textContent()).includes('private-synthetic-error-input'));
    assert.equal(new URL(page.url()).pathname, location);
    assert.deepEqual(escaped, []); assert.deepEqual(errors, []);
    return { layout, width, dark, passed: true, compactPanel: 'passed', dialogs: 'passed', credentials: 'passed', references: 'passed', probes: 'passed', discoveryAndIsolation: 'passed', pageErrors: errors.length };
  } finally { await context.close(); }
}
(async () => {
  fs.mkdirSync(output, { recursive: true }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try { const results = []; for (const layout of ['classic', 'editorial']) { for (const width of [320, 390, 1440]) results.push(await run(browser, origin, layout, width)); results.push(await run(browser, origin, layout, 1440, true)); }
    fs.writeFileSync(path.join(output, 'results-ui.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); server.closeAllConnections(); server.close(); process.exitCode = 1; });
