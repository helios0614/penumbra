/* Run after npm run build: node tests/browser/production-subpath-smoke.cjs [playwright module] [browser executable].
 * Starts local Vite preview/dev only. Backend API/WS is synthetic; only local Vite HMR is forwarded. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { chromium } = require(process.argv[2] || 'playwright');
const root = path.resolve(__dirname, '../..');
const dist = path.join(root, 'dist');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
}

function checkBuild() {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const entryUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  assert(entryUrls.some(url => url.startsWith('/penumbra/assets/') && url.endsWith('.js')));
  assert(entryUrls.some(url => url.startsWith('/penumbra/assets/') && url.endsWith('.css')));
  const assetUrls = [...entryUrls];
  for (const file of files(dist)) {
    if (/\.(js|css)$/.test(file)) {
      const content = fs.readFileSync(file, 'utf8');
      assert(!/AionHome API Proxy Test|Chat Markdown 开发验收|Ready to test the Vite dev proxy/.test(content), `Development page in ${path.basename(file)}`);
      if (file.endsWith('.css')) {
        assetUrls.push(...[...content.matchAll(/url\(\s*["']?([^\s)"']+)/g)].map(match => match[1]).filter(url => !url.startsWith('data:')));
      }
    }
  }
  for (const url of assetUrls) {
    assert(url.startsWith('/penumbra/'), `Static URL escaped application base: ${url}`);
    assert(fs.statSync(path.join(dist, decodeURIComponent(url.slice('/penumbra/'.length)))).isFile(), `Missing built asset: ${url}`);
  }
  return { staticUrls: assetUrls.length, developmentPagesExcluded: true };
}

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
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

async function exercise(browser, origin, production, width) {
  const base = production ? '/penumbra/' : '/';
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
  const requests = [], sockets = [], errors = [], failures = [], escaped = [];
  let legacyDestination = false;
  await context.addCookies([{ name: 'aion_session', value: 'synthetic-switch-session', url: origin, httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  await context.routeWebSocket(() => true, socket => {
    const url = new URL(socket.url());
    if (!production && url.origin.replace(/^ws/, 'http') === origin && url.pathname === '/') {
      socket.connectToServer(); // Vite's own local HMR socket, separate from the backend /ws.
      return;
    }
    sockets.push(url.pathname);
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { escaped.push(url.origin); return route.abort('blockedbyclient'); }
    if (legacyDestination && url.pathname === '/' && request.isNavigationRequest()) {
      assert.equal(request.frame(), page.mainFrame());
      assert((await request.allHeaders()).cookie.includes('aion_session=synthetic-switch-session'));
      return route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic legacy home</h1>' });
    }
    if (url.pathname.startsWith('/api/')) {
      requests.push({ path: url.pathname, method: request.method() });
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
  try {
    await page.goto(`${origin}${base}`); await classicHome();
    await page.getByRole('button', { name: '打开对话', exact: true }).last().click();
    await chat(); assert.equal(pathname(), `${base}app/chat`);
    await page.reload(); await chat();
    await page.goBack(); await classicHome(); assert.equal(pathname(), base);
    await page.goForward(); await chat(); assert.equal(pathname(), `${base}app/chat`);
    await page.getByRole('button', { name: '返回桌面', exact: true }).click(); await classicHome();
    assert.equal(pathname(), base);

    // A direct detail load has no app-owned history entry: close must replace with the correct desktop.
    await page.goto(`${origin}${base}app/chat`); await chat();
    await page.getByRole('button', { name: '返回桌面', exact: true }).click(); await classicHome();
    assert.equal(pathname(), base);
    await page.getByRole('button', { name: '编辑桌面', exact: true }).click();
    await page.getByRole('button', { name: '切换到实验桌面', exact: true }).click(); await editorialHome();
    assert.equal(pathname(), `${base}editorial`);
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
      const cookies = await context.cookies(origin);
      assert.equal(cookies.find(cookie => cookie.name === 'aion_session').value, 'synthetic-switch-session');
      legacyDestination = false;
    }

    await page.goto(`${origin}${base}proxy-test`);
    if (production) {
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
    return { mode: production ? 'preview' : 'dev', width, navigation: 'passed', legacySwitch: 'both desktops passed', apiRoot: '/api/', websocketRoot: '/ws', pageErrors: 0 };
  } finally { await context.close(); }
}

(async () => {
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
})().catch(error => { console.error(error); process.exitCode = 1; });
