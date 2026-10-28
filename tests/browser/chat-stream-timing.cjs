/* Synthetic data only. Real Chat/StrictMode, SSE reader/controller and render timing. */
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { fixture } = require('./chat-pr6-5-config-smoke.cjs');
const output = process.env.CHAT_TIMING_OUTPUT || '/private/tmp/penumbra-sse-timing';
const row = (id, role, content) => ({ id, conv_id: 'a', role, content, created_at: 1700000000, drift: null, thinking: null, attachments: [], is_carryover: 0, mcp_tool_calls: [], cache_region: null });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function transport(browser) {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:45365/tests/browser/chat-pr3.html');
  const result = [];
  for (const [name, base, buffered] of [['direct', 'http://127.0.0.1:45366', false], ['proxy', 'http://127.0.0.1:45365', false], ['buffered-direct', 'http://127.0.0.1:45366', true], ['buffered-proxy', 'http://127.0.0.1:45365', true]]) {
    await fetch('http://127.0.0.1:45366/api/synthetic/scenario', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ delays: [0.2, 1, 3], buffer: buffered }) });
    let targetId;
    for (const kind of (buffered ? ['send'] : ['send', 'regenerate'])) {
      const id = `timing-${name}-${kind}-${Date.now()}`;
      const value = await page.evaluate(async ({ base, id, kind, targetId }) => {
        const at = Date.now(), reads = []; let text = ""; const decoder = new TextDecoder();
        const response = await fetch(`${base}/api/conversations/conv-1/${kind === 'send' ? 'send' : `messages/${targetId}/regenerate`}`, {
          method: 'POST', headers: { 'content-type': 'application/json', 'X-Penumbra-Debug-Execution': id },
          ...(kind === 'send' ? { body: JSON.stringify({ content: 'synthetic timing', client_msg_id: id, fast_mode: true }) } : {}),
        });
        const headers = Date.now();
        if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
        const reader = response.body.getReader();
        while (true) { const { done, value } = await reader.read(); if (done) break; reads.push({ wall: Date.now(), bytes: value.byteLength }); text += decoder.decode(value, { stream: true }); }
        const start = text.split("\n").filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6))).find(e => e.type === "start");
        return { at, headers, reads, ended: Date.now(), assistantId: start?.id };
      }, { base, id, kind, targetId });
      targetId = value.assistantId;
      result.push({ name, kind, id, ...value });
    }
  }
  await page.close(); return result;
}
async function integrated(browser) {
  await fetch('http://127.0.0.1:45366/api/synthetic/scenario', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ delays: [5.5, 1, 3], buffer: false }) });
  const { page, context, errors } = await fixture(browser, 1280);
  let release;
  await page.route('**/api/conversations/a/send', route => route.continue());
  await page.route('**/api/conversations/a/send-results/*', async route => {
    const client = new URL(route.request().url()).pathname.split('/').pop();
    const response = await fetch(`http://127.0.0.1:45366/api/conversations/a/send-results/${client}`);
    const value = await response.json();
    await route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(value) });
  });
  await page.route('**/api/conversations/a/messages/window*', async route => {
    await new Promise(resolve => { release = resolve; });
    const response = await fetch('http://127.0.0.1:45366/api/conversations/a/messages/window?public_view=true');
    const value = await response.json();
    await route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(value) });
  });
  await page.evaluate(() => {
    window.__penumbraChatTimeline.enable();

  });
  await page.getByRole('textbox', { name: '消息正文', exact: true }).fill('synthetic integrated timing');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await page.getByText('SSE_ONE', { exact: true }).waitFor();
  await page.getByText('SSE_ONE_TWO', { exact: true }).waitFor();
  await page.getByText('SSE_ONE_TWO_THREE', { exact: true }).waitFor();
  await page.waitForFunction(() => window.__penumbraChatTimeline.read().some(e => e.stage === 'history.begin'));
  assert(release); release();
  await page.waitForFunction(() => window.__penumbraChatTimeline.read().some(e => e.stage === 'execution.reconciled'));
  await page.waitForFunction(() => window.__penumbraChatTimeline.read().some(e => e.stage === 'ui.commit' && e.source === 'history'));
  const rows = await page.evaluate(() => window.__penumbraChatTimeline.read());
  const begin = rows.find(e => e.stage === 'execution.begin');
  const facts = await (await fetch('http://127.0.0.1:45366/api/synthetic/timeline')).json();
  const backend = facts.filter(e => e.run === begin.executionId.replace('execution:', 'send:'));
  assert(backend.some(e => e.stage === 'backend.provider'));
  const chunks = rows.filter(e => e.stage === 'controller.event' && e.event === 'chunk');
  const commits = rows.filter(e => e.stage === 'ui.commit' && e.source === 'sse');
  assert.equal(chunks.length, 3);
  assert(commits.length >= 3);
  assert(commits[0].wall < backend.find(e => e.stage === 'backend.ws.after_commit' && e.wall > chunks[0].wall).wall);
  assert.deepEqual(errors, []);
  fs.writeFileSync(`${output}/integrated.json`, JSON.stringify({ rows, backend }, null, 2));
  console.log('Real backend fake Provider -> queue -> ASGI -> Vite -> browser -> mapper/controller -> React -> HTTP history passed');
  await context.close();
}
async function ui(browser, width) {
  const { page, state, errors, context } = await fixture(browser, width);
  let receipt = null, releaseHistory = null, historyGate = false;
  let capture = null, delivered = false;
  await page.route('**/api/chat/debug/drain', route => {
    const records = capture && !delivered ? [capture] : []; if (records.length) delivered = true;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ records, dropped: 0 }) });
  });
  await page.route('**/api/conversations/*/send-results/*', route => route.fulfill({ status: receipt ? 200 : 404, contentType: 'application/json', body: JSON.stringify(receipt || {}) }));
  await page.route('**/api/conversations/a/messages/window*', async route => {
    if (historyGate) await new Promise(resolve => { releaseHistory = resolve; });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ conversation_id: 'a', anchor_id: null, messages: state.messages.a, older_cursor: null, newer_cursor: null, has_older: false, has_newer: false, reaches_latest: true }) });
  });
  await page.evaluate(() => {
    window.__penumbraChatTimeline.enable();
    const original = window.fetch.bind(window);
    window.__sources = []; window.__post = []; window.__delayHeaders = true;
    window.fetch = async (url, options) => {
      if (options?.method === 'POST' && /\/(send|regenerate)(?:\?|$)/.test(String(url))) {
        window.__post.push(JSON.parse(options.body || '{}'));
        const body = new ReadableStream({ start(controller) { window.__sources.push(controller); } });
        if (window.__delayHeaders) await new Promise(resolve => { window.__headers = resolve; });
        return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
      }
      return original(url, options);
    };
  });
  const composer = page.getByRole('textbox', { name: '消息正文', exact: true });
  const send = async text => { await composer.fill(text); await page.getByRole('button', { name: '发送消息', exact: true }).click(); };
  const emit = payload => page.evaluate(payload => window.__sources.at(-1).enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`)), payload);
  const trace = () => page.evaluate(() => window.__penumbraChatTimeline.read());
  const select = async name => {
    if (width < 768) await page.getByRole('button', { name: '打开会话列表', exact: true }).click();
    await page.getByRole('button', { name: `打开会话会话 ${name}`, exact: true }).filter({ visible: true }).click();
  };
  await send('synthetic delayed headers');
  await page.waitForFunction(() => window.__sources.length === 1);
  const client = await page.evaluate(() => window.__post[0].client_msg_id);
  capture = { id: 'synthetic-large', execution_id: `send:${client}`, conversation_id: 'a', kind: 'send', created_at: Date.now() / 1000, payload_json: JSON.stringify({ messages: [{ role: 'user', content: 'synthetic'.repeat(100000) }] }), complete: true, limitations: [] };
  receipt = { conv_id: 'a', client_msg_id: client, user_message_id: 'timing-user', assistant_message_id: null };
  state.messages.a.push(row('timing-user', 'user', 'synthetic delayed headers'));
  // Return to Chat while headers are still pending; User is saved, Assistant waits.
  await page.evaluate(() => window.__chatUnmount()); await sleep(100); await page.evaluate(() => window.__chatMount());
  await page.locator('.chat-generation[data-active=true]').waitFor();
  await sleep(5200);
  let rows = await trace(); assert(rows.filter(e => e.stage === 'loading.tick').length >= 2);
  await page.evaluate(() => window.__headers()); await emit({ type: 'start', id: 'timing-assistant' });
  await composer.fill('independent next draft');
  await sleep(5200); // start received; first text intentionally late
  if (width === 1280) {
    // Controlled long task crossing a timer deadline: independent of stream arrival.
    await page.evaluate(async () => {
      const tick = window.__penumbraChatTimeline.read().filter(e => e.stage === 'loading.tick').at(-1);
      await new Promise(resolve => setTimeout(resolve, Math.max(0, tick.at + 2300 - performance.now())));
      const end = performance.now() + 650; while (performance.now() < end) { /* synthetic stall */ }
    });
    await sleep(100);
    const stalled = await trace();
    assert(stalled.some(e => e.stage === 'page.longtask' && e.duration >= 600));
    const ticks = stalled.filter(e => e.stage === 'loading.tick');
    assert(ticks.some((e, i) => i && e.at - ticks[i - 1].at >= 2800));
  }
  rows = await trace(); assert(rows.filter(e => e.stage === 'loading.tick').length >= 4);
  await emit({ type: 'chunk', content: 'SSE_ONE' });
  await page.getByText('SSE_ONE', { exact: true }).waitFor();
  assert(!state.requests.some(r => r.path.includes('/messages/window') && r.method === 'POST'));
  await sleep(1000); await emit({ type: 'chunk', content: '_TWO' }); await page.getByText('SSE_ONE_TWO', { exact: true }).waitFor();
  // WS persistence notification cannot replace a live partial with a saved row.
  state.messages.a.push(row('timing-assistant', 'assistant', 'HTTP_ONLY_FINAL'));
  receipt.assistant_message_id = 'timing-assistant';
  state.ws.send(JSON.stringify({ type: 'msg_created', data: { id: 'timing-assistant', conv_id: 'a' } }));
  await sleep(300);
  assert.equal(await page.getByText('HTTP_ONLY_FINAL', { exact: true }).count(), 0);
  // Navigation loads authoritative HTTP history while the SSE is still active.
  await select('B'); await select('A'); await page.getByText('HTTP_ONLY_FINAL', { exact: true }).waitFor();
  await emit({ type: 'chunk', content: '_THREE' }); await sleep(100);
  assert.equal(await page.getByText('SSE_ONE_TWO_THREE', { exact: true }).count(), 0);
  historyGate = true;
  await page.evaluate(() => window.__sources.at(-1).close());
  await page.waitForFunction(() => window.__penumbraChatTimeline.read().some(e => e.stage === 'history.begin'));
  while (!releaseHistory) await sleep(10);
  historyGate = false; releaseHistory();
  await page.waitForFunction(() => window.__penumbraChatTimeline.read().some(e => e.stage === 'history.end'));
  // A separate empty stream completes through exact receipt + HTTP history only.
  receipt = null;
  await page.evaluate(() => { window.__delayHeaders = false; });
  await send('synthetic history fallback');
  await page.waitForFunction(() => window.__post.length === 2);
  const fallbackClient = await page.evaluate(() => window.__post[1].client_msg_id);
  receipt = { conv_id: 'a', client_msg_id: fallbackClient, user_message_id: 'fallback-user', assistant_message_id: 'fallback-assistant' };
  state.messages.a.push(row('fallback-user', 'user', 'synthetic history fallback'), row('fallback-assistant', 'assistant', 'HTTP_WITHOUT_SSE'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(id => window.__penumbraChatTimeline.read().some(e => e.executionId === `execution:${id}` && e.stage === 'receipt.read' && e.phase === 'assistant'), fallbackClient);
  await page.evaluate(() => window.__sources.at(-1).close());
  await page.getByText('HTTP_WITHOUT_SSE', { exact: true }).waitFor();
  await page.waitForFunction(id => window.__penumbraChatTimeline.read().some(e => e.executionId === `execution:${id}` && e.stage === 'ui.commit' && e.source === 'history'), fallbackClient);
  rows = await trace();
  const fallbackId = `execution:${fallbackClient}`;
  assert(!rows.some(e => e.executionId === fallbackId && e.stage === 'controller.event' && e.event === 'chunk'));
  assert(rows.some(e => e.executionId === fallbackId && e.stage === 'ui.commit' && e.source === 'history'));
  const chunk = rows.find(e => e.stage === 'controller.event' && e.event === 'chunk');
  const commit = rows.find(e => e.stage === 'ui.commit' && e.source === 'sse' && e.size === 7);
  assert(commit && commit.at - chunk.at < 500, `slow first commit: ${commit?.at - chunk?.at}`);
  assert(rows.some(e => e.stage === 'ui.commit' && e.source === 'history'));
  assert(delivered, 'large synthetic snapshot was not drained');
  assert(!JSON.stringify(rows).includes('synthetic'.repeat(10)), 'timeline contains synthetic body');
  assert.deepEqual(errors, []);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'horizontal overflow');
  fs.writeFileSync(`${output}/ui-${width}.json`, JSON.stringify(rows, null, 2));
  console.log(`${width}px: delayed headers/start/first chunk, rotating Loading, immediate partial, WS deferral, navigation HTTP replacement; first chunk -> commit ${(commit.at - chunk.at).toFixed(1)}ms`);
  await context.close();
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try {
    if (process.env.CHAT_TIMING_BACKEND) {
      const result = await transport(browser);
      fs.writeFileSync(`${output}/transport.json`, JSON.stringify(result, null, 2));
      const facts = await (await fetch('http://127.0.0.1:45366/api/synthetic/timeline')).json();
      fs.writeFileSync(`${output}/backend.json`, JSON.stringify(facts, null, 2));
      console.log(JSON.stringify(result.map(r => ({ name: r.name, kind: r.kind, headersMs: r.headers - r.at, readsMs: r.reads.map(e => e.wall - r.at) }))));
    }
    if (process.env.CHAT_TIMING_INTEGRATED) await integrated(browser);
    if (!process.env.CHAT_TIMING_TRANSPORT_ONLY && !process.env.CHAT_TIMING_INTEGRATED) for (const width of (process.env.CHAT_TIMING_DESKTOP_ONLY ? [1280] : [1280, 390])) await ui(browser, width);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
