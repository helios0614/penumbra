/* Actual built App + streaming local fixture server. Never connects to AionHome/model/data. */
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const dist = process.env.DIARY_PR3_DIST;
if (!dist) throw new Error('DIARY_PR3_DIST must point to an isolated production build');
const output = process.env.DIARY_PR3_OUTPUT || '/private/tmp/penumbra-diary-pr3-browser';
const origin = 'http://127.0.0.1:45373';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async predicate => { for (let i = 0; i < 100; i++) { if (predicate()) return; await wait(20); } throw new Error('fixture state timeout'); };
let fixture;
const row = (entry, id, role, content) => ({ entry_id: entry, id, role, content, created_at: 1790000000, updated_at: 0, drift: '', thinking: '' });
function addEntry(id, date, status = 'writing') {
  fixture.entries.set(id, { id, date, status, title: status === 'done' ? '原归档阅读' : '合成日记', content: status === 'done' ? '原有归档正文' : '', tags: [], keywords: [], importance: 0.6, auto_feed_status: 'finished' });
  fixture.rows.set(id, [row(id, `${id}-material`, 'user', '自动投喂保存的材料'), row(id, `${id}-question`, 'assistant', '材料已读，想听听你的回答。')]);
}
const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, origin), f = fixture;
  if (!url.pathname.startsWith('/api/')) {
    const relative = url.pathname.startsWith('/assets/') ? url.pathname.slice(1) : 'index.html';
    const file = path.join(dist, relative);
    if (!file.startsWith(path.resolve(dist) + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); return fs.createReadStream(file).pipe(res);
  }
  f.requests.push({ method: req.method, path: url.pathname, replace: url.searchParams.get('replace_existing') });
  if (url.pathname === '/api/diary/reader/calendar') {
    f.indexReads++;
    return json(res, [...f.entries.values()].filter(e => e.date.startsWith(url.searchParams.get('month')) && !f.hidden.has(e.id)).map(e => ({
      date: e.date, entry_id: e.id, title: e.title, entry_status: e.status, has_diary_messages: true, has_saved_content: e.status === 'done', calendar_state: e.status === 'done' ? 'archived' : 'pending', invalid_reason: null,
    })));
  }
  if (url.pathname === '/api/diary/auto-feed-status') return json(res, { enabled: false });
  if (req.method === 'POST' && url.pathname.startsWith('/api/diary/auto-feed/history/')) {
    const date = url.pathname.split('/').pop(), replace = url.searchParams.get('replace_existing');
    assert(['false', 'true'].includes(replace));
    const existing = [...f.entries.values()].find(e => e.date === date);
    await wait(80);
    if (existing?.status === 'done') return json(res, { ok: false, message: '该日期已有完成的日记' });
    if (existing && replace !== 'true') return json(res, { ok: false, code: 'diary_draft_exists', entry_id: existing.id });
    const id = `receipt-${date}-${++f.created}`;
    if (existing) { f.entries.delete(existing.id); f.rows.delete(existing.id); }
    if (date !== '2026-09-09') addEntry(id, date);
    if (date === '2026-09-05') f.hidden.add(id); // Receipt must work before index visibility.
    if (date === '2026-09-08' || date === '2026-09-09') {
      // Interrupt a received response, rather than a pre-header socket Chrome may retransmit.
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.flushHeaders(); res.write('{"ok":');
      setTimeout(() => res.destroy(), 30); return;
    }
    return json(res, { ok: true, entry_id: id });
  }
  const match = url.pathname.match(/^\/api\/diary\/entries\/([^/]+)(\/messages)?$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    if (!match[2]) return json(res, f.entries.get(id) || { ok: false });
    if (req.method === 'GET') return f.failHistory ? json(res, { detail: 'synthetic offline' }, 503) : json(res, f.rows.get(id) || []);
    if (req.method === 'POST') {
      let body = ''; for await (const bytes of req) body += bytes;
      const input = JSON.parse(body); assert.deepEqual(Object.keys(input).sort(), ['content', 'role']); assert.equal(input.role, 'user');
      const n = ++f.sent, userId = `manual-user-${n}`, aiId = `manual-ai-${n}`;
      f.rows.get(id).push(row(id, userId, 'user', input.content));
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }); res.flushHeaders();
      const frame = value => res.write(`data: ${JSON.stringify(value)}\n\n`);
      f.pending = { id, aiId, userId, frame, res };
      frame({ type: 'start', entry_id: id, id: aiId, user_message_id: userId });
      frame({ type: 'chunk', content: '流式第一段' }); return;
    }
  }
  return json(res, {});
});

