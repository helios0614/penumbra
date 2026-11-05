/* Production build, isolated contexts, synthetic Registry only.
 * node tests/browser/settings-resources-smoke.cjs [playwright module] [Chromium executable]
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.argv[2] || 'playwright');
const output = process.env.SETTINGS_RESOURCES_OUTPUT || path.resolve(__dirname, '../../artifacts/settings-resources');
const root = path.resolve(__dirname, '../../dist');
const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://localhost').pathname;
  if (!p.startsWith('/penumbra/')) { res.writeHead(404); return res.end(); }
  const relative = p.slice('/penumbra/'.length);
  const file = path.resolve(root, relative.startsWith('assets/') ? relative : 'index.html');
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
// Synthetic Registry and MCP fixtures only. No real backend or credential source.
async function run(browser, origin, layout, width, dark, wallpaper = false) {
  const context = await browser.newContext({ viewport: { width, height: 850 }, colorScheme: dark ? 'dark' : 'light' });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const errors = [], external = [], calls = [], writes = []; let passwordWarnings = 0;
  const longName = '合成的超长资源名称'.repeat(24), longURL = 'https://synthetic.invalid/' + 'long/public/path/'.repeat(30);
  let apiConfigured = true, mcpConfigured = true, global = false;
  const secret = 'synthetic-resource-secret';
  const credential = (configured, ref) => ({ configured, masked: configured ? '••••1234' : '', secret_ref: configured ? ref : null });
  const connection = (id, extra = {}) => ({ id, name: '合成连接 ' + id, base_url: 'https://synthetic.invalid/v1', enabled: true, transport: 'direct', gateway_id: null, default_model: 'literal/model', credential: credential(id === 'a' ? apiConfigured : true, 'api-ref'), ...extra });
  const apiList = () => [connection('a'), connection('cf', { transport: 'cloudflare_rest', gateway_id: 'synthetic-gateway' }), connection('anthropic', { transport: 'cloudflare_anthropic', gateway_id: 'synthetic-anthropic' }), connection('long', { name: longName, base_url: longURL })];
  const server = (name, extra = {}) => ({ name, displayName: '合成服务 ' + name, url: 'https://synthetic.invalid/sse', enabled: true, status: 'online', lastConnected: 1700000000, credentialMode: 'query_token', credential: credential(mcpConfigured, 'mcp-ref'), ...extra });
  const mcpList = () => [server('a'), server('long', { displayName: longName, url: longURL })];
  await context.addInitScript(() => { window.__copies = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copies.push(value); } } }); });
  page.on('pageerror', error => errors.push(error.message)); page.on('console', msg => { if (msg.text().includes('Password field is not contained in a form')) passwordWarnings++; });
  await context.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); external.push('external-request'); return route.abort(); });
  await page.routeWebSocket(/.*/, ws => ws.close());
  await page.route('**/api/**', route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname, method = req.method(), body = req.postData() ? req.postDataJSON() : {};
    calls.push(method + ' ' + p); if (method !== 'GET') writes.push({ p, method, body });
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (p === '/api/registry/connections') return json({ schema_version: 2, authority_state: 'persisted_v2', migration_required: false, connections: apiList(), diagnostics: [], deferred_usages: [] });
    const api = p.match(/^\/api\/registry\/connections\/([^/]+)(.*)$/);
    if (api) {
      const id = decodeURIComponent(api[1]), action = api[2], c = apiList().find(c => c.id === id); assert(c);
      if (action === '/references') return json({ references: [], unresolved: [] });
      if (action === '/credential/reveal') { assert.equal(body.secret_ref, 'api-ref'); return json({ secret }); }
      if (action === '/credential/clear') { assert.equal(body.secret_ref, 'api-ref'); apiConfigured = false; return json(apiList().find(c => c.id === id)); }
      if (action === '/test') return json({ ok: true, ...body, content: 'synthetic-test-output', input_tokens: 1, output_tokens: 1, test_type: 'basic_nonstream', validates_full_chat: false });
      assert.equal(action, ''); assert.equal(method, 'GET'); return json(c);
    }
    if (p === '/api/mcp/config') { if (method === 'PUT') { global = body.enabled; return json({ ok: true }); } return json({ enabled: global, servers: {} }); }
    if (p === '/api/mcp/servers') return json(mcpList());
    if (p === '/api/mcp/secrets/reveal') { assert.equal(body.secret_ref, 'mcp-ref'); return json({ secret }); }
    if (p === '/api/mcp/secrets/clear') { assert.equal(body.secret_ref, 'mcp-ref'); mcpConfigured = false; return json({ ok: true }); }
    if (/\/api\/mcp\/servers\/a\/test$/.test(p)) return json({ success: true, tools: [{}] });
    if (/\/api\/mcp\/servers\/a\/tools$/.test(p)) return json({ server: 'a', tools: [{ name: 'synthetic-tool', description: 'Synthetic tool', inputSchema: {}, enabled: true }] });
    if (p === '/api/settings') return json({ mcp_max_chain_depth: 5 });
    assert.equal(method, 'GET', 'unexpected write ' + p);
    if (p === '/api/session') return json({ authenticated: true }); if (p === '/api/conversations') return json([]); return json({ ready: true, reason_code: 'ready' });
  });
  const click = (name, scope = page) => scope.getByRole('button', { name, exact: true }).first().click();
  const row = id => page.locator(`[data-connection-id="${id}"]`), mcp = id => page.locator(`[data-mcp-server="${id}"]`), dlg = name => page.getByRole('dialog', { name, exact: true });
  const category = async name => { const nav = page.getByRole('navigation', { name: '设置分类' }); if (!await nav.isVisible()) await click('返回设置分类'); await nav.getByRole('button', { name: new RegExp('^' + name) }).click(); };
  const bounds = async () => {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    for (const details of await page.locator('[data-resource-details]').all()) assert(await details.evaluate(el => { const css = getComputedStyle(el); return css.backgroundColor === 'rgba(0, 0, 0, 0)' && css.boxShadow === 'none' && parseFloat(css.borderRadius) === 0 && el.scrollWidth <= el.clientWidth + 1; }));
    for (const button of await page.locator('[data-resource-details] button').all()) assert(await button.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && el.scrollWidth <= el.clientWidth + 1; }));
  };
  const checkIcons = async scope => {
    const credential = scope.locator('[data-resource-field="凭据"]');
    assert.equal(await credential.locator('button').count(), 2);
    assert(await credential.locator('button').evaluateAll(nodes => nodes.every(el => el.innerText.trim() === '' && !!el.getAttribute('aria-label') && !!el.title && el.getBoundingClientRect().width === 28 && el.querySelector('svg').getBoundingClientRect().width === 14)));
    assert(await credential.locator('[role="group"]').evaluate(el => getComputedStyle(el).columnGap === '6px'));
    assert((await credential.locator('button').first().getAttribute('aria-label')).startsWith('查看'));
    assert(await credential.evaluate(el => { const value = el.querySelector('[data-resource-field-value]'), actions = el.querySelector('[data-resource-field-actions]'); return actions.getBoundingClientRect().top >= value.getBoundingClientRect().bottom + 1.9 && Math.abs(actions.getBoundingClientRect().right - el.querySelector('[role="group"]').getBoundingClientRect().right) < 1; }), 'credential icons occupy a separate, right-aligned line below the mask');
  };
  const checkForm = async dialog => {
    await page.waitForTimeout(150);
    assert(await dialog.locator('input[type="password"]').evaluateAll(nodes => nodes.length > 0 && nodes.every(el => !!el.closest('form') && el.type === 'password')));
    assert(await dialog.locator('form button').evaluateAll(nodes => nodes.every(el => el.type === 'button')));
    assert(await dialog.locator('input').evaluateAll(nodes => nodes.filter(el => el.closest('label')).every(el => { const label = el.closest('label'); const text = label.querySelector('span'); return !text || el.getBoundingClientRect().top - text.getBoundingClientRect().bottom >= 7.9; })));
    const before = writes.length;
    assert(await dialog.locator('form').evaluate(el => !el.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))));
    await dialog.getByRole('textbox').first().press('Enter'); await page.waitForTimeout(80); assert.equal(writes.length, before, 'Enter must not submit an editor');
  };
  const metrics = scope => scope.locator('[data-resource-heading]').evaluate(el => {
    const css = getComputedStyle(el), title = el.querySelector('[data-resource-title]'), arrow = el.querySelector('[data-resource-chevron]'), controls = el.querySelector('[data-resource-controls]');
    return { padding: css.paddingLeft, minHeight: css.minHeight, titleSize: getComputedStyle(title).fontSize, weight: getComputedStyle(title).fontWeight, arrowTitleOffset: Math.round(arrow.getBoundingClientRect().y + arrow.getBoundingClientRect().height / 2 - title.getBoundingClientRect().y - title.getBoundingClientRect().height / 2), arrowSize: arrow.getBoundingClientRect().width, arrowX: arrow.getBoundingClientRect().x - el.getBoundingClientRect().x, controls: controls.getBoundingClientRect().width, statusSize: getComputedStyle(el.querySelector('[data-resource-status]')).fontSize };
  });
  try {
    await page.goto(origin + `/penumbra/${layout === 'editorial' ? 'editorial' : ''}`);
    if (wallpaper) { await page.evaluate(async () => {
      localStorage.setItem('penumbra-wallpaper-settings', JSON.stringify({ mode: 'custom', fit: 'cover', position: 'center', shade: 'soft', textTone: 'light' }));
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open('penumbra-preferences', 1); r.onupgradeneeded = () => r.result.createObjectStore('wallpapers'); r.onsuccess = () => resolve(r.result); r.onerror = reject; });
      await new Promise((resolve, reject) => { const tx = db.transaction('wallpapers', 'readwrite'); tx.objectStore('wallpapers').put(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect fill="#8da296" width="600" height="900"/></svg>'], { type: 'image/svg+xml' }), 'desktop'); tx.oncomplete = resolve; tx.onerror = reject; }); db.close();
    }); await page.reload(); }
    await page.getByRole('button', { name: '打开设置', exact: true }).last().click(); await category('API 与连接'); await row('a').waitFor();
    assert.equal(await page.getByRole('region', { name: '连接管理面板', exact: true }).getByRole('switch').count(), 0);
    assert(await row('a').evaluate(el => el.getBoundingClientRect().height <= 49)); const apiMetrics = await metrics(row('a')); assert.equal(apiMetrics.arrowTitleOffset, 0, 'arrows align with the first title line');
    await row('a').locator('[aria-controls]').focus(); await page.keyboard.press('Enter'); await row('a').locator('[data-resource-details]').waitFor();
    assert.equal(await row('a').locator('[data-resource-field="API 地址"] dd').textContent(), 'https://synthetic.invalid/v1'); assert.equal(await row('a').locator('[data-resource-field="接入方式"]').count(), 0); await checkIcons(row('a'));
    await click('复制：合成连接 a'); await page.waitForFunction(() => window.__copies.length === 1); assert.equal(await page.evaluate(() => window.__copies[0]), secret);
    assert(!(await row('a').textContent()).includes(secret)); await click('查看：合成连接 a'); await row('a').getByLabel('临时 Key 明文').waitFor(); await click('隐藏：合成连接 a'); assert.equal(await row('a').getByLabel('临时 Key 明文').count(), 0);
    await bounds(); await page.screenshot({ path: path.join(output, `${layout}-${width}-api.png`), animations: 'disabled' });
    await click('测试：合成连接 a'); await dlg('测试连接').getByRole('button', { name: '发送', exact: true }).waitFor(); await click('发送', dlg('测试连接')); await dlg('测试连接').getByText('synthetic-test-output', { exact: true }).waitFor(); await click('关闭', dlg('测试连接'));
    await click('展开连接：合成连接 cf'); assert.equal(await row('cf').locator('[data-resource-field="接入方式"] dd').textContent(), 'Cloudflare REST'); assert.equal(await row('cf').locator('[data-resource-field="Gateway ID"] dd').textContent(), 'synthetic-gateway');
    await click('展开连接：合成连接 anthropic'); assert.equal(await row('anthropic').locator('[data-resource-field="接入方式"] dd').textContent(), 'Cloudflare Anthropic');
    await click('展开连接：' + longName); assert.equal(await row('long').locator('[data-resource-field="API 地址"] dd').textContent(), longURL.replace(/\/$/, '')); await bounds(); await page.screenshot({ path: path.join(output, `${layout}-${width}-api-long.png`), animations: 'disabled' });
    await click('编辑：合成连接 a'); await dlg('编辑连接').getByLabel('连接名称', { exact: true }).waitFor(); await checkForm(dlg('编辑连接')); await click('显式清除 Key', dlg('编辑连接')); await click('确认操作', dlg('编辑连接')); await dlg('编辑连接').getByText('操作已保存并读回。已有绑定和模型选择未修改。', { exact: true }).waitFor(); assert(!apiConfigured); await click('取消', dlg('编辑连接'));
    await page.waitForTimeout(150); assert.equal(await row('a').getByRole('button', { name: '编辑：合成连接 a', exact: true }).evaluate(el => el === document.activeElement), true);
    await click('展开连接：合成连接 a'); assert((await row('a').textContent()).includes('未配置')); assert(await row('a').getByRole('button', { name: '复制：合成连接 a', exact: true }).isDisabled());
    await category('MCP 服务'); await mcp('a').waitFor(); assert.deepEqual(await metrics(mcp('a')), apiMetrics, 'resource header geometry and type must match');
    await click('详情 合成服务 a'); assert((await mcp('a').locator('[data-resource-field="验证状态"]').textContent()).includes('上次验证成功')); assert((await mcp('a').textContent()).includes('查询参数')); await checkIcons(mcp('a'));
    const mcpActionStyle = await mcp('a').getByRole('button', { name: '编辑', exact: true }).evaluate(el => ({ icon: el.querySelector('svg').getBoundingClientRect().width, gap: getComputedStyle(el).columnGap, font: getComputedStyle(el).fontSize })); assert.deepEqual(mcpActionStyle, { icon: 16, gap: '6px', font: '12px' });
    await bounds(); await page.screenshot({ path: path.join(output, `${layout}-${width}-mcp.png`), animations: 'disabled' });
    await click('编辑', mcp('a')); await dlg('编辑 MCP 服务器').waitFor(); await checkForm(dlg('编辑 MCP 服务器')); await click('取消', dlg('编辑 MCP 服务器')); await click('详情 合成服务 a');
    await click('查看凭据', mcp('a')); await mcp('a').getByText(secret, { exact: true }).waitFor(); await click('复制凭据', mcp('a')); await page.waitForFunction(() => window.__copies.length === 2); await click('隐藏凭据', mcp('a'));
    await click('测试连接', mcp('a')); await dlg('连接测试结果').getByText('测试成功', { exact: true }).waitFor(); await click('关闭', dlg('连接测试结果')); await click('详情 合成服务 a');
    await click('管理工具', mcp('a')); await dlg('工具管理').getByText('synthetic-tool', { exact: true }).waitFor(); await click('关闭工具管理', dlg('工具管理'));
    await click('清除凭据', mcp('a')); await click('确认清除凭据', dlg('清除 MCP 凭据')); await dlg('清除 MCP 凭据').waitFor({ state: 'hidden' }); assert(!mcpConfigured); assert(!global);
    await click('详情 ' + longName); assert.equal(await mcp('long').locator('[data-resource-field="公开 URL"] dd').textContent(), longURL); await bounds(); await page.screenshot({ path: path.join(output, `${layout}-${width}-mcp-long.png`), animations: 'disabled' });
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })); assert(!storage.includes(secret)); assert.equal(passwordWarnings, 0); assert.deepEqual(errors, []); assert.deepEqual(external, []);
    return { layout, width, dark, wallpaper, passed: true, requests: calls.length, writes: writes.length, pageErrors: errors.length };
  } finally { await context.close(); }
}
(async () => {
  fs.mkdirSync(output, { recursive: true }); await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try { const results = [], origin = `http://127.0.0.1:${server.address().port}`;
    for (const layout of (process.env.SETTINGS_RESOURCES_QUICK ? ['classic'] : ['classic', 'editorial'])) for (const width of (process.env.SETTINGS_RESOURCES_QUICK ? [320] : [320, 390, 1440])) results.push(await run(browser, origin, layout, width, width === 390));
    if (!process.env.SETTINGS_RESOURCES_QUICK) results.push(await run(browser, origin, 'classic', 390, true, true));
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(done => server.close(done)); }
})().catch(error => { console.error(error); server.closeAllConnections(); server.close(); process.exitCode = 1; });
