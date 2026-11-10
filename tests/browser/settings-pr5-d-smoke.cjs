/* Production build with isolated browser contexts and synthetic HTTP responses.
 * node tests/browser/settings-pr5-d-smoke.cjs [playwright module] [Chromium executable]
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.argv[2] || 'playwright');
const output = process.env.SETTINGS_PR5_D_OUTPUT || path.resolve(__dirname, '../../artifacts/settings-pr5-d');
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
const checkedAt = '2026-11-10T03:34:56.123456Z';
const first = 'synthetic-music-initial-1001';
const next = 'synthetic-music-replace-2002';
const recovered = 'synthetic-music-recover-3003';
const rejected = 'synthetic-music-rejected-4004';
const rawError = 'unsafe-fixture-upstream-error';
const empty = { configured: false, masked: '', secret_ref: null };
const snapshot = (mode, status, error_code = null) => ({
  mode, status, checked_at: status === 'unverified' && !error_code ? null : checkedAt, error_code,
});

async function verify(browser, origin, layout, width) {
  const height = 850;
  const context = await browser.newContext({ viewport: { width, height },
    ...(width < 768 ? { isMobile: true, hasTouch: true } : {}) });
  await context.addInitScript(() => {
    window.copiedFixtureValues = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async value => { window.copiedFixtureValues.push(value); },
    } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const calls = [], errors = [], external = [];
  let key = '', refVersion = 1, failWrite = '', failAuth = false, loseReceipt = false;
  let holdAuth = false, finishAuth, holdReveal = false, finishReveal;
  let auth = snapshot('anonymous', 'unverified'), authAfterWrite;
  const metadata = () => key
    ? { configured: true, masked: '••••••••' + key.slice(-4), secret_ref: 'music-ref-fixture-' + refVersion }
    : empty;
  const secretPattern = /synthetic-music-|music-ref-fixture-|unsafe-fixture-upstream-error/;

  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (secretPattern.test(message.text())) errors.push('unsafe console output'); });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push('unexpected external request');
    return route.abort();
  });
  await page.routeWebSocket(/.*/, ws => ws.close());
  await page.route('**/api/**', async route => {
    const req = route.request(), method = req.method(), endpoint = new URL(req.url()).pathname;
    const body = req.postData() ? req.postDataJSON() : undefined;
    const json = (data, status = 200) => route.fulfill({
      status, headers: { 'Cache-Control': 'no-store' }, json: data,
    }).catch(() => {});
    const call = method + ' ' + endpoint;
    if (endpoint.startsWith('/api/music/')) assert.equal(call, 'GET /api/music/auth-status');
    if (endpoint === '/api/settings' || endpoint.startsWith('/api/settings/secrets/') || endpoint === '/api/music/auth-status') calls.push([call, body]);
    if (call === 'GET /api/settings') return json({ credentials: { netease_music_u: metadata() } });
    if (call === 'GET /api/music/auth-status') {
      if (failAuth) { failAuth = false; return json({ detail: rawError }, 503); }
      const observed = auth;
      if (holdAuth) {
        holdAuth = false;
        await new Promise(resolve => { finishAuth = resolve; });
      }
      return json({ ...observed, detail: rawError });
    }
    const clear = call === 'POST /api/settings/secrets/clear';
    if (call === 'PUT /api/settings' || clear) {
      if (clear) assert.deepEqual(body, { secret_ref: metadata().secret_ref });
      else {
        assert.deepEqual(Object.keys(body), ['netease_music_u']);
        assert([first, next, recovered, rejected].includes(body.netease_music_u));
      }
      if (failWrite) {
        const failure = failWrite;
        failWrite = '';
        if (failure === 'stale') {
          refVersion++;
          return json({ detail: 'Secret reference is invalid or stale' }, 422);
        }
        return json({ detail: { code: 'persistence_failed', input: rawError } }, 503);
      }
      assert(authAfterWrite, 'fixture must supply login status independently');
      key = clear ? '' : body.netease_music_u;
      refVersion++;
      auth = authAfterWrite;
      authAfterWrite = undefined;
      if (loseReceipt) { loseReceipt = false; return route.abort('failed'); }
      return json({ ok: true });
    }
    if (call === 'POST /api/settings/secrets/reveal') {
      assert.deepEqual(body, { secret_ref: metadata().secret_ref });
      const value = key;
      if (holdReveal) {
        holdReveal = false;
        await new Promise(resolve => { finishReveal = resolve; });
      }
      return json({ secret: value });
    }
    assert.equal(method, 'GET', 'unexpected write to ' + endpoint);
    if (endpoint === '/api/session') return json({ authenticated: true });
    if (endpoint === '/api/conversations') return json([]);
    return json({});
  });

  const nav = page.getByRole('navigation', { name: '设置分类' });
  const panel = page.getByRole('region', { name: 'Music 服务设置', exact: true });
  const credential = panel.getByRole('region', { name: 'MUSIC_U 凭据' });
  const login = panel.getByRole('region', { name: '登录状态' });
  const editor = page.getByRole('dialog', { name: '编辑 MUSIC_U' });
  const field = editor.getByLabel('新 MUSIC_U');
  const save = editor.getByRole('button', { name: '保存凭据', exact: true });
  const clear = page.getByRole('alertdialog', { name: '清除 MUSIC_U' });
  const shown = page.locator('[aria-label="临时 MUSIC_U 明文"]');
  const mask = credential.getByLabel('MUSIC_U 掩码');
  const edit = credential.getByRole('button', { name: '编辑凭据' });
  const click = (name, area = page) => area.getByRole('button', { name, exact: typeof name === 'string' }).click();
  const text = (value, area = login) => area.getByText(value, { exact: true });
  const enter = async () => {
    await click(/^Music 服务/, nav);
    await edit.and(page.locator(':enabled')).waitFor();
  };
  const checkFlow = async (index, call, body) => {
    for (let attempt = 0; calls.length < index + 3 && attempt < 100; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.deepEqual(calls.slice(index), [
      [call, body], ['GET /api/settings', undefined], ['GET /api/music/auth-status', undefined],
    ]);
  };
  const replace = async (value, authResult) => {
    await edit.click();
    assert.equal(await field.inputValue(), '');
    await field.fill(value);
    authAfterWrite = authResult;
    const index = calls.length;
    await save.click();
    await editor.waitFor({ state: 'hidden' });
    await checkFlow(index, 'PUT /api/settings', { netease_music_u: value });
  };
  const layoutBounds = async () => {
    const { width, scroll, height, bounds } = await page.evaluate(() => ({
      width: innerWidth, scroll: document.documentElement.scrollWidth, height: innerHeight,
      bounds: [...document.querySelectorAll("[data-slot='dialog-content'],[data-slot='alert-dialog-content']")].map(node => node.getBoundingClientRect().toJSON()),
    }));
    assert(scroll <= width + 1, 'horizontal overflow');
    for (const rect of bounds) assert(rect.left >= -1 && rect.right <= width + 1 && rect.top >= -1 && rect.bottom <= height + 1);
  };
  const waitHeld = async getRelease => {
    for (let attempt = 0; !getRelease() && attempt < 100; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert(getRelease(), 'fixture request must be in flight');
  };
  const screenshot = name => page.screenshot({ path: path.join(output, layout + '-' + width + '-' + name + '.png'), animations: 'disabled' });

  try {
    await page.goto(origin + '/penumbra/' + (layout === 'editorial' ? 'editorial' : ''));
    await page.getByRole('button', { name: '打开设置', exact: true }).last().click();
    await enter();
    await text('未配置', credential).waitFor();
    await text('匿名模式').waitFor();
    await text('尚未验证').waitFor();
    assert(!calls.some(([call]) => call.endsWith('/reveal')));
    await layoutBounds();

    await replace(first, snapshot('credential', 'success'));
    await text('最近登录成功').waitFor();
    await text('凭据登录').waitFor();
    assert.equal(await login.locator('time').getAttribute('datetime'), checkedAt);
    assert.equal(await mask.textContent(), '••••••••1001');
    await click('查看凭据', credential);
    await shown.waitFor();
    assert.equal(await shown.textContent(), first);
    await click('复制凭据', credential);
    await page.waitForFunction(value => window.copiedFixtureValues.includes(value), first);
    await click('隐藏凭据', credential);
    assert.equal(await shown.count(), 0);

    await edit.click();
    assert.equal(await field.getAttribute('type'), 'password');
    assert.equal(await field.inputValue(), '');
    assert(await save.isDisabled());
    await field.fill(metadata().masked);
    assert(await save.isDisabled());
    await field.fill(next);
    if (width < 768) {
      await page.setViewportSize({ width, height: 460 });
      await field.focus();
      await page.locator('.penumbra-toast-list').filter({ hasText: '已复制' }).waitFor({ state: 'attached' });
      await page.locator('.penumbra-toast-list').filter({ hasText: '已复制' }).waitFor({ state: 'hidden' });
      await layoutBounds();
      await screenshot('short-editor');
      await page.setViewportSize({ width, height });
    }
    failWrite = 'persistence';
    let index = calls.length;
    await save.click();
    await editor.getByRole('alert').filter({ hasText: '保存失败' }).waitFor();
    await checkFlow(index, 'PUT /api/settings', { netease_music_u: next });
    assert.equal(await field.inputValue(), next);
    assert.equal(key, first);

    loseReceipt = true;
    authAfterWrite = snapshot('credential', 'failed', 'login_failed');
    index = calls.length;
    await save.click();
    await editor.getByRole('alert').filter({ hasText: '保存结果未确认' }).waitFor();
    await checkFlow(index, 'PUT /api/settings', { netease_music_u: next });
    assert.equal(await field.inputValue(), next);
    await click('取消', editor);
    await text('最近登录失败').waitFor();
    assert.equal(await mask.textContent(), '••••••••2002');

    await replace(rejected, snapshot('credential', 'failed', 'login_rejected'));
    await text('最近登录失败').waitFor();
    await text('网易云音乐未认可当前凭据。').waitFor();
    await text('MUSIC_U 已保存', page.locator('.penumbra-toast')).waitFor();
    await layoutBounds();
    await screenshot('credential-failed');

    await click('清除凭据', credential);
    await text('清除 MUSIC_U 后，网易云音乐将尝试匿名登录。', clear).waitFor();
    index = calls.length;
    await click('取消', clear);
    assert.equal(calls.length, index);
    for (const failure of ['stale', 'persistence']) {
      await click('清除凭据', credential);
      const oldRef = metadata().secret_ref;
      failWrite = failure;
      index = calls.length;
      await click('确认清除', clear);
      await clear.getByRole('alert').filter({ hasText: failure === 'stale' ? '凭据引用已失效' : '保存失败' }).waitFor();
      await checkFlow(index, 'POST /api/settings/secrets/clear', { secret_ref: oldRef });
      assert(await clear.getByRole('button', { name: '确认清除' }).isDisabled());
      assert.equal(key, rejected);
      await click('取消', clear);
      assert.equal(await mask.textContent(), '••••••••4004');
    }
    await click('清除凭据', credential);
    const ref = metadata().secret_ref;
    index = calls.length;
    authAfterWrite = snapshot('anonymous', 'failed', 'login_failed');
    await click('确认清除', clear);
    await clear.waitFor({ state: 'hidden' });
    await text('未配置', credential).waitFor();
    await text('匿名模式').waitFor();
    await text('最近登录失败').waitFor();
    await text('登录尝试失败。').waitFor();
    await checkFlow(index, 'POST /api/settings/secrets/clear', { secret_ref: ref });
    await text('MUSIC_U 已清除', page.locator('.penumbra-toast')).waitFor();

    failAuth = true;
    await page.reload();
    await text('未配置', credential).waitFor();
    await text('登录状态暂不可读取。').waitFor();
    assert.equal(await text('尚未验证').count(), 0);
    auth = snapshot('anonymous', 'success');
    await click('重新读取登录状态', login);
    await text('匿名模式').waitFor();
    await text('最近登录成功').waitFor();

    await click('返回设置分类');
    holdAuth = true;
    await enter();
    await text('正在读取登录状态…').waitFor();
    await waitHeld(() => finishAuth);
    await replace(recovered, snapshot('credential', 'unverified', 'login_not_confirmed'));
    await text('凭据登录').waitFor();
    await text('尚未验证').waitFor();
    finishAuth();
    await text('本次尝试未能确认登录结果。').waitFor();
    assert.equal(await text('匿名模式').count(), 0);

    holdReveal = true;
    await click('查看凭据', credential);
    await text('正在查看凭据…', credential).waitFor();
    await waitHeld(() => finishReveal);
    await click('返回设置分类');
    finishReveal();
    holdAuth = true;
    finishAuth = undefined;
    auth = snapshot('anonymous', 'failed', 'login_failed');
    await enter();
    await waitHeld(() => finishAuth);
    await click('返回设置分类');
    auth = snapshot('credential', 'success');
    await enter();
    await text('最近登录成功').waitFor();
    finishAuth();
    await text('凭据登录').waitFor();
    assert.equal(await text('匿名模式').count(), 0);
    assert.equal(await shown.count(), 0);
    await layoutBounds();
    const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, history: history.state }));
    assert(!secretPattern.test(storage));
    assert(!secretPattern.test(await panel.innerText()));
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    return { layout, width, writes: calls.filter(([call]) => call.startsWith('PUT') || call.endsWith('/clear')).length, pageErrors: 0, external: 0 };
  } finally {
    finishAuth?.();
    finishReveal?.();
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
    for (const layout of process.env.SETTINGS_PR5_D_QUICK ? ['classic'] : ['classic', 'editorial']) {
      for (const width of process.env.SETTINGS_PR5_D_QUICK ? [320] : [320, 390, 1440]) results.push(await verify(browser, origin, layout, width));
    }
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise(done => server.close(done));
  }
})().catch(error => { console.error(error); server.closeAllConnections(); server.close(); process.exitCode = 1; });
