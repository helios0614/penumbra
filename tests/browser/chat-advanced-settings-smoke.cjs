/* Real Chat settings with synthetic HTTP/WS. Use the chat-pr6-5 fixture's Vite server. */
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const { fixture } = require('./chat-pr6-5-config-smoke.cjs');

const fields = {
  include_heart: 'HEART 向 AI 回显历史',
  include_drift: 'DRIFT 向 AI 回显历史',
  enable_hidden_heart: 'HEART 提供生成指令',
  enable_hidden_drift: 'DRIFT 提供生成指令',
};

async function run(browser, width) {
  const values = { include_heart: true, include_drift: true, enable_hidden_heart: false, enable_hidden_drift: true };
  const writes = [];
  let reads = 0, fail = false;
  const { page, context, errors } = await fixture(browser, width, async (page, state) => {
    state.messages.a[0].drift = '历史 DRIFT 内容';
    await page.route(/\/api\/settings(?:\/context_toggle)?$/, async route => {
      const req = route.request();
      if (req.method() === 'GET') {
        assert(new URL(req.url()).pathname.endsWith('/settings'));
        reads++;
        return route.fulfill({ json: values });
      }
      assert.equal(req.method(), 'PUT');
      const patch = req.postDataJSON();
      const [field] = Object.keys(patch);
      assert.equal(Object.keys(patch).length, 1);
      assert(field in fields);
      assert.equal(new URL(req.url()).pathname, field.startsWith('include_') ? '/api/settings/context_toggle' : '/api/settings');
      writes.push(patch);
      if (fail) return route.fulfill({ status: 503, json: { detail: { code: 'persistence_failed' } } });
      Object.assign(values, patch);
      return route.fulfill({ json: { ok: true } });
    });
  });

  const panel = page.getByRole('dialog', { name: '聊天设置' });
  const advanced = panel.locator('summary').filter({ hasText: '高级控制' });
  const scroll = panel.locator('[data-slot="chat-settings-scroll"]');
  const control = field => panel.getByRole('switch', { name: fields[field], exact: true });
  const expectSwitch = (field, checked) => control(field).and(page.locator(`[aria-checked="${checked}"]:enabled`)).waitFor();
  const open = async () => {
    await page.getByRole('button', { name: '聊天设置', exact: true }).click();
    await advanced.click();
  };

  try {
    assert.equal(reads, 0);
    await open();
    for (const field of Object.keys(fields)) await expectSwitch(field, values[field]);
    const initialReads = reads;
    fail = true;
    await control('include_drift').click();
    await panel.getByRole('alert').filter({ hasText: 'persistence_failed' }).waitFor();
    await expectSwitch('include_drift', true);
    fail = false;
    for (const field of Object.keys(fields)) {
      const next = !values[field];
      await control(field).click();
      await expectSwitch(field, next);
      assert.deepEqual(writes.at(-1), { [field]: next });
      for (const other of Object.keys(fields)) await expectSwitch(other, values[other]);
    }
    assert.equal(reads, initialReads + 4);
    await page.setViewportSize({ width, height: 360 });
    await control('include_drift').scrollIntoViewIfNeeded();
    assert(await scroll.evaluate(el => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight > el.clientHeight));
    await advanced.click();
    await control('include_drift').waitFor({ state: 'detached' });
    const parameters = panel.locator('[data-slot="chat-settings-parameters"]');
    await parameters.evaluate(el => { el.scrollTop = 0; });
    assert(await advanced.evaluate(el => {
      const heading = el.getBoundingClientRect();
      const popup = el.closest('[data-slot="popover-content"]').getBoundingClientRect();
      return heading.top >= popup.top && heading.bottom <= popup.bottom;
    }));
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'hidden' });
    await page.reload();
    await page.getByText('历史 DRIFT 内容', { exact: true }).waitFor();
    await open();
    for (const field of Object.keys(fields)) await expectSwitch(field, values[field]);
    assert.deepEqual(errors, []);
    console.log(`${width}px: four independent fields, backend errors and readback, saved DRIFT display, scroll and refresh passed`);
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try {
    for (const width of [320, 390, 1280]) await run(browser, width);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
