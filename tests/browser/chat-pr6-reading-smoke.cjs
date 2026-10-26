/* Display-only checks, real Dialog/Workspace, synthetic data. No screenshots. */
const { chromium } = require(process.env.CHAT_PR6_PLAYWRIGHT || "playwright");
const assert = require("node:assert/strict");
const origin = process.env.CHAT_PR6_ORIGIN || "http://127.0.0.1:45360";
async function main() {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHAT_PR6_CHROMIUM ? { executablePath: process.env.CHAT_PR6_CHROMIUM } : {}) });
  const report = [];
  try {
    const eventOnly = process.env.CHAT_PR6_EVENT_ONLY === "1";
    for (const width of eventOnly ? [390] : [320,390,1280]) {
      const page = await browser.newPage({ viewport: { width, height: 850 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
      const errors = [], remote = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", req => { if (req.url().includes("example.invalid")) remote.push(req.url()); });
      for (const reading of eventOnly ? ["mixed"] : ["pure", "mixed"]) {
        await page.goto(`${origin}/tests/browser/chat-pr6-global-search.html?reading=${reading}`);
        await page.locator('[data-message-id="message-1299"]').waitFor();
        const mainViewport = page.locator('.chat-message-scroll [data-slot="scroll-area-viewport"]');
        const mainTop = await mainViewport.evaluate(el => el.scrollTop);
        const draft = page.getByRole("textbox", { name: "消息正文" });
        await draft.fill("保留的合成草稿");
        if (width < 768) await page.getByRole("button", { name: "打开会话列表", exact: true }).click();
        await page.getByRole("button", { name: "搜索全部聊天", exact: true }).filter({ visible: true }).click();
        const search = page.locator(".global-chat-search");
        const empty = await search.boundingBox();
        assert(empty.height < 500, "empty search should use natural height");
        if (width < 768) await page.waitForFunction(() => getComputedStyle(document.querySelector(".chat-conversations-drawer")).opacity === "0");
        const input = search.getByRole("textbox", { name: "全部聊天关键词" });
        await input.fill("阅读");
        await search.locator("[data-has-results=true]").waitFor();
        const full = await search.boundingBox();
        assert(full.height > empty.height && full.height <= 818);
        const rows = search.locator(".global-chat-results");
        const source = search.getByRole("button", { name: "查看原文", exact: true }).nth(8);
        await source.scrollIntoViewIfNeeded();
        const geometry = await source.evaluate(button => {
          const action = button.getBoundingClientRect();
          const meta = button.closest("[data-global-result-meta]");
          const time = meta.querySelector("time").getBoundingClientRect();
          return { touchHeight: action.height, right: action.right, metaRight: meta.getBoundingClientRect().right,
            separated: time.right <= action.left, inside: action.left >= 0 && action.right <= innerWidth };
        });
        assert(geometry.touchHeight >= 44 && geometry.inside && geometry.separated);
        assert(Math.abs(geometry.right - geometry.metaRight) < 1, "source action belongs on the right of metadata");
        const scrollTop = await rows.evaluate(el => el.scrollTop);
        await source.click();
        const context = page.locator(".conversation-context-dialog");
        await context.locator('[data-context-message="source-8"]').waitFor();
        await page.waitForFunction(() => getComputedStyle(document.querySelector(".global-chat-search")).opacity === "0");
        assert.equal(await context.locator("[data-context-message]").count(), 5);
        const beforeDetail = await context.boundingBox();
        assert(beforeDetail.x >= 0 && beforeDetail.x + beforeDetail.width <= width + 1);
        assert.equal(await context.evaluate(el => el.scrollWidth > el.clientWidth), false);
        if (reading === "mixed") {
          const memory = context.locator('[data-context-message="memory"]');
          const details = memory.locator("details");
          const body = memory.locator(".context-event > p").first();
          const textBefore = await body.innerText();
          assert(textBefore.length > 180, "neighboring memory body must not become only a clipped preview");
          assert(await body.isVisible());
          assert.equal(await details.getAttribute("open"), null);
          assert.equal(await memory.getByText("synthetic-memory-28", { exact: true }).isVisible(), false);
          assert(await context.locator('[data-context-message="source-8"]').innerText().then(text => text.includes("08:55") && text.includes("当前关注")));
          assert(await context.locator('[data-context-message="source-8"]').innerText().then(text => text.includes("提醒时间") && text.includes("记录于")));
          await details.locator("summary").click();
          assert(await body.isVisible(), "opening details must not hide the neighboring memory body");
          assert.equal(await body.innerText(), textBefore);
          assert(!(await details.innerText()).includes(textBefore), "details must not repeat the memory body");
          assert(await memory.getByText("synthetic-memory-28", { exact: true }).isVisible());
          assert.equal(await memory.locator("dt").filter({ hasText: "重要度" }).count(), 0);
          await details.locator("summary").click();
          assert(await body.isVisible()); assert.equal(await body.innerText(), textBefore);
          const tool = context.locator('[data-context-message="tool"]');
          await tool.scrollIntoViewIfNeeded();
          const text = await tool.innerText();
          for (const word of ["部分完成", "失败", "截断标记"]) assert(text.includes(word));
        }
        assert(!await context.innerText().then(text => /PRIVATE_RAW_COMMAND|PRIVATE_ARGS/.test(text)));
        await page.keyboard.press("Escape");
        await context.waitFor({ state: "hidden" });
        await page.waitForFunction(() => getComputedStyle(document.querySelector(".global-chat-search")).opacity === "1");
        assert(Math.abs(await rows.evaluate(el => el.scrollTop) - scrollTop) <= 1);
        assert(await source.evaluate(el => document.activeElement === el));
        // Resize is a small-viewport check, not a claim of real IME/OS keyboard verification.
        if (width < 768) {
          await input.focus();
          const button = search.getByRole("button", { name: "继续查找更早 30 天", exact: true });
          for (const height of [420, 350]) {
            await page.setViewportSize({ width, height });
            await page.waitForTimeout(100);
            const box = await button.boundingBox();
            assert(box.y >= 0 && box.y + box.height <= height, `continue button must remain reachable at ${width}x${height}`);
            assert(await rows.evaluate(el => el.clientHeight > 0 && el.scrollHeight > el.clientHeight));
          }
          await page.setViewportSize({ width, height: 850 });
        }
        await page.goBack(); await search.waitFor({ state: "hidden" });
        if (width < 768) {
          await page.waitForFunction(() => getComputedStyle(document.querySelector(".chat-conversations-drawer")).opacity === "1");
          await page.getByRole("button", { name: "Close", exact: true }).click();
        }
        assert.equal(await draft.inputValue(), "保留的合成草稿");
        assert(Math.abs(await mainViewport.evaluate(el => el.scrollTop) - mainTop) <= 1);
        assert.equal(await page.evaluate(() => window.pr6.workspace.getState().workspace.selectedConversationId), "conv_a");
        report.push({ width, reading, emptyHeight: Math.round(empty.height), resultHeight: Math.round(full.height), restored: true });
      }
      assert.deepEqual(errors, []); assert.deepEqual(remote, []); await page.close();
    }
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exit(1); });
