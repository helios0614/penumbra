/* Production build, isolated contexts, synthetic Registry only.
 * node tests/browser/settings-pr4b-smoke.cjs [playwright module] [Chromium executable]
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.argv[2] || 'playwright');
const output = process.env.SETTINGS_PR4B_OUTPUT || path.resolve(__dirname, '../../artifacts/settings-pr4b');
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
// Mock MCP discovery/test service. Only the Fake API invokes it; no remote host is contacted.
const mockMCP = {
  tools: [{ name: 'shared-tool', description: '<img src=x onerror=alert(1)> external text', inputSchema: { type: 'object', properties: { input: { type: 'string', description: '<script>unsafe</script>' } } } }, { name: 'new-tool', description: '新发现的工具', inputSchema: {} }],
  test(fail) { return { success: !fail, error: fail ? '连接失败' : null, tools: fail ? [] : this.tools }; },
};
const syntheticSecret = 'synthetic-only-token-777';
async function run(browser, origin, layout, width, dark = false, wallpaper = false) {
  const context = await browser.newContext({ viewport: { width, height: 850 }, colorScheme: dark ? 'dark' : 'light', ...(width < 768 ? { isMobile: true, hasTouch: true } : {}) });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = [], external = [], calls = [], writes = []; let version = 1, global = false, depth = 5, mode = '', cache = true, pending = null;
  const make = (name, extra = {}) => ({ name, displayName: '合成服务 ' + name, url: 'https://mock.invalid/sse', credentialMode: 'query_token', enabled: true, status: 'offline', lastConnected: 0, credential: { configured: true, masked: '••••', secret_ref: '' }, ...extra });
  let servers = [make('a'), make('b', { status: 'online', lastConnected: 1700000000 }), make('path', { credentialMode: 'path_segment', url: 'https://mock.invalid/base' }), make('ambiguous', { url: '', url_diagnostic: 'MCP URL is ambiguous', credentialMode: 'path_segment' }), make('off', { enabled: false, credential: { configured: false, masked: '', secret_ref: null } })];
  const disabled = { a: new Set(['new-tool']), b: new Set(), path: new Set(), ambiguous: new Set(), off: new Set() };
  const safe = () => servers.map(s => ({ ...s, credential: { ...s.credential, secret_ref: s.credential.configured ? `ref-${s.name}-${version}` : null } }));
  const tools = id => mockMCP.tools.map(t => ({ ...t, enabled: !disabled[id]?.has(t.name) }));
  const jsonTools = (route, id) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ server: id, tools: tools(id) }) }).catch(() => {});
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); external.push('unexpected external host'); return route.abort(); });
  await page.routeWebSocket(/.*/, ws => ws.close());
  await page.route('**/api/**', async route => {
    const req = route.request(), p = new URL(req.url()).pathname, method = req.method(), body = req.postData() ? req.postDataJSON() : {};
    calls.push(method + ' ' + p); if (method !== 'GET') writes.push({ path: p, method, body });
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value), headers: { 'Cache-Control': 'no-store' } }).catch(() => {});
    if (p === '/api/mcp/config') { if (method === 'PUT') { assert.deepEqual(Object.keys(body), ['enabled']); global = body.enabled; version++; return json({ ok: true }); } return json({ enabled: global, servers: {} }); }
    if (p === '/api/mcp/servers') {
      if (method === 'GET') return json(safe());
      assert.equal(method, 'POST'); assert.equal(body.enabled, false); const pathCredential = body.credential_mode === 'path_segment'; const configured = !!body.token || pathCredential; servers.push(make(body.name, { displayName: body.display_name, url: pathCredential ? body.url.slice(0, body.url.lastIndexOf('/') + 1) : body.url, enabled: body.enabled, credentialMode: body.credential_mode, credential: { configured, masked: configured ? '••••' : '', secret_ref: null } })); disabled[body.name] = new Set(); version++; return json({ ok: true });
    }
    if (p === '/api/mcp/secrets/reveal' || p === '/api/mcp/secrets/clear') {
      if (mode === 'stale') { mode = ''; version++; return json({ detail: 'Secret reference is invalid or stale' }, 422); }
      const s = safe().find(s => s.credential.secret_ref === body.secret_ref); if (!s) return json({ detail: 'Secret reference is invalid or stale' }, 422);
      if (p.endsWith('/reveal')) return json({ secret: s.name === 'path' ? 'https://mock.invalid/base/' + syntheticSecret : syntheticSecret });
      if (s.url_diagnostic) return json({ detail: 'MCP URL is ambiguous; replace endpoint explicitly' }, 422);
      servers.find(item => item.name === s.name).credential = { configured: false, masked: '', secret_ref: null }; version++; return json({ ok: true });
    }
    const match = p.match(/^\/api\/mcp\/servers\/([^/]+)(?:\/(tools|test))?$/);
    if (match) {
      const id = decodeURIComponent(match[1]), operation = match[2], s = servers.find(s => s.name === id);
      if (operation === 'test') { assert(!(body.token && body.secret_ref)); return json(mockMCP.test(mode === 'test-fail')); }
      if (!s) return json({ detail: 'MCP Server 不存在' }, 404);
      if (operation === 'tools') {
        if (method === 'GET') { if (!s.enabled) return json({ detail: '服务器未启用' }, 400); if (mode === 'late' && id === 'a') { pending = route; return; } if (!cache) return json({ detail: '工具列表暂不可用，请稍后重试' }, 503); return jsonTools(route, id); }
        assert.deepEqual(Object.keys(body).sort(), ['enabled', 'name']);
        if (mode === 'topology') { mode = ''; return json({ detail: { code: 'topology_changed' } }, 409); }
        if (body.enabled) disabled[id].delete(body.name); else disabled[id].add(body.name); version++; return json({ ok: true, ...body });
      }
      if (method === 'DELETE') { servers = servers.filter(s => s.name !== id); version++; return json({ ok: true }); }
      assert.equal(method, 'PUT'); if (mode === 'save-fail') { mode = ''; return json({ detail: 'unsafe-private-raw' }, 503); }
      assert(!body.token || body.secret_ref, 'replacement must include current ref');
      if (body.secret_ref && body.secret_ref !== safe().find(s => s.name === id).credential.secret_ref) return json({ detail: 'Secret reference is invalid or stale' }, 422);
      s.displayName = body.display_name; s.url = body.url; s.enabled = body.enabled; if (body.credential_mode) s.credentialMode = body.credential_mode; version++; return json({ ok: true });
    }
    if (p === '/api/settings') { if (method === 'PUT') { assert.deepEqual(Object.keys(body), ['mcp_max_chain_depth']); depth = body.mcp_max_chain_depth; return json({ ok: true }); } return json({ mcp_max_chain_depth: depth, unrelated: 'keep' }); }
    assert.equal(method, 'GET', 'unexpected business write');
    if (p === '/api/session') return json({ authenticated: true }); if (p === '/api/chat/readiness') return json({ ready: true, reason_code: 'ready' }); if (p === '/api/conversations') return json([]); return json({});
  });
  const click = (name, scope = page) => scope.getByRole('button', { name, exact: true }).first().click();
  const card = id => page.locator(`[data-mcp-server="${id}"]`), dlg = name => page.getByRole('dialog', { name, exact: true });
  const enter = async () => { await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: /^MCP 服务/ }).click(); await card('a').waitFor(); };
  const expand = async id => { await click('详情 合成服务 ' + id); };
  const bounds = async () => { const result = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, dialogs: [...document.querySelectorAll('[data-slot="dialog-content"]')].map(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }) })); assert(result.scroll <= result.width + 1, 'page overflow'); for (const r of result.dialogs) { assert(r.left >= -1 && r.right <= result.width + 1, 'dialog horizontal overflow'); assert(r.top >= -1 && r.bottom <= 851, 'dialog vertical overflow'); } };
  try {
    await page.goto(origin + `/penumbra/${layout === 'editorial' ? 'editorial' : ''}`);
    if (wallpaper) {
      await page.evaluate(async () => {
        localStorage.setItem('penumbra-wallpaper-settings', JSON.stringify({ mode: 'custom', fit: 'cover', position: 'center', shade: 'soft', textTone: 'light' }));
        const db = await new Promise((resolve, reject) => { const r = indexedDB.open('penumbra-preferences', 1); r.onupgradeneeded = () => r.result.createObjectStore('wallpapers'); r.onsuccess = () => resolve(r.result); r.onerror = reject; });
        await new Promise((resolve, reject) => { const t = db.transaction('wallpapers', 'readwrite'); t.objectStore('wallpapers').put(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="500" height="900"><rect fill="#7d9b80" width="500" height="900"/></svg>'], { type: 'image/svg+xml' }), 'desktop'); t.oncomplete = resolve; t.onerror = reject; }); db.close();
      }); await page.reload();
    }
    await page.getByRole('button', { name: '打开设置', exact: true }).last().click(); await enter();
    assert.equal(calls.filter(s => s.endsWith('/tools')).length, 0); assert.equal(calls.filter(s => s.endsWith('/reveal')).length, 0);
    assert((await card('a').textContent()).includes('尚未验证')); assert((await card('b').textContent()).includes('最近验证成功'));
    assert.equal(await page.getByRole('link', { name: '旧版 MCP 管理', exact: true }).getAttribute('href'), '/mcp');
    const savedServers = structuredClone(servers); await page.getByRole('switch', { name: '全局启用 MCP', exact: true }).click(); assert(global); assert.deepEqual(servers, savedServers); await page.getByRole('switch', { name: '全局启用 MCP', exact: true }).click(); assert(!global); assert.deepEqual(servers, savedServers);
    await expand('a'); await bounds(); await page.screenshot({ path: path.join(output, `${layout}-${width}-panel.png`), animations: 'disabled' });
    await click('查看凭据', card('a')); await card('a').getByText(syntheticSecret, { exact: true }).waitFor(); await click('复制凭据', card('a')); assert.equal(await page.evaluate(() => navigator.clipboard.readText()), syntheticSecret); await click('隐藏凭据', card('a')); assert(!(await page.locator('body').textContent()).includes(syntheticSecret));
    await click('查看凭据', card('a')); await card('a').getByText(syntheticSecret, { exact: true }).waitFor(); await expand('a'); await expand('a'); assert(!(await card('a').textContent()).includes(syntheticSecret));
    await click('查看凭据', card('a')); await card('a').getByText(syntheticSecret, { exact: true }).waitFor(); await click('返回设置分类'); await enter(); await expand('a'); assert(!(await card('a').textContent()).includes(syntheticSecret));
    mode = 'stale'; const revealCount = calls.filter(s => s.endsWith('/reveal')).length; await click('查看凭据', card('a')); await card('a').getByText('凭据引用已过期，请核对刷新后的状态，再次确认操作。', { exact: true }).waitFor(); assert.equal(calls.filter(s => s.endsWith('/reveal')).length, revealCount + 1); await click('查看凭据', card('a')); await card('a').getByText(syntheticSecret, { exact: true }).waitFor(); await click('隐藏凭据', card('a'));
    await expand('path'); await click('查看凭据', card('path')); await card('path').getByText('完整私有 Endpoint（历史内嵌凭据）', { exact: true }).waitFor(); await click('编辑', card('path')); await dlg('编辑 MCP 服务器').waitFor(); assert.equal(await dlg('编辑 MCP 服务器').getByLabel('完整 Endpoint', { exact: true }).inputValue(), ''); assert(!(await dlg('编辑 MCP 服务器').textContent()).includes(syntheticSecret)); await bounds(); await click('取消', dlg('编辑 MCP 服务器'));
    await expand('ambiguous'); assert((await card('ambiguous').textContent()).includes('地址已安全隐藏')); await click('清除凭据', card('ambiguous')); assert(await dlg('清除 MCP 凭据').getByRole('button', { name: '确认清除凭据', exact: true }).isDisabled()); await click('取消', dlg('清除 MCP 凭据'));
    await expand('a'); await click('管理工具', card('a')); await card('a').getByText('shared-tool', { exact: true }).waitFor(); assert((await card('a').textContent()).includes('已启用 1 / 共 2 项')); assert.equal(await card('a').locator('img,script').count(), 0);
    await card('a').getByText('输入 Schema', { exact: true }).first().click(); assert((await card('a').locator('pre').first().textContent()).includes('<script>'));
    const beforeToolReads = calls.filter(s => s.endsWith('/tools') && s.startsWith('GET')).length;
    await card('a').getByRole('switch', { name: '启用工具 shared-tool', exact: true }).click(); await page.waitForFunction(() => document.querySelector('[data-mcp-server="a"]').textContent.includes('已启用 0 / 共 2 项')); assert(disabled.a.has('new-tool')); assert.equal(calls.filter(s => s.endsWith('/tools') && s.startsWith('GET')).length, beforeToolReads);
    mode = 'topology'; await card('a').getByRole('switch', { name: '启用工具 shared-tool', exact: true }).click(); await card('a').getByRole('button', { name: '已核对工具，继续操作', exact: true }).waitFor(); await click('已核对工具，继续操作', card('a'));
    await expand('b'); await click('管理工具', card('b')); await card('b').getByText('shared-tool', { exact: true }).waitFor(); assert.equal(await card('b').getByRole('switch', { name: '启用工具 shared-tool', exact: true }).getAttribute('aria-checked'), 'true');
    await expand('off'); await click('管理工具', card('off')); await card('off').getByRole('alert').waitFor(); assert((await card('off').textContent()).includes('HTTP 400'));
    cache = false; await expand('b'); await click('刷新工具列表', card('b')); await card('b').getByRole('alert').waitFor(); assert((await card('b').textContent()).includes('HTTP 503')); cache = true; await click('刷新工具列表', card('b')); await card('b').getByText('shared-tool', { exact: true }).waitFor();
    await expand('a'); await card('a').getByText('shared-tool', { exact: true }).waitFor(); mode = 'late'; await click('刷新工具列表', card('a')); for (let i = 0; !pending && i < 50; i++) await page.waitForTimeout(20); assert(pending); await expand('b'); mode = ''; await jsonTools(pending, 'a'); pending = null; assert(!await card('b').getByText('合成服务 a', { exact: true }).count());
    await click('测试连接', card('b')); await dlg('连接测试结果').getByText('测试成功', { exact: true }).waitFor(); await click('关闭', dlg('连接测试结果')); assert.equal(await dlg('连接测试结果').count(), 0);
    await expand('a'); await click('编辑', card('a')); let editor = dlg('编辑 MCP 服务器'); assert(await editor.getByLabel('Server ID', { exact: true }).isDisabled()); await editor.getByLabel('显示名称', { exact: true }).fill('合成服务 a'); await editor.getByLabel('新 Token', { exact: true }).fill('synthetic-replacement'); await bounds(); await page.screenshot({ path: path.join(output, `${layout}-${width}-editor.png`), animations: 'disabled' });
    mode = 'test-fail'; const beforeTestWrites = writes.filter(w => w.path === '/api/mcp/servers' || /^\/api\/mcp\/servers\/[^/]+$/.test(w.path)).length; await click('测试草稿', editor); await dlg('连接测试结果').getByText('测试失败', { exact: true }).waitFor(); await click('关闭', dlg('连接测试结果')); assert.equal(writes.filter(w => w.path === '/api/mcp/servers' || /^\/api\/mcp\/servers\/[^/]+$/.test(w.path)).length, beforeTestWrites); mode = '';
    await click('保存服务器', editor); await editor.waitFor({ state: 'hidden' }); assert.equal(writes.at(-1).body.token, 'synthetic-replacement');
    await expand('a'); await click('编辑', card('a')); editor = dlg('编辑 MCP 服务器'); await editor.getByLabel('显示名称', { exact: true }).fill('保留的失败草稿'); mode = 'save-fail'; await click('保存服务器', editor); await editor.getByRole('alert').waitFor(); assert.equal(await editor.getByLabel('显示名称', { exact: true }).inputValue(), '保留的失败草稿'); await click('重新读取当前状态', editor); await click('已核对，继续编辑', editor); await editor.getByLabel('显示名称', { exact: true }).fill('合成服务 a'); await click('保存服务器', editor); await editor.waitFor({ state: 'hidden' }); assert(!('token' in writes.at(-1).body)); assert(!('credential_mode' in writes.at(-1).body));
    await click('新增服务器'); editor = dlg('新增 MCP 服务器'); await editor.getByLabel('Server ID', { exact: true }).fill('created'); await editor.getByLabel('显示名称', { exact: true }).fill('合成服务 created'); await editor.getByRole('combobox', { name: '凭据模式', exact: true }).click(); await page.getByRole('option', { name: 'Path Segment', exact: true }).click(); await editor.getByLabel('完整 Endpoint', { exact: true }).fill('https://mock.invalid/base/synthetic-new-path'); const createdBefore = servers.length; await click('测试草稿', editor); await dlg('连接测试结果').getByText('测试成功', { exact: true }).waitFor(); await click('关闭', dlg('连接测试结果')); assert.equal(servers.length, createdBefore); assert(writes.at(-1).path.includes('__penumbra_draft_')); await click('保存服务器', editor); await editor.waitFor({ state: 'hidden' }); await card('created').waitFor(); assert.equal(servers.find(s => s.name === 'created').enabled, false); assert.equal(servers.find(s => s.name === 'created').url, 'https://mock.invalid/base/'); assert(!(await card('created').textContent()).includes('synthetic-new-path'));
    await page.getByRole('switch', { name: '启用服务器 合成服务 created', exact: true }).click(); await page.waitForFunction(() => document.querySelector('[data-mcp-server="created"] [role="switch"]').getAttribute('aria-checked') === 'true'); await page.getByRole('switch', { name: '启用服务器 合成服务 created', exact: true }).click();
    await expand('a'); await click('清除凭据', card('a')); const clearBefore = writes.length; await click('取消', dlg('清除 MCP 凭据')); assert.equal(writes.length, clearBefore); await expand('a'); await click('清除凭据', card('a')); await click('确认清除凭据', dlg('清除 MCP 凭据')); await dlg('清除 MCP 凭据').waitFor({ state: 'hidden' }); assert(servers.some(s => s.name === 'a')); assert.equal(servers.find(s => s.name === 'a').url, 'https://mock.invalid/sse'); assert(!servers.find(s => s.name === 'a').credential.configured);
    await expand('created'); await click('删除', card('created')); await click('确认删除服务器', dlg('删除 MCP 服务器')); await card('created').waitFor({ state: 'hidden' });
    await page.getByRole('region', { name: 'MCP 服务器列表', exact: true }).getByText('高级设置', { exact: true }).click(); const number = page.getByLabel('最大链式追加深度', { exact: true }); assert.equal(await number.inputValue(), '5');
    for (const value of ['0', '20']) { await number.fill(value); await click('保存高级设置'); await page.getByText('已保存并重新读取核对。', { exact: true }).waitFor(); assert.equal(depth, Number(value)); }
    for (const value of ['21', '-1', '1.5']) { await number.fill(value); assert(await page.getByRole('button', { name: '保存高级设置', exact: true }).isDisabled()); }
    await bounds(); assert(!global); await page.goBack(); await enter(); await page.reload(); await card('a').waitFor();
    const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })); assert(!storage.includes(syntheticSecret)); assert(!storage.includes('synthetic-replacement')); assert.deepEqual(errors, []); assert.deepEqual(external, []);
    return { layout, width, dark, wallpaper, passed: true, requests: calls.length, writes: writes.length, external: external.length, errors: errors.length };
  } finally { await context.close(); }
}
(async () => {
  fs.mkdirSync(output, { recursive: true }); await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try { const results = [], origin = `http://127.0.0.1:${server.address().port}`;
    for (const layout of (process.env.SETTINGS_PR4B_QUICK ? ['classic'] : ['classic', 'editorial'])) for (const width of (process.env.SETTINGS_PR4B_QUICK ? [320] : [320, 390, 1440])) results.push(await run(browser, origin, layout, width, width === 390));
    if (!process.env.SETTINGS_PR4B_QUICK) results.push(await run(browser, origin, 'classic', 390, true, true));
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(done => server.close(done)); }
})().catch(error => { console.error(error); server.closeAllConnections(); server.close(); process.exitCode = 1; });
