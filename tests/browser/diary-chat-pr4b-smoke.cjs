/* Production UI, synthetic local HTTP/SSE/WS only. Never contacts a real backend or model. */
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const dist = process.env.DIARY_PR4B_DIST;
if (!dist) throw new Error('DIARY_PR4B_DIST must point to an isolated production build');
const output = process.env.DIARY_PR4B_OUTPUT || '/private/tmp/penumbra-diary-pr4b-browser';
const origin = 'http://127.0.0.1:45375', date = '2026-11-03';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async predicate => { for (let i = 0; i < 200; i++) { if (predicate()) return; await wait(10); } throw new Error('fixture timeout'); };
const body = '【标题】合成日记\n【正文】第一段\n\n第二段🦉\n【关键词】甲，乙、丙\n【重要性】0.8\n【标签】共同经历、约定';
const markdownBody = '# 自由日记\n\n**一起散步**  \n继续这一段\n\n- 听风\n  - 看树\n\n【心情】放松\n> 【正文】正文里的引用\n\n```md\n【正文】正文里的代码\n```\n\n最后谈到【关键词】这个标记。';
const formatted = `【标题】格式自由\n【正文】\n${markdownBody}\n【重要性】无效元数据\n【正文】第二个正文块\n\n**保留排版**`;
const row = (id, role, content) => ({ id, entry_id: 'a', role, content, created_at: 1790000000 });
const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
let fixture;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, origin), f = fixture;
  if (!url.pathname.startsWith('/api/')) {
    const file = path.join(dist, url.pathname.startsWith('/assets/') ? url.pathname.slice(1) : 'index.html');
    if (!file.startsWith(path.resolve(dist) + path.sep) || !fs.existsSync(file)) return json(res, {}, 404);
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); return fs.createReadStream(file).pipe(res);
  }
  f.requests.push({ method: req.method, path: url.pathname });
  if (url.pathname === '/api/diary/reader/calendar') return json(res, url.searchParams.get('month') === '2026-11' ? [{ date, entry_id: 'a', title: f.entry.title, entry_status: f.entry.status, has_diary_messages: true, has_saved_content: !!f.entry.content, calendar_state: f.entry.status === 'done' ? 'archived' : 'pending', invalid_reason: null }] : []);
  if (url.pathname === '/api/diary/auto-feed-status') return json(res, { ok: true, enabled: false });
  if (url.pathname === '/api/diary/entries/a') {
    if (req.method === 'PUT') {
      let raw = ''; for await (const bytes of req) raw += bytes;
      f.puts++; f.submitted = JSON.parse(raw);
      assert.equal(f.submitted.status, 'done'); assert.deepEqual(Object.keys(f.submitted).sort(), ['content', 'importance', 'keywords', 'status', 'tags', 'title']);
      if (f.reject) { f.reject = false; return json(res, {}, 422); }
      Object.assign(f.entry, f.submitted); f.awaitReadback = true; return json(res, { ok: true });
    }
    if (f.awaitReadback) {
      f.awaitReadback = false; f.readbacks++;
      if (f.failReadback) { f.failReadback = false; return json(res, {}, 503); }
    }
    return json(res, f.entry);
  }
  if (url.pathname === '/api/diary/entries/a/messages') {
    if (req.method === 'GET') return f.failHistory ? json(res, {}, 503) : json(res, f.rows);
    if (req.method === 'POST') {
      let raw = ''; for await (const bytes of req) raw += bytes;
      const input = JSON.parse(raw); f.sends++;
      const user = row('sent-u', 'user', input.content), ai = row('sent-ai', 'assistant', '日记已归档，仍然可以继续聊。'); f.rows.push(user, ai);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const event of [{ type: 'start', entry_id: 'a', id: ai.id, user_message_id: user.id }, { type: 'done', message: ai }]) res.write(`data: ${JSON.stringify(event)}\n\n`);
      return res.end();
    }
  }
  const message = url.pathname.match(/^\/api\/diary\/entries\/a\/messages\/([^/]+)(\/regenerate)?$/);
  if (message) {
    const id = decodeURIComponent(message[1]);
    if (req.method === 'DELETE') { f.rows = f.rows.filter(row => row.id !== id); return json(res, { ok: true }); }
    if (message[2]) {
      assert.equal(req.method, 'POST'); const index = f.rows.findIndex(row => row.id === id), replaced = f.rows.slice(index).map(row => row.id);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.flushHeaders();
      const frame = value => res.write(`data: ${JSON.stringify(value)}\n\n`);
      f.pending = { res, frame, replaced }; frame({ type: 'start', entry_id: 'a', id: 'regenerated', replaced_message_ids: replaced }); frame({ type: 'chunk', content: body }); return;
    }
  }
  return json(res, {});
});
async function run(browser, appPath, width, dark = false) {
  fixture = { entry: { id: 'a', date, status: 'writing', title: '原标题', content: '未归档原文', importance: 0.2, tags: [], keywords: [] }, rows: [row('user', 'user', '素材'), row('chat', 'assistant', '今天过得好吗？'), row('formatted', 'assistant', formatted), row('old', 'assistant', body), row('last', 'assistant', '【正文】仅正文')], puts: 0, readbacks: 0, sends: 0, requests: [], sockets: [] };
  const f = fixture, label = `${appPath.includes('editorial') ? 'editorial' : 'classic'}-${width}${dark ? '-dark' : ''}`;
  const context = await browser.newContext({ viewport: { width, height: 640 }, hasTouch: width < 768, isMobile: width < 768, colorScheme: dark ? 'dark' : 'light' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'));
  const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(10000);
  await page.clock.setFixedTime(new Date('2026-11-03T04:00:00Z'));
  await page.routeWebSocket(url => url.pathname === '/ws', ws => f.sockets.push(ws));
  const bubble = id => page.locator(`.chat-shell [data-message-id="${id}"]`);
  const action = async (id, name) => { await bubble(id).scrollIntoViewIfNeeded(); await bubble(id).getByRole('button', { name, exact: true }).click(); };
  const preview = () => page.getByRole('dialog', { name: '日记草稿预览' });
  const cancel = () => preview().getByRole('button', { name: '取消', exact: true }).click();
  const save = () => preview().getByRole('button', { name: '确认保存并归档', exact: true }).click();
  const emit = () => { for (const ws of f.sockets) { try { ws.send(JSON.stringify({ type: 'diary_msg_created', data: { entry_id: 'a', id: 'invalidation' } })); } catch {} } };
  const noOverflow = async () => {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    for (const el of await page.locator('.chat-message-actions, [role="dialog"]').all()) assert(await el.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; }));
  };
  const checkActions = async state => {
    for (const notice of await page.getByRole('button', { name: /^关闭提示：/ }).all()) await notice.click();
    await page.mouse.move(width - 4, 4); await wait(150);
    const actions = page.locator('[data-diary-selection-actions]');
    const feed = actions.getByRole('button', { name: '开始投喂', exact: true }), extract = actions.getByRole('button', { name: '提取日记', exact: true });
    await extract.waitFor(); await extract.scrollIntoViewIfNeeded();
    const a = await feed.boundingBox(), b = await extract.boundingBox();
    assert(a && b); assert(Math.abs(a.y - b.y) <= 1); assert.equal(a.height, b.height); assert(a.height >= 44);
    assert(b.x - (a.x + a.width) >= 10 && b.x - (a.x + a.width) <= 12.1);
    assert.equal(await feed.evaluate(el => getComputedStyle(el).borderRadius), await extract.evaluate(el => getComputedStyle(el).borderRadius));
    assert(await extract.evaluate(el => el.parentElement.querySelector('button')?.textContent.includes('开始投喂')));
    await noOverflow(); await page.screenshot({ path: `${output}/${label}-${state}-actions.png` });
  };
  try {
    await page.goto(`${origin}${appPath}`); await checkActions('pending');
    f.entry.status = 'done'; await page.getByRole('button', { name: '刷新日历', exact: true }).click();
    await page.getByRole('button', { name: /阅读全文：原标题/ }).waitFor(); await checkActions('archived');
    assert.equal(f.puts, 0); f.entry.status = 'writing';
    await page.goto(`${origin}${appPath}?diaryEntry=a`); await bubble('last').waitFor();
    assert.equal(await bubble('last').getByRole('button', { name: '提取正文', exact: true }).count(), 1);
    assert.equal(await bubble('user').getByRole('button', { name: '提取正文', exact: true }).count(), 0);
    const original = structuredClone(f.entry);
    await action('chat', '提取正文'); await page.getByRole('status').filter({ hasText: '无法提取' }).waitFor(); assert.equal(await preview().count(), 0); assert.deepEqual(f.entry, original);
    await action('formatted', '提取正文'); assert.equal(await preview().getByLabel('正文', { exact: true }).inputValue(), `${markdownBody}\n第二个正文块\n\n**保留排版**`);
    assert.equal(await preview().getByLabel('重要度（0–1）', { exact: true }).inputValue(), ''); await cancel(); assert.equal(f.puts, 0);
    await action('last', '提取正文'); assert.equal(await preview().getByLabel('正文', { exact: true }).inputValue(), '仅正文');
    assert.equal(await preview().getByLabel('标题', { exact: true }).inputValue(), ''); await cancel(); assert.equal(f.puts, 0);
    await action('old', '提取正文'); await noOverflow();
    assert.equal(await preview().getByLabel('正文', { exact: true }).inputValue(), '第一段\n\n第二段🦉');
    await preview().getByLabel('标题', { exact: true }).fill('人工确认的标题');
    await preview().getByLabel('正文', { exact: true }).fill('人工正文\n\n末段🦉');
    await preview().getByLabel('重要度（0–1）', { exact: true }).fill('0');
    await preview().getByRole('button', { name: '情感时刻', exact: true }).click();
    await preview().getByRole('button', { name: '添加关键词', exact: true }).click();
    await preview().getByRole('textbox', { name: '关键词 4', exact: true }).fill('人工词');
    await preview().getByRole('button', { name: '确认关键词修改', exact: true }).click();
    await page.screenshot({ path: `${output}/${label}-preview.png` });
    f.reject = true; await save(); await preview().getByRole('alert').filter({ hasText: '保存失败' }).waitFor();
    assert.equal(await preview().getByLabel('标题', { exact: true }).inputValue(), '人工确认的标题'); assert.deepEqual(f.entry, original);
    await save(); await preview().waitFor({ state: 'hidden' }); assert.equal(f.entry.status, 'done'); assert.equal(f.readbacks, 1);
    assert.equal(f.entry.content, '人工正文\n\n末段🦉'); assert.deepEqual(f.entry.keywords, ['甲', '乙', '丙', '人工词']); assert.equal(f.entry.importance, 0); assert(f.entry.tags.includes('emotion'));
    assert.equal(f.rows.find(row => row.id === 'old').content, body);
    // Saved prose stays independent of later chat and local deletion.
    await action('old', '提取正文'); f.rows = f.rows.filter(row => row.id !== 'old'); emit();
    await preview().getByRole('alert').filter({ hasText: '来源消息已删除或变化' }).waitFor();
    assert(await preview().getByRole('button', { name: '确认保存并归档', exact: true }).isDisabled()); await cancel();
    assert.equal(await bubble('old').count(), 0); assert.equal(f.puts, 2);
    // Start regeneration, extract the still-persisted old reply, then verify its draft expires on replacement.
    await action('last', '重新生成回复'); await page.getByRole('button', { name: '确认重新生成', exact: true }).click(); await until(() => f.pending);
    await bubble('regenerated').waitFor(); assert.equal(await bubble('regenerated').getByRole('button', { name: '提取正文', exact: true }).count(), 0);
    await action('last', '提取正文'); const ai = row('regenerated', 'assistant', body);
    f.rows = f.rows.filter(row => !f.pending.replaced.includes(row.id)); f.rows.push(ai); f.pending.frame({ type: 'done', message: ai }); f.pending.res.end();
    await preview().getByRole('alert').filter({ hasText: '来源消息已删除或变化' }).waitFor(); await cancel();
    assert.equal(await bubble('last').count(), 0); await bubble('regenerated').getByRole('button', { name: '提取正文', exact: true }).waitFor();
    // A failed post-save GET retains the draft. Verification never repeats PUT.
    await action('regenerated', '提取正文'); f.failReadback = true; await save();
    await preview().getByRole('button', { name: '核对结果', exact: true }).waitFor(); const writes = f.puts;
    assert(await preview().getByRole('button', { name: '确认保存并归档', exact: true }).isDisabled());
    await preview().getByRole('button', { name: '核对结果', exact: true }).click(); await preview().waitFor({ state: 'hidden' }); assert.equal(f.puts, writes);
    const savedContent = f.entry.content;
    await page.getByRole('textbox', { name: '消息正文', exact: true }).fill('归档后继续聊天'); await page.getByRole('button', { name: '发送消息', exact: true }).click(); await bubble('sent-ai').waitFor(); assert.equal(f.entry.content, savedContent);
    await page.getByRole('button', { name: '返回日历', exact: true }).click();
    const quick = () => page.getByRole('button', { name: '提取日记', exact: true }); await quick().waitFor();
    await quick().click(); await preview().waitFor(); assert.equal(await preview().getByLabel('标题', { exact: true }).inputValue(), '合成日记');
    await preview().getByLabel('标题', { exact: true }).fill('日历快捷归档'); await save(); await preview().waitFor({ state: 'hidden' });
    const read = page.getByRole('button', { name: /阅读全文：日历快捷归档/ }); await read.waitFor(); await read.click();
    await page.getByRole('heading', { name: '日历快捷归档', exact: true }).waitFor(); await page.getByRole('button', { name: '返回日历', exact: true }).click();
    const saved = structuredClone(f.entry); f.rows = [row('chat', 'assistant', '普通聊天')]; await quick().click();
    await page.getByRole('status').filter({ hasText: '暂未找到可提取正文' }).waitFor(); assert.equal(await preview().count(), 0); assert.deepEqual(f.entry, saved);
    f.failHistory = true; await quick().click(); await page.getByRole('status').filter({ hasText: '暂时无法读取对话' }).waitFor(); assert.deepEqual(f.entry, saved);
    await noOverflow(); await page.screenshot({ path: `${output}/${label}-calendar.png` });
    assert.deepEqual(errors, []); assert(!f.requests.some(req => req.method !== 'GET' && req.path.includes('/conversations')));
    console.log(JSON.stringify({ label, passed: true, puts: f.puts, readbacks: f.readbacks, sends: f.sends }));
  } finally { f.pending?.res.end(); await context.close(); }
}
(async () => {
  fs.mkdirSync(output, { recursive: true }); await new Promise(resolve => server.listen(45375, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try { for (const appPath of ['/app/diary', '/editorial/app/diary']) { for (const width of [320, 390, 1280]) await run(browser, appPath, width); await run(browser, appPath, 390, true); } }
  finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; server.closeAllConnections(); server.close(); });
