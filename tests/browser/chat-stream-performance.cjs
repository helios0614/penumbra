/* Real ChatView + controller + React Profiler, synthetic HTTP/SSE only.
 * Run against an isolated Vite server on 45365, before and after the change.
 * All instrumentation is injected into browser responses, never production code.
 */
const { chromium } = require(process.argv[2] || 'playwright');
const { fixture } = require('./chat-pr6-5-config-smoke.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const output = process.env.CHAT_PERF_OUTPUT || '/private/tmp/penumbra-chat-stream-performance.json';
const runs = Number(process.env.CHAT_PERF_RUNS || 3);

async function run(browser) {
  const { page, context, errors } = await fixture(browser, 1280, async (page, state) => {
    state.messages.a = Array.from({ length: 60 }, (_, index) => ({
      id: index === 0 ? 'a-initial' : `history-${index}`, conv_id: 'a', role: index % 2 ? 'user' : 'assistant',
      content: index % 2 ? `Synthetic question ${index}` : `Synthetic answer ${index} with **emphasis**.\n\n\`\`\`ts\nconst value = ${index};\n\`\`\`\n\n| Key | Value |\n| --- | --- |\n| item | ${index} |`,
      created_at: 1700000000 + index, drift: null, thinking: null, attachments: [], is_carryover: 0, mcp_tool_calls: [], cache_region: null,
    }));
    await page.addInitScript(() => {
      window.__streamPerf = { projections: 0, boundaryParses: 0, markdownRenders: 0, commits: [], longtasks: [] };
      new PerformanceObserver(list => window.__streamPerf.longtasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration })))).observe({ type: 'longtask' });
    });
    for (const [file, functionName, counter] of [
      ['chat-workspace/presentation/chat-message-presenter.ts', 'presentChatMessage', 'projections'],
      ['chat/markdown-boundaries.ts', 'parseBubbleMarkdown', 'boundaryParses'],
      ['chat/MarkdownRenderer.tsx', 'MarkdownRendererInner', 'markdownRenders'],
    ]) {
      await page.route(`**/src/components/${file}*`, async route => {
        const response = await route.fetch();
        const source = await response.text();
        const pattern = new RegExp(`(function ${functionName}\\([^]*?\\) \\{)`);
        assert(pattern.test(source), `Instrumentation target missing: ${functionName}`);
        await route.fulfill({ response, body: source.replace(pattern, `$1 window.__streamPerf.${counter}++;`) });
      });
    }
    await page.route('**/tests/browser/chat-pr3.html?html-proxy*', async route => {
      const response = await route.fetch();
      const source = await response.text();
      const target = 'React.createElement(ChatView, { onBack: () => { window.__chatHomeReturns = (window.__chatHomeReturns || 0) + 1; } })';
      assert(source.includes(target));
      await route.fulfill({ response, body: source.replace(target, `React.createElement(React.Profiler, { id: 'chat', onRender: (id, phase, actualDuration) => window.__streamPerf.commits.push({ phase, actualDuration }) }, ${target})`) });
    });
  });
  try {
    // Some local file watchers miss changes. Never label stale served code as
    // the implementation on disk when collecting a before/after comparison.
    const expectedGate = fs.readFileSync(require('node:path').join(__dirname, '../../src/application/chat-send/chat-send-controller.ts'), 'utf8').includes('sameStreamingPresentation');
    const served = await page.request.get(`${new URL(page.url()).origin}/src/application/chat-send/chat-send-controller.ts`);
    assert.equal((await served.text()).includes('sameStreamingPresentation'), expectedGate, 'Stale Vite module: restart the isolated server');
    await page.locator('[data-message-id="history-59"]').waitFor();
    await page.evaluate(() => {
      window.__penumbraChatTimeline.enable();
      const fetchOriginal = window.fetch.bind(window);
      window.fetch = async (url, options) => {
        if (options?.method === 'POST' && /\/send$/.test(String(url))) {
          return new Response(new ReadableStream({ start(controller) { window.__perfSource = controller; } }), { headers: { 'content-type': 'text/event-stream' } });
        }
        return fetchOriginal(url, options);
      };
    });
    await page.getByRole('textbox', { name: '消息正文', exact: true }).fill('Synthetic performance send');
    await page.getByRole('button', { name: '发送消息', exact: true }).click();
    await page.waitForFunction(() => window.__perfSource);
    await page.evaluate(() => window.__perfSource.enqueue(new TextEncoder().encode('data: {"type":"start","id":"perf-reply"}\n\n')));
    await page.waitForTimeout(250);
    await page.evaluate(() => { window.__historyCodeNode = document.querySelector('[data-message-id="a-initial"] .ai-code-block'); });
    const results = {};
    for (const [name, event, count] of [
      ['content', { type: 'chunk', content: ' token' }, 16],
      ['unknown', { type: 'synthetic-noop' }, 8],
      ['empty', { type: 'chunk', content: '' }, 8],
    ]) {
      await page.evaluate(() => {
        Object.assign(window.__streamPerf, { projections: 0, boundaryParses: 0, markdownRenders: 0, commits: [], longtasks: [] });
        window.__penumbraChatTimeline.clear();
      });
      await page.evaluate(async ({ event, count }) => {
        for (let i = 0; i < count; i++) {
          window.__perfSource.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
          await new Promise(resolve => setTimeout(resolve, 40));
        }
      }, { event, count });
      await page.waitForTimeout(200);
      results[name] = await page.evaluate(() => ({ ...window.__streamPerf,
        publications: window.__penumbraChatTimeline.read().filter(e => e.stage === 'session.publish').length,
        historicalCodeNodeReused: !!window.__historyCodeNode && window.__historyCodeNode === document.querySelector('[data-message-id="a-initial"] .ai-code-block'),
      }));
      results[name].events = count;
      if (expectedGate) {
        assert.equal(results[name].historicalCodeNodeReused, true);
        assert.equal(results[name].projections, 0);
        if (name !== 'content') {
          assert.equal(results[name].publications, 0);
          assert.equal(results[name].commits.length, 0);
          assert.equal(results[name].boundaryParses, 0);
          assert.equal(results[name].markdownRenders, 0);
        }
      }
    }
    assert.equal((await page.locator('[data-message-body]').last().innerText()).trim(), ' token'.repeat(16).trim());
    assert.deepEqual(errors, []);
    return results;
  } finally { await context.close(); }
}
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try {
    const results = [];
    for (let i = 0; i < runs; i++) results.push(await run(browser));
    fs.writeFileSync(output, JSON.stringify({ historyMessages: 60, intervalMs: 40, strictMode: true, results }, null, 2));
    console.log(JSON.stringify({ output, results: results.map(run => Object.fromEntries(Object.entries(run).map(([phase, value]) => [phase, {
      events: value.events, publications: value.publications, projections: value.projections,
      boundaryParses: value.boundaryParses, markdownRenders: value.markdownRenders,
      commits: value.commits.length, reactActualMs: +value.commits.reduce((sum, item) => sum + item.actualDuration, 0).toFixed(1),
      longtasks: value.longtasks.length, longtaskMs: +value.longtasks.reduce((sum, item) => sum + item.duration, 0).toFixed(1),
    }]))) }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
