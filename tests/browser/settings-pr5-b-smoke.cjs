/* Production build with isolated browser contexts and synthetic HTTP responses.
 * node tests/browser/settings-pr5-b-smoke.cjs [playwright module] [Chromium executable]
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.argv[2] || 'playwright');
const output = process.env.SETTINGS_PR5_B_OUTPUT || path.resolve(__dirname, '../../artifacts/settings-pr5-b');
const root = path.resolve(__dirname, '../../dist');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/penumbra/')) { res.writeHead(404); return res.end(); }
  const relative = url.pathname.slice('/penumbra/'.length);
  const file = path.resolve(root, relative.startsWith('assets/') ? relative : 'index.html');
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': ({
    '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2',
  })[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
const original = 'synthetic-brave-old0', replacement = 'synthetic-brave-new1';
const features = ['main_chat', 'memory_sentinel', 'memory_digest', 'web_compression', 'quick_note_compression',
  'camera_sentinel', 'location_sentinel', 'book_annotation', 'game_decision'].map(usage => ({
  usage, selection: null, diagnostic: 'feature_binding_required', lifecycle: 'feature',
  allowed_protocols: ['openai_chat_completions'],
}));

async function verify(browser, origin, layout, width) {
  const desktopHeight = 850;
  const context = await browser.newContext({
    viewport: { width, height: desktopHeight },
    ...(width < 768 ? { isMobile: true, hasTouch: true } : {}),
  });
  await context.addInitScript(() => {
    window.copiedFixtureValues = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { window.copiedFixtureValues.push(value); } },
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [], external = [], requests = [], writes = [];
  let enabled = width === 1440, key = width === 390 ? '' : original, version = 1;
  let mode = width === 320 ? 'read-fails' : '', finishReveal, finishAccess;
  const credential = () => key
    ? { configured: true, masked: '••••••••' + key.slice(-4), secret_ref: 'signed-fixture-' + version }
    : { configured: false, masked: '', secret_ref: null };
  const state = () => ({ web_access_enabled: enabled, credentials: { brave_search_key: credential() } });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push('external request');
    return route.abort();
  });
  await page.routeWebSocket(/.*/, ws => ws.close());
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.text().includes(original) || message.text().includes(replacement)
        || message.text().includes('Password field is not contained in a form')) errors.push('unsafe console output');
  });
  await page.route('**/api/**', async route => {
    const req = route.request(), method = req.method(), endpoint = new URL(req.url()).pathname;
    const body = req.postData() ? req.postDataJSON() : undefined;
    requests.push(method + ' ' + endpoint);
    const json = (data, status = 200) => route.fulfill({
      status, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, json: data,
    }).catch(() => {});
    if (endpoint === '/api/settings' && method === 'GET') {
      if (mode === 'read-fails') { mode = ''; return json({ detail: original }, 503); }
      return json(state());
    }
    if (endpoint === '/api/settings' && method === 'PUT') {
      writes.push(body);
      if (Object.hasOwn(body, 'web_access_enabled')) {
        assert.deepEqual(body, { web_access_enabled: !enabled });
        if (mode === 'access-fails') { mode = ''; return json({ detail: { code: 'persistence_failed', input: original } }, 503); }
        if (mode === 'access-pending') {
          mode = '';
          await new Promise(resolve => { finishAccess = resolve; });
        }
        enabled = body.web_access_enabled;
        return json({ ok: true });
      }
      assert.deepEqual(body, { brave_search_key: replacement });
      if (mode === 'replace-uncertain') { mode = ''; key = replacement; version++; return route.abort('failed'); }
      key = body.brave_search_key;
      version++;
      if (mode === 'ack-readback-fails') mode = 'read-fails';
      return json({ ok: true });
    }
    if (endpoint === '/api/settings/secrets/reveal' || endpoint === '/api/settings/secrets/clear') {
      assert.equal(method, 'POST');
      assert.deepEqual(body, { secret_ref: credential().secret_ref });
      const clear = endpoint.endsWith('/clear');
      if (clear) writes.push({ clear: body.secret_ref });
      if (mode === 'stale') { mode = ''; version++; return json({ detail: 'Secret reference is invalid or stale' }, 422); }
      if (mode === 'reveal-fails') { mode = ''; return json({ detail: original }, 500); }
      if (mode === 'clear-fails') { mode = ''; return json({ detail: { code: 'persistence_failed', input: original } }, 503); }
      if (mode === 'late-reveal') {
        mode = '';
        const value = key;
        await new Promise(resolve => { finishReveal = resolve; });
        return json({ secret: value });
      }
      if (!clear) return json({ secret: key });
      key = '';
      version++;
      return json({ ok: true });
    }
    assert.equal(method, 'GET', 'unexpected write to ' + endpoint);
    if (endpoint === '/api/registry/feature-bindings') return json({ features });
    if (endpoint === '/api/registry/connections') return json({
      schema_version: 2, authority_state: 'persisted_v2', migration_required: false,
      diagnostics: [], deferred_usages: [], connections: [],
    });
    if (endpoint === '/api/session') return json({ authenticated: true });
    if (endpoint === '/api/conversations') return json([]);
    return json({});
  });

  const click = (name, area = page) => area.getByRole('button', { name, exact: typeof name === 'string' }).click();
  const nav = page.getByRole('navigation', { name: '设置分类' });
  const historyPath = () => page.evaluate(() => history.state.penumbraSettingsPath);
  const panel = page.getByRole('region', { name: 'Web 服务设置', exact: true });
  const toggle = panel.getByRole('switch', { name: '联网访问' });
  const brave = panel.getByRole('region', { name: 'Brave Search 凭据' });
  const revealed = page.locator('[aria-label="临时 Brave Key 明文"]');
  const editor = page.getByRole('dialog', { name: '编辑 Brave Key' });
  const clearDialog = page.getByRole('alertdialog', { name: '清除 Brave Key' });
  const field = editor.getByLabel('新 Brave Key', { exact: true });
  const waitEnabled = async (locator, enabled) => {
    await locator.and(page.locator(enabled ? ':enabled' : ':disabled')).waitFor();
  };
  const safeBounds = async () => {
    const measures = await page.evaluate(() => ({
      width: innerWidth, scroll: document.documentElement.scrollWidth, height: innerHeight,
      bounds: [...document.querySelectorAll('[data-slot="dialog-content"],[data-slot="alert-dialog-content"]')].map(node => node.getBoundingClientRect().toJSON()),
    }));
    assert(measures.scroll <= measures.width + 1, 'horizontal overflow');
    for (const rect of measures.bounds) {
      assert(rect.left >= -1 && rect.right <= measures.width + 1, 'dialog horizontal overflow');
      assert(rect.top >= -1 && rect.bottom <= measures.height + 1, 'dialog vertical overflow');
    }
  };
  const screenshot = name => page.screenshot({ path: path.join(output, layout + '-' + width + '-' + name + '.png'), animations: 'disabled' });
  const changeAccess = async target => {
    const before = key;
    await toggle.click();
    await waitEnabled(toggle, true);
    assert.equal(await toggle.getAttribute('aria-checked'), String(target));
    assert.equal(enabled, target);
    assert.equal(key, before);
  };

  try {
    await page.goto(origin + '/penumbra/' + (layout === 'editorial' ? 'editorial' : ''));
    await page.getByRole('button', { name: '打开设置', exact: true }).last().click();
    await nav.getByRole('heading', { name: '服务集成' }).waitFor();
    assert.equal(await nav.getByRole('button', { name: /^服务集成/ }).count(), 0);
    await click(/^Web 服务/, nav);
    await panel.waitFor();
    assert.deepEqual(await historyPath(), ['web']);
    if (width === 320) {
      await panel.getByRole('alert').filter({ hasText: '无法读取 Web 设置' }).waitFor();
      assert.equal(await toggle.count(), 0);
      assert.equal(await brave.getByText('未配置', { exact: true }).count(), 0);
      await click('重新读取', panel);
    }
    await waitEnabled(toggle, true);
    assert.equal(await toggle.getAttribute('aria-checked'), String(enabled));
    assert.equal(requests.filter(call => call.endsWith('/reveal')).length, 0);
    assert.equal(requests.filter(call => call.includes('/api/registry')).length, 0);
    await brave.getByText(key ? '已配置' : '未配置', { exact: true }).waitFor();
    if (key) assert.equal(await brave.getByLabel('Brave Key 掩码').textContent(), credential().masked);
    await safeBounds();
    await screenshot('page');
    mode = 'access-pending';
    const initial = enabled, initialKey = key, beforeAccess = writes.length;
    await toggle.evaluate(node => { node.click(); node.click(); });
    await panel.getByRole('status').filter({ hasText: '正在保存联网许可' }).waitFor();
    await waitEnabled(toggle, false);
    await waitEnabled(brave.getByRole('button', { name: '编辑凭据' }), false);
    assert.equal(await toggle.getAttribute('aria-busy'), 'true');
    for (let attempt = 0; !finishAccess && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(writes.length, beforeAccess + 1);
    assert.equal(enabled, initial);
    assert(finishAccess);
    finishAccess();
    await waitEnabled(toggle, true);
    assert.equal(await toggle.getAttribute('aria-checked'), String(!initial));
    assert.equal(key, initialKey);
    await changeAccess(initial);
    mode = 'access-fails';
    const originalAccess = enabled;
    await toggle.click();
    await panel.getByRole('alert').filter({ hasText: '保存失败' }).waitFor();
    assert.equal(await toggle.getAttribute('aria-checked'), String(originalAccess));
    await page.reload();
    await waitEnabled(toggle, true);
    assert.equal(await toggle.getAttribute('aria-checked'), String(originalAccess));

    if (enabled) await changeAccess(false);
    if (key) {
      mode = 'reveal-fails';
      await click('查看凭据', brave);
      await panel.getByRole('alert').filter({ hasText: '无法查看凭据' }).waitFor();
      assert.equal(await revealed.count(), 0);
      mode = 'stale';
      await click('查看凭据', brave);
      await panel.getByRole('alert').filter({ hasText: '凭据引用已失效' }).waitFor();
      assert.equal(await revealed.count(), 0);
      await click('查看凭据', brave);
      await revealed.waitFor();
      assert.equal(await revealed.textContent(), original);
      await click('复制凭据', brave);
      await page.waitForFunction(value => window.copiedFixtureValues.includes(value), original);
      await page.getByText('已复制', { exact: true }).last().waitFor();
      await click('隐藏凭据', brave);
      assert.equal(await revealed.count(), 0);
    }

    await click('编辑凭据', brave);
    assert.equal(await field.getAttribute('type'), 'password');
    assert.equal(await field.inputValue(), '');
    await waitEnabled(editor.getByRole('button', { name: '保存 Key' }), false);
    await field.fill(key ? credential().masked : '   ');
    await waitEnabled(editor.getByRole('button', { name: '保存 Key' }), false);
    await field.fill('discard-this-synthetic-draft');
    if (width < 768) {
      await page.setViewportSize({ width, height: 460 });
      await field.focus();
      assert.equal(await field.evaluate(node => node === document.activeElement), true);
      await safeBounds();
      await screenshot('short-editor');
      await page.setViewportSize({ width, height: desktopHeight });
    }
    await click('取消', editor);
    await click('编辑凭据', brave);
    assert.equal(await field.inputValue(), '');
    await safeBounds();
    await screenshot('editor');
    await field.fill(replacement);
    mode = 'replace-uncertain';
    const before = writes.length;
    await click('保存 Key', editor);
    await editor.getByRole('alert').filter({ hasText: '保存结果未确认' }).waitFor();
    assert.equal(await field.inputValue(), replacement);
    assert.equal(writes.length, before + 1);
    assert((await editor.getByText(/凭据状态/).textContent()).includes('new1'));
    await click('保存 Key', editor);
    await editor.waitFor({ state: 'hidden' });
    await page.getByText('Brave Key 已保存', { exact: true }).last().waitFor();
    assert.equal(enabled, false);
    await brave.getByText('已配置', { exact: true }).waitFor();

    for (const [failure, message] of [['stale', '凭据引用已失效'], ['clear-fails', '保存失败']]) {
      await click('清除凭据', brave);
      await safeBounds();
      await screenshot('clear');
      mode = failure;
      const count = writes.length;
      await click('确认清除', clearDialog);
      await clearDialog.getByRole('alert').filter({ hasText: message }).waitFor();
      await waitEnabled(clearDialog.getByRole('button', { name: '确认清除' }), false);
      assert.equal(writes.length, count + 1);
      assert.equal(key, replacement);
      await click('取消', clearDialog);
    }
    await click('清除凭据', brave);
    await click('确认清除', clearDialog);
    await clearDialog.waitFor({ state: 'hidden' });
    await brave.getByText('未配置', { exact: true }).waitFor();
    assert.equal(key, '');
    assert.equal(enabled, false);

    await click('编辑凭据', brave);
    await field.fill(replacement);
    mode = 'ack-readback-fails';
    await click('保存 Key', editor);
    await editor.waitFor({ state: 'hidden' });
    await panel.getByRole('alert').filter({ hasText: '当前状态读回失败' }).waitFor();
    await waitEnabled(toggle, false);
    await click('重新读取', panel);
    await waitEnabled(brave.getByRole('button', { name: '查看凭据' }), true);
    mode = 'late-reveal';
    await click('查看凭据', brave);
    await brave.getByRole('status').filter({ hasText: '正在查看' }).waitFor();
    await click(/^网页内容压缩模型/, panel);
    const row = page.locator('[data-feature-usage="web_compression"]');
    await row.waitFor();
    assert.deepEqual(await historyPath(), ['web', 'features']);
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-feature-usage') === 'web_compression');
    assert.equal(await page.getByRole('dialog').count(), 0, 'navigation must not open an editor');
    finishReveal?.();
    await page.goBack();
    await waitEnabled(toggle, true);
    assert.equal(await revealed.count(), 0, 'late reveal must not restore plaintext');
    await page.goForward();
    await row.waitFor();
    await click('返回上级设置');
    await waitEnabled(toggle, true);
    assert.deepEqual(await historyPath(), ['web']);
    await click('查看凭据', brave);
    await revealed.waitFor();
    await click('编辑凭据', brave);
    assert.equal(await revealed.count(), 0, 'opening an editor hides plaintext');
    await field.fill('discard-on-leave');
    await page.goBack();
    await nav.getByRole('button', { name: /^Web 服务/ }).waitFor();
    assert.deepEqual(await historyPath(), []);
    await click(/^Web 服务/, nav);
    await waitEnabled(toggle, true);
    await click('编辑凭据', brave);
    assert.equal(await field.inputValue(), '');
    await click('取消', editor);
    await safeBounds();
    await click('返回设置分类');
    await panel.waitFor({ state: 'hidden' });
    await nav.getByRole('button', { name: /^Web 服务/ }).waitFor();
    assert.deepEqual(await historyPath(), []);

    const retained = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, history: history.state }));
    for (const value of [original, replacement, 'discard-on-leave', 'signed-fixture-']) assert(!retained.includes(value));
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    return { layout, width, writes: writes.length, external: external.length, errors: errors.length };
  } finally {
    finishReveal?.();
    finishAccess?.();
    await context.close();
  }
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try {
    const origin = 'http://127.0.0.1:' + server.address().port;
    const results = [];
    for (const layout of process.env.SETTINGS_PR5_B_QUICK ? ['classic'] : ['classic', 'editorial']) {
      for (const width of process.env.SETTINGS_PR5_B_QUICK ? [320] : [320, 390, 1440]) results.push(await verify(browser, origin, layout, width));
    }
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise(done => server.close(done));
  }
})().catch(error => { console.error(error); server.closeAllConnections(); server.close(); process.exitCode = 1; });
