/* Actual DEV page + production Bubble; synthetic content only, no chat backend. */
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const origin = process.env.CHAT_MARKDOWN_ORIGIN || 'http://127.0.0.1:45365';
const selectCase = async (page, id) => page.getByRole('combobox', { name: '测试案例', exact: true }).selectOption(id);
const body = page => page.locator('[data-markdown-preview] [data-message-body]');
const count = async page => Number(await page.locator('[data-bubble-count]').textContent());
async function run(browser, width) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  await context.addInitScript(() => {
    window.__markdownCopies = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => window.__markdownCopies.push(text) } });
  });
  const page = await context.newPage(), errors = [], api = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => { api.push(route.request().url()); return route.abort(); });
  await page.route('https://example.invalid/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="600"><rect width="2400" height="600" fill="#80a0b0"/></svg>' }));
  await page.route('https://example.org/**', route => route.fulfill({ contentType: 'text/html', body: 'Synthetic link destination' }));
  await page.goto(`${origin}/dev/chat-markdown`);
  await page.getByRole('heading', { name: 'Chat Markdown 开发验收', exact: true }).waitFor();
  const fixtures = await page.evaluate(async () => (await import('/src/components/dev/chat-markdown-cases.ts')).markdownCases);
  for (const item of fixtures) {
    await selectCase(page, item.id);
    assert.equal(await count(page), item.bubbles, item.id);
    assert.equal(await body(page).locator('[data-markdown-segment]').count(), item.bubbles, `actual surfaces ${item.id}`);
    assert.equal(await page.getByRole('textbox', { name: 'Markdown 原文', exact: true }).inputValue(), item.content);
    assert.equal(await page.locator('[data-known-limitation]').count(), item.limitation ? 1 : 0);
  }
  await selectCase(page, 'breaks');
  assert.equal(await body(page).locator('hr').count(), 6);
  assert.equal(await body(page).locator('.min-h-9').count(), 0);
  assert(await body(page).locator('[data-markdown-segment="rule"]').evaluateAll(nodes => nodes.every(el => el.getBoundingClientRect().height < 32)));
  await selectCase(page, 'standalone-code');
  assert.equal(await body(page).locator('.min-h-9').count(), 0);
  assert.equal(await body(page).locator('.ai-code-block').count(), 1);
  assert.equal(await body(page).locator('pre').evaluate(el => getComputedStyle(el).scrollbarWidth), 'thin');
  await selectCase(page, 'mixed-code');
  assert.equal(await body(page).locator('.min-h-9').count(), 1);
  assert.equal(await body(page).locator('.ai-code-block').count(), 1);
  await selectCase(page, 'definition-with-body');
  assert.equal(await body(page).locator('a').count(), 0);
  await selectCase(page, 'definition-unsafe');
  assert.equal(await body(page).locator('a').count(), 0);
  assert((await body(page).innerText()).includes('链接不可用'));
  for (const target of [320, 390, 768]) {
    await page.getByRole('radio', { name: target === 768 ? '桌面 768px' : `${target}px`, exact: true }).check();
    assert.equal(await page.locator('[data-markdown-preview]').evaluate(el => el.getBoundingClientRect().width), target);
    await selectCase(page, 'wide-table');
    const region = page.locator('[data-markdown-table-scroll]');
    assert.equal(await region.evaluate(el => getComputedStyle(el).scrollbarWidth), 'thin');
    const dimensions = await region.evaluate(el => {
      el.scrollLeft = el.scrollWidth;
      return { client: el.clientWidth, scroll: el.scrollWidth, left: el.scrollLeft,
        last: el.querySelector('th:last-child').getBoundingClientRect().right, right: el.getBoundingClientRect().right };
    });
    assert(dimensions.scroll > dimensions.client + 50, JSON.stringify(dimensions));
    assert(dimensions.left > 0); assert(dimensions.last <= dimensions.right + 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    await region.evaluate(el => { el.scrollLeft = 0; });
    await region.hover(); await page.mouse.wheel(400, 0);
    await page.waitForFunction(() => document.querySelector('[data-markdown-table-scroll]').scrollLeft > 0);
    await selectCase(page, 'short-table');
    assert(await region.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await selectCase(page, 'long-cell');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
  }
  await selectCase(page, 'tilde');
  const raw = await page.getByRole('textbox', { name: 'Markdown 原文', exact: true }).inputValue();
  await page.getByRole('button', { name: '复制消息', exact: true }).click({ force: true });
  await page.getByRole('button', { name: '复制代码', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.__markdownCopies), [raw, 'const a = 1;\n\nconst b = 2;']);
  const editor = page.getByRole('textbox', { name: 'Markdown 原文', exact: true });
  await editor.fill('edited\n\nparagraph\n\n----'); assert.equal(await count(page), 3);
  await page.getByRole('button', { name: '恢复默认文本', exact: true }).click();
  assert.equal(await editor.inputValue(), raw); assert.equal(await count(page), 1);

  await selectCase(page, 'code-tail');
  const fullText = await body(page).innerText();
  await page.getByRole('combobox', { name: '显示模式', exact: true }).selectOption('stream');
  assert.equal(await count(page), 0);
  await page.getByRole('button', { name: '继续 / 开始', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[data-stream-progress]').textContent.startsWith('0 /'));
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const progress = await page.locator('[data-stream-progress]').textContent();
  await page.waitForTimeout(140); assert.equal(await page.locator('[data-stream-progress]').textContent(), progress);
  await page.getByRole('button', { name: '重置流式', exact: true }).click();
  assert.equal(await count(page), 0);
  await page.getByRole('button', { name: '继续 / 开始', exact: true }).click();
  await page.waitForFunction(() => { const [a,b] = document.querySelector('[data-stream-progress]').textContent.match(/\d+/g).map(Number); return a === b; });
  assert.equal(await body(page).innerText(), fullText); assert.equal(await count(page), 3);
  await page.getByRole('combobox', { name: '显示模式', exact: true }).selectOption('full');
  await selectCase(page, 'filtered'); assert.equal(await count(page), 1);
  assert(!await page.locator('[data-markdown-preview]').innerText().then(text => /SYNTHETIC|HEART:|TODO:/.test(text)));
  await selectCase(page, 'definition');
  const definitionSource = await editor.inputValue();
  await page.getByRole('button', { name: '复制消息', exact: true }).click({ force: true });
  assert.equal(await page.evaluate(() => window.__markdownCopies.at(-1)), definitionSource);
  await body(page).getByRole('link').click();
  await page.waitForURL('https://example.org/guide');
  assert.deepEqual(api, []); assert.deepEqual(errors, []);
  await context.close();
  console.log(`${width}px: ${fixtures.length} presets, 320/390/768 preview widths, real table scroll/wheel, copy, edit/reset, stream pause/reset/final parity and API isolation passed`);
}
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    for (const width of [320,390,1280]) await run(browser, width);
    if (process.env.CHAT_MARKDOWN_PRODUCTION_ORIGIN) {
      const context = await browser.newContext(), page = await context.newPage();
      await page.route('**/api/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
      await page.routeWebSocket(() => true, socket => socket.close());
      await page.goto(`${process.env.CHAT_MARKDOWN_PRODUCTION_ORIGIN}/dev/chat-markdown`);
      await page.waitForFunction(() => document.getElementById('root').childElementCount > 0);
      assert.equal(await page.locator('[data-markdown-preview]').count(), 0);
      assert.equal(await page.getByRole('heading', { name: 'Chat Markdown 开发验收', exact: true }).count(), 0);
      assert(!(await page.evaluate(() => performance.getEntriesByType('resource').map(item => item.name)))
        .some(url => /ChatMarkdownDevPage|chat-markdown-cases/.test(url)));
      await context.close(); console.log('Production preview: DEV page is absent and fixture modules are not loaded');
    }
  }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
