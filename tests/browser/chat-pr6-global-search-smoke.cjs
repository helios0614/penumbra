/* One compact pass per viewport; synthetic transport only, no visual matrix. */
const { chromium } = require(process.env.CHAT_PR6_PLAYWRIGHT || "playwright");
const assert = require("node:assert/strict");
const origin = process.env.CHAT_PR6_ORIGIN || "http://127.0.0.1:45360";
async function main() {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHAT_PR6_CHROMIUM ? { executablePath: process.env.CHAT_PR6_CHROMIUM } : {}) });
  const report = [];
  try {
    for (const width of [320, 390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      const errors = [], remote = [];
      page.on("pageerror", e => errors.push(e.message));
      page.on("request", req => { if (req.url().includes("example.invalid")) remote.push(req.url()); });
      await page.goto(`${origin}/tests/browser/chat-pr6-global-search.html`);
      await page.locator('[data-message-id="message-1299"]').waitFor();
      const inputDraft = page.getByRole("textbox", { name: "消息正文" });
      await inputDraft.fill("保留的合成草稿");
      // Existing fixture exposes the real send controller; opening the dialogs
      // during its stream must not cancel/finalize it or navigate its history.
      await page.evaluate(() => { void window.pr6.generate(); });
      if (width < 768) await page.getByRole("button", { name: "打开会话列表", exact: true }).click();
      await page.getByRole("button", { name: "搜索全部聊天", exact: true }).filter({ visible: true }).click();
      const search = page.getByRole("dialog", { name: "搜索全部聊天", exact: true });
      const input = search.getByRole("textbox", { name: "全部聊天关键词" });
      await input.fill("关键词");
      await search.getByText("尚未查完", { exact: true }).waitFor();
      await page.waitForTimeout(350);
      assert.equal(await page.evaluate(() => window.pr6c.calls.filter(p => p.includes("messages/search")).length), 1);
      await search.getByRole("button", { name: "继续查找当前时间段", exact: true }).click();
      await search.getByRole("button", { name: "查看原文", exact: true }).waitFor();
      await search.getByRole("button", { name: "查看原文", exact: true }).click();
      const context = page.getByRole("dialog", { name: "原文对话", exact: true });
      await context.locator('[data-context-message="source"]').waitFor();
      assert.equal(await context.locator("li").count(), 5);
      assert.equal(await context.locator("strong").count(), 5);
      assert.equal(await context.locator("img,audio,video,iframe,a,button:not([data-slot=dialog-close-button])").count(), 0);
      assert.equal(await context.getByText("书架与秋日 · 当前名称", { exact: false }).count(), 1);
      for (const dialog of [context, search]) {
        const bounds = await dialog.boundingBox();
        assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.height <= 850);
        assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth), false);
      }
      await page.goBack(); await context.waitFor({ state: "hidden" });
      assert(await search.isVisible());
      assert.equal(await search.getByRole("button", { name: "查看原文", exact: true }).evaluate(el => document.activeElement === el), true);
      await search.getByRole("button", { name: "继续查找当前时间段", exact: true }).click();
      await search.getByRole("button", { name: "继续查找更早 30 天", exact: true }).click();
      await page.waitForFunction(() => window.pr6c.calls.filter(p => p.includes("messages/search")).length === 4);
      const ranges = await page.evaluate(() => window.pr6c.calls.filter(p => p.includes("messages/search")).map(p => Object.fromEntries(new URL(p, location.href).searchParams)));
      assert.equal(Number(ranges[3].range_end), Number(ranges[0].range_start));
      assert.equal(Number(ranges[3].range_start), Number(ranges[0].range_start) - 2592000);
      await search.getByText("已找到 2 条", { exact: true }).waitFor();
      const calls = await page.evaluate(() => window.pr6c.calls);
      assert(calls.some(p => p.includes("before_limit=2&after_limit=2")));
      await page.waitForTimeout(1600);
      assert.equal(await page.evaluate(() => window.pr6.workspace.getState().workspace.selectedConversationId), "conv_a");
      assert(!await page.evaluate(() => window.pr6.workspace.getState().workspace.history?.messages.some(m => m.id === "source")));
      await search.getByRole("button", { name: "关闭", exact: true }).click();
      if (width < 768) await page.getByRole("button", { name: "Close", exact: true }).click();
      await page.locator('[data-message-id="generated-assistant"]').waitFor();
      assert.equal(await inputDraft.inputValue(), "保留的合成草稿");
      assert.equal(remote.length, 0); assert.deepEqual(errors, []);
      report.push({ width, requests: calls.length, readOnly: true, generationPreserved: true });
      await page.close();
    }
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exit(1); });