async function run(browser, appPath, width) {
  fixture = { requests: [], indexReads: 0, created: 0, sent: 0, entries: new Map(), rows: new Map(), hidden: new Set(), sockets: [], failHistory: false, pending: null };
  const f = fixture;
  addEntry('draft-exact', '2026-09-06'); addEntry('done-exact', '2026-09-07', 'done');
  const context = await browser.newContext({ viewport: { width, height: 640 }, isMobile: width < 768, hasTouch: width < 768 });
  const page = await context.newPage(); page.setDefaultTimeout(10_000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error' && /same key|unique.*key/.test(e.text())) errors.push(e.text()); });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'));
  await page.routeWebSocket(url => url.pathname === '/ws', ws => f.sockets.push(ws));
  const label = `${appPath.includes('editorial') ? 'editorial' : 'classic'}-${width}`;
  const select = date => page.locator(`[data-diary-date="${date}"]`).click();
  const launch = () => page.getByRole('button', { name: '开始投喂', exact: true });
  const input = () => page.getByRole('textbox', { name: '消息正文' });
  const send = () => page.getByRole('button', { name: '发送消息', exact: true });
  const bubbles = () => page.locator('.chat-shell [data-message-id]');
  const feedPosts = () => f.requests.filter(r => r.method === 'POST' && r.path.includes('/auto-feed/history/'));
  const emitWs = id => { for (const ws of f.sockets) { try { ws.send(JSON.stringify({ type: 'diary_msg_created', data: { entry_id: id, id: 'invalidation-only' } })); } catch {} } };
  const begin = async text => { f.pending = null; await input().fill(text); await send().click(); await until(() => f.pending); await page.getByText('流式第一段', { exact: true }).waitFor(); return f.pending; };
  const finish = async (p, message, error = false) => {
    if (message) f.rows.get(p.id).push(message);
    if (error) p.frame({ type: 'error', content: 'synthetic provider failure' });
    p.frame({ type: 'done', drift: '', thinking: '', message }); p.res.end();
    await page.waitForFunction(() => document.querySelector('.chat-composer')?.getAttribute('aria-busy') === 'false');
  };
  const noOverflow = async () => {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (await input().count()) assert(await input().evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight; }));
  };
  try {
    await page.goto(`${origin}${appPath}`); await page.getByRole('button', { name: '上个月', exact: true }).click(); await page.getByRole('heading', { name: '2026年9月' }).waitFor();
    await select('2026-09-05'); await launch().scrollIntoViewIfNeeded(); await launch().focus();
    const calendar = page.getByRole('region', { name: '日记月历与日期预览', exact: true });
    const top = await calendar.evaluate(el => el.scrollTop), beforeReads = f.indexReads;
    await launch().click(); await page.getByText('已开始投喂，可进入对话查看。', { exact: true }).waitFor(); await wait(150);
    assert.equal(f.indexReads, beforeReads + 1); assert.equal(await page.locator('.chat-shell').count(), 0);
    assert.equal(await calendar.evaluate(el => el.scrollTop), top); assert(await launch().evaluate(el => el === document.activeElement));
    assert.equal(await page.locator('[data-diary-date="2026-09-05"]').getAttribute('aria-pressed'), 'true');
    await noOverflow(); await page.screenshot({ path: `${output}/${label}-started-calendar.png` });
    await page.getByRole('button', { name: '进入本次日记对话', exact: true }).click();
    const id = [...f.entries.values()].find(e => e.date === '2026-09-05').id;
    await page.locator(`[data-message-id="${id}-question"]`).waitFor(); assert.equal(new URL(page.url()).searchParams.get('diaryEntry'), id);
    // IME remains Sender-owned; composition Enter must not submit.
    await input().fill('相同文本'); await input().dispatchEvent('compositionstart'); await input().press('Enter'); assert.equal(f.sent, 0); await input().dispatchEvent('compositionend');
    const first = await begin('相同文本'); assert(await send().isDisabled()); assert(!(await input().isDisabled()));
    first.frame({ type: 'chunk', content: '继续增长' }); await page.getByText('流式第一段继续增长', { exact: true }).waitFor();
    const firstSaved = { ...row(id, first.aiId, 'assistant', '清理后的已保存回复'), drift: '保存的 DRIFT', thinking: '保存的 Thinking' };
    f.rows.get(id).push(firstSaved); emitWs(id);
    await page.getByText('清理后的已保存回复', { exact: true }).waitFor(); assert.equal(await bubbles().count(), 4);
    first.frame({ type: 'chunk', content: '不得覆盖已保存正文' }); first.frame({ type: 'done', drift: firstSaved.drift, thinking: firstSaved.thinking, message: firstSaved }); first.res.end();
    await page.waitForFunction(() => document.querySelector('.chat-composer')?.getAttribute('aria-busy') === 'false');
    await input().fill('下一条草稿'); assert(!(await send().isDisabled()));
    assert.equal(await page.locator(`[data-message-id="${first.userId}"]`).count(), 1); assert.equal(await page.locator(`[data-message-id="${first.aiId}"]`).count(), 1);
    await noOverflow(); await page.screenshot({ path: `${output}/${label}-continued-chat.png` });
    // done before WS, failed readback retains receipt and doesn't lock the next send.
    const second = await begin('相同文本'); f.failHistory = true;
    await finish(second, row(id, second.aiId, 'assistant', '第二条保存回复'));
    await page.getByRole('alert').filter({ hasText: '消息历史读取失败' }).waitFor();
    assert.equal(await page.locator(`[data-message-id="${second.aiId}"]`).count(), 1); assert.equal(await page.getByText('相同文本', { exact: true }).count(), 2);
    f.failHistory = false; emitWs(id); await wait(300); assert.equal(await bubbles().count(), f.rows.get(id).length);
    // Error then partial save retains user input, feedback and persisted reply.
    const partial = await begin('失败时保留输入'); await finish(partial, row(id, partial.aiId, 'assistant', '部分已保存'), true);
    await page.getByRole('alert').filter({ hasText: '回复生成遇到错误' }).waitFor(); assert.equal(await input().inputValue(), '失败时保留输入'); assert(!(await send().isDisabled()));
    const empty = await begin('空保存'); await finish(empty, null); await wait(150); assert.equal(await page.locator(`[data-message-id="${empty.aiId}"]`).count(), 0);
    const broken = await begin('断流输入'); f.failHistory = true; broken.res.end();
    await page.getByRole('alert').filter({ hasText: '连接结束但未收到完整身份' }).waitFor(); assert.equal(await input().inputValue(), '断流输入'); assert(!(await send().isDisabled()));
    assert.equal(await page.locator(`[data-message-id="${broken.userId}"]`).count(), 1); assert.equal(await page.locator(`[data-message-id="${broken.aiId}"]`).count(), 1);
    f.failHistory = false; f.rows.get(id).push(row(id, broken.aiId, 'assistant', '断流后核对的保存回复'));
    await page.getByRole('button', { name: '刷新对话', exact: true }).click(); await page.getByText('断流后核对的保存回复', { exact: true }).waitFor();
    assert.deepEqual(await bubbles().evaluateAll(nodes => nodes.map(n => n.dataset.messageId)), f.rows.get(id).map(r => r.id));
    assert(f.requests.filter(r => r.method === 'POST' && r.path.endsWith('/messages')).every(r => r.path === `/api/diary/entries/${id}/messages`));
    await page.getByRole('button', { name: '返回日历', exact: true }).click(); await launch().waitFor();
    // Draft continuation never starts another request. Replacement requires explicit warning+confirm.
    await select('2026-09-06'); await launch().click(); const keep = page.getByRole('button', { name: '继续原日记', exact: true }); await keep.waitFor();
    const draftPosts = feedPosts().length; await keep.click(); await page.locator('[data-message-id="draft-exact-question"]').waitFor(); assert.equal(feedPosts().length, draftPosts);
    await page.getByRole('button', { name: '返回日历', exact: true }).click();
    await page.getByRole('button', { name: '替换并重新投喂', exact: true }).click();
    await page.getByRole('alertdialog').waitFor(); await wait(250); assert((await page.getByRole('alertdialog').textContent()).includes('旧草稿和对话将被替换'));
    await noOverflow(); await page.screenshot({ path: `${output}/${label}-replace-warning.png` });
    await page.getByRole('button', { name: '保留旧草稿', exact: true }).click(); assert.equal(feedPosts().length, draftPosts);
    await page.getByRole('button', { name: '替换并重新投喂', exact: true }).click(); await page.getByRole('button', { name: '确认替换并投喂', exact: true }).click();
    await page.getByText('已开始投喂，可进入对话查看。', { exact: true }).waitFor();
    assert.equal(feedPosts().at(-1).replace, 'true'); assert.equal(feedPosts().length, draftPosts + 1); assert.equal(await page.locator('.chat-shell').count(), 0);
    // Existing done Entry stays archived and retains formal reader/editor.
    await select('2026-09-07'); await launch().click(); await page.getByRole('alert').filter({ hasText: '未启动投喂' }).waitFor();
    assert.equal(f.entries.get('done-exact').status, 'done'); assert.equal(feedPosts().at(-1).replace, 'false');
    await page.getByRole('button', { name: /^阅读全文：原归档阅读/ }).click(); await page.getByRole('button', { name: '编辑日记', exact: true }).click();
    await page.getByRole('button', { name: '保存', exact: true }).waitFor(); await page.getByRole('button', { name: '取消编辑并返回阅读', exact: true }).click(); await page.getByRole('button', { name: '返回日历', exact: true }).click();
    // Unknown POST with and without a visible created Entry: one POST, read-only verification.
    for (const date of ['2026-09-08', '2026-09-09']) {
      await select(date); const count = feedPosts().length; await launch().click(); await page.getByRole('alert').filter({ hasText: '启动结果待核对' }).waitFor(); await wait(200);
      assert.equal(feedPosts().length, count + 1); assert(!(await launch().isDisabled()));
      if (date.endsWith('08')) {
        await page.getByRole('button', { name: '查看对话', exact: true }).click(); const found = [...f.entries.values()].find(e => e.date === date).id;
        await page.locator(`[data-message-id="${found}-question"]`).waitFor(); assert.equal(new URL(page.url()).searchParams.get('diaryEntry'), found);
        await page.getByRole('button', { name: '返回日历', exact: true }).click();
      } else {
        assert.equal(await page.getByRole('button', { name: '查看对话', exact: true }).count(), 0);
        await page.getByRole('button', { name: '刷新日历', exact: true }).click(); await wait(150); assert.equal(feedPosts().length, count + 1);
      }
    }
    assert.deepEqual(errors, []); assert(!f.requests.some(r => r.path.includes('/conversations') && r.method !== 'GET'));
    console.log(JSON.stringify({ path: appPath, width, passed: true, feedPosts: feedPosts().length, manualPosts: f.sent, indexReads: f.indexReads, sameEntry: id, retainedScroll: top }));
  } finally { f.pending?.res.end(); await context.close(); }
}

(async () => {
  fs.mkdirSync(output, { recursive: true }); await new Promise(resolve => server.listen(45373, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try { for (const appPath of ['/app/diary', '/editorial/app/diary']) for (const width of [320, 390, 1280]) await run(browser, appPath, width); }
  finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; server.closeAllConnections(); server.close(); });
