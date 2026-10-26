/* UI-only: real Chat controls with the existing synthetic HTTP/WS fixture. */
const { fixture } = require('./chat-pr6-5-config-smoke.cjs');
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const measureOnly = process.env.CHAT_SETTINGS_MEASURE_ONLY === '1';
const reportPath = process.env.CHAT_SETTINGS_LAYOUT_REPORT || '/private/tmp/chat-settings-layout-after.json';

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  const measurements = [];
  try {
    for (const width of [320, 390, 1280]) {
      const { page, context, state, errors } = await fixture(browser, width);
      const protocol = 'anthropic_messages';
      state.selections.a.protocol = protocol;
      Object.assign(state.defaults, { context: 97, float: 1, carryover: 50 });
      state.defaults.thinking[protocol] = { enabled: true, effort: 'max' };
      await page.reload(); await page.locator('[data-message-id="a-initial"]').waitFor();
      const input = page.getByRole('textbox', { name: '消息正文', exact: true });
      await input.fill('保留的聊天草稿');
      await page.getByRole('button', { name: '聊天设置', exact: true }).click();
      const panel = page.getByRole('dialog', { name: '聊天设置', exact: true });
      await page.getByRole('group', { name: '思考强度' }).waitFor();
      await panel.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {}))));
      const geometry = await panel.evaluate(el => {
        const box = el.getBoundingClientRect();
        const title = el.querySelector('[id="' + el.getAttribute('aria-labelledby') + '"]');
        const titleBox = title.getBoundingClientRect();
        const efforts = [...el.querySelector('[aria-label="思考强度"]').querySelectorAll('button')].map(button => {
          const r = button.getBoundingClientRect(); return { top: r.top, width: r.width, height: r.height, overflow: button.scrollWidth > button.clientWidth + 1 };
        });
        return { height: box.height, panelWidth: box.width, left: box.left, right: box.right, overflow: el.scrollWidth > el.clientWidth + 1, efforts,
          heading: { titleFits: title.scrollWidth <= title.clientWidth,
            titleSingleLine: titleBox.height <= parseFloat(getComputedStyle(title).lineHeight) + 1 },
          sliderHeights: [...el.querySelectorAll('[data-slot="slider-control"]')].map(control => control.getBoundingClientRect().height) };
      });
      measurements.push({ viewport: width, ...geometry });
      if (!measureOnly) {
        assert(geometry.height <= 540, JSON.stringify(geometry));
        assert(!geometry.overflow && geometry.left >= 0 && geometry.right <= width);
        assert(Object.values(geometry.heading).every(Boolean), JSON.stringify(geometry.heading));
        assert.equal(new Set(geometry.efforts.map(effort => effort.top)).size, 1);
        assert(geometry.efforts.every(effort => effort.width >= 44 && effort.height >= 44 && !effort.overflow));
        assert(geometry.sliderHeights.every(height => height >= 44));
        const low = page.getByRole('button', { name: 'low', exact: true });
        await low.click(); await page.waitForFunction(() => document.querySelector('[aria-label="思考强度"] button[aria-pressed="true"]')?.textContent === 'low');
        await page.waitForFunction(() => !document.querySelector('[data-chat-setting="thinking"]')?.textContent.includes('保存中'));
        assert.equal(state.defaults.thinking[protocol].effort, 'low');
        const toggle = page.getByRole('switch', { name: '扩展思考', exact: true });
        await toggle.click(); await page.getByRole('group', { name: '思考强度' }).waitFor({ state: 'hidden' });
        await toggle.click(); await low.waitFor();
        state.failSave = true;
        const slider = page.locator('[data-chat-setting="temperature"]').getByRole('slider');
        await slider.focus(); await page.keyboard.press('Home');
        await page.getByText('未确认保存，当前编辑已保留。', { exact: false }).waitFor();
        await page.getByRole('button', { name: '重试', exact: true }).click();
        await page.getByText('未确认保存，当前编辑已保留。', { exact: false }).waitFor({ state: 'hidden' });
        assert.equal(state.defaults.temperatures[protocol], 0);
        await page.setViewportSize({ width, height: 260 });
        await page.waitForFunction(() => { const el = document.querySelector('[aria-label="思考强度"]')?.closest('[data-slot="popover-content"]');
          if (!el) return false; const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1 && el.scrollHeight > el.clientHeight; });
        const carryover = page.locator('[data-chat-setting="carryover_count"]').getByRole('slider');
        await carryover.scrollIntoViewIfNeeded(); await carryover.focus(); await page.keyboard.press('Home');
        await page.waitForFunction(() => document.querySelector('[data-chat-setting="carryover_count"] output')?.textContent === '0条');
        assert(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
        await page.keyboard.press('Escape'); await panel.waitFor({ state: 'hidden' });
        assert.equal(await input.inputValue(), '保留的聊天草稿');
        assert.equal(await page.getByRole('button', { name: '聊天设置', exact: true }).evaluate(el => el === document.activeElement), true);
        assert.deepEqual(errors, []);
      }
      await context.close();
    }
    fs.writeFileSync(reportPath, JSON.stringify(measurements, null, 2));
    console.log(measurements.map(result => ({ width: result.viewport, height: result.height, effortRows: new Set(result.efforts.map(effort => effort.top)).size })));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
