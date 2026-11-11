/* Run against a disposable AionHome instance serving a production Penumbra build.
 * The fixture uses synthetic/synthetic-test and a conversation with user and AI messages.
 * APPEARANCE_TEST_ORIGIN=http://127.0.0.1:47816 node tests/browser/appearance-persistence-smoke.cjs [playwright] [chrome]
 */
const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2] || 'playwright');
const origin = process.env.APPEARANCE_TEST_ORIGIN;
const endpoint = '/api/appearance';
const login = { username: 'synthetic', password: 'synthetic-test' };
const red = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAAF0lEQVR4nGM87BjPQAgwEVQxqmgAggAAe/wBe4QKKL8AAAAASUVORK5CYII=', 'base64');
const green = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAAF0lEQVR4nGN0WtrKQAgwEVQxqmgAggAAit8BhNJtt14AAAAASUVORK5CYII=', 'base64');
const oldLayout = [
  { instanceId: 'legacy-sticker', widgetId: 'sticker', page: 0, position: { col: 1, row: 1 } },
  { instanceId: 'local-clock', widgetId: 'clock', page: 0, position: { col: 0, row: 0 } },
];

async function startContext(browser, viewport) {
  const context = await browser.newContext({
    viewport, colorScheme: 'light', hasTouch: viewport.width < 600, reducedMotion: 'reduce', serviceWorkers: 'allow',
  });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  assert((await context.request.post(origin + '/api/auth/login', { data: login })).ok());
  return context;
}

async function seedLegacy(page) {
  await page.evaluate(async ({ layout, image }) => {
    localStorage.setItem('penumbra-theme-mode', 'light');
    localStorage.setItem('penumbra-theme-color', '#ABCDEF');
    localStorage.setItem('penumbra-ai-color', '#123456');
    localStorage.setItem('penumbra-wallpaper-settings', JSON.stringify({ mode: 'custom', fit: 'contain', shade: 'clear' }));
    localStorage.setItem('penumbra-desktop-layout', JSON.stringify(layout));
    localStorage.setItem('penumbra-desktop-layout-version', '2');
    for (const [dbName, storeName, key] of [
      ['penumbra-preferences', 'wallpapers', 'desktop'],
      ['penumbra-widget-assets', 'images', 'desktop-sticker'],
    ]) {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(storeName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(new Blob([new Uint8Array(image)], { type: 'image/png' }), key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }
  }, { layout: oldLayout, image: [...red] });
}

async function read(context) {
  const response = await context.request.get(origin + endpoint);
  assert.equal(response.status(), 200);
  assert.equal(response.headers()['cache-control'], 'no-store');
  return response.json();
}

async function openAppearance(page, editorial = false) {
  const response = await page.goto(origin + '/penumbra/' + (editorial ? 'editorial/' : '') + 'app/settings');
  assert(response.ok(), 'The AionHome static router must serve Settings');
  const appearance = page.getByRole('region', { name: '外观', exact: true });
  if (!await appearance.isVisible()) {
    await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: /^外观/ }).click();
  }
  await appearance.getByRole('radio', { name: /^深色/ }).waitFor();
  return appearance;
}

async function mutate(page, method, path, action, status = 200) {
  const [response] = await Promise.all([
    page.waitForResponse(value => new URL(value.url()).pathname === endpoint + path && value.request().method() === method),
    action(),
  ]);
  assert.equal(response.status(), status, await response.text());
  return response.json();
}

function upload(scope, label, buffer) {
  return scope.getByLabel(label, { exact: true }).setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer });
}

async function expectAvatar(page, kind, reference) {
  await page.waitForFunction(({ kind, reference }) => Array.from(document.querySelectorAll(`[data-avatar-kind="${kind}"] img`)).some(image => {
    const path = new URL(image.src).pathname;
    return image.complete && image.naturalWidth > 0 && (reference ? path.endsWith('/' + reference) : path.includes('placeholder-'));
  }), { kind, reference });
}

async function assertTheme(page, color) {
  await page.waitForFunction(value => document.documentElement.classList.contains('dark') &&
    document.documentElement.style.getPropertyValue('--color-theme') === value, color);
}

