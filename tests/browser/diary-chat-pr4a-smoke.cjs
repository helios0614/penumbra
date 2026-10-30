/* Production App with local synthetic HTTP, segmented SSE and WS; no real backend/data/model. */
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const dist = process.env.DIARY_PR4A_DIST;
if (!dist) throw new Error('DIARY_PR4A_DIST must be an isolated production build');
const output = process.env.DIARY_PR4A_OUTPUT || '/private/tmp/penumbra-diary-pr4a-browser';
const origin = 'http://127.0.0.1:45374';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async predicate => { for (let i = 0; i < 200; i++) { if (predicate()) return; await wait(10); } throw new Error('fixture state timeout'); };
const row = (entry, id, role, content = '相同正文') => ({ entry_id: entry, id, role, content, created_at: 1790000000, updated_at: 0 });
let fixture;
const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, origin), f = fixture;
  if (!url.pathname.startsWith('/api/')) {
    const file = path.join(dist, url.pathname.startsWith('/assets/') ? url.pathname.slice(1) : 'index.html');
    if (!file.startsWith(path.resolve(dist) + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); return fs.createReadStream(file).pipe(res);
  }
  f.requests.push({ method: req.method, path: url.pathname });
  const m = url.pathname.match(/^\/api\/diary\/entries\/([^/]+)(?:\/(messages)(?:\/([^/]+)(\/regenerate)?)?)?$/);
  if (m) {
    const entry = decodeURIComponent(m[1]), id = m[3] && decodeURIComponent(m[3]);
    if (!m[2]) return json(res, { id: entry, date: '2026-09-05', status: 'writing', title: '合成投喂 Entry' });
    if (req.method === 'GET') {
      const rows = structuredClone(f.rows[entry] || []);
      if (f.holdHistory) { f.heldRead = () => json(res, rows); return; }
      return f.failHistory ? json(res, {}, 503) : json(res, rows);
    }
    if (m[4]) {
      assert.equal(req.method, 'POST'); assert.equal(url.search, '');
      if (f.rejectRegenerateCode) { const code = f.rejectRegenerateCode; f.rejectRegenerateCode = null; return json(res, { detail: { code } }, 422); }
      const index = f.rows[entry].findIndex(row => row.id === id);
      if (index < 0) return json(res, {}, 404);
      const replaced = f.rows[entry].slice(index).map(row => row.id), aiId = `regenerated-${++f.regenerates}`;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.flushHeaders();
      const frame = value => res.write(`data: ${JSON.stringify(value)}\n\n`);
      f.pending = { res, frame, entry, aiId, replaced };
      frame({ type: 'start', entry_id: entry, id: aiId, replaced_message_ids: replaced }); frame({ type: 'chunk', content: '重新生成中的片段' }); return;
    }
    if (id) {
      let body = ''; for await (const bytes of req) body += bytes;
      if (f.holdMutation) await new Promise(resolve => { f.releaseMutation = resolve; });
      if (f.failMutation) { f.failMutation = false; return json(res, {}, 503); }
      if (req.method === 'DELETE') f.rows[entry] = f.rows[entry].filter(row => row.id !== id);
      else {
        assert.equal(req.method, 'PUT'); const value = JSON.parse(body); assert.deepEqual(Object.keys(value), ['content']);
        const target = f.rows[entry].find(row => row.id === id && row.role === 'user'); if (target) target.content = value.content;
      }
      return json(res, { ok: true });
    }
    if (req.method === 'POST') {
      let body = ''; for await (const bytes of req) body += bytes; const value = JSON.parse(body);
      assert.deepEqual(Object.keys(value).sort(), ['content', 'role']);
      const n = ++f.sends, user = row(entry, `sent-u-${n}`, 'user', value.content), ai = row(entry, `sent-ai-${n}`, 'assistant', '继续聊天成功');
      f.rows[entry].push(user, ai);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const value of [{ type: 'start', entry_id: entry, id: ai.id, user_message_id: user.id }, { type: 'done', message: ai }]) res.write(`data: ${JSON.stringify(value)}\n\n`);
      return res.end();
    }
  }
  return json(res, {});
});
async function run(browser, appPath, width, dark = false) {
  fixture = { rows: { a: [row('a', 'feed-u', 'user', '\n  自动投喂原文\n\n下一段  \n'), row('a', 'old', 'assistant', '长回复预览'.repeat(500)), row('a', 'later-u', 'user'), row('a', 'last', 'assistant'), row('a', 'unknown', 'system', '未知角色保留')], b: [row('b', 'b-user', 'user', '另一 Entry')] }, requests: [], sockets: [], regenerates: 0, sends: 0 };
  const f = fixture, label = `${appPath.includes('editorial') ? 'editorial' : 'classic'}-${width}${dark ? '-dark' : ''}`;
  const context = await browser.newContext({ viewport: { width, height: 640 }, hasTouch: width < 768, isMobile: width < 768, colorScheme: dark ? 'dark' : 'light' });
  const page = await context.newPage(); page.setDefaultTimeout(10000); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'));
  await page.routeWebSocket(url => url.pathname === '/ws', ws => f.sockets.push(ws));
  const bubble = id => page.locator(`.chat-shell [data-message-id="${id}"]`);
  const ids = () => page.locator('.chat-shell [data-message-id]').evaluateAll(nodes => nodes.map(node => node.dataset.messageId));
  const clickAction = async (id, name) => { await bubble(id).scrollIntoViewIfNeeded(); await bubble(id).getByRole('button', { name, exact: true }).click(); };
  const editor = () => page.getByRole('textbox', { name: '编辑消息正文', exact: true });
  const save = () => page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  const closeEdit = () => page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  const emit = entry => { for (const ws of f.sockets) { try { ws.send(JSON.stringify({ type: 'diary_msg_created', data: { entry_id: entry, id: 'invalidation' } })); } catch {} } };
  const checkOrder = async entry => { assert.deepEqual(await ids(), f.rows[entry].map(row => row.id)); };
  const refresh = async () => { await page.getByRole('button', { name: '刷新对话', exact: true }).click(); await wait(200); };
  const noOverflow = async () => {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    for (const locator of [page.locator('.chat-message-actions'), page.getByRole('alertdialog'), page.getByRole('dialog')]) {
      for (const el of await locator.all()) assert(await el.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; }));
    }
  };
  const beginRegen = async id => {
    f.pending = null; const count = f.regenerates; await clickAction(id, '重新生成回复'); const dialog = page.getByRole('alertdialog'); await dialog.waitFor();
    assert((await dialog.textContent()).includes('提交时其后的消息')); await wait(50); assert.equal(f.regenerates, count);
    await noOverflow(); await dialog.getByRole('button', { name: '确认重新生成', exact: true }).click(); await until(() => f.pending); await page.getByText('重新生成中的片段', { exact: true }).waitFor();
    assert.equal(await bubble(f.pending.aiId).getByRole('button', { name: '删除消息', exact: true }).count(), 0); return f.pending;
  };
  const commit = p => { const ai = row(p.entry, p.aiId, 'assistant', '相同正文'); f.rows[p.entry] = f.rows[p.entry].filter(row => !p.replaced.includes(row.id)); f.rows[p.entry].push(ai); return ai; };
  try {
    await page.goto(`${origin}${appPath}?diaryEntry=a`); await bubble('old').waitFor();
    assert.equal(await bubble('old').getByRole('button', { name: '编辑消息', exact: true }).count(), 0);
    assert.equal(await bubble('feed-u').getByRole('button', { name: '重新生成回复', exact: true }).count(), 0);
    assert.equal(await bubble('unknown').getByRole('button', { name: '删除消息', exact: true }).count(), 0);
    await clickAction('feed-u', '编辑消息'); assert.equal(await page.getByRole('dialog').getByText('修改整条消息的正文，保存后不会自动生成回复。', { exact: true }).count(), 0); await closeEdit();
    await clickAction('feed-u', '编辑消息'); assert.equal(await editor().inputValue(), f.rows.a[0].content);
    const draft = '\n  修改后的原文\n\n保留空白  \n'; await editor().fill(draft); f.failMutation = true; await save();
    await page.getByRole('dialog').getByRole('alert').waitFor(); assert.equal(await editor().inputValue(), draft); assert.notEqual(f.rows.a[0].content, draft);
    await save(); await editor().waitFor({ state: 'hidden' }); assert.equal(f.rows.a[0].content, draft); await checkOrder('a'); assert.equal(f.sends, 0); assert.equal(f.regenerates, 0);
    // A legacy ok:true on a missing edit target must retain the draft.
    await clickAction('later-u', '编辑消息'); await editor().fill('不存在目标的草稿'); f.rows.a = f.rows.a.filter(row => row.id !== 'later-u'); await save();
    await page.getByRole('dialog').getByRole('alert').filter({ hasText: '不存在' }).waitFor(); assert.equal(await editor().inputValue(), '不存在目标的草稿'); await closeEdit();
    f.rows.a.splice(2, 0, row('a', 'later-u', 'user')); await refresh();
    // Deletion is confirmed and never optimistic, including on failure.
    for (const id of ['later-u', 'last']) {
      const before = f.requests.filter(r => r.method === 'DELETE').length; await clickAction(id, '删除消息'); await wait(40); assert.equal(f.requests.filter(r => r.method === 'DELETE').length, before);
      assert((await page.getByRole('alertdialog').textContent()).includes('删除这条消息？此操作无法撤回。'));
      await page.getByRole('button', { name: '取消', exact: true }).click(); assert.equal(f.requests.filter(r => r.method === 'DELETE').length, before); await clickAction(id, '删除消息');
      if (id === 'later-u') { f.holdMutation = true; f.failMutation = true; }
      await page.getByRole('button', { name: '确认删除', exact: true }).click();
      if (id === 'later-u') { await until(() => f.releaseMutation); assert.equal(await bubble(id).count(), 1); f.holdMutation = false; f.releaseMutation(); await page.getByRole('alertdialog').getByRole('alert').waitFor(); assert.equal(await bubble(id).count(), 1); await page.getByRole('button', { name: '确认删除', exact: true }).click(); }
      await page.getByRole('alertdialog').waitFor({ state: 'hidden' }); assert.equal(await bubble(id).count(), 0); await checkOrder('a');
    }
    // Known configuration rejection is precise; other 422s retain safe unknown feedback.
    for (const code of ['missing_base_url', 'different_validation_error']) {
      await clickAction('old', '重新生成回复');
      const dialog = page.getByRole('alertdialog');
      const preview = dialog.locator('p').filter({ hasText: '长回复预览' });
      assert((await preview.textContent()).length <= 241); await noOverflow();
      const before = await ids(); f.rejectRegenerateCode = code;
      await dialog.getByRole('button', { name: '确认重新生成', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: code === 'missing_base_url' ? '当前模型配置缺少 API 地址，请检查模型设置。' : '重新生成结果待核对' }).waitFor();
      await wait(200); assert.deepEqual(await ids(), before); assert.equal(f.regenerates, 0);
    }
    // Zero-message suffix still explains the submission-time scope; cancel issues no request.
    const savedRows = f.rows.a; f.rows.a = [f.rows.a[0], row('a', 'zero-tail', 'assistant')]; await refresh();
    const beforeCancel = f.requests.length; await clickAction('zero-tail', '重新生成回复');
    assert((await page.getByRole('alertdialog').textContent()).includes('提交时其后的消息（当前 0 条）'));
    await page.getByRole('button', { name: '取消', exact: true }).click(); assert.equal(f.requests.length, beforeCancel);
    f.rows.a = savedRows; await refresh();
    // Restore a suffix for explicit deletion-scope warning, cancel must not submit.
    f.rows.a = [f.rows.a[0], row('a', 'old', 'assistant'), row('a', 'later-u', 'user'), row('a', 'last', 'assistant')]; await refresh();
    await clickAction('old', '重新生成回复'); assert((await page.getByRole('alertdialog').textContent()).includes('当前 2 条')); await noOverflow();
    await page.mouse.move(width - 8, 8); await wait(250);
    await page.screenshot({ path: `${output}/${label}-suffix-warning.png` }); await page.getByRole('button', { name: '取消', exact: true }).click(); assert.equal(f.regenerates, 0);
    const failed = await beginRegen('old'); assert.equal(await bubble('old').count(), 1); assert.equal(await bubble('last').count(), 1); failed.frame({ type: 'error', content: 'private failure' }); failed.res.end();
    await page.getByRole('alert').filter({ hasText: '核对' }).waitFor(); await wait(200); assert.deepEqual(await ids(), f.rows.a.map(row => row.id));
    // WS before done: raw chunks cannot overwrite the saved text or create a duplicate.
    const first = await beginRegen('old'), ai = commit(first); emit('a'); await bubble(ai.id).getByText('相同正文', { exact: true }).waitFor(); await wait(200);
    first.frame({ type: 'chunk', content: '不得覆盖已保存正文' }); first.frame({ type: 'done', message: ai }); first.res.end(); await wait(250); await checkOrder('a'); assert.equal(await bubble(ai.id).count(), 1);
    // done before WS, failed readback still uses the receipt's exact suffix.
    f.rows.a.push(row('a', 'tail-u', 'user'), row('a', 'tail-ai', 'assistant')); await refresh();
    const second = await beginRegen(ai.id), secondAi = commit(second); f.failHistory = true; second.frame({ type: 'done', message: secondAi }); second.res.end();
    await page.getByRole('alert').filter({ hasText: '消息历史读取失败' }).waitFor(); assert.equal(await bubble(ai.id).count(), 0); assert.equal(await bubble('tail-ai').count(), 0); assert.equal(await bubble(secondAi.id).count(), 1);
    f.failHistory = false; emit('a'); await wait(300); await checkOrder('a');
    // Unknown outcome: a committed replacement is recovered by history, one POST only.
    const unknown = await beginRegen(secondAi.id); commit(unknown); unknown.res.end(); await page.getByRole('alert').filter({ hasText: '重复提交' }).waitFor(); await wait(250); await checkOrder('a'); assert.equal(f.regenerates, 4);
    // Continue chatting after auto-feed and operations, preserving the original Entry.
    await page.getByRole('textbox', { name: '消息正文', exact: true }).fill('继续原 Entry'); await page.getByRole('button', { name: '发送消息', exact: true }).click(); await bubble('sent-ai-1').waitFor(); await wait(200); await checkOrder('a');
    await noOverflow(); await page.screenshot({ path: `${output}/${label}-chat.png` });
    // A regeneration can commit after navigating away; its late frames stay scoped to A.
    const lateStream = await beginRegen('sent-ai-1');
    await page.evaluate(path => { history.pushState({}, '', `${path}?diaryEntry=b`); window.dispatchEvent(new PopStateEvent('popstate')); }, appPath); await bubble('b-user').waitFor();
    const lateAi = commit(lateStream); lateStream.frame({ type: 'done', message: lateAi }); lateStream.res.end(); await wait(200); await checkOrder('b');
    await page.evaluate(path => { history.pushState({}, '', `${path}?diaryEntry=a`); window.dispatchEvent(new PopStateEvent('popstate')); }, appPath); await bubble(lateAi.id).waitFor();
    // A late mutation acknowledgement also stays scoped to A.
    f.holdMutation = true; await clickAction('feed-u', '编辑消息'); await editor().fill('迟到编辑'); await save(); await until(() => f.releaseMutation);
    await page.evaluate(path => { history.pushState({}, '', `${path}?diaryEntry=b`); window.dispatchEvent(new PopStateEvent('popstate')); }, appPath); await bubble('b-user').waitFor(); f.holdMutation = false; f.releaseMutation(); await wait(200); await checkOrder('b');
    assert.deepEqual(errors, []); assert(!f.requests.some(r => r.method !== 'GET' && r.path.includes('/conversations')));
    console.log(JSON.stringify({ label, passed: true, regenerates: f.regenerates, sends: f.sends, writes: f.requests.filter(r => ['PUT', 'DELETE'].includes(r.method)).length }));
  } finally { f.pending?.res.end(); f.releaseMutation?.(); f.heldRead?.(); await context.close(); }
}
(async () => {
  fs.mkdirSync(output, { recursive: true }); await new Promise(resolve => server.listen(45374, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try { for (const appPath of ['/app/diary', '/editorial/app/diary']) { for (const width of [320, 390, 1280]) await run(browser, appPath, width); await run(browser, appPath, 390, true); } }
  finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; server.closeAllConnections(); server.close(); });
