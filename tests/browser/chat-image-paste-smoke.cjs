/* Real ChatView in StrictMode; synthetic ClipboardEvent/File and HTTP only.
 * Start Vite on 45365, then: node tests/browser/chat-image-paste-smoke.cjs <playwright path> [chromium executable]
 */
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const { fixture } = require('./chat-pr6-5-config-smoke.cjs');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');

async function run(browser, mobile) {
  const { page, context, state, errors } = await fixture(browser, mobile ? 390 : 1440);
  try {
    await context.addInitScript(() => {
      const listeners = new Set(), add = document.addEventListener.bind(document), remove = document.removeEventListener.bind(document);
      document.addEventListener = (type, listener, options) => { if (type === 'paste') listeners.add(listener); return add(type, listener, options); };
      document.removeEventListener = (type, listener, options) => { if (type === 'paste') listeners.delete(listener); return remove(type, listener, options); };
      window.__pasteListenerCount = () => listeners.size;
    });
    await page.reload();
    const input = page.getByRole('textbox', { name: '消息正文', exact: true });
    const send = page.getByRole('button', { name: '发送消息', exact: true });
    const drafts = page.locator('.attachment-draft');
    await input.waitFor();
    await page.waitForFunction(() => document.querySelector('[aria-label="消息正文"]')?.disabled === false);
    assert.equal(await page.evaluate(() => window.__pasteListenerCount()), mobile ? 0 : 1);

    const uploads = [], held = [];
    let hold = false;
    await page.route('**/api/upload', async route => {
      const name = /filename="([^"]+)"/.exec(route.request().postDataBuffer().toString())?.[1];
      const url = `/uploads/${1700000000000 + uploads.length}.png`;
      uploads.push({ name, url });
      if (hold) await new Promise(resolve => held.push(resolve));
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ name, url, type: 'image/png' }) });
    });
    await page.route('**/uploads/*.png', route => route.fulfill({ contentType: 'image/png', body: png }));
    const paste = (selector, options = {}) => page.evaluate(({ selector, options, png }) => {
      const target = selector === 'active' ? document.activeElement : document.querySelector(selector);
      const data = new DataTransfer();
      if (options.text) data.setData('text/plain', options.text);
      if (!options.textOnly) {
        const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
        data.items.add(new File([bytes], options.name || 'paste.png', { type: options.type || 'image/png' }));
      }
      const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true, composed: true });
      target.dispatchEvent(event);
      return { prevented: event.defaultPrevented, focus: document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName };
    }, { selector, options, png: png.toString('base64') });
    const blur = () => page.evaluate(() => document.activeElement?.blur());
    const remove = async name => { await page.getByRole('button', { name: `移除 ${name}`, exact: true }).click(); };
    const uploaded = () => page.waitForFunction(() => [...document.querySelectorAll('.attachment-draft')].every(el => el.dataset.uploadStatus === 'uploaded'));

    // Focused Sender owns the paste; the page fallback must never double-add it.
    await input.fill('原草稿'); await input.focus();
    assert.equal((await paste('active', { text: '不追加的混合文字', name: 'focused.png' })).prevented, true);
    await uploaded(); assert.equal(await drafts.count(), 1); assert.equal(uploads.length, 1);
    assert.equal(await input.inputValue(), '原草稿'); assert.equal(state.sends.length, 0);
    await remove('focused.png'); assert.equal(await drafts.count(), 0);

    await blur();
    const unfocused = await paste('body', { name: 'unfocused.png', text: '混合文字' });
    assert.equal(unfocused.prevented, !mobile); assert.equal(unfocused.focus, 'BODY');
    if (mobile) {
      assert.equal(await drafts.count(), 0); assert.equal(uploads.length, 1);
    } else {
      await uploaded(); assert.equal(await drafts.count(), 1); assert.equal(uploads.length, 2);
      assert.equal(await input.inputValue(), '原草稿'); assert.equal(state.sends.length, 0);
      await page.getByRole('button', { name: '查看 unfocused.png', exact: true }).click();
      await page.getByRole('dialog', { name: '图片预览' }).waitFor();
      assert.equal((await paste('body')).prevented, false); assert.equal(uploads.length, 2);
      await page.getByRole('button', { name: '关闭图片预览', exact: true }).click();
      await remove('unfocused.png');

      // Ordinary chat focus is eligible. A child handler can still consume paste first.
      await page.locator('[data-chat-reading-region]').evaluate(el => { el.tabIndex = -1; el.focus(); });
      assert.equal((await paste('active', { name: 'region.png' })).prevented, true);
      await uploaded(); assert.equal(await drafts.count(), 1); await remove('region.png');
      await page.locator('[data-chat-reading-region]').evaluate(el => el.addEventListener('paste', event => event.preventDefault(), { once: true }));
      await blur(); const before = uploads.length;
      assert.equal((await paste('[data-chat-reading-region]')).prevented, true);
      assert.equal(uploads.length, before); assert.equal(await drafts.count(), 0);
    }

    // Text-only events remain native in both focused and unfocused cases.
    await input.focus(); assert.equal((await paste('active', { text: '普通文字', textOnly: true })).prevented, false);
    await blur(); assert.equal((await paste('body', { text: '普通文字', textOnly: true })).prevented, false);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(() => navigator.clipboard.writeText('实际文本粘贴'));
    await input.fill(''); await input.focus(); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
    assert.equal(await input.inputValue(), '实际文本粘贴');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '实际文本粘贴');

    // Real search input, Settings Popover and a modal never feed the Chat draft.
    await page.getByRole('button', { name: '搜索聊天历史', exact: true }).click();
    const search = page.getByRole('textbox', { name: '搜索当前会话', exact: true }); await search.waitFor(); await search.focus();
    assert.equal((await paste('active')).prevented, false); assert.equal(await drafts.count(), 0);
    await page.getByRole('button', { name: '关闭搜索', exact: true }).click();
    await page.getByRole('button', { name: '聊天设置', exact: true }).click();
    const settings = page.getByRole('dialog', { name: '聊天设置', exact: true }); await settings.waitFor();
    await blur(); assert.equal((await paste('body')).prevented, false);
    assert.equal((await paste('[data-chat-setting="send-shortcut"]')).prevented, false);
    assert.equal(await drafts.count(), 0); await page.keyboard.press('Escape'); await settings.waitFor({ state: 'hidden' });

    // Native and custom editable regions, including nested contenteditable children.
    const editableCases = ['<input aria-label="other">', '<textarea></textarea>', '<select><option>one</option></select>', '<div contenteditable="true"><span>edit</span></div>', '<div role="textbox" tabindex="0"></div>', '<div role="searchbox" tabindex="0"></div>', '<div role="combobox" tabindex="0"></div>'];
    for (const markup of editableCases) {
      await page.evaluate(markup => { const host = document.createElement('div'); host.id = 'paste-test'; host.innerHTML = markup; document.querySelector('.chat-shell').append(host); host.firstElementChild.focus(); }, markup);
      assert.equal((await paste('#paste-test span, #paste-test > :first-child')).prevented, false);
      assert.equal((await paste('body')).prevented, false);
      assert.equal(await drafts.count(), 0); await page.locator('#paste-test').evaluate(el => el.remove());
    }
    await page.evaluate(() => { const outside = document.createElement('button'); outside.id = 'outside-chat'; document.body.append(outside); outside.focus(); });
    assert.equal((await paste('#outside-chat')).prevented, false); assert.equal((await paste('body')).prevented, false);
    await page.locator('#outside-chat').evaluate(el => el.remove());
    await page.evaluate(() => { const dialog = document.createElement('div'); dialog.id = 'paste-dialog'; dialog.role = 'dialog'; dialog.textContent = '合成弹窗'; document.body.append(dialog); });
    await blur(); assert.equal((await paste('body')).prevented, false);
    await page.locator('#paste-dialog').evaluate(el => el.remove());

    if (!mobile) {
      // Same store retains upload gating and format validation; paste cannot send.
      await input.fill(''); await blur(); hold = true;
      assert.equal((await paste('body', { name: 'held.png' })).prevented, true);
      await page.waitForFunction(() => document.querySelector('.attachment-draft')?.dataset.uploadStatus === 'uploading');
      assert.equal(await send.isDisabled(), true); assert.equal(state.sends.length, 0);
      await page.waitForFunction(() => document.querySelector('.attachment-draft') !== null);
      const deadline = Date.now() + 10000;
      while (!held.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(held.length, 1);
      hold = false; held.splice(0).forEach(resolve => resolve()); await uploaded();
      assert.equal(await send.isEnabled(), true);
      await send.click(); await page.waitForFunction(() => !document.querySelector('.attachment-draft'));
      assert.equal(state.sends.length, 1); assert.deepEqual(state.sends[0].attachments, [uploads.at(-1).url]);
      assert.equal(state.sends[0].content, '');
      await blur(); const count = uploads.length;
      assert.equal((await paste('body', { name: 'unsupported.svg', type: 'image/svg+xml' })).prevented, true);
      assert.equal(await drafts.getAttribute('data-upload-status'), 'failed'); assert.equal(uploads.length, count);
      assert.equal(await send.isDisabled(), true); await remove('unsupported.svg');

      // Switching owners preserves A and sends subsequent paste only into B.
      await blur(); await paste('body', { name: 'owner-a.png' }); await uploaded();
      await page.getByRole('button', { name: '打开会话会话 B', exact: true }).click();
      await page.locator('[data-message-id="b-initial"]').waitFor(); assert.equal(await drafts.count(), 0);
      await blur(); await paste('body', { name: 'owner-b.png' }); await uploaded();
      assert.equal(await drafts.count(), 1); await page.getByRole('button', { name: '移除 owner-b.png', exact: true }).waitFor();
      await page.getByRole('button', { name: '打开会话会话 A', exact: true }).click();
      await page.getByRole('button', { name: '移除 owner-a.png', exact: true }).waitFor();
      assert.equal(await drafts.count(), 1); assert.equal(await page.evaluate(() => window.__pasteListenerCount()), 1);
    }

    // StrictMode remount and page exit leave no stale document listeners.
    const before = uploads.length;
    await page.evaluate(() => window.__chatUnmount()); await page.locator('.chat-shell').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.__pasteListenerCount()), 0);
    await blur(); assert.equal((await paste('body')).prevented, false); assert.equal(uploads.length, before);
    await page.evaluate(() => window.__chatMount()); await input.waitFor();
    await page.waitForFunction(() => document.querySelector('[aria-label="消息正文"]')?.disabled === false);
    assert.equal(await page.evaluate(() => window.__pasteListenerCount()), mobile ? 0 : 1);
    assert.deepEqual(errors, []);
    console.log(`${mobile ? 'mobile' : 'desktop'}: clipboard ownership, native text, upload flow and listener lifecycle passed`);
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try { await run(browser, false); await run(browser, true); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