async function run(browser) {
  const desktop = await startContext(browser, { width: 1440, height: 900 });
  const mobile = await startContext(browser, { width: 390, height: 800 });
  const a = await desktop.newPage();
  const b = await mobile.newPage();
  const errors = [];
  for (const page of [a, b]) page.on('pageerror', error => errors.push(error.message));
  try {
    const base = await read(desktop);
    assert.equal(base.wallpaper.image, null, 'Use an empty disposable appearance fixture');
    await b.goto(origin + '/login');
    await seedLegacy(b);
    const bootWrites = [];
    b.on('request', request => {
      if (request.url().includes(endpoint) && request.method() !== 'GET') bootWrites.push(request.method());
    });
    await b.goto(origin + '/penumbra/');
    await b.locator('.desktop-wallpaper[data-wallpaper-mode="ambient"]').waitFor();
    await b.locator('[data-widget-id="sticker"]').waitFor({ state: 'attached' });
    assert.equal(await b.locator('[data-widget-id="sticker"] img').count(), 0);
    assert.equal(await b.locator('[data-widget-id="sticker"]').count(), 1);
    assert.deepEqual(await read(mobile), base);
    assert.deepEqual(bootWrites, []);

    const appearance = await openAppearance(a);
    await mutate(a, 'PATCH', '', () => appearance.getByRole('radio', { name: /^深色/ }).click());
    await mutate(a, 'PATCH', '', () => appearance.getByRole('button', { name: '使用海蓝主题', exact: true }).click());
    await mutate(a, 'PATCH', '', () => appearance.getByRole('button', { name: '使用青瓷 AI 主题', exact: true }).click());
    await assertTheme(a, '#4A6FD4');

    const uploaded = await mutate(a, 'PUT', '/images/wallpaper', () => upload(appearance, '选择自定义壁纸', red));
    await mutate(a, 'PATCH', '', () => appearance.getByRole('button', { name: '底部', exact: true }).click());
    const wallpaper = (await mutate(a, 'PUT', '/images/wallpaper', () => upload(appearance, '选择自定义壁纸', green))).wallpaper;
    assert.notEqual(wallpaper.image, uploaded.wallpaper.image);
    assert.equal(wallpaper.position, 'bottom');

    const user = (await mutate(a, 'PUT', '/images/user-avatar', () => upload(appearance, '上传用户头像', red))).avatars.user;
    const ai = (await mutate(a, 'PUT', '/images/assistant-avatar', () => upload(appearance, '上传AI 角色头像', green))).avatars.assistant;
    const nextUser = (await mutate(a, 'PUT', '/images/user-avatar', () => upload(appearance, '替换用户头像', green))).avatars.user;
    const nextAi = (await mutate(a, 'PUT', '/images/assistant-avatar', () => upload(appearance, '替换AI 角色头像', red))).avatars.assistant;
    assert.notEqual(user, nextUser);
    assert.notEqual(ai, nextAi);
    await expectAvatar(a, 'user', nextUser);
    await expectAvatar(a, 'assistant', nextAi);
    assert((await a.reload()).ok(), 'The authenticated Settings URL must survive reload');
    await assertTheme(a, '#4A6FD4');
    await expectAvatar(a, 'user', nextUser);

    await a.route('**/api/appearance/images/user-avatar', route => route.fulfill({ status: 503, json: { detail: 'fixture' } }));
    await mutate(a, 'PUT', '/images/user-avatar', () => upload(appearance, '替换用户头像', red), 503);
    await appearance.getByRole('alert').getByText('保存图片失败，请稍后重试').waitFor();
    await expectAvatar(a, 'user', nextUser);
    assert.equal((await read(mobile)).avatars.user, nextUser);
    await a.unroute('**/api/appearance/images/user-avatar');

    await b.reload();
    await assertTheme(b, '#4A6FD4');
    await b.waitForFunction(name => document.querySelector('.desktop-wallpaper-image')?.style.backgroundImage.includes(name), wallpaper.image);
    assert.match(await b.locator('.desktop-wallpaper-image').evaluate(node => node.style.backgroundPosition), /bottom$/);
    await b.evaluate(async name => {
      const image = new Image();
      image.src = '/api/appearance/images/wallpaper/' + name;
      await image.decode();
    }, wallpaper.image);
    assert.deepEqual(await b.evaluate(() => JSON.parse(localStorage.getItem('penumbra-desktop-layout'))), oldLayout);
    assert.deepEqual(bootWrites, []);

    await a.goto(origin + '/penumbra/');
    await a.getByRole('button', { name: '切换到桌面第2页' }).click();
    const sticker = a.locator('[data-widget-id="sticker"]');
    const stickerImage = (await mutate(a, 'PUT', '/images/sticker', () => upload(sticker, '更换贴纸图片', green))).stickerImage;
    await a.getByRole('button', { name: '编辑桌面', exact: true }).click();
    await a.getByRole('button', { name: '添加桌面组件', exact: true }).click();
    const [addition] = await Promise.all([
      a.waitForResponse(value => value.url().includes(endpoint + '/stickers/sticker-') && value.request().method() === 'PUT'),
      a.getByRole('button', { name: /^贴纸/ }).click(),
    ]);
    assert(addition.ok(), await addition.text());
    const placement = (await addition.json()).stickers.find(item => item.id !== 'sticker-default');
    assert.equal(placement.page, 1);
    assert.deepEqual(placement.size, { cols: 1, rows: 1 });
    assert(Number.isInteger(placement.position.row) && Number.isInteger(placement.position.col));

    await b.reload();
    await b.waitForFunction(name => document.querySelectorAll(`[data-widget-id="sticker"] img[src$="${name}"]`).length === 2, stickerImage);
    await mutate(a, 'DELETE', '/stickers/sticker-default', () => sticker.first().getByRole('button', { name: '移除组件' }).click());
    await b.reload();
    await b.waitForFunction(name => document.querySelectorAll('[data-widget-id="sticker"]').length === 1 &&
      document.querySelector('[data-widget-id="sticker"] img')?.src.endsWith(name), stickerImage);
    assert.deepEqual((await read(mobile)).stickers, [placement]);

    await b.goto(origin + '/penumbra/editorial/app/chat');
    await expectAvatar(b, 'user', nextUser);
    await expectAvatar(b, 'assistant', nextAi);
    await assertTheme(b, '#4A6FD4');
    assert.equal(await b.locator('.desktop-wallpaper-image').count(), 0);
    assert.equal(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);

    const settings = await openAppearance(a, true);
    await mutate(a, 'DELETE', '/images/user-avatar', () => settings.getByRole('button', { name: '恢复默认用户头像' }).click());
    await mutate(a, 'DELETE', '/images/assistant-avatar', () => settings.getByRole('button', { name: '恢复默认AI 角色头像' }).click());
    await b.reload();
    await expectAvatar(b, 'user', null);
    await expectAvatar(b, 'assistant', null);
    assert.deepEqual(errors, []);
    console.log('Appearance browser smoke passed: authenticated desktop/mobile, Classic/Editorial, two contexts, both avatars, wallpaper, stickers, stale browser storage, and failed save');
  } finally {
    await desktop.close();
    await mobile.close();
  }
}

(async () => {
  const fixtureUrl = new URL(origin);
  assert.equal(fixtureUrl.hostname, '127.0.0.1', 'Use a disposable localhost fixture');
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try { await run(browser); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
