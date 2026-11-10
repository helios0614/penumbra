/* Run against a same-origin production build with synthetic Settings responses.
 * node tests/browser/settings-pr5-e-smoke.cjs [playwright module] [Chromium executable]
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.argv[2] || 'playwright');
const output = process.env.SETTINGS_PR5_E_OUTPUT || path.resolve(__dirname, '../../artifacts/settings-pr5-e');
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

const defaultUrl = 'https://api.siliconflow.cn/v1';
const defaultModel = 'BAAI/bge-large-zh-v1.5';
const first = 'synthetic-embedding-key-1001';
const second = 'synthetic-embedding-key-2002';
const custom = 'https://embedding.fixture.invalid/v1';
const nextAddress = 'https://next.fixture.invalid/v1';
const staleDetail = 'Secret reference is invalid or stale';
const empty = { configured: false, masked: '', secret_ref: null };
const sensitive = /synthetic-embedding-|embedding-ref-fixture-|unsafe-fixture-error|hidden-legacy-path/;

async function verify(browser, origin, layout, width) {
  const context = await browser.newContext({ viewport: { width, height: 850 },
    ...(width < 768 ? { isMobile: true, hasTouch: true } : {}) });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async value => { window.copiedFixture = value; },
    } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const calls = [], errors = [], unexpected = [];
  let address = '', model = '', key = '', version = 0, readMode, writeMode, holdCall, release, settled;
  let invalidProjection = false;
  const metadata = () => key ? {
    configured: true, masked: '••••••••' + key.slice(-4), secret_ref: 'embedding-ref-fixture-' + version,
  } : empty;
  const projection = () => ({
    embedding_custom_url: !!address && address.replace(/\/+$/, '') !== defaultUrl,
    embedding_model: model,
    siliconflow_url: 'https://legacy.fixture.invalid/hidden-legacy-path',
    siliconflow_tts_custom_url: true,
    credentials: {
      embedding_key: invalidProjection ? { ...metadata(), secret_ref: 'invalid-fixture-ref' } : metadata(),
      siliconflow_tts_key: empty,
    },
  });

  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (sensitive.test(message.text())) errors.push('unsafe console output'); });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    unexpected.push('external request');
    return route.abort();
  });
  await page.routeWebSocket(/.*/, socket => socket.close());
  await page.route('**/api/**', async route => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname;
    const call = request.method() + ' ' + endpoint;
    const body = request.postData() ? request.postDataJSON() : undefined;
    const json = async (data, status = 200) => {
      if (holdCall === call) {
        holdCall = undefined;
        await new Promise(resolve => { release = resolve; });
        settled = true;
      }
      return route.fulfill({ status, headers: { 'Cache-Control': 'no-store' }, json: data }).catch(() => {});
    };
    if (endpoint === '/api/settings' || endpoint.startsWith('/api/settings/secrets/')) calls.push([call, body]);
    if (call === 'GET /api/settings') {
      const mode = readMode;
      readMode = undefined;
      if (mode === 'fail') return json({ detail: 'unsafe-fixture-error' }, 503);
      if (mode === 'missing') return json({ credentials: {} });
      if (mode === 'mismatch') return json({ ...projection(), credentials: { embedding_key: empty } });
      return json(projection());
    }
    if (call === 'PUT /api/settings') {
      const fields = Object.keys(body);
      assert.equal(fields.length, 1);
      assert(['embedding_url', 'embedding_key'].includes(fields[0]));
      if (writeMode === 'fail') {
        writeMode = undefined;
        return json({ detail: { code: 'persistence_failed', input: 'unsafe-fixture-error' } }, 503);
      }
      if ('embedding_url' in body) {
        assert([custom, nextAddress, ''].includes(body.embedding_url));
        address = body.embedding_url;
      } else {
        assert([first, second].includes(body.embedding_key));
        key = body.embedding_key;
        version++;
      }
      return json({ ok: true });
    }
    if (call === 'POST /api/settings/secrets/reveal' || call === 'POST /api/settings/secrets/clear') {
      assert.deepEqual(Object.keys(body), ['secret_ref']);
      if (body.secret_ref !== metadata().secret_ref || !key) return json({ detail: staleDetail }, 422);
      if (call.endsWith('/reveal')) return json({ secret: key });
      key = '';
      return json({ ok: true });
    }
    if (/registry|embeddings?|siliconflow/i.test(endpoint) || request.method() !== 'GET' || endpoint.startsWith('/api/settings')) {
      unexpected.push(call);
      return json({}, 404);
    }
    if (endpoint === '/api/session') return json({ authenticated: true });
    if (endpoint === '/api/conversations') return json([]);
    return json({});
  });

  const nav = page.getByRole('navigation', { name: '设置分类' });
  const panel = page.getByRole('region', { name: 'Embedding 服务设置' });
  const addressArea = panel.getByRole('region', { name: 'API 地址' });
  const modelArea = panel.getByRole('region', { name: '模型名称' });
  const keyArea = panel.getByRole('region', { name: 'API Key' });
  const addressDialog = page.getByRole('dialog', { name: '修改 Embedding API 地址' });
  const addressField = addressDialog.getByLabel('新 API 地址');
  const addressSave = addressDialog.getByRole('button', { name: '确认保存地址' });
  const resetDialog = page.getByRole('alertdialog', { name: '恢复默认 API 地址' });
  const editor = page.getByRole('dialog', { name: '编辑 Embedding API Key' });
  const keyField = editor.getByLabel('新 Embedding API Key');
  const keySave = editor.getByRole('button', { name: '保存 Key' });
  const clearDialog = page.getByRole('alertdialog', { name: '清除 Embedding API Key' });
  const shown = page.getByLabel('临时 Embedding API Key 明文');
  const mask = page.locator('[aria-label="Embedding API Key 掩码"]');
  const toast = page.locator('.penumbra-toast');
  const button = (name, area = page) => area.getByRole('button', { name, exact: typeof name === 'string' });
  const click = (name, area) => button(name, area).click();
  const text = (value, area) => area.getByText(value, { exact: true });
  const ready = () => button('修改 API 地址', addressArea).and(page.locator(':enabled')).waitFor();
  const enter = async () => { await click(/^Embedding 服务/, nav); await ready(); };
  const leave = () => click('返回设置分类');
  const get = ['GET /api/settings', undefined];
  const assertFlow = (index, call, body) => assert.deepEqual(calls.slice(index), [[call, body], get]);
  const waitFor = async predicate => {
    for (let attempt = 0; !predicate() && attempt < 150; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
    assert(predicate(), 'expected fixture request state');
  };
  const hold = call => { holdCall = call; release = undefined; settled = false; };
  const layoutBounds = async () => {
    const viewport = await page.evaluate(() => ({
      width: innerWidth, height: innerHeight, scroll: document.documentElement.scrollWidth,
      dialogs: [...document.querySelectorAll('[data-slot="dialog-content"], [data-slot="alert-dialog-content"]')]
        .map(node => node.getBoundingClientRect().toJSON()),
    }));
    assert(viewport.scroll <= viewport.width + 1, 'horizontal overflow');
    for (const rect of viewport.dialogs) {
      assert(rect.left >= -1 && rect.right <= viewport.width + 1 && rect.top >= -1 && rect.bottom <= viewport.height + 1);
    }
  };
  const screenshot = name => page.screenshot({ path: path.join(output, layout + '-' + width + '-' + name + '.png'), animations: 'disabled' });
  const defaultStatus = '使用默认地址 · ' + defaultUrl;
  const customStatus = '已配置自定义地址';

  try {
    await page.goto(origin + '/penumbra/' + (layout === 'editorial' ? 'editorial' : ''));
    await page.getByRole('button', { name: '打开设置', exact: true }).last().click();
    readMode = 'missing';
    await click(/^Embedding 服务/, nav);
    await panel.getByRole('alert').waitFor();
    await click('重新读取', panel);
    await ready();
    await text(defaultStatus, addressArea).waitFor();
    await text(defaultModel, modelArea).waitFor();
    await text('只读', modelArea).waitFor();
    await text('未配置', keyArea).waitFor();
    assert.equal(await modelArea.locator('input, button, select, [contenteditable]').count(), 0);
    assert.equal(await button('恢复默认地址', addressArea).count(), 0);
    assert.deepEqual(calls, [get, get]);
    await layoutBounds();
    await screenshot('default');

    await click('编辑凭据', keyArea);
    assert.equal(await keyField.inputValue(), '');
    assert.equal(await keyField.getAttribute('type'), 'password');
    await keyField.fill('  ');
    assert(await keySave.isDisabled());
    await keyField.fill('••••••••');
    assert(await keySave.isDisabled());
    await keyField.fill(first);
    let index = calls.length;
    await keySave.click();
    await editor.waitFor({ state: 'hidden' });
    assertFlow(index, 'PUT /api/settings', { embedding_key: first });
    assert.equal(await mask.textContent(), metadata().masked);

    await click('查看凭据', keyArea);
    await shown.waitFor();
    assert.equal(await shown.textContent(), first);
    await click('复制凭据', keyArea);
    await page.waitForFunction(value => window.copiedFixture === value, first);
    await click('隐藏凭据', keyArea);
    assert.equal(await shown.count(), 0);

    await click('修改 API 地址', addressArea);
    assert.equal(await addressField.inputValue(), '');
    await text('修改 API 地址后，当前 Embedding API Key 会随请求发送到新地址。', addressDialog).waitFor();
    for (const invalid of ['http://fixture.invalid', 'https://user@fixture.invalid/v1', 'https://fixture.invalid?q=1']) {
      await addressField.fill(invalid);
      assert(await addressSave.isDisabled());
    }
    if (width < 768) {
      await page.setViewportSize({ width, height: 460 });
      await addressField.focus();
      await layoutBounds();
      await screenshot('short-address');
      await page.setViewportSize({ width, height: 850 });
    }
    await addressField.fill(custom);
    writeMode = 'fail';
    index = calls.length;
    await addressSave.click();
    await addressDialog.getByRole('alert').filter({ hasText: '保存失败' }).waitFor();
    assertFlow(index, 'PUT /api/settings', { embedding_url: custom });
    assert.equal(await addressField.inputValue(), custom);
    assert.equal(address, '');

    readMode = 'fail';
    model = 'fixture/saved-model';
    index = calls.length;
    await addressSave.click();
    await addressDialog.getByRole('alert').filter({ hasText: '配置读回失败' }).waitFor();
    assertFlow(index, 'PUT /api/settings', { embedding_url: custom });
    assert.equal(await addressField.inputValue(), custom);
    assert((await page.locator('section[aria-label="API 地址"]').innerText()).includes(defaultStatus));
    assert((await page.locator('section[aria-label="模型名称"]').innerText()).includes(defaultModel));
    assert(await addressSave.isDisabled());
    assert.equal(await toast.getByText('API 地址配置状态已确认').count(), 0);
    await click('重新读取', addressDialog);
    await addressSave.and(page.locator(':enabled')).waitFor();
    assert.equal(await addressField.inputValue(), custom);
    assert.deepEqual(calls.slice(index + 2), [get]);
    await click('关闭', addressDialog);
    await text(customStatus, addressArea).waitFor();
    await text(model, modelArea).waitFor();
    assert(!(await panel.innerText()).includes(custom));
    assert.equal(key, first);
    await screenshot('custom');

    await click('修改 API 地址', addressArea);
    assert.equal(await addressField.inputValue(), '');
    await addressField.fill(nextAddress);
    index = calls.length;
    await addressSave.click();
    await addressDialog.waitFor({ state: 'hidden' });
    assertFlow(index, 'PUT /api/settings', { embedding_url: nextAddress });

    await click('恢复默认地址', addressArea);
    index = calls.length;
    await click('取消', resetDialog);
    assert.equal(calls.length, index);
    await click('恢复默认地址', addressArea);
    await click('确认恢复默认', resetDialog);
    await resetDialog.waitFor({ state: 'hidden' });
    assertFlow(index, 'PUT /api/settings', { embedding_url: '' });
    await text(defaultStatus, addressArea).waitFor();
    assert.equal(key, first);

    // An invalid reference and an expired one both produce C1's safe 422.
    invalidProjection = true;
    await leave();
    await enter();
    invalidProjection = false;
    index = calls.length;
    await click('查看凭据', keyArea);
    await keyArea.getByRole('alert').filter({ hasText: '请重新查看' }).waitFor();
    assertFlow(index, 'POST /api/settings/secrets/reveal', { secret_ref: 'invalid-fixture-ref' });
    assert.equal(await shown.count(), 0);
    await click('查看凭据', keyArea);
    await shown.waitFor();
    await click('编辑凭据', keyArea);
    assert.equal(await shown.count(), 0);
    assert.equal(await keyField.inputValue(), '');
    await keyField.fill(metadata().masked);
    assert(await keySave.isDisabled());
    await keyField.fill(second);
    if (width < 768) {
      await page.setViewportSize({ width, height: 460 });
      await keyField.focus();
      await layoutBounds();
      await screenshot('short-key');
      await page.setViewportSize({ width, height: 850 });
    }
    readMode = 'mismatch';
    index = calls.length;
    await keySave.click();
    await editor.getByRole('alert').filter({ hasText: '读回状态与本次操作不一致' }).waitFor();
    assertFlow(index, 'PUT /api/settings', { embedding_key: second });
    assert.equal(await keyField.inputValue(), second);
    readMode = 'fail';
    index = calls.length;
    await keySave.click();
    await editor.getByRole('alert').filter({ hasText: '配置读回失败' }).waitFor();
    assertFlow(index, 'PUT /api/settings', { embedding_key: second });
    assert.equal(await keyField.inputValue(), second);
    assert.equal(await mask.count(), 0);
    assert(await keySave.isDisabled());
    await click('重新读取', editor);
    await keySave.and(page.locator(':enabled')).waitFor();
    assert.equal(await keyField.inputValue(), second);
    await click('取消', editor);
    assert.equal(await mask.textContent(), metadata().masked);

    await click('清除凭据', keyArea);
    const expiredRef = metadata().secret_ref;
    version++;
    index = calls.length;
    await click('确认清除', clearDialog);
    await clearDialog.getByRole('alert').filter({ hasText: '请重新确认' }).waitFor();
    assertFlow(index, 'POST /api/settings/secrets/clear', { secret_ref: expiredRef });
    assert(await button('确认清除', clearDialog).isDisabled());
    assert.equal(key, second);
    await click('取消', clearDialog);

    hold('POST /api/settings/secrets/reveal');
    await click('查看凭据', keyArea);
    await waitFor(() => release);
    await leave();
    await enter();
    release();
    await waitFor(() => settled);
    assert.equal(await shown.count(), 0);

    await click('清除凭据', keyArea);
    index = calls.length;
    await click('确认清除', clearDialog);
    await clearDialog.waitFor({ state: 'hidden' });
    assertFlow(index, 'POST /api/settings/secrets/clear', { secret_ref: 'embedding-ref-fixture-' + version });
    await text('未配置', keyArea).waitFor();
    assert.equal(address, '');

    await click('编辑凭据', keyArea);
    assert.equal(await keyField.inputValue(), '');
    await keyField.fill(first);
    hold('PUT /api/settings');
    index = calls.length;
    await keySave.evaluate(node => { node.click(); node.click(); });
    await waitFor(() => release);
    assert.deepEqual(calls.slice(index), [['PUT /api/settings', { embedding_key: first }]]);
    assert(await keyField.isDisabled());
    assert(await page.locator('section[aria-label="API 地址"] button').first().isDisabled());
    await page.evaluate(() => history.back());
    await panel.waitFor({ state: 'hidden' });
    await enter();
    assert.equal(await mask.textContent(), metadata().masked);
    release();
    await waitFor(() => settled);
    assert.deepEqual(calls.slice(index), [['PUT /api/settings', { embedding_key: first }], get]);
    assert.equal(await toast.getByText('Embedding API Key 已保存').count(), 0);
    assert.equal(await shown.count(), 0);
    await click('编辑凭据', keyArea);
    assert.equal(await keyField.inputValue(), '');
    await click('取消', editor);

    await click('修改 API 地址', addressArea);
    await addressField.fill(custom);
    hold('GET /api/settings');
    index = calls.length;
    await addressSave.click();
    await waitFor(() => release);
    await page.evaluate(() => history.back());
    await panel.waitFor({ state: 'hidden' });
    model = 'fixture/newer-model';
    await enter();
    release();
    await waitFor(() => settled);
    assert.deepEqual(calls.slice(index), [['PUT /api/settings', { embedding_url: custom }], get, get]);
    await text(model, modelArea).waitFor();
    assert.equal(await toast.getByText('API 地址配置状态已确认').count(), 0);

    const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, history: history.state }));
    assert(!sensitive.test(storage));
    assert(!sensitive.test(await panel.innerText()));
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    await layoutBounds();
    return { layout, width, settingsRequests: calls.length, pageErrors: 0, unexpectedRequests: 0 };
  } finally {
    release?.();
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
    for (const layout of process.env.SETTINGS_PR5_E_QUICK ? ['classic'] : ['classic', 'editorial']) {
      for (const width of process.env.SETTINGS_PR5_E_QUICK ? [320] : [320, 390, 1440]) results.push(await verify(browser, origin, layout, width));
    }
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise(done => server.close(done));
  }
})().catch(error => { console.error(error); server.closeAllConnections(); server.close(); process.exitCode = 1; });
