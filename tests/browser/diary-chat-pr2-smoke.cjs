/* Real App, Classic/Editorial Diary and shared Chat UI; synthetic HTTP/WS only. */
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const origin = process.env.DIARY_PR2_ORIGIN || 'http://127.0.0.1:45372';
const output = process.env.DIARY_PR2_OUTPUT || '/private/tmp/penumbra-diary-pr21-bubbles-browser';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const entryId = 'diary-exact-id', date = '2026-09-09';
const message = (id, role, content, created_at) => ({ id, entry_id: entryId, role, content, created_at, updated_at: 0, drift: '', thinking: '' });
const history = () => [
  message('material', 'user', '【记忆原文】\n\n保留真实的素材和原文提示。', 172800),
  { ...message('ai-markdown', 'assistant', '**持久化 Markdown**\n\n```ts\nconst saved = true;\n```\n\n' + '较长消息，保持阅读位置。'.repeat(100), 86400), drift: '合成 DRIFT 内容', thinking: '合成 Thinking 内容' },
  message('equal-a', 'user', '同正文不同 ID', 172800), message('equal-b', 'assistant', '同正文不同 ID', 172800),
  ...Array.from({ length: 60 }, (_, index) => message(`history-${index}`, index % 2 ? 'assistant' : 'user', `已保存的第 ${index + 1} 条消息。\n\n第二段内容。`, 172800 + index)),
];

