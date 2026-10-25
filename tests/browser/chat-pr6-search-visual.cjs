/* Paper surface verification against dense synthetic chat. No business backend. */
const { chromium } = require(process.env.CHAT_PR6_PLAYWRIGHT || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const origin = process.env.CHAT_PR6_ORIGIN || "http://127.0.0.1:45362";
const output = "node_modules/.pr6-artifacts";
async function run() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHAT_PR6_CHROMIUM
      ? { executablePath: process.env.CHAT_PR6_CHROMIUM }
      : {}),
  });
  const reports = [];
  try {
    for (const width of [320, 390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin
          ? route.continue()
          : route.abort(),
      );
      await page.goto(`${origin}/tests/browser/chat-pr6-search.html?visual=1`);
      await page.locator('[data-message-id="message-1299"]').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const viewport = page.locator(
        '.chat-message-scroll [data-slot="scroll-area-viewport"]',
      );
      const position = () =>
        viewport.evaluate((el) => ({
          top: el.scrollTop,
          y: el.getBoundingClientRect().top,
          height: el.clientHeight,
        }));
      const before = await position();
      await page
        .getByRole("button", { name: "搜索聊天历史", exact: true })
        .click();
      const input = page.getByRole("textbox", {
        name: "搜索当前会话",
        exact: true,
      });
      await input.waitFor();
      await page.waitForTimeout(250);
      assert.deepEqual(
        await position(),
        before,
        "opening search must not resize or scroll chat",
      );
      assert.equal(
        await page
          .getByRole("button", { name: "上一条匹配消息", exact: true })
          .count(),
        0,
      );
      await page.screenshot({
        path: `${output}/paper-search-${width}-empty.png`,
      });
      await input.fill("公开关键词");
      await page.getByRole("listitem").first().waitFor();
      const toolbar = page.locator(".chat-search-toolbar");
      assert.equal(
        await toolbar
          .getByRole("button", { name: "上一条匹配消息", exact: true })
          .count(),
        0,
      );
      const meta = page.locator(".chat-search-meta");
      assert.equal(
        await meta
          .getByRole("button", { name: "上一条匹配消息", exact: true })
          .count(),
        1,
      );
      await page.getByRole("listitem").first().click();
      const list = page.getByRole("list", { name: "历史搜索结果" });
      const footer = page.locator(".chat-search-footer");
      const chatAtTarget = await position();
      await list.hover();
      await page.mouse.wheel(0, 450);
      await page.waitForTimeout(100);
      assert(
        await list.evaluate((el) => el.scrollTop > 0),
        "results own their scrolling",
      );
      assert.deepEqual(
        await position(),
        chatAtTarget,
        "result scrolling cannot move chat",
      );
      const previousScroll = await list.evaluate((el) => el.scrollTop);
      await page
        .getByRole("button", { name: "继续搜索历史", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document.querySelectorAll('.chat-search-results [role="listitem"]')
            .length === 40,
      );
      assert.equal(
        await list.evaluate((el) => el.scrollTop),
        previousScroll,
        "appending matches must retain list position",
      );
      await list.evaluate((el) => {
        el.scrollTop = 0;
      });
      const l = await list.boundingBox(),
        f = await footer.boundingBox();
      assert(
        l.y + l.height <= f.y + 1,
        "footer must sit outside the result scroll area",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: `${output}/paper-search-${width}-results.png`,
      });
      if (width === 390) {
        const stress = await page.addStyleTag({
          content:
            ".chat-message-scroll [data-user-bubble] { background: color-mix(in srgb, var(--color-primary) 24%, transparent); } .chat-message-scroll { --chat-ai-surface: color-mix(in srgb, var(--color-ai) 26%, transparent); }",
        });
        await page.screenshot({
          path: `${output}/paper-search-${width}-contrast-stress.png`,
        });
        await stress.evaluate((el) => el.remove());
      }
      const material = await page
        .locator(".chat-search-panel")
        .evaluate((el) => {
          const style = getComputedStyle(el);
          return {
            background: style.backgroundColor,
            blur: style.backdropFilter,
            shadow: style.boxShadow,
          };
        });
      await input.fill("不存在的测试片段");
      await page.getByText("没有匹配消息", { exact: true }).waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "继续搜索历史", exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "上一条匹配消息", exact: true })
          .count(),
        0,
      );
      await page.screenshot({
        path: `${output}/paper-search-${width}-no-results.png`,
      });
      await page.getByRole("button", { name: "清空搜索", exact: true }).click();
      assert.equal(
        await page
          .getByRole("group", { name: "历史阅读位置", exact: true })
          .count(),
        0,
      );
      if (width < 768) {
        assert(
          (await input.evaluate((el) =>
            parseFloat(getComputedStyle(el).fontSize),
          )) >= 16,
        );
        await page.setViewportSize({ width, height: 480 });
        await input.fill("公开关键词");
        await page.getByRole("listitem").first().waitFor();
        const panel = await page.locator(".chat-search-panel").boundingBox();
        const composer = await page
          .locator(".chat-composer-dock")
          .boundingBox();
        assert(
          panel.y + panel.height <= composer.y + 1,
          "short visual viewport must leave Composer clear",
        );
        assert((await footer.boundingBox()).height > 20);
        await page.screenshot({
          path: `${output}/paper-search-${width}-short-viewport.png`,
        });
        await page.setViewportSize({ width, height: 850 });
      }
      await page.getByRole("button", { name: "关闭搜索", exact: true }).click();
      await input.waitFor({ state: "hidden" });
      assert.equal(errors.length, 0, errors.join("\n"));
      reports.push({
        width,
        material,
        inputAndNavigation: true,
        scrollIsolated: true,
        footerSeparated: true,
        errors,
      });
      await page.close();
    }
    fs.writeFileSync(
      `${output}/paper-search-visual.json`,
      JSON.stringify(reports, null, 2),
    );
    console.log(JSON.stringify(reports, null, 2));
  } finally {
    await browser.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
