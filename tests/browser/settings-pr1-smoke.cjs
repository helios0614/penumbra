/* Real production UI in fresh browser contexts; every API/WS response is synthetic.
 * npm run build
 * node tests/browser/settings-pr1-smoke.cjs [playwright module] [Chromium executable]
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.argv[2] || 'playwright');
const root = path.resolve(__dirname, '../..');
const output = process.env.SETTINGS_PR1_OUTPUT || '/private/tmp/penumbra-settings-pr1-browser';
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
async function run(browser, origin, layout, width) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: width === 390 ? 'dark' : 'light' });
  const errors = [], requests = [], writes = [], escaped = [];
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  const state = {
    fail: null,
    cache: { cache_enabled: true, anthropic_system_cache_ttl: '1h', cache_freeze_size: 20, cache_slide_max: 10 },
    keepalive: { cache_keepalive_enabled: true, cache_keepalive_threshold_min: 50 },
    appearance: {
      themeMode: 'dark', themeColor: '#4A8F6B', aiColor: '#7D73B5',
      wallpaper: { mode: 'custom', fit: 'contain', position: 'bottom', shade: 'soft', textTone: 'light', image: 'a'.repeat(32) + '.png' },
      avatars: { user: null, assistant: null }, stickerImage: null, stickers: [],
    },
  };
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    escaped.push(route.request().url()); return route.abort();
  });
  await page.routeWebSocket(/.*/, ws => ws.close());
  await page.route('**/api/**', async route => {
    const req = route.request(), endpoint = new URL(req.url()).pathname;
    requests.push(endpoint);
    if (req.method() !== 'GET') writes.push(`${req.method()} ${endpoint}`);
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) }).catch(() => {});
    if (state.fail === endpoint) return json({ detail: 'synthetic save failed' }, 503);
    if (endpoint === '/api/settings') return json(state.cache);
    if (endpoint === '/api/settings/cache-toggle') {
      const body = req.postDataJSON();
      assert.deepEqual(Object.keys(body), ['cache_enabled']);
      state.cache.cache_enabled = body.cache_enabled;
      return json({ ok: true, ...body });
    }
    if (endpoint === '/api/settings/anthropic-system-cache-ttl') {
      const body = req.postDataJSON();
      assert.deepEqual(Object.keys(body), ['ttl']);
      state.cache.anthropic_system_cache_ttl = body.ttl;
      return json({ ok: true, ...body });
    }
    if (endpoint === '/api/settings/keepalive') {
      if (req.method() === 'GET') return json(state.keepalive);
      const body = req.postDataJSON();
      assert.equal(Object.keys(body).length, 1);
      assert(Object.keys(body)[0] in state.keepalive);
      Object.assign(state.keepalive, body);
      return json({ ok: true });
    }
    if (endpoint === '/api/appearance') {
      if (req.method() === 'PATCH') {
        const { wallpaper, ...fields } = req.postDataJSON();
        state.appearance = { ...state.appearance, ...fields, wallpaper: { ...state.appearance.wallpaper, ...wallpaper } };
      }
      return json(state.appearance);
    }
    if (endpoint === '/api/appearance/images/wallpaper') {
      if (req.method() === 'PUT') Object.assign(state.appearance.wallpaper, { mode: 'custom', image: 'b'.repeat(32) + '.png' });
      if (req.method() === 'DELETE') Object.assign(state.appearance.wallpaper, { mode: 'ambient', image: null });
      return json(state.appearance);
    }
    if (endpoint.startsWith('/api/appearance/images/wallpaper/')) return route.fulfill({ contentType: 'image/png', body: png });
    if (endpoint === '/api/session') return json({ authenticated: true, cookie: 'synthetic-private-cookie-must-not-render' });
    if (endpoint === '/api/worldbook') return json({ ai_name: '合成助手' });
    // Background widgets use only these synthetic empty facts.
    if (endpoint === '/api/schedule/reminders' || endpoint === '/api/conversations') return json([]);
    if (endpoint === '/api/settings/user-info') return json({ user_name: '合成用户' });
    return json({});
  });
  const location = `/penumbra/${layout === 'editorial' ? 'editorial' : ''}`;
  // Seed legacy device preferences and an existing Blob before the application is loaded.
  await page.goto(origin + location);
  await page.evaluate(async bytes => {
    localStorage.setItem('penumbra-theme-mode', 'light');
    localStorage.setItem('penumbra-theme-color', '#AABBCC');
    localStorage.setItem('penumbra-ai-color', '#BBAACC');
    localStorage.setItem('penumbra-wallpaper-settings', JSON.stringify({ mode: 'ambient' }));
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('penumbra-preferences', 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('wallpapers')) r.result.createObjectStore('wallpapers'); }; r.onsuccess = () => resolve(r.result); r.onerror = reject; });
    await new Promise((resolve, reject) => { const t = db.transaction('wallpapers', 'readwrite'); t.objectStore('wallpapers').put(new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'desktop'); t.oncomplete = resolve; t.onerror = reject; }); db.close();
  }, [...png]);
  await page.reload();
  const preferences = () => page.evaluate(() => Object.fromEntries(['penumbra-theme-mode', 'penumbra-theme-color', 'penumbra-ai-color', 'penumbra-wallpaper-settings'].map(key => [key, localStorage.getItem(key)])));
  const before = await preferences();
  const open = async () => { const launcher = page.getByRole('button', { name: '打开设置', exact: true }); if (await launcher.count()) await launcher.last().click(); await page.getByRole('navigation', { name: '设置分类' }).waitFor(); };
  const category = title => page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: new RegExp(`^${title}`) });
  const back = () => page.getByRole('button', { name: '返回设置分类', exact: true }).click();
  const appearance = () => page.getByRole('region', { name: '外观', exact: true });
  const openColor = async title => {
    await appearance().getByRole('button', { name: title, exact: true }).click();
    return page.getByRole('dialog', { name: title, exact: true });
  };
  const assertColor = async (title, expected) => {
    const dialog = await openColor(title);
    assert.equal(await dialog.getByLabel('色值', { exact: true }).inputValue(), expected);
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
  };
  const advanced = page.getByRole('region', { name: '高级设置', exact: true });
  const cache = advanced.getByRole('switch', { name: '缓存总开关', exact: true });
  const ttl = advanced.getByRole('combobox', { name: 'Anthropic 系统缓存有效期', exact: true });
  const keepalive = advanced.getByRole('switch', { name: '服务端缓存保活', exact: true });
  const threshold = advanced.getByRole('spinbutton', { name: '回复间隔阈值（分钟）', exact: true });
  const expectSwitch = (control, checked) => control.and(page.locator(`[aria-checked="${checked}"]:enabled`)).waitFor();
  const noOverflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('[data-page-scroll-region]')].filter(el => el.getBoundingClientRect().width).every(el => el.scrollWidth <= el.clientWidth + 1)));
  try {
    await open();
    assert.equal(new URL(page.url()).pathname, location.replace(/\/$/, '') + '/app/settings');
    if (width < 768) assert.equal(await appearance().isVisible(), false);
    assert.equal(await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: /^API 与连接/ }).count(), 1);
    assert.equal(await page.getByText('日历设置', { exact: true }).count(), 0);
    await page.screenshot({ path: path.join(output, `${layout}-${width}-categories.png`) });
    await category('外观').click();
    await appearance().locator('.desktop-wallpaper-preview').waitFor();
    await page.waitForFunction(() => document.querySelector('.desktop-wallpaper-preview')?.style.backgroundImage.includes('/api/appearance/images/wallpaper/'));
    await assertColor('自定义主题颜色', '#4A8F6B');
    await assertColor('自定义 AI 主题色', '#7D73B5');
    assert.deepEqual(await preferences(), before); assert.deepEqual(writes, []); await noOverflow();
    await page.screenshot({ path: path.join(output, `${layout}-${width}-appearance.png`) });
    if (layout === 'classic') assert.equal(await page.locator('.desktop-wallpaper').first().getAttribute('data-wallpaper-mode'), 'custom');
    await appearance().getByRole('radio', { name: /^浅色/ }).click();
    await appearance().getByRole('button', { name: '使用海蓝主题', exact: true }).click();
    await appearance().getByRole('button', { name: '使用青瓷 AI 主题', exact: true }).click();
    const themeDialog = await openColor('自定义主题颜色');
    const themeInput = themeDialog.getByLabel('色值', { exact: true });
    await themeInput.fill('256 187 204');
    await themeDialog.getByRole('button', { name: '应用', exact: true }).click();
    assert.equal(await themeInput.getAttribute('aria-invalid'), 'true');
    await themeInput.fill('170 187 204');
    await themeDialog.getByRole('button', { name: '应用', exact: true }).click();

    const aiDialog = await openColor('自定义 AI 主题色');
    const aiInput = aiDialog.getByLabel('色值', { exact: true });
    await aiDialog.getByRole('slider', { name: '亮度', exact: true }).press('End');
    assert.equal(await aiInput.inputValue(), '#FFFFFF');
    await aiDialog.getByRole('button', { name: '取消', exact: true }).click();
    await assertColor('自定义 AI 主题色', '#5F9E91');
    await openColor('自定义 AI 主题色');
    await aiInput.fill('#bbaacc');
    await page.screenshot({ path: path.join(output, `${layout}-${width}-color-dialog.png`) });
    await aiDialog.getByRole('button', { name: '应用', exact: true }).click();
    for (const name of ['填充', '顶部', '平衡', '黑色']) await appearance().getByRole('button', { name, exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.desktop-wallpaper-preview')?.getAttribute('data-wallpaper-text') === 'dark');
    const { themeMode, themeColor, aiColor, wallpaper } = state.appearance;
    assert.equal(themeMode, 'light');
    assert.equal(themeColor, '#AABBCC'); assert.equal(aiColor, '#BBAACC');
    assert.deepEqual(wallpaper, { mode: 'custom', fit: 'cover', position: 'top', shade: 'balanced', textTone: 'dark', image: 'a'.repeat(32) + '.png' });
    await appearance().getByLabel('选择自定义壁纸').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
    await page.waitForFunction(() => document.querySelector('.desktop-wallpaper-preview')?.style.backgroundImage.includes('bbbbbb'));
    await back();
    assert.equal(await category('系统状态').count(), 0);
    await category('高级设置').click();
    await expectSwitch(cache, true);
    assert.equal(await ttl.getAttribute('data-surface'), 'translucent');
    assert.equal(await threshold.getAttribute('data-surface'), 'translucent');
    assert.equal(await ttl.locator('[data-slot="select-value"]').textContent(), '1 小时');
    assert.equal(await threshold.inputValue(), '50');
    state.fail = '/api/settings/cache-toggle';
    await cache.click();
    await advanced.getByRole('alert').filter({ hasText: 'synthetic save failed' }).waitFor();
    await expectSwitch(cache, true);
    state.fail = null;
    await cache.click(); await expectSwitch(cache, false);
    await ttl.click(); await page.getByRole('option', { name: '5 分钟' }).click();
    await ttl.getByText('5 分钟').waitFor();
    await keepalive.click(); await expectSwitch(keepalive, false);
    assert.equal(await threshold.count(), 0);
    await keepalive.click(); await expectSwitch(keepalive, true);
    await threshold.fill('37');
    await advanced.getByRole('button', { name: '保存', exact: true }).click();
    await expectSwitch(keepalive, true);
    assert.equal(state.keepalive.cache_keepalive_threshold_min, 37);
    assert.equal(requests.filter(endpoint => endpoint === '/api/settings').length, 6);
    assert.equal(requests.filter(endpoint => endpoint === '/api/settings/keepalive').length, 9);
    await noOverflow();
    await page.screenshot({ path: path.join(output, `${layout}-${width}-advanced.png`) });
    await page.reload();
    await expectSwitch(cache, false);
    assert.equal(await ttl.locator('[data-slot="select-value"]').textContent(), '5 分钟');
    await expectSwitch(keepalive, true);
    assert.equal(await threshold.inputValue(), '37');
    await back(); await category('外观').click();
    await assertColor('自定义主题颜色', '#AABBCC');
    await appearance().getByRole('button', { name: '移除', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.desktop-wallpaper-preview')?.style.backgroundImage === '');
    await page.getByRole('button', { name: '返回桌面', exact: true }).click();
    await page.reload(); await open(); await category('外观').click();
    await assertColor('自定义 AI 主题色', '#BBAACC');
    assert.equal(await appearance().getByRole('button', { name: '移除', exact: true }).isDisabled(), true);
    await appearance().getByRole('radio', { name: /^跟随系统/ }).click();
    await appearance().getByRole('radio', { name: /^深色/ }).click();
    await back();
    const legacy = page.getByRole('link', { name: '返回旧版合成助手', exact: true });
    assert.equal(await legacy.getAttribute('href'), '/'); assert.equal(await legacy.getAttribute('target'), '_top');
    assert.equal(new URL(page.url()).pathname, location.replace(/\/$/, '') + '/app/settings');
    assert(writes.length > 0 && writes.every(write => / \/api\/(appearance|settings\/(cache-toggle|anthropic-system-cache-ttl|keepalive))/.test(write)));
    assert(!requests.includes('/api/settings/cache-config'));
    assert(!requests.includes('/api/chat/readiness'));
    assert.deepEqual(await preferences(), before);
    assert.deepEqual(escaped, []); assert.deepEqual(errors, []);
    assert(!requests.includes('/api/models'));
    assert(!requests.some(path => path.startsWith('/penumbra/api')));
    return { layout, width, navigation: 'passed', appearanceStorage: 'passed', cacheReadback: 'passed', apiWrites: writes.length, pageErrors: errors.length };
  } finally { await context.close(); }
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try {
    const results = [];
    for (const layout of ['classic', 'editorial']) for (const width of [320, 390, 1440]) results.push(await run(browser, origin, layout, width));
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
