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
const readiness = code => ({ ready: code === 'ready', model_key: 'synthetic-default', reason_code: code, setup_action_required: code !== 'ready' });

async function run(browser, origin, layout, width) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: width === 390 ? 'dark' : 'light' });
  const errors = [], requests = [], writes = [], escaped = [];
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  const state = { fail: null, code: 'ready', delay: null, pending: [] };
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
    if (state.fail === endpoint) return json({ error: 'synthetic-private-error-must-not-render' }, 503);
    if (state.delay === endpoint) { state.pending.push({ route, code: state.code }); return; }
    if (endpoint === '/api/session') return json({ authenticated: true, cookie: 'synthetic-private-cookie-must-not-render' });
    if (endpoint === '/api/models') return json([{ key: 'synthetic-default', provider: 'synthetic-provider', api_key: 'synthetic-private-key-must-not-render' }]);
    if (endpoint === '/api/chat/readiness') return json(readiness(state.code));
    // Background widgets use only these synthetic empty facts.
    if (endpoint === '/api/schedule/reminders' || endpoint === '/api/conversations') return json([]);
    if (endpoint === '/api/settings/user-info') return json({ user_name: '合成用户' });
    return json({});
  });
  const location = `/penumbra/${layout === 'editorial' ? 'editorial' : ''}`;
  // Seed legacy device preferences and an existing Blob before the application is loaded.
  await page.goto(origin + location);
  await page.evaluate(async bytes => {
    localStorage.setItem('penumbra-theme-mode', 'dark');
    localStorage.setItem('penumbra-theme-color', '#4A8F6B');
    localStorage.setItem('penumbra-ai-color', '#7D73B5');
    localStorage.setItem('penumbra-wallpaper-settings', JSON.stringify({ mode: 'custom', fit: 'contain', position: 'bottom', shade: 'soft', textTone: 'light' }));
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('penumbra-preferences', 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('wallpapers')) r.result.createObjectStore('wallpapers'); }; r.onsuccess = () => resolve(r.result); r.onerror = reject; });
    await new Promise((resolve, reject) => { const t = db.transaction('wallpapers', 'readwrite'); t.objectStore('wallpapers').put(new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'desktop'); t.oncomplete = resolve; t.onerror = reject; }); db.close();
  }, [...png]);
  await page.reload();
  const preferences = () => page.evaluate(() => Object.fromEntries(['penumbra-theme-mode', 'penumbra-theme-color', 'penumbra-ai-color', 'penumbra-wallpaper-settings'].map(key => [key, localStorage.getItem(key)])));
  const before = await preferences();
  const open = async () => { await page.getByRole('button', { name: '打开设置', exact: true }).last().click(); await page.getByRole('navigation', { name: '设置分类' }).waitFor(); };
  const category = title => page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: new RegExp(title) });
  const back = () => page.getByRole('button', { name: '返回设置分类', exact: true }).click();
  const appearance = () => page.getByRole('region', { name: '外观与本机偏好', exact: true });
  const system = () => page.getByRole('region', { name: '系统状态', exact: true });
  const item = title => system().getByRole('region', { name: title, exact: true });
  const noOverflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('[data-page-scroll-region]')].filter(el => el.getBoundingClientRect().width).every(el => el.scrollWidth <= el.clientWidth + 1)));
  try {
    await open();
    assert.equal(new URL(page.url()).pathname, location);
    if (width < 768) assert.equal(await appearance().isVisible(), false);
    assert.equal(await page.getByRole('button', { name: 'API 与连接', exact: true }).count(), 0);
    assert.equal(await page.getByText('日历设置', { exact: true }).count(), 0);
    await page.screenshot({ path: path.join(output, `${layout}-${width}-categories.png`) });
    await category('外观与本机偏好').click();
    await appearance().locator('.desktop-wallpaper-preview').waitFor();
    await page.waitForFunction(() => document.querySelector('.desktop-wallpaper-preview')?.style.backgroundImage.includes('blob:'));
    assert.equal(await appearance().getByLabel('自定义主题颜色', { exact: true }).inputValue(), '#4a8f6b');
    assert.equal(await appearance().getByLabel('自定义 AI 主题色', { exact: true }).inputValue(), '#7d73b5');
    assert.deepEqual(await preferences(), before); await noOverflow();
    await page.screenshot({ path: path.join(output, `${layout}-${width}-appearance.png`) });
    if (layout === 'classic') assert.equal(await page.locator('.desktop-wallpaper').first().getAttribute('data-wallpaper-mode'), 'custom');
    await appearance().getByRole('radio', { name: /^浅色/ }).click();
    await appearance().getByRole('button', { name: '使用海蓝主题', exact: true }).click();
    await appearance().getByRole('button', { name: '使用青瓷 AI 主题', exact: true }).click();
    await appearance().getByLabel('自定义主题颜色', { exact: true }).fill('#aabbcc');
    await appearance().getByLabel('自定义 AI 主题色', { exact: true }).fill('#bbaacc');
    for (const name of ['填充', '顶部', '平衡', '黑色']) await appearance().getByRole('button', { name, exact: true }).click();
    let changed = await preferences();
    assert.equal(changed['penumbra-theme-mode'], 'light');
    assert.equal(changed['penumbra-theme-color'], '#AABBCC'); assert.equal(changed['penumbra-ai-color'], '#BBAACC');
    assert.deepEqual(JSON.parse(changed['penumbra-wallpaper-settings']), { mode: 'custom', fit: 'cover', position: 'top', shade: 'balanced', textTone: 'dark' });
    // Upload and remove use the original IndexedDB object store contract.
    await appearance().getByLabel('选择自定义壁纸').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
    await appearance().getByRole('button', { name: '移除', exact: true }).waitFor({ state: 'visible' });
    await back(); await category('系统状态').click();
    await item('Session').getByText('Session 可达 · 已登录', { exact: true }).waitFor();
    await item('模型目录').getByText('目录可读取 · 1 个模型', { exact: true }).waitFor();
    await item('Chat readiness · 新会话默认配置').getByText('默认配置就绪', { exact: true }).waitFor();
    assert(!(await system().textContent()).includes('synthetic-private'));
    for (const [endpoint, title] of [['/api/session', 'Session'], ['/api/models', '模型目录'], ['/api/chat/readiness', 'Chat readiness · 新会话默认配置']]) {
      state.fail = endpoint;
      await system().getByRole('button', { name: '重新加载设置状态', exact: true }).click();
      await item(title).getByRole('button', { name: '重试', exact: true }).waitFor();
      for (const other of ['Session', '模型目录', 'Chat readiness · 新会话默认配置'].filter(v => v !== title)) assert.equal(await item(other).getByRole('alert').count(), 0);
      assert(!(await system().textContent()).includes('synthetic-private'));
      await page.waitForFunction(() => !document.querySelector('[aria-label="重新加载设置状态"]')?.disabled);
      state.fail = null; const offset = requests.length;
      await item(title).getByRole('button', { name: '重试', exact: true }).click();
      await item(title).getByRole('alert').waitFor({ state: 'hidden' });
      assert.deepEqual(requests.slice(offset).filter(path => ['/api/session', '/api/models', '/api/chat/readiness'].includes(path)), [endpoint]);
    }
    for (const [code, copy] of [['missing_credential', '缺少凭据'], ['disabled_profile', '已禁用'], ['invalid_main_selection', '选择无效'], ['future_safe_code', '检查连接与模型配置后重试'], ['constructor', '检查连接与模型配置后重试']]) {
      state.code = code; await system().getByRole('button', { name: '重新加载设置状态', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('[aria-label="重新加载设置状态"]')?.disabled);
      await item('Chat readiness · 新会话默认配置').getByText(copy, { exact: false }).waitFor();
      assert(!(await system().textContent()).includes('后端离线'));
    }
    await noOverflow();
    await page.screenshot({ path: path.join(output, `${layout}-${width}-system.png`) });
    // Slow readiness must not hide the successful Session/catalog. Closing discards the late response.
    state.delay = '/api/chat/readiness'; state.code = 'missing_credential';
    await system().getByRole('button', { name: '重新加载设置状态', exact: true }).click();
    await item('Session').getByText('Session 可达 · 已登录', { exact: true }).waitFor();
    await item('模型目录').getByText('目录可读取 · 1 个模型', { exact: true }).waitFor();
    await page.getByRole('button', { name: '返回桌面', exact: true }).click();
    state.delay = null; state.code = 'ready';
    await open(); await category('系统状态').click();
    await item('Chat readiness · 新会话默认配置').getByText('默认配置就绪', { exact: true }).waitFor();
    for (const pending of state.pending.splice(0)) await pending.route.fulfill({ contentType: 'application/json', body: JSON.stringify(readiness(pending.code)) }).catch(() => {});
    assert(await item('Chat readiness · 新会话默认配置').getByText('默认配置就绪', { exact: true }).isVisible());
    await back(); await category('外观与本机偏好').click();
    assert.equal(await appearance().getByLabel('自定义主题颜色', { exact: true }).inputValue(), '#aabbcc');
    await appearance().getByRole('button', { name: '移除', exact: true }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('penumbra-wallpaper-settings')).mode === 'ambient');
    await page.getByRole('button', { name: '返回桌面', exact: true }).click();
    await page.reload(); await open(); await category('外观与本机偏好').click();
    assert.equal(await appearance().getByLabel('自定义 AI 主题色', { exact: true }).inputValue(), '#bbaacc');
    assert.equal(await appearance().getByRole('button', { name: '移除', exact: true }).isDisabled(), true);
    await appearance().getByRole('radio', { name: /^跟随系统/ }).click();
    await appearance().getByRole('radio', { name: /^深色/ }).click();
    await back();
    const legacy = page.getByRole('link', { name: '返回旧版知远', exact: true });
    assert.equal(await legacy.getAttribute('href'), '/'); assert.equal(await legacy.getAttribute('target'), '_top');
    assert.equal(new URL(page.url()).pathname, location);
    assert.deepEqual(writes, []); assert.deepEqual(escaped, []); assert.deepEqual(errors, []);
    assert(!requests.some(path => path.startsWith('/penumbra/api')));
    return { layout, width, navigation: 'passed', appearanceStorage: 'passed', independentOverview: 'passed', safeDiagnostics: 'passed', reopenAndLateResponse: 'passed', apiWrites: writes.length, pageErrors: errors.length };
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