async function run(browser, path, width, dark = false) {
  const context = await browser.newContext({ viewport: { width, height: 640 }, isMobile: width < 768, hasTouch: width < 768, colorScheme: dark ? 'dark' : 'light' });
  const page = await context.newPage(); page.setDefaultTimeout(12_000);
  const errors = [], reads = [], writes = [], sockets = [];
  let rows = history(), failHistory = false, missing = false;
  const archivedRows = history().map(row => ({ ...row, id: `archived-${row.id}`, entry_id: 'archived-id' }));
  const screen = `${path.includes('editorial') ? 'editorial' : 'classic'}-${width}${dark ? '-dark' : ''}`;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error' && /same key|unique.*key/.test(msg.text())) errors.push(msg.text()); });
  await page.routeWebSocket(url => url.pathname === '/ws', ws => { sockets.push(ws); });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== origin) return route.abort('blockedbyclient');
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (req.method() !== 'GET') { writes.push(req.method() + ' ' + url.pathname); return route.fulfill({ status: 405 }); }
    reads.push(url.pathname);
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/diary/reader/calendar') {
      const month = url.searchParams.get('month');
      return json(month === '2026-09' ? [
        { date, entry_id: entryId, title: '写作记录', entry_status: 'writing', has_diary_messages: true, has_saved_content: false, calendar_state: 'pending', invalid_reason: null },
        { date: '2026-09-10', entry_id: 'archived-id', title: '归档原流程', entry_status: 'done', has_diary_messages: true, has_saved_content: true, calendar_state: 'archived', invalid_reason: null },
      ] : []);
    }
    if (url.pathname === '/api/diary/auto-feed-status') return json({ enabled: false });
    if (url.pathname === '/api/diary/entries/archived-id') return json({ id: 'archived-id', date: '2026-09-10', title: '归档原流程', status: 'done', content: '保留的归档正文，原阅读和编辑入口。', importance: 0.6, tags: [], keywords: [] });
    if (url.pathname === '/api/diary/entries/archived-id/messages') return json(archivedRows);
    if (url.pathname === `/api/diary/entries/${entryId}`) return json(missing ? { ok: false, message: '日记不存在' } : { id: entryId, date, title: '写作记录', status: 'writing', auto_feed_status: 'finished', auto_feed_config: { memories: ['must not display'] } });
    if (url.pathname === `/api/diary/entries/${entryId}/messages`) {
      if (failHistory) return json({ detail: 'synthetic history failure' }, 503);
      return json(rows);
    }
    return json({});
  });
  const chat = page.locator('.chat-shell');
  const bubbles = () => chat.locator('[data-message-id]');
  const viewport = () => chat.locator('[data-slot="scroll-area-viewport"]');
  const selection = () => page.getByRole('region', { name: '选中日期的日记', exact: true });
  const loaded = async id => { await page.locator(`[data-message-id="${id}"]`).waitFor({ state: 'attached' }); await page.getByRole('button', { name: '刷新对话', exact: true }).waitFor(); await page.waitForFunction(() => !document.querySelector('button[aria-label="刷新对话"]')?.disabled); };
  const send = async event => { for (const ws of sockets) { try { ws.send(JSON.stringify(event)); } catch {} } await wait(250); };
  const counts = () => reads.filter(path => path.endsWith('/messages')).length;
  const refresh = async () => { await page.getByRole('button', { name: '刷新对话', exact: true }).click(); await page.waitForFunction(() => !document.querySelector('button[aria-label="刷新对话"]')?.disabled); };
  try {
    await page.goto(`${origin}${path}?preserved=hello#calendar`);
    await page.getByRole('button', { name: '上个月', exact: true }).click();
    await page.getByRole('heading', { name: '2026年9月' }).waitFor();
    await page.locator('[data-diary-date="2026-09-09"]').click();
    const open = page.getByRole('button', { name: '查看对话', exact: true }); await open.waitFor(); await open.focus(); await open.scrollIntoViewIfNeeded();
    assert(await open.evaluate(el => !!el.closest('[data-diary-selection-meta]') && !el.parentElement.closest('button')));
    assert(await open.evaluate(el => el.getBoundingClientRect().height >= 44));
    await selection().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/${screen}-pending-calendar.png` });
    const wallpaperBefore = await page.locator(path.includes('editorial') ? '.editorial-desktop' : '.desktop-wallpaper').evaluate(el => getComputedStyle(el).backgroundImage);
    const calendar = page.getByRole('region', { name: '日记月历与日期预览', exact: true });
    const top = await calendar.evaluate(el => el.scrollTop); await open.click();
    await loaded('history-59'); await wait(350);
    assert.equal(new URL(page.url()).searchParams.get('diaryEntry'), entryId); assert.equal(new URL(page.url()).searchParams.get('preserved'), 'hello'); assert.equal(new URL(page.url()).hash, '#calendar');
    assert.deepEqual(await bubbles().evaluateAll(nodes => nodes.map(node => node.dataset.messageId)), rows.map(row => row.id));
    assert.equal(await chat.getByText('同正文不同 ID', { exact: true }).count(), 2);
    assert.equal(await chat.locator('strong').first().textContent(), '持久化 Markdown'); assert.equal(await chat.locator('pre').count(), 1);
    const thinking = chat.getByRole('button', { name: /思考过程/ });
    await thinking.click(); assert.equal(await thinking.getAttribute('aria-expanded'), 'true');
    assert.equal(await chat.getByText('合成 Thinking 内容', { exact: true }).count(), 1);
    assert.equal(await chat.getByText('合成 DRIFT 内容', { exact: true }).count(), 1);
    assert.equal(await chat.getByRole('textbox', { name: '消息正文' }).count(), 1);
    assert(await chat.getByRole('button', { name: '发送消息', exact: true }).isDisabled());
    assert.equal(await chat.getByRole('button', { name: '复制消息', exact: true }).count(), 0);
    assert.equal(await chat.getByText('finished', { exact: true }).count(), 0); assert.equal(await chat.getByText('must not display').count(), 0);
    assert.equal(await page.locator(path.includes('editorial') ? '.editorial-desktop' : '.desktop-wallpaper').evaluate(el => getComputedStyle(el).backgroundImage), wallpaperBefore);
    assert(await viewport().evaluate(el => el.clientHeight > 100 && el.scrollHeight > el.clientHeight));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert(await viewport().evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; }));
    await viewport().evaluate(el => { el.scrollTop = 0; }); await wait(100);
    const sharedStyles = await page.locator('.diary-chat-reading').evaluate(el => {
      const properties = ['backgroundColor', 'color', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
        'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
        'boxShadow', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'backdropFilter', 'fontSize', 'lineHeight'];
      const snapshot = node => { const style = getComputedStyle(node); return Object.fromEntries(properties.map(key => [key, style[key]])); };
      // Main uses these same Bubble/BubbleSegment elements without Diary's wrapper.
      // Compare a copy outside that scope, retaining the current global theme.
      const reference = document.createElement('div'); reference.className = 'chat-shell';
      reference.style.cssText = 'position:fixed;left:-10000px;top:0;width:720px;pointer-events:none';
      document.body.append(reference);
      const results = {};
      try {
        for (const [kind, id, selector] of [
          ['assistant', 'ai-markdown', '[data-message-body] .text-ai'],
          ['code', 'ai-markdown', '.chat-code-segment .ai-code-block'],
          ['user', 'material', '[data-user-bubble]'],
        ]) {
          const message = el.querySelector(`[data-message-id="${id}"]`), copy = message.cloneNode(true);
          reference.replaceChildren(copy);
          results[kind] = { diary: snapshot(message.querySelector(selector)), shared: snapshot(copy.querySelector(selector)) };
        }
      } finally { reference.remove(); }
      const reading = getComputedStyle(el);
      return { bubbles: results, background: reading.backgroundColor, blur: reading.backdropFilter };
    });
    for (const [kind, styles] of Object.entries(sharedStyles.bubbles)) assert.deepEqual(styles.diary, styles.shared, `${kind} must use the shared Main Chat styles`);
    assert.equal(sharedStyles.blur, 'blur(6px)');
    assert.equal(sharedStyles.background, dark ? 'rgba(25, 24, 22, 0.78)' : 'rgba(255, 252, 247, 0.72)');
    await page.screenshot({ path: `${output}/${screen}-chat.png` });

    // Refresh errors retain saved history; a successful empty history remains a valid Entry.
    failHistory = true; await refresh(); await page.getByRole('alert').filter({ hasText: '消息历史读取失败' }).waitFor(); assert.equal(await bubbles().count(), rows.length);
    failHistory = false; await page.getByRole('button', { name: '重试读取' }).click(); await loaded('history-59');
    assert.equal(await viewport().evaluate(el => el.scrollTop), 0);
    rows = []; await refresh(); await chat.getByText('暂无消息', { exact: true }).waitFor(); assert.equal(await bubbles().count(), 0); assert.equal(await chat.getByText('writing', { exact: true }).count(), 1);
    rows = history(); await refresh(); await loaded('history-59'); await wait(250);

    // Main and another Entry never invalidate this timeline; short Diary bursts merge.
    const before = counts(); await send({ type: 'msg_created', data: { id: 'main', conv_id: entryId } }); await send({ type: 'diary_msg_created', data: { id: 'other', entry_id: 'other-entry' } }); assert.equal(counts(), before);
    rows.push(message('from-ws', 'user', 'WS 失效后的权威历史', 100));
    for (let i = 0; i < 10; i++) for (const ws of sockets) { try { ws.send(JSON.stringify({ type: 'diary_msg_created', data: { id: `event-${i}`, entry_id: entryId } })); } catch {} }
    await loaded('from-ws'); await wait(250); assert.equal(counts(), before + 1);
    const stable = counts(); await wait(700); assert.equal(counts(), stable);
    for (const ws of sockets) { try { ws.close({ code: 1006, reason: 'synthetic reconnect' }); } catch {} }
    await page.waitForFunction(() => document.querySelector('.chat-shell') !== null); await wait(1500); assert.equal(counts(), stable + 1);

    // Back retains the live calendar's month/date/scroll/focus; archived flow is untouched.
    await page.getByRole('button', { name: '返回日历', exact: true }).click(); await open.waitFor();
    assert.equal(await calendar.evaluate(el => el.scrollTop), top); assert.equal(await open.evaluate(el => el === document.activeElement), true);
    assert.equal(await page.locator('[data-diary-date="2026-09-09"]').getAttribute('aria-pressed'), 'true'); await page.getByRole('heading', { name: '2026年9月' }).waitFor();
    await page.goForward(); await loaded('from-ws'); await page.goBack(); await open.waitFor();
    await page.locator('[data-diary-date="2026-09-10"]').click();
    const formal = page.getByRole('button', { name: /^阅读全文：归档原流程/ });
    await formal.waitFor(); await open.scrollIntoViewIfNeeded();
    assert.equal(await selection().locator('button button').count(), 0);
    assert(await open.evaluate(el => {
      const formal = el.closest('section').querySelector('.diary-entry-link');
      const a = el.getBoundingClientRect(), b = formal.getBoundingClientRect();
      return a.bottom <= b.top && a.left >= 0 && a.right <= innerWidth;
    }));
    await selection().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/${screen}-archived-calendar.png` });
    await open.click(); await loaded('archived-history-59');
    assert.equal(new URL(page.url()).searchParams.get('diaryEntry'), 'archived-id');
    assert.equal(await chat.getByText('done', { exact: true }).count(), 1);
    assert.deepEqual(await bubbles().evaluateAll(nodes => nodes.map(node => node.dataset.messageId)), archivedRows.map(row => row.id));
    assert.equal(await page.locator('[data-diary-content]:visible').count(), 0);
    await page.getByRole('button', { name: '返回日历', exact: true }).click(); await open.waitFor();
    assert.equal(await open.evaluate(el => el === document.activeElement), true);
    await formal.click();
    await page.getByRole('button', { name: '编辑日记', exact: true }).waitFor(); assert.equal(await page.locator('[data-diary-content]').textContent(), '保留的归档正文，原阅读和编辑入口。'); assert.equal(await chat.count(), 0);
    await page.getByRole('button', { name: '返回日历', exact: true }).click();
    assert.equal(await formal.evaluate(el => el === document.activeElement), true);
    await page.locator('[data-diary-date="2026-09-09"]').click(); await open.click(); await loaded('from-ws');

    // A full reload resolves the same Entry from the URL without calendar lookup.
    await page.reload(); await loaded('from-ws'); assert.equal(new URL(page.url()).searchParams.get('diaryEntry'), entryId);
    missing = true; await send({ type: 'diary_entry_deleted', data: { id: entryId } }); await page.getByRole('alert').filter({ hasText: '已被删除' }).waitFor(); assert.equal(await bubbles().count(), 0);
    await refresh(); await page.getByRole('alert').filter({ hasText: '已不存在' }).waitFor();
    const afterDelete = counts(); await send({ type: 'diary_msg_created', data: { id: 'late', entry_id: entryId } }); assert.equal(counts(), afterDelete);
    assert.deepEqual(writes, []); assert.deepEqual(errors, []);
    console.log(JSON.stringify({ path, width, dark, passed: true, reads: reads.length, writes: writes.length, sequence: history().length, calendarScroll: top, sharedBubbleStyles: true }));
  } finally { await context.close(); }
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try { for (const path of ['/app/diary', '/editorial/app/diary']) {
    for (const width of [320, 390, 1280]) await run(browser, path, width);
    for (const width of [390, 1280]) await run(browser, path, width, true);
  } }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
