/* Run after npm run build: node tests/browser/production-subpath-smoke.cjs [playwright module] [browser executable].
 * Standalone: local Vite preview/dev with synthetic backend API/WS.
 * Exported exercise(..., { mockBackend: false }): real local FastAPI transport,
 * whose business API fixtures are supplied by the integration test application. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const dist = path.join(root, 'dist');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function files(directory) {
  assert(fs.lstatSync(directory).isDirectory(), `Not a real directory: ${directory}`);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    const stat = fs.lstatSync(file);
    assert(!stat.isSymbolicLink(), `Symbolic link in build: ${file}`);
    assert(stat.isDirectory() || stat.isFile(), `Non-regular build file: ${file}`);
    return stat.isDirectory() ? files(file) : [file];
  });
}

function contained(directory, file) {
  const relative = path.relative(directory, file);
  return relative !== '' && !path.isAbsolute(relative) && relative.split(path.sep)[0] !== '..';
}

// Ordinary CI/preview keeps working without a manifest. Release packaging must
// supply requireManifest and the exact file set it will actually copy.
function checkBuild({ distDirectory = dist, finalFiles, requireManifest = false } = {}) {
  const directory = path.resolve(distDirectory);
  const builtFiles = files(directory);
  const builtNames = new Set(builtFiles.map(file => path.relative(directory, file).split(path.sep).join('/')));
  const published = new Set(finalFiles ?? [...builtNames].filter(file => file !== '.vite/manifest.json'));
  for (const file of published) assert(builtNames.has(file), `Missing published file: ${file}`);
  assert(published.has('index.html'), 'Missing published index.html');
  const realDirectory = fs.realpathSync(directory);
  const base = '/penumbra/';
  const origin = 'https://penumbra-build.invalid';

  function resource(reference, from = 'index.html', manifestFile = false) {
    assert(typeof reference === 'string' && reference.length > 0, 'Empty resource reference');
    if (!manifestFile && from.endsWith('.css') && /^data:/i.test(reference)) {
      // Data payloads may contain percent-encoded binary bytes, not UTF-8 paths.
      assert(!/%(?![0-9a-f]{2})/i.test(reference), 'Invalid inline CSS data encoding');
      assert(new URL(reference).protocol === 'data:' && reference.includes(','), 'Invalid inline CSS data URL');
      return null; // Existing inline CSS resources do not name filesystem files.
    }
    // Validate encoding in query/fragment too, rather than silently discarding it.
    const decoded = decodeURIComponent(reference);
    assert(reference === reference.trim() && !/[\\\u0000-\u001f\u007f]/.test(decoded), `Invalid resource URL: ${reference}`);
    assert(!/^(?:[A-Za-z][\w+.-]*:|\/\/)/.test(reference), `External resource: ${reference}`);
    if (manifestFile) assert(!/^[/?#]|[?#]/.test(reference), `Invalid manifest file: ${reference}`);
    const rawPath = reference.split(/[?#]/, 1)[0];
    const decodedPath = decodeURIComponent(rawPath);
    // Reject dot segments before WHATWG URL normalization can erase evidence.
    assert(!decodedPath.split('/').some(part => part === '..'), `Resource traversal: ${reference}`);
    assert(!/%(?:2f|5c)/i.test(rawPath) && !/%[0-9a-f]{2}/i.test(decodedPath), `Ambiguous resource encoding: ${reference}`);
    const url = new URL(manifestFile ? base + reference : reference, origin + base + from);
    assert(url.origin === origin, `External resource: ${reference}`);
    const pathname = decodeURIComponent(url.pathname);
    assert(contained(base, pathname), `Static URL escaped application base: ${reference}`);
    const relative = path.posix.relative(base, pathname);
    const target = path.resolve(directory, relative);
    assert(contained(directory, target), `Resource escaped dist: ${reference}`);
    assert(published.has(relative), `Resource absent from final release: ${reference}`);
    assert(fs.lstatSync(target).isFile(), `Missing regular built asset: ${reference}`);
    assert(contained(realDirectory, fs.realpathSync(target)), `Resource real path escaped dist: ${reference}`);
    return relative;
  }

  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  const entryUrls = [...html.matchAll(/(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)]
    .map(match => match[1] ?? match[2] ?? match[3]);
  const entries = entryUrls.map(url => resource(url));
  assert(entries.some(file => file.endsWith('.js')), 'Missing JavaScript entry');
  assert(entries.some(file => file.endsWith('.css')), 'Missing CSS entry');
  let staticUrls = entryUrls.length;
  for (const relative of published) {
    const file = path.join(directory, relative);
    if (/\.(js|css)$/.test(file)) {
      const content = fs.readFileSync(file, 'utf8');
      assert(!/AionHome API Proxy Test|Chat Markdown 开发验收|Ready to test the Vite dev proxy/.test(content), `Development page in ${path.basename(file)}`);
      if (file.endsWith('.css')) {
        const css = content.replace(/\/\*[\s\S]*?\*\//g, '');
        const urls = [...css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/gi)]
          .map(match => match[1] ?? match[2] ?? match[3]);
        urls.push(...[...css.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)].map(match => match[1] ?? match[2]));
        for (const url of urls) if (resource(url, relative) !== null) staticUrls++;
      }
    }
  }

  const hasManifest = builtNames.has('.vite/manifest.json');
  assert(!requireManifest || hasManifest, 'Missing Vite build manifest');
  let manifest = null;
  if (hasManifest) {
    const graph = JSON.parse(fs.readFileSync(path.join(directory, '.vite/manifest.json'), 'utf8'));
    assert(graph && typeof graph === 'object' && !Array.isArray(graph), 'Invalid Vite manifest');
    const chunks = Object.entries(graph);
    assert(chunks.length > 0 && chunks.some(([, chunk]) => chunk?.isEntry === true), 'Manifest has no entry');
    manifest = { entries: chunks.length, imports: 0, dynamicImports: 0, css: 0, assets: 0 };
    for (const [key, chunk] of chunks) {
      assert(chunk && typeof chunk === 'object' && !Array.isArray(chunk), `Invalid manifest entry: ${key}`);
      resource(chunk.file, 'index.html', true);
      for (const field of ['imports', 'dynamicImports', 'css', 'assets']) {
        if (chunk[field] === undefined) continue;
        assert(Array.isArray(chunk[field]), `Invalid manifest ${field}: ${key}`);
        for (const reference of chunk[field]) {
          assert(typeof reference === 'string' && reference.length > 0, `Invalid manifest ${field} reference`);
          if (field === 'imports' || field === 'dynamicImports') {
            assert(Object.hasOwn(graph, reference), `Missing manifest key: ${reference}`);
            resource(graph[reference]?.file, 'index.html', true);
          } else resource(reference, 'index.html', true);
          manifest[field]++;
        }
      }
    }
  }
  return {
    staticUrls,
    developmentPagesExcluded: true,
    manifest,
    fileCount: published.size,
    sizeBytes: [...published].reduce((total, file) => total + fs.statSync(path.join(directory, file)).size, 0),
  };
}

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

// Exercise the loaded stylesheet in a browser: source-text checks cannot catch
// a production optimizer dropping the standard backdrop-filter declaration.
async function checkGlassStyles(page) {
  const results = await page.evaluate(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none';
    host.innerHTML = `<div class="mist-glass" data-probe="ordinary"></div>
      <div class="glass-card" data-probe="alias"></div>
      <div class="mist-glass-strong" data-probe="strong"></div>
      <div class="chat-conversations-drawer" data-probe="drawer"></div>
      <div class="glass-nav" data-probe="nav"></div>
      <div class="desktop-wallpaper" data-wallpaper-mode="custom" data-wallpaper-shade="soft">
        <div class="desktop-wallpaper-overlay" data-probe="soft-wallpaper"></div>
        <span class="desktop-shortcut-label" data-probe="wallpaper-label"></span>
      </div>
      <div class="widget-card mist-glass sticker-widget-frame" data-probe="sticker"></div>
      <div class="widget-card mist-glass signature-widget-frame" data-probe="signature"></div>`;
    document.body.append(host);
    try {
      return ['light', 'dark'].flatMap(theme => {
        root.classList.toggle('dark', theme === 'dark');
        return [...host.querySelectorAll('[data-probe]')].map(element => ({
          theme, material: element.dataset.probe, backdrop: getComputedStyle(element).backdropFilter,
        }));
      });
    } finally {
      host.remove();
      root.classList.toggle('dark', wasDark);
    }
  });
  const expected = {
    ordinary: 'blur(18px) saturate(1.25)', alias: 'blur(18px) saturate(1.25)',
    strong: 'blur(22px) saturate(1.3)', drawer: 'blur(26px) saturate(1.25)',
    nav: 'blur(20px)', 'soft-wallpaper': 'blur(3px)', 'wallpaper-label': 'blur(8px)',
    sticker: 'none', signature: 'none',
  };
  for (const result of results) assert.equal(result.backdrop, expected[result.material], JSON.stringify(result));
  return results;
}

async function startVite(preview) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'),
    ...(preview ? ['preview'] : []), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    // Override the ignored local development target, without reading or changing it.
    env: { ...process.env, PENUMBRA_DEV_PROXY_TARGET: 'http://127.0.0.1:1' },
  });
  let logs = '';
  child.stdout.on('data', data => { logs += data; });
  child.stderr.on('data', data => { logs += data; });
  try {
    for (let attempt = 0; attempt < 300; attempt++) {
      if (child.exitCode !== null) throw new Error(`Vite exited: ${logs}`);
      try {
        const response = await fetch(`${origin}${preview ? '/penumbra/' : '/'}`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) return { origin, stop: () => stop(child) };
      } catch { /* Local server is still starting. */ }
      await pause(100);
    }
    throw new Error(`Vite startup timeout: ${logs}`);
  } catch (error) { await stop(child); throw error; }
}

