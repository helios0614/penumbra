/* Real Chat UI -> real FastAPI routes -> isolated SQLite + atomic settings.
 * Start AionHome tests/ui/chat_pr65c_fixture_server.py in an isolated source copy.
 * This test never uses a production server, DB, credential or model.
 */
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const origin = process.env.CHAT_PR65_ORIGIN || 'http://127.0.0.1:45365';
const backend = process.env.CHAT_PR65_FIXTURE || 'http://127.0.0.1:45366';

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(15000);
    const errors = [], creations = [], sends = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.routeWebSocket(url => url.pathname === '/ws', () => {});
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() === 'POST' && url.pathname === '/api/conversations') creations.push(request.postDataJSON());
      if (url.pathname.endsWith('/send')) sends.push(request.postDataJSON());
      const response = await route.fetch({ url: backend + url.pathname + url.search });
      await route.fulfill({ response });
    });
    const facts = async () => (await page.request.get(backend + '/api/synthetic/assertions')).json();
    const selectSource = async () => {
      await page.getByRole('button', { name: '打开会话effective input', exact: true }).click();
      await page.locator('[data-message-id="source-064"]').waitFor();
    };
    const settings = () => page.getByRole('dialog', { name: '聊天设置', exact: true });
    const idle = async () => page.waitForFunction(() => !document.querySelector('[aria-label="聊天设置"]')?.disabled);
    const send = async text => {
      await page.getByRole('textbox', { name: '消息正文', exact: true }).fill(text);
      await page.getByRole('button', { name: '发送消息', exact: true }).click();
      await idle();
    };
    await page.goto(origin + '/tests/browser/chat-pr3.html');
    await page.locator('[data-message-id="source-064"]').waitFor();
    for (const count of [0, 4, 50]) {
      await selectSource();
      await page.getByRole('button', { name: '聊天设置', exact: true }).click();
      const slider = page.getByRole('slider', { name: '新会话携带历史数量', exact: true });
      await slider.waitFor(); await slider.focus(); await page.keyboard.press('Home');
      if (count === 50) await page.keyboard.press('End');
      else for (let n = 0; n < count; n++) await page.keyboard.press('ArrowRight');
      await page.waitForFunction(value => document.querySelector('[data-chat-setting="carryover_count"] output')?.textContent === `${value}条`, count);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.waitForFunction(() => !document.querySelector('[data-slot="popover-content"]')?.textContent.includes('保存中'));
      const saved = await facts(); assert.equal(saved.settings.main_chat_defaults?.carryover_count ?? 0, count);
      await page.keyboard.press('Escape'); await settings().waitFor({ state: 'hidden' });
      const previous = new Set(saved.conversations.map(c => c.id));
      await page.getByRole('button', { name: '新建会话', exact: true }).click(); await idle();
      await page.getByRole('textbox', { name: '消息正文', exact: true }).waitFor();
      const created = (await facts()).conversations.find(c => !previous.has(c.id));
      assert(created); assert.equal(created.carryover_source_conv_id, 'conv-1');
      assert.deepEqual(creations.at(-1), { carryover_source_conv_id: 'conv-1' });
      // Origin survives leaving the new conversation, returning and a refresh.
      await selectSource();
      await page.getByRole('button', { name: '打开会话新对话', exact: true }).first().click(); await idle();
      await page.reload(); await page.getByRole('textbox', { name: '消息正文', exact: true }).waitFor();
      await send(`FIRST_${count}`);
      let persisted = await facts();
      let rows = persisted.messages.filter(row => row.conv_id === created.id);
      const copied = rows.filter(row => row.is_carryover === 1);
      assert.equal(copied.length, count);
      assert(copied.every(row => ['user', 'assistant'].includes(row.role) && !['SOURCE_62', 'SOURCE_63'].includes(row.content)));
      assert.equal(rows.filter(row => row.content === `FIRST_${count}` && row.is_carryover === 0).length, 1);
      assert.equal(persisted.conversations.find(c => c.id === created.id).carryover_source_conv_id, null);
      await send(`SECOND_${count}`);
      persisted = await facts(); rows = persisted.messages.filter(row => row.conv_id === created.id);
      assert.equal(rows.filter(row => row.is_carryover === 1).length, count);
      assert.equal(rows.filter(row => row.content === `SECOND_${count}` && row.is_carryover === 0).length, 1);
      assert(sends.every(body => !('carryover_messages' in body) && !('carryover' in body)));
      console.log(`carryover ${count}: real UI create/source, navigation+refresh, first-send persistence and no second-send copy passed`);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
