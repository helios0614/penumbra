/* Real Chromium, synthetic fixture only. No business backend/WS/media network. */
const { chromium } = require(process.env.CHAT_PR6_PLAYWRIGHT || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const origin = process.env.CHAT_PR6_ORIGIN || "http://127.0.0.1:45360";
async function main() {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHAT_PR6_CHROMIUM
      ? { executablePath: process.env.CHAT_PR6_CHROMIUM }
      : {}),
  });
  const reports = [];
  try {
    for (const width of [1280, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${origin}/tests/browser/chat-pr6-search.html`);
      await page.locator('[data-message-id="message-1299"]').waitFor();
      const viewport = page.locator(
        '.chat-message-scroll [data-slot="scroll-area-viewport"]',
      );
      const before = await viewport.evaluate((el) => ({
        top: el.scrollTop,
        bodyTop: document.scrollingElement.scrollTop,
      }));
      await page
        .getByRole("button", { name: "搜索聊天历史", exact: true })
        .click();
      const input = page.getByRole("textbox", {
        name: "搜索当前会话",
        exact: true,
      });
      await input.fill("古老关键词");
      await page.getByRole("listitem").first().waitFor();
      await page.getByRole("listitem").first().click();
      const target = page.locator('[data-message-id="message-2"]');
      await target.waitFor();
      await page.waitForFunction(
        () => !!document.querySelector('[data-message-id="message-2"] mark'),
      );
      assert((await target.locator("mark").count()) > 0);
      assert.equal(
        await page.evaluate(() => document.scrollingElement.scrollTop),
        before.bodyTop,
      );
      const calls = await page.evaluate(() => window.pr6.requests);
      assert(
        calls.some((p) => p.includes("/messages/window?anchor_id=message-2")),
      );
      assert(
        !calls.some((p) => p.includes("before_cursor")),
        "direct jump must not walk pages",
      );
      const bounds = await target.boundingBox(),
        v = await viewport.boundingBox();
      assert(
        bounds.y >= v.y - 2 && bounds.y < v.y + v.height,
        "target must be in Chat viewport",
      );
      await page.evaluate(() => {
        const body = document.querySelector(
          '[data-message-id="message-1"] [data-message-body]',
        );
        const block = document.createElement("div");
        block.style.height = "450px";
        block.dataset.syntheticLateMedia = "true";
        body.appendChild(block);
      });
      await page.waitForTimeout(300);
      assert(
        Math.abs((await target.boundingBox()).y - bounds.y) < 3,
        "late media height must preserve the jump target",
      );
      await page.getByRole("button", { name: "关闭搜索", exact: true }).click();
      await page.locator('[data-message-id="message-1299"]').waitFor();
      await page
        .getByRole("button", { name: "搜索聊天历史", exact: true })
        .click();
      await input.fill("公开系统关键词");
      await page.getByRole("listitem").first().waitFor();
      await page.getByRole("listitem").first().click();
      await page
        .locator('[data-message-id="message-3"] [aria-expanded="true"]')
        .waitFor();
      await page.locator('[data-message-id="message-3"] pre').waitFor();
      await page.waitForTimeout(300);
      assert.equal(
        await page
          .locator("body")
          .evaluate((el) => el.scrollWidth > window.innerWidth + 1),
        false,
        "no horizontal page overflow",
      );
      fs.mkdirSync("node_modules/.pr6-artifacts", { recursive: true });
      await page.screenshot({
        path: `node_modules/.pr6-artifacts/search-${width}.png`,
        fullPage: true,
      });
      await viewport.hover();
      await page.mouse.wheel(0, 150);
      await page.waitForTimeout(100);
      await page.getByRole("button", { name: "关闭搜索", exact: true }).click();
      assert(
        await page.locator('[data-message-id="message-3"]').count(),
        "closing after user reading must retain the old window",
      );
      await page
        .getByRole("button", { name: "返回搜索前位置", exact: true })
        .click();
      await page.locator('[data-message-id="message-1299"]').waitFor();
      await page
        .getByRole("button", { name: "搜索聊天历史", exact: true })
        .click();
      await input.fill("PRIVATE_DESTINATION");
      await page.getByText("没有匹配消息", { exact: true }).waitFor();
      await input.fill("slow");
      await page.waitForTimeout(300);
      await input.fill("古老关键词");
      await page.getByRole("listitem").first().waitFor();
      await page.waitForTimeout(800);
      assert(
        (await page.getByRole("listitem").first().innerText()).includes(
          "古老关键词",
        ),
      );
      // While a real Send controller waits for HTTP confirmation, navigate to old history.
      await page.evaluate(() => {
        void window.pr6.generate();
      });
      await page.getByRole("listitem").first().click();
      await target.waitFor();
      await page.waitForFunction(
        () => window.pr6.send.getState().kind === "idle",
      );
      assert(await target.count());
      assert.equal(
        await page.locator('[data-message-id="generated-assistant"]').count(),
        0,
      );
      assert(
        (
          await page.evaluate(() =>
            window.pr6.workspace
              .getState()
              .workspace.history.messages.map((m) => m.id),
          )
        ).includes("message-2"),
      );
      await page
        .getByRole("button", { name: "回到最新", exact: true })
        .first()
        .click();
      await page.locator('[data-message-id="generated-assistant"]').waitFor();
      await page.goBack();
      await page
        .getByRole("textbox", { name: "搜索当前会话", exact: true })
        .waitFor({ state: "hidden" });
      assert(
        page.url().includes("chat-pr6-search.html"),
        "Back must close search on the same Chat page",
      );
      assert.equal(errors.length, 0, errors.join("\n"));
      reports.push({
        width,
        directJump: true,
        viewportOnly: true,
        systemExpanded: true,
        lateQueryIsolated: true,
        confirmationIsolated: true,
        errors,
      });
      await page.close();
    }
    console.log(JSON.stringify(reports, null, 2));
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
