/* Built App + synthetic configuration/messages only. No real config, key or Provider. */
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const dist = process.env.DIARY_MODELS_DIST;
if (!dist) throw new Error('DIARY_MODELS_DIST must point to an isolated production build');
const output = process.env.DIARY_MODELS_OUTPUT || '/private/tmp/penumbra-diary-models-browser';
const origin = 'http://127.0.0.1:45375';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async predicate => { for (let i = 0; i < 200; i++) { if (predicate()) return; await wait(10); } throw new Error('fixture state timeout'); };
const OP = 'openai_chat_completions', AN = 'anthropic_messages';
const preset = id => ({ connection_id: id, protocol: id === 'a' ? AN : OP, model: `preset-${id}` });
const row = (entry, id, role, content) => ({ entry_id: entry, id, role, content, created_at: 1790000000 });
let f;
const wire = entry => { const chosen = f.selections[entry], effective = chosen || preset('a'); return {
  scope: 'diary', id: entry, editable: true, source: chosen ? 'explicit' : 'legacy_unselected', selection: chosen,
  stored_model: chosen ? JSON.stringify(chosen) : null, diagnostic: chosen ? null : 'independent_selection_required',
  effective_selection: effective, effective_diagnostic: null, allowed_protocols: [OP, AN],
  connections: ['a', 'b'].map(id => ({ id, name: `连接 ${id.toUpperCase()}`, enabled: true, transport: 'direct', default_model: `preset-${id}`, credential_configured: true })),
}; };
const json = (res, value, status = 200) => { if (res.writableEnded || res.destroyed) return; res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, origin), state = f;
  if (!url.pathname.startsWith('/api/')) {
    const file = path.join(dist, url.pathname.startsWith('/assets/') ? url.pathname.slice(1) : 'index.html');
    if (!file.startsWith(path.resolve(dist) + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' }); return fs.createReadStream(file).pipe(res);
  }
  state.requests.push({ method: req.method, path: url.pathname });
  const selection = url.pathname.match(/^\/api\/registry\/selections\/diary\/([^/]+)$/);
  if (selection) {
    const id = decodeURIComponent(selection[1]);
    if (req.method === 'GET') {
      const value = structuredClone(wire(id));
      if (state.holdRead === id) { state.releaseRead = () => json(res, value); return; }
      if (state.failRead) { state.failRead = false; return json(res, {}, 503); }
      return json(res, value);
    }
    assert.equal(req.method, 'PUT'); let body = ''; for await (const bytes of req) body += bytes;
    const chosen = JSON.parse(body); assert.deepEqual(Object.keys(chosen).sort(), ['connection_id', 'model', 'protocol']); state.writes.push({ entry: id, ...chosen });
    if (state.holdWrite === id) await new Promise(resolve => { state.releaseWrite = resolve; });
    if (state.failSave) { state.failSave = false; return json(res, { detail: { code: 'incompatible_protocol' } }, 422); }
    state.selections[id] = chosen; return json(res, wire(id));
  }
  const match = url.pathname.match(/^\/api\/diary\/entries\/([^/]+)(?:\/messages(?:\/([^/]+)\/regenerate)?)?$/);
  if (match) {
    const entry = decodeURIComponent(match[1]);
    if (!url.pathname.includes('/messages')) return json(res, { id: entry, date: '2026-09-05', status: 'writing', title: '合成日记' });
    if (req.method === 'GET') return json(res, state.rows[entry]);
    const regenerate = !!match[2];
    if (!regenerate) { let body = ''; for await (const b of req) body += b; assert.deepEqual(Object.keys(JSON.parse(body)).sort(), ['content', 'role']); }
    state.generations.push({ entry, kind: regenerate ? 'regenerate' : 'send', selection: structuredClone(state.selections[entry] || preset('a')) });
    const n = state.generations.length, id = `saved-ai-${n}`, ai = row(entry, id, 'assistant', `合成回复 ${n}`), userId = `saved-user-${n}`;
    const replaced = regenerate ? state.rows[entry].slice(state.rows[entry].findIndex(row => row.id === match[2])).map(row => row.id) : [];
    if (regenerate) state.rows[entry] = state.rows[entry].filter(row => !replaced.includes(row.id));
    else state.rows[entry].push(row(entry, userId, 'user', '合成提问'));
    state.rows[entry].push(ai); res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const start = { type: 'start', entry_id: entry, id, ...(regenerate ? { replaced_message_ids: replaced } : { user_message_id: userId }) };
    for (const value of [start, { type: 'chunk', content: '合成片段' }, { type: 'done', message: ai }]) res.write(`data: ${JSON.stringify(value)}\n\n`);
    return res.end();
  }
  return json(res, {});
});
async function run(browser, appPath, width, dark = false) {
  f = { selections: { a: null, b: { ...preset('b'), model: 'entry-b-model' } }, rows: {}, writes: [], requests: [], generations: [] };
  for (const id of ['a', 'b']) f.rows[id] = [row(id, `${id}-user`, 'user', '原有材料'), row(id, `${id}-ai`, 'assistant', '原有回复')];
  const state = f, context = await browser.newContext({ viewport: { width, height: 640 }, isMobile: width < 768, hasTouch: width < 768, colorScheme: dark ? 'dark' : 'light' });
  const page = await context.newPage(); page.setDefaultTimeout(10000); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'));
  await page.routeWebSocket(url => url.pathname === '/ws', () => {});
  const label = `${appPath.includes('editorial') ? 'editorial' : 'classic'}-${width}${dark ? '-dark' : ''}`;
  const panel = () => page.locator('.chat-composer-menu').filter({ visible: true });
  const open = async () => { if (!(await panel().isVisible())) await page.getByRole('button', { name: '会话工具', exact: true }).click(); await panel().getByRole('heading', { name: '当前模型', exact: true }).waitFor(); };
  const advanced = async () => { const details = panel().locator('details'); if ((await details.getAttribute('open')) === null) await details.locator('summary').click(); };
  const input = () => panel().getByRole('textbox', { name: '模型名称', exact: true });
  const choose = async (name, text) => { await panel().getByRole('combobox', { name, exact: true }).click(); await page.getByRole('option').filter({ hasText: text }).click(); };
  const navigate = async entry => { await page.evaluate(({ path, entry }) => { history.pushState({}, '', `${path}?diaryEntry=${entry}`); dispatchEvent(new PopStateEvent('popstate')); }, { path: appPath, entry }); await page.locator(`[data-message-id="${entry}-user"]`).waitFor(); };
  const noOverflow = async () => {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert(await panel().evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; }));
  };
  const close = async () => { await page.keyboard.press('Escape'); if (await panel().isVisible()) await page.getByRole('button', { name: '会话工具', exact: true }).click(); };
  try {
    await page.goto(`${origin}${appPath}?diaryEntry=a`); await page.locator('[data-message-id="a-ai"]').waitFor(); await open();
    await panel().getByText('兼容配置（尚未独立保存）', { exact: true }).waitFor(); assert((await panel().textContent()).includes('仅影响当前日记的回复与重新生成。'));
    assert(!(await panel().textContent()).includes('主动消息与提醒')); assert((await panel().textContent()).includes('preset-a')); assert((await panel().textContent()).includes('连接 A')); await noOverflow();
    assert(await panel().getByRole('button', { name: '保存模型', exact: true }).isEnabled());
    await page.waitForTimeout(180); await page.screenshot({ path: `${output}/${label}-current.png` });
    // Quick changes, toggles, text blur and Enter do not implicitly save.
    await choose('切换模型', '连接 B'); await advanced(); await input().fill('cancelled-model'); await input().press('Tab'); await input().press('Enter');
    await panel().locator('summary').click(); assert.equal(state.writes.length, 0);
    await panel().getByRole('button', { name: '取消修改', exact: true }).click(); assert.equal(state.writes.length, 0); assert((await panel().textContent()).includes('preset-a'));
    await choose('切换模型', '连接 B'); await advanced(); await choose('接口格式', 'OpenAI 格式'); await input().fill('entry-a-custom'); await input().press('Tab'); assert.equal(state.writes.length, 0);
    state.failSave = true; await panel().getByRole('button', { name: '保存模型', exact: true }).click();
    await panel().getByText('未能保存模型，请检查连接、接口格式和模型名称。修改已保留。', { exact: true }).waitFor(); assert.equal(await input().inputValue(), 'entry-a-custom'); assert.equal(state.selections.a, null);
    await panel().getByRole('button', { name: '保存模型', exact: true }).click(); await panel().getByText('当前日记的独立配置', { exact: true }).waitFor();
    assert.deepEqual(state.selections.a, { connection_id: 'b', protocol: OP, model: 'entry-a-custom' }); await noOverflow();
    await page.waitForTimeout(180); await page.screenshot({ path: `${output}/${label}-manual.png` });
    await panel().locator('summary').click(); await panel().getByRole('combobox', { name: '切换模型', exact: true }).filter({ hasText: 'entry-a-custom' }).waitFor(); await noOverflow(); await close();
    // Same Entry send + regenerate use its saved selection, without model overrides in their payloads.
    await page.getByRole('textbox', { name: '消息正文', exact: true }).fill('继续原日记'); await page.getByRole('button', { name: '发送消息', exact: true }).click(); await page.locator('[data-message-id="saved-ai-1"]').waitFor();
    await page.locator('[data-message-id="saved-ai-1"]').getByRole('button', { name: '重新生成回复', exact: true }).click(); await page.getByRole('button', { name: '确认重新生成', exact: true }).click(); await page.locator('[data-message-id="saved-ai-2"]').waitFor();
    assert.deepEqual(state.generations[0].selection, state.generations[1].selection); assert.equal(state.generations[0].entry, 'a'); assert.equal(state.generations[1].entry, 'a');
    // Refresh failure keeps a usable saved snapshot and exposes a visible recovery action.
    await open(); state.failRead = true; await panel().getByRole('button', { name: '刷新状态', exact: true }).click(); await panel().getByText('模型配置读取失败，请刷新状态后重试。', { exact: true }).waitFor();
    await panel().getByRole('button', { name: '刷新状态', exact: true }).click(); await panel().getByText('当前日记的独立配置', { exact: true }).waitFor();
    // A's delayed read cannot overwrite B's model panel.
    state.holdRead = 'a'; state.releaseRead = null; await panel().getByRole('button', { name: '刷新状态', exact: true }).click(); await until(() => state.releaseRead);
    await navigate('b'); await open(); await panel().getByRole('combobox', { name: '切换模型', exact: true }).filter({ hasText: 'entry-b-model' }).waitFor();
    state.holdRead = null; state.releaseRead(); await wait(100); assert((await panel().textContent()).includes('entry-b-model'));
    // Saving B then leaving cannot publish the late configuration or lock A.
    await advanced(); await input().fill('late-b-model'); state.holdWrite = 'b'; state.releaseWrite = null;
    await panel().getByRole('button', { name: '保存模型', exact: true }).click(); await until(() => state.releaseWrite);
    await navigate('a'); await open(); await panel().getByRole('combobox', { name: '切换模型', exact: true }).filter({ hasText: 'entry-a-custom' }).waitFor();
    state.holdWrite = null; state.releaseWrite(); await wait(150); assert((await panel().textContent()).includes('entry-a-custom')); assert(!(await panel().textContent()).includes('late-b-model'));
    await noOverflow(); assert.deepEqual(errors, []); assert(!state.requests.some(r => r.method !== 'GET' && r.path.includes('/conversations')));
    console.log(JSON.stringify({ label, passed: true, explicitWrites: state.writes.length, generationPairs: state.generations.length }));
  } finally { state.releaseRead?.(); state.releaseWrite?.(); await context.close(); }
}
(async () => {
  fs.mkdirSync(output, { recursive: true }); await new Promise(resolve => server.listen(45375, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try { for (const path of ['/app/diary', '/editorial/app/diary']) { for (const width of [320, 390, 1280]) await run(browser, path, width); await run(browser, path, 390, true); } }
  finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; server.closeAllConnections(); server.close(); });
