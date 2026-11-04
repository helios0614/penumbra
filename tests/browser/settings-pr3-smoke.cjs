/* Production build, isolated contexts, synthetic Registry only.
 * node tests/browser/settings-pr3-smoke.cjs [playwright module] [Chromium executable]
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.argv[2] || 'playwright');
const output = process.env.SETTINGS_PR3_OUTPUT || path.resolve(__dirname, '../../artifacts/settings-pr3');
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
const O = 'openai_chat_completions', A = 'anthropic_messages', M = 'minimax_chatcompletion_v2';
const usages = ['main_chat', 'memory_sentinel', 'memory_digest', 'web_compression', 'quick_note_compression', 'camera_sentinel', 'location_sentinel', 'book_annotation', 'game_decision'];
const names = ['新对话默认模型', '记忆哨兵', '日记总结（Memory Digest）', '网页内容压缩', '速记压缩', '摄像头哨兵', '位置哨兵', '书籍批注', '游戏决策'];
const connection = (id, extra = {}) => ({ id, name: '合成连接 ' + id, base_url: 'https://synthetic.invalid', transport: 'direct', gateway_id: null,
  enabled: true, default_model: 'suggestion/' + id, credential: { configured: true, masked: '••••1234', secret_ref: 'synthetic-ref-' + id }, ...extra });

async function run(browser, origin, layout, width, dark, wallpaper = false) {
  const selectLayout = process.env.SETTINGS_PR3_VARIANT === 'select';
  const touch = selectLayout && width < 768;
  const context = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: dark ? 'dark' : 'light', ...(touch ? { isMobile: true, hasTouch: true } : {}) });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const errors = [], external = [], requests = [], writes = [], pending = [];
  let mode = '', reads = 0;
  const connections = [connection('a'), connection('b'), connection('disabled', { enabled: false }), connection('nokey', { credential: { configured: false, masked: '', secret_ref: null } })];
  if (selectLayout) connections.push(...Array.from({ length: 26 }, (_, i) => connection('extra-' + i, i === 25 ? { name: '合成超长连接名称'.repeat(24) } : {})));
  const features = usages.map((usage, i) => ({ usage, selection: { connection_id: 'a', protocol: A, model: 'literal/' + usage }, diagnostic: null,
    allowed_protocols: [1, 3].includes(i) ? [O] : [5, 6].includes(i) ? [O, A, M] : [O, A],
    lifecycle: [0, 8].includes(i) ? 'new_session_default' : i === 7 ? 'request_default' : 'feature' }));
  features[1].selection = null; features[1].diagnostic = 'feature_binding_required';
  features[2].selection.connection_id = 'disabled'; features[2].diagnostic = 'disabled_profile';
  features[3].selection.connection_id = 'nokey'; features[3].selection.protocol = O; features[3].diagnostic = 'missing_credential';
  features[4].selection.connection_id = 'missing /?连接'; features[4].diagnostic = 'missing_profile';
  features[5].selection.protocol = 'historical_protocol'; features[5].diagnostic = 'incompatible_protocol';
  features[6].diagnostic = 'invalid_feature_binding';
  if (selectLayout) features[0].selection.connection_id = 'extra-8';
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); external.push(route.request().url()); return route.abort(); });
  await page.routeWebSocket(/.*/, socket => socket.close());
  await page.route('**/api/**', async route => {
    const req = route.request(), p = new URL(req.url()).pathname, method = req.method(); requests.push(method + ' ' + p);
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) }).catch(() => {});
    if (p === '/api/registry/feature-bindings') {
      reads++; if (mode === 'read-fail') return json({ detail: { code: 'invalid_registry_configuration' } }, 503);
      if (mode === 'late-read') { pending.push({ route, features: JSON.parse(JSON.stringify(features)) }); return; }
      return json({ features: [...features, { usage: 'camera_core', selection: null }] });
    }
    if (p === '/api/registry/connections') { assert.equal(method, 'GET'); return json({ schema_version: 2, authority_state: 'persisted_v2', migration_required: false, connections,
      diagnostics: [], deferred_usages: [], feature_bindings: [{ usage: 'main_chat', connection_id: 'wrong-snapshot' }] }); }
    if (p.startsWith('/api/registry/feature-bindings/')) {
      const usage = decodeURIComponent(p.slice('/api/registry/feature-bindings/'.length)); const feature = features.find(item => item.usage === usage); assert(feature);
      assert(['PUT', 'DELETE'].includes(method)); writes.push({ usage, method, body: req.postData() ? req.postDataJSON() : null });
      if (mode === 'write-fail') { mode = ''; return json({ detail: { code: 'persistence_failed' } }, 503); }
      if (method === 'PUT') { const body = req.postDataJSON(); assert.deepEqual(Object.keys(body).sort(), ['connection_id', 'model', 'protocol']);
        assert(feature.allowed_protocols.includes(body.protocol)); feature.selection = body; feature.diagnostic = null;
      } else { feature.selection = null; feature.diagnostic = 'feature_binding_required'; }
      if (mode === 'unknown') { mode = ''; return route.abort('failed'); }
      if (mode === 'read-after-write-fail') mode = 'read-fail';
      return json(method === 'PUT' ? { usage, ...feature.selection } : { ok: true });
    }
    assert(!p.startsWith('/api/registry/'), 'unexpected Registry API: ' + p);
    assert.equal(method, 'GET', 'unexpected business mutation: ' + p);
    if (p === '/api/session') return json({ authenticated: true });
    if (p === '/api/chat/readiness') return json({ ready: true, reason_code: 'ready', model_key: 'synthetic', setup_action_required: false });
    if (p === '/api/conversations') return json([]);
    return json({});
  });
  const location = `/penumbra/${layout === 'editorial' ? 'editorial' : ''}`;
  const panel = () => page.getByRole('region', { name: '模型与任务分配面板', exact: true });
  const row = usage => page.locator(`[data-feature-usage="${usage}"]`);
  const dialog = () => page.getByRole('dialog', { name: /^编辑/ });
  const openOptions = () => page.locator('[data-slot="select-content"][data-open]').getByRole('option');
  const click = (name, scope = page) => scope.getByRole('button', { name, exact: true }).click();
  const edit = async usage => { await row(usage).getByRole('button', { name: '编辑：' + names[usages.indexOf(usage)], exact: true }).click(); await dialog().waitFor(); };
  const choose = async (name, label) => { await dialog().getByRole('combobox', { name, exact: true }).click(); await openOptions().filter({ hasText: label }).filter({ visible: true }).getByText(label, { exact: true }).click(); };
  const enter = async () => { await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: /^模型与任务分配/ }).click(); await row('main_chat').waitFor(); };
  const close = async () => { await dialog().locator('[data-slot="dialog-footer"]').getByRole('button', { name: '关闭', exact: true }).click(); await dialog().waitFor({ state: 'hidden' }); await row('main_chat').getByRole('button').waitFor({state:'visible'}); };
  const bounds = async () => {
    const viewport = page.viewportSize();
    // Compare against the physical test viewport: mobile innerWidth itself can grow on overflow.
    assert(await page.evaluate(w => innerWidth <= w + 1 && document.documentElement.scrollWidth <= w + 1, viewport.width));
    for (const el of await page.getByRole('dialog').all()) assert(await el.evaluate((node, viewport) => { const r = node.getBoundingClientRect(); return r.left >= -1 && r.right <= viewport.width + 1 && r.top >= -1 && r.bottom <= viewport.height + 1 && node.scrollWidth <= node.clientWidth + 1; }, viewport));
  };
  async function runSelectLayout(label) {
    await edit('main_chat'); await page.waitForTimeout(200);
    const trigger = () => dialog().getByRole('combobox', { name: 'Connection', exact: true });
    const popup = () => page.locator('[data-slot="select-content"][data-open]');
    const original = await dialog().boundingBox();
    const literal = await dialog().getByLabel('模型名称', { exact: true }).inputValue();
    const protocol = await dialog().getByRole('combobox', { name: 'Protocol', exact: true }).textContent();
    const openList = async target => {
      // Sample the opening frames, including the initial positioning pass.
      await page.evaluate(() => {
        window.__selectWidths = []; window.__selectSampling = true;
        const sample = () => { if (!window.__selectSampling) return; window.__selectWidths.push(Math.max(innerWidth, document.documentElement.scrollWidth)); requestAnimationFrame(sample); }; sample();
      });
      if (touch) await target.tap(); else await target.click();
      await popup().waitFor(); await page.waitForTimeout(200); await bounds();
      const viewport = page.viewportSize();
      assert(await popup().evaluate((node, viewport) => { const r = node.getBoundingClientRect(); return r.left >= -1 && r.right <= viewport.width + 1 && r.top >= -1 && r.bottom <= viewport.height + 1 && r.height <= 321; }, viewport));
      const maxWidth = await page.evaluate(() => { window.__selectSampling = false; return Math.max(...window.__selectWidths); });
      assert(maxWidth <= width + 1, `opening widened layout to ${maxWidth}px on ${width}px screen`);
    };
    await openList(trigger()); assert.equal(await page.getByRole('option').count(), 30);
    let current = await dialog().boundingBox();
    assert(Math.abs(current.x - original.x) <= 1 && Math.abs(current.width - original.width) <= 1, 'dialog shifted when opening Connection');
    assert(await popup().evaluate(node => node.scrollHeight > node.clientHeight), 'long list must scroll inside popup');
    await page.screenshot({ path: path.join(output, label + '-select-open.png'), animations: 'disabled' });
    const longName = connections[29].name + ' · 已启用';
    const last = page.getByRole('option', { name: longName, exact: true });
    await last.scrollIntoViewIfNeeded(); await bounds();
    if (touch) await last.tap(); else await last.click();
    await popup().waitFor({ state: 'hidden' });
    assert.equal(await dialog().getByLabel('模型名称', { exact: true }).inputValue(), literal);
    assert.equal(await dialog().getByRole('combobox', { name: 'Protocol', exact: true }).textContent(), protocol);
    await openList(trigger()); await bounds();
    await page.getByRole('option', { name: '合成连接 a · 已启用', exact: true }).scrollIntoViewIfNeeded();
    if (touch) await page.getByRole('option', { name: '合成连接 a · 已启用', exact: true }).tap();
    else await page.getByRole('option', { name: '合成连接 a · 已启用', exact: true }).click();
    await popup().waitFor({ state: 'hidden' });
    if (!touch) {
      await trigger().focus(); await page.keyboard.press('ArrowDown'); await popup().waitFor();
      await page.keyboard.press('End'); await page.keyboard.press('Escape'); await popup().waitFor({ state: 'hidden' }); await dialog().waitFor(); await bounds();
    }
    await openList(dialog().getByRole('combobox', { name: 'Protocol', exact: true }));
    assert.equal(await page.getByRole('option').count(), 2);
    await page.keyboard.press('Escape'); await popup().waitFor({ state: 'hidden' });
    await close();
    if (touch) {
      await page.setViewportSize({ width, height: 520 }); await edit('main_chat'); await page.waitForTimeout(200);
      await openList(trigger());
      await page.screenshot({ path: path.join(output, label + '-select-short.png'), animations: 'disabled' });
      await page.keyboard.press('Escape'); await popup().waitFor({ state: 'hidden' }); await close();
    }
    assert.equal(writes.length, 0); assert(!requests.some(req => /migrate|\/test|fetch-models|\/selections\//.test(req)));
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
    return { layout, width, dark, wallpaper, touch, passed: true, connections: connections.length, writes: writes.length, externalRequests: external.length, pageErrors: errors.length };
  }
  try {
    await page.goto(origin + location);
    if (wallpaper) {
      await page.evaluate(async () => {
        localStorage.setItem('penumbra-theme-mode', 'dark'); localStorage.setItem('penumbra-theme-color', '#4A8F6B');
        localStorage.setItem('penumbra-wallpaper-settings', JSON.stringify({ mode: 'custom', fit: 'cover', position: 'center', shade: 'soft', textTone: 'light' }));
        const db = await new Promise((resolve, reject) => { const r = indexedDB.open('penumbra-preferences', 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('wallpapers')) r.result.createObjectStore('wallpapers'); }; r.onsuccess = () => resolve(r.result); r.onerror = reject; });
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><defs><linearGradient id="a" x2="1" y2="1"><stop stop-color="#edf5da"/><stop offset=".5" stop-color="#154d65"/><stop offset="1" stop-color="#49285d"/></linearGradient></defs><rect width="600" height="900" fill="url(#a)"/></svg>';
        await new Promise((resolve, reject) => { const t = db.transaction('wallpapers', 'readwrite'); t.objectStore('wallpapers').put(new Blob([svg], { type: 'image/svg+xml' }), 'desktop'); t.oncomplete = resolve; t.onerror = reject; }); db.close();
      }); await page.reload();
    }
    await page.getByRole('button', { name: '打开设置', exact: true }).last().click(); await enter();
    if (selectLayout) return await runSelectLayout(`${layout}-${width}-${dark ? 'dark' : 'light'}${wallpaper ? '-wallpaper' : ''}`);
    assert.equal(await panel().locator('[data-feature-usage]').count(), 9);
    assert.deepEqual(await panel().locator('[data-feature-usage]').evaluateAll(nodes => nodes.map(node => node.dataset.featureUsage)), usages);
    for (const [usage, text] of [['main_chat', '当前可用'], ['memory_sentinel', '未配置'], ['memory_digest', '已停用'], ['web_compression', '缺少凭据'], ['quick_note_compression', '不存在'], ['camera_sentinel', '协议不兼容'], ['location_sentinel', '绑定无法解析']]) assert((await row(usage).textContent()).includes(text));
    assert(!(await panel().textContent()).includes('wrong-snapshot'));
    await bounds(); const label = `${layout}-${width}-${dark ? 'dark' : 'light'}${wallpaper ? '-wallpaper' : ''}`;
    await page.screenshot({ path: path.join(output, label + '-panel.png') });
    await edit('main_chat'); assert((await dialog().textContent()).includes('不修改已有会话'));
    await dialog().getByLabel('模型名称', { exact: true }).fill('catalog外/manual-v99');
    await choose('Connection', '合成连接 b · 已启用');
    assert.equal(await dialog().getByLabel('模型名称', { exact: true }).inputValue(), 'catalog外/manual-v99');
    assert((await dialog().getByRole('combobox', { name: 'Protocol', exact: true }).textContent()).includes('Anthropic'));
    await bounds(); await page.screenshot({ path: path.join(output, label + '-editor.png') });
    await click('保存分配', dialog()); await dialog().waitFor({ state: 'hidden' }); assert.equal(features[0].selection.model, 'catalog外/manual-v99');
    await edit('main_chat'); assert.equal(await dialog().getByLabel('模型名称', { exact: true }).inputValue(), 'catalog外/manual-v99'); await close();
    await edit('memory_sentinel'); await choose('Connection', '合成连接 b · 已启用'); assert.equal(await dialog().getByLabel('模型名称', { exact: true }).inputValue(), 'suggestion/b');
    assert((await dialog().getByRole('combobox', { name: 'Protocol', exact: true }).textContent()).includes('选择协议'));
    await dialog().getByRole('combobox', { name: 'Protocol', exact: true }).click(); await openOptions().first().waitFor(); assert.equal(await openOptions().count(), 1); await openOptions().getByText('OpenAI Chat Completions', { exact: true }).click();
    await click('保存分配', dialog()); await dialog().waitFor({ state: 'hidden' });
    await edit('camera_sentinel'); assert((await dialog().textContent()).includes('historical_protocol'));
    await dialog().getByRole('combobox', { name: 'Protocol', exact: true }).click(); await openOptions().first().waitFor(); assert.equal(await openOptions().count(), 4);
    assert(await openOptions().filter({ hasText: 'historical_protocol' }).isDisabled()); await openOptions().getByText('MiniMax Chatcompletion v2', { exact: true }).click();
    await click('保存分配', dialog()); await dialog().waitFor({ state: 'hidden' });
    await edit('quick_note_compression'); assert((await dialog().textContent()).includes('missing /?连接')); await choose('Connection', '合成连接 a · 已启用');
    await click('采用建议模型', dialog()); await click('保存分配', dialog()); await dialog().waitFor({ state: 'hidden' });
    await edit('game_decision'); assert((await dialog().textContent()).includes('不修改已有 Session'));
    const beforeClear = writes.length; await click('清除当前分配', dialog()); await click('取消清除', dialog()); assert.equal(writes.length, beforeClear);
    await click('清除当前分配', dialog()); assert((await dialog().textContent()).includes('不会恢复历史兼容绑定'));
    await click('确认清除', dialog()); await dialog().waitFor({ state: 'hidden' }); assert.equal(features[8].selection, null); assert((await row('game_decision').textContent()).includes('未配置'));
    await edit('book_annotation'); assert((await dialog().textContent()).includes('任务可显式覆盖'));
    mode = 'write-fail'; await click('保存分配', dialog()); await dialog().getByRole('button', { name: '已核对，继续编辑', exact: true }).waitFor();
    assert(await dialog().getByRole('button', { name: '保存分配', exact: true }).isDisabled()); await click('已核对，继续编辑', dialog());
    mode = 'unknown'; await dialog().getByLabel('模型名称', { exact: true }).fill('unknown-result'); const unknownCount = writes.length;
    await click('保存分配', dialog()); await dialog().getByRole('button', { name: '已核对，继续编辑', exact: true }).waitFor();
    assert.equal(writes.length, unknownCount + 1); assert((await dialog().getByLabel('当前后端状态').textContent()).includes('unknown-result'));
    await click('已核对，继续编辑', dialog()); mode = 'read-after-write-fail'; await click('保存分配', dialog());
    await dialog().getByRole('alert').waitFor(); assert(await dialog().getByRole('button', { name: '已核对，继续编辑', exact: true }).isDisabled());
    mode = ''; await click('重新读取当前状态', dialog()); await dialog().getByRole('button', { name: '已核对，继续编辑', exact: true }).waitFor();
    await close();
    const beforeManage = reads; await click('管理连接', panel()); await page.getByRole('region', { name: '连接管理面板', exact: true }).waitFor();
    connections[0].name = '更新后的合成连接 a'; features[7].diagnostic = 'missing_credential';
    await page.goBack(); await row('main_chat').waitFor(); assert(reads > beforeManage); assert((await row('book_annotation').textContent()).includes('缺少凭据'));
    features[7].diagnostic = null; await click('刷新功能分配'); await page.waitForFunction(() => document.querySelector('[data-feature-usage="book_annotation"]').textContent.includes('当前可用'));
    // A delayed readback must not contaminate a newly opened feature dialog.
    await edit('main_chat'); mode = 'late-read'; await click('保存分配', dialog());
    for (let attempt = 0; !pending.length && attempt < 100; attempt++) await page.waitForTimeout(20);
    assert(pending.length, 'delayed read did not start: ' + requests.slice(-8).join(', ')); await close(); mode = '';
    for (const item of pending.splice(0)) await item.route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: item.features }) }).catch(() => {});
    await edit('book_annotation'); assert.equal(await dialog().getByLabel('模型名称', { exact: true }).inputValue(), 'unknown-result'); await close();
    await click('返回设置分类'); await enter(); await page.reload(); await row('main_chat').waitFor(); assert((await row('main_chat').textContent()).includes('catalog外/manual-v99'));
    if (wallpaper) { await edit('main_chat'); await page.setViewportSize({ width, height: 520 }); await dialog().getByLabel('模型名称', { exact: true }).focus(); await page.waitForTimeout(200); await bounds(); await page.screenshot({ path: path.join(output, label + '-short.png'), animations: 'disabled' }); await close(); }
    assert(!requests.some(req => /migrate|\/test|fetch-models|\/selections\//.test(req)));
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
    return { layout, width, dark, wallpaper, passed: true, writes: writes.length, featureReads: reads, pageErrors: errors.length, externalRequests: external.length };
  } finally { await context.close(); }
}
(async () => {
  fs.mkdirSync(output, { recursive: true }); await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try { const results = [], origin = `http://127.0.0.1:${server.address().port}`;
    if (!process.env.SETTINGS_PR3_VARIANT || process.env.SETTINGS_PR3_VARIANT === 'select') for (const layout of ['classic', 'editorial']) for (const [width, dark] of [[320, false], [390, true], [1440, false], [1440, true]]) results.push(await run(browser, origin, layout, width, dark));
    results.push(await run(browser, origin, 'classic', 390, true, true));
    fs.writeFileSync(path.join(output, process.env.SETTINGS_PR3_VARIANT === 'select' ? 'results-select.json' : process.env.SETTINGS_PR3_VARIANT ? 'results-wallpaper.json' : 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(done => server.close(done)); }
})().catch(error => { console.error(error); server.closeAllConnections(); server.close(); process.exitCode = 1; });