async function stop(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill();
  await exited;
}

async function exercise(browser, origin, production, width, { mockBackend = true } = {}) {
  const base = production ? '/penumbra/' : '/';
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
  const requests = [], sockets = [], errors = [], failures = [], escaped = [];
  let legacyDestination = false;
  await context.addCookies([{ name: 'aion_session', value: 'synthetic-switch-session', url: origin, httpOnly: true, sameSite: 'Lax' }]);
  await context.addInitScript(() => {
    if (localStorage.getItem('penumbra-desktop-layout')) return;
    const items = [
      ['clock', 0, 0, 0], ['weather', 0, 1, 0], ['sticker', 1, 0, 0],
      ['music', 1, 2, 0], ['signature', 1, 0, 1], ['calendar', 1, 0, 2],
      ['chat', 1, 2, 2], ['notes', 1, 0, 4], ['todo', 1, 2, 4],
    ].map(([widgetId, page, col, row]) => ({ instanceId: `${widgetId}-fixture`, widgetId, page, position: { col, row } }));
    localStorage.setItem('penumbra-desktop-layout', JSON.stringify(items));
    localStorage.setItem('penumbra-desktop-layout-version', '2');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  if (mockBackend) await context.routeWebSocket(() => true, socket => {
    const url = new URL(socket.url());
    if (!production && url.origin.replace(/^ws/, 'http') === origin && url.pathname === '/') {
      socket.connectToServer(); // Vite's own local HMR socket, separate from the backend /ws.
      return;
    }
    sockets.push(url.pathname);
  });
  else page.on('websocket', socket => sockets.push(new URL(socket.url()).pathname));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { escaped.push(url.origin); return route.abort('blockedbyclient'); }
    if (mockBackend && legacyDestination && url.pathname === '/' && request.isNavigationRequest()) {
      assert.equal(request.frame(), page.mainFrame());
      assert((await request.allHeaders()).cookie.includes('aion_session=synthetic-switch-session'));
      return route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic legacy home</h1>' });
    }
    if (url.pathname.startsWith('/api/')) {
      requests.push({ path: url.pathname, method: request.method() });
      if (!mockBackend) return route.continue();
      const fixtures = {
        '/api/session': { authenticated: true }, '/api/conversations': [], '/api/models': [],
        '/api/main/configuration': { connections: [], allowed_protocols: [], profiles: [], models: [], selection: null, connection_selection: null, diagnostic: null },
        '/api/chat/readiness': { ready: false, model_key: '', reason_code: 'provider_not_configured', setup_action_required: true },
        '/api/auth/logout': { ok: true },
      };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(fixtures[url.pathname] ?? {}) });
    }
    if (production && ['script', 'stylesheet', 'font', 'image'].includes(request.resourceType())) {
      assert(url.pathname.startsWith(base), `Browser asset escaped base: ${url.pathname}`);
    }
    return route.continue();
  });
  const classicHome = () => page.getByTestId('dock-app-chat').waitFor();
  const chat = () => page.getByRole('heading', { name: '暂无会话', exact: true }).waitFor();
  const editorialHome = () => page.locator('.editorial-home').waitFor();
  const pathname = () => new URL(page.url()).pathname;
  const hiddenEntries = async () => {
    for (const name of ['打开音乐', '打开天气', '打开笔记']) assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0);
    for (const id of ['notes', 'music', 'weather', 'chat', 'calendar', 'todo']) assert.equal(await page.locator(`[data-widget-id="${id}"]`).count(), 0);
  };
  try {
    await page.goto(`${origin}${base}`); await classicHome();
    const glassStyles = await checkGlassStyles(page);
    await hiddenEntries();
    for (const id of ['clock', 'sticker', 'signature']) assert.equal(await page.locator(`[data-widget-id="${id}"]`).count(), 1);
    await page.getByRole('button', { name: '编辑桌面', exact: true }).click();
    await page.getByRole('button', { name: '添加桌面组件', exact: true }).click();
    const picker = page.getByRole('heading', { name: '添加到首页', exact: true }).locator('..').locator('..').locator('..');
    for (const name of ['对话', '日历', '待办', '音乐', '天气', '笔记']) assert.equal(await picker.getByRole('button', { name: new RegExp(`^${name}`) }).count(), 0);
    for (const name of ['时钟', '贴纸', '个性签名']) assert.equal(await picker.getByRole('button', { name: new RegExp(`^${name}`) }).count(), 1);
    await picker.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: '完成编辑', exact: true }).click();
    const savedWidgetIds = await page.evaluate(() => JSON.parse(localStorage.getItem('penumbra-desktop-layout')).map(item => item.widgetId));
    for (const id of ['notes', 'music', 'weather', 'chat', 'calendar', 'todo']) assert(savedWidgetIds.includes(id));
    await page.getByRole('button', { name: '打开对话', exact: true }).last().click();
    await chat(); assert.equal(pathname(), `${base}app/chat`);
    await page.reload(); await chat();
    await page.goBack(); await classicHome(); assert.equal(pathname(), base);
    await page.goForward(); await chat(); assert.equal(pathname(), `${base}app/chat`);
    await page.getByRole('button', { name: '返回桌面', exact: true }).click(); await classicHome();
    assert.equal(pathname(), base);

    // A direct detail load has no app-owned history entry: close must replace with the correct desktop.
    await page.goto(`${origin}${base}app/chat`); await chat();
    await page.reload(); await chat();
    await page.getByRole('button', { name: '返回桌面', exact: true }).click(); await classicHome();
    assert.equal(pathname(), base);
    await page.getByRole('button', { name: '编辑桌面', exact: true }).click();
    await page.getByRole('button', { name: '切换到实验桌面', exact: true }).click(); await editorialHome();
    assert.equal(pathname(), `${base}editorial`);
    await page.goto(`${origin}${base}editorial`); await editorialHome();
    await page.reload(); await editorialHome();
    assert.equal(pathname(), `${base}editorial`);
    await hiddenEntries();
    assert.equal(await page.getByRole('heading', { name: 'Today', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '播放音乐', exact: true }).count(), 0);
    await page.getByRole('button', { name: '打开对话', exact: true }).last().click(); await chat();
    assert.equal(pathname(), `${base}editorial/app/chat`);
    await page.reload(); await chat();
    await page.goBack(); await editorialHome(); assert.equal(pathname(), `${base}editorial`);
    await page.goForward(); await chat();
    await page.getByRole('button', { name: '返回桌面', exact: true }).click(); await editorialHome();
    await page.goto(`${origin}${base}editorial/app/music/`);
    await page.getByRole('heading', { name: '音乐', exact: true, level: 1 }).waitFor();
    await page.reload(); await page.getByRole('heading', { name: '音乐', exact: true, level: 1 }).waitFor();
    await page.getByRole('button', { name: '返回桌面', exact: true }).click(); await editorialHome();
    assert.equal(pathname(), `${base}editorial`);
    await page.getByRole('button', { name: '返回经典桌面', exact: true }).click(); await classicHome();
    assert.equal(pathname(), base);

    // The shared Settings link must leave either Penumbra desktop for the root,
    // even in a production build whose internal base is /penumbra/.
    for (const desktop of ['', 'editorial']) {
      await page.goto(`${origin}${base}${desktop}`);
      await page.getByRole('button', { name: '打开设置', exact: true }).last().click();
      const link = page.getByRole('link', { name: '返回旧版知远', exact: true });
      await link.scrollIntoViewIfNeeded();
      assert.equal(await link.getAttribute('href'), '/');
      assert.equal(await link.getAttribute('target'), '_top');
      assert(await page.locator('#frontend-version-note').isVisible());
      legacyDestination = true;
      await link.click();
      await page.getByRole('heading', { name: 'Synthetic legacy home', exact: true }).waitFor();
      assert.equal(pathname(), '/');
      assert(await page.evaluate(() => window === window.top));
      assert.equal(page.frames().length, 1);
      const cookies = await context.cookies(origin);
      assert.equal(cookies.find(cookie => cookie.name === 'aion_session').value, 'synthetic-switch-session');
      legacyDestination = false;
    }

    const proxyPage = await page.goto(`${origin}${base}proxy-test`);
    if (production && !mockBackend) {
      assert.equal(proxyPage.status(), 404);
      assert.equal((await page.goto(`${origin}${base}dev/chat-markdown`)).status(), 404);
      // Expected errors are recorded separately from unexpected resource failures.
      assert.deepEqual(failures.splice(0), [`404 ${base}proxy-test`, `404 ${base}dev/chat-markdown`]);
    } else if (production) {
      await classicHome(); assert.equal(await page.getByRole('heading', { name: 'AionHome API Proxy Test' }).count(), 0);
      await page.goto(`${origin}${base}dev/chat-markdown`); await classicHome();
      assert.equal(await page.getByRole('heading', { name: 'Chat Markdown 开发验收' }).count(), 0);
    } else {
      await page.getByRole('heading', { name: 'AionHome API Proxy Test' }).waitFor();
      await page.getByRole('button', { name: /Run|Test/ }).click();
      await page.getByText('Proxy is reachable. FastAPI returned a successful response.').waitFor();
      await page.goto(`${origin}/dev/chat-markdown`);
      await page.getByRole('heading', { name: 'Chat Markdown 开发验收' }).waitFor();
    }
    assert(requests.some(request => request.path === '/api/conversations'));
    assert(sockets.length && sockets.every(socket => socket === '/ws'), JSON.stringify(sockets));
    assert.deepEqual(escaped, []); assert.deepEqual(errors, []); assert.deepEqual(failures, []);
    return { mode: !mockBackend ? 'fastapi-real-dist' : production ? 'preview' : 'dev', width, glassStyles, navigation: 'passed', desktopCleanup: 'shortcuts, saved widgets and picker passed', legacySwitch: 'both desktops passed', apiRoot: '/api/', websocketRoot: '/ws', pageErrors: 0 };
  } finally { await context.close(); }
}

async function main() {
  const { chromium } = require(process.argv[2] || 'playwright');
  const build = checkBuild();
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  const results = [];
  try {
    for (const production of [true, false]) {
      const server = await startVite(production);
      try { for (const width of [1440, 390]) results.push(await exercise(browser, server.origin, production, width)); }
      finally { await server.stop(); }
    }
    console.log(JSON.stringify({ build, browser: results }, null, 2));
  } finally { await browser.close(); }
}

module.exports = { checkBuild, exercise };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
