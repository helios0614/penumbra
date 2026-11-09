/* Production build with isolated browser contexts and synthetic HTTP responses.
 * node tests/browser/settings-pr5-c-smoke.cjs [playwright module] [Chromium executable]
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.argv[2] || 'playwright');
const output = process.env.SETTINGS_PR5_C_OUTPUT || path.resolve(__dirname, '../../artifacts/settings-pr5-c');
const root = path.resolve(__dirname, '../../dist');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/penumbra/')) { res.writeHead(404); return res.end(); }
  const relative = url.pathname.slice('/penumbra/'.length);
  const file = path.resolve(root, relative.startsWith('assets/') ? relative : 'index.html');
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': ({
    '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2',
  })[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
const empty = { configured: false, masked: "", secret_ref: null };
const opaqueId = "shared-opaque-832";
const decoyId = "connection-legacy-siliconflow";
const historical = [
  "https://legacy-user:legacy-password@fixture.invalid/v1",
  "https://fixture.invalid/legacy-path-token/v1",
  "https://fixture.invalid/v1?key=legacy-query-token",
];
const address = "https://relay.fixture.invalid/voice/v1";
const keyFields = ["minimax_tts_key", "elevenlabs_tts_key", "minimax_asr_key"];

async function verify(browser, origin, layout, width) {
  const height = 850;
  const context = await browser.newContext({ viewport: { width, height },
    ...(width < 768 ? { isMobile: true, hasTouch: true } : {}) });
  await context.addInitScript(() => {
    window.copiedFixtureValues = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async value => { window.copiedFixtureValues.push(value); },
    } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [], external = [], calls = [], writes = [];
  const fields = {
    tts_provider: "", minimax_tts_url: historical[0], minimax_tts_model: "fixture/minimax",
    siliconflow_tts_model: "", elevenlabs_tts_url: historical[1], elevenlabs_tts_model: "fixture/elevenlabs",
    elevenlabs_tts_output_format: "", minimax_asr_url: historical[2], minimax_asr_model: "fixture/asr",
    embedding_model: "preserve-embedding",
  };
  const keys = { minimax_tts_key: "fake-initial-minimax-key", elevenlabs_tts_key: "fake-initial-elevenlabs-key", minimax_asr_key: "" };
  const versions = { minimax_tts_key: 1, elevenlabs_tts_key: 1, minimax_asr_key: 1 };
  let alias = opaqueId, mode = "", releaseSave, releaseReveal;
  const credential = name => keys[name]
    ? { configured: true, masked: "••••••••" + keys[name].slice(-4), secret_ref: name + "-fixture-ref-" + versions[name] }
    : empty;
  const connection = (id, name) => ({
    id, name, base_url: "https://shared.fixture.invalid/v1", enabled: false, transport: "direct", credential: empty,
  });
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (/legacy-password|legacy-path-token|legacy-query-token|fake-replacement|Password field is not contained/.test(message.text())) errors.push("unsafe console output");
  });
  await context.route("**/*", route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push("external request");
    return route.abort();
  });
  await page.routeWebSocket(/.*/, ws => ws.close());
  await page.route("**/api/**", async route => {
    const req = route.request();
    const method = req.method(), endpoint = new URL(req.url()).pathname;
    const body = req.postData() ? req.postDataJSON() : undefined;
    const json = (data, status = 200) => route.fulfill({ status, headers: { "Cache-Control": "no-store" }, json: data }).catch(() => {});
    calls.push(method + " " + endpoint);
    assert(!/^\/api\/(tts|voice)(\/|$)/.test(endpoint), "settings must not invoke synthesis, voices, or transcriptions");
    if (endpoint === "/api/settings" && method === "GET") {
      return json({ ...fields, credentials: Object.fromEntries(keyFields.map(name => [name, credential(name)])) });
    }
    if (endpoint === "/api/settings" && method === "PUT") {
      writes.push(body);
      const names = Object.keys(body);
      assert(names.length > 0);
      assert(names.every(name => !["embedding_model", "elevenlabs_tts_output_format", "siliconflow_key", "siliconflow_url", "secret_ref"].includes(name)));
      if (mode === "fail") { mode = ""; return json({ detail: { code: "persistence_failed", value: historical[0] } }, 503); }
      if (mode === "lost") { mode = ""; return route.abort("failed"); }
      if (mode === "pending") { mode = ""; await new Promise(resolve => { releaseSave = resolve; }); }
      for (const [name, value] of Object.entries(body)) {
        if (keyFields.includes(name)) {
          assert(value.startsWith("fake-replacement"));
          keys[name] = value;
          versions[name]++;
        } else {
          assert(Object.hasOwn(fields, name));
          fields[name] = value;
        }
      }
      return json({ ok: true });
    }
    if (endpoint === "/api/settings/secrets/reveal" || endpoint === "/api/settings/secrets/clear") {
      assert.equal(method, "POST");
      assert.deepEqual(Object.keys(body), ["secret_ref"]);
      const name = keyFields.find(field => credential(field).secret_ref === body.secret_ref);
      assert(name, "must use the latest ref for the exact credential");
      const clearing = endpoint.endsWith("/clear");
      if (clearing) writes.push({ clear: name });
      if (mode === "stale") {
        mode = "";
        versions[name]++;
        return json({ detail: "Secret reference is invalid or stale" }, 422);
      }
      if (clearing) { keys[name] = ""; versions[name]++; return json({ ok: true }); }
      const secret = keys[name];
      if (mode === "late") { mode = ""; await new Promise(resolve => { releaseReveal = resolve; }); }
      return json({ secret });
    }
    assert.equal(method, "GET", "unexpected write to " + endpoint);
    if (endpoint === "/api/registry/connections") return json({
      schema_version: 2, authority_state: "persisted_v2", migration_required: false, diagnostics: [], deferred_usages: [],
      profile_aliases: { "legacy:siliconflow": { connection_id: alias } },
      connections: [connection(decoyId, "SiliconFlow"), connection(opaqueId, "合成共享代理")],
    });
    if (endpoint === "/api/session") return json({ authenticated: true });
    if (endpoint === "/api/conversations") return json([]);
    return json({});
  });

  const nav = page.getByRole("navigation", { name: "设置分类" });
  const panel = page.getByRole("region", { name: "语音服务设置" });
  const provider = panel.getByRole("combobox", { name: "语音合成 Provider" });
  const group = label => panel.getByRole("group", { name: label + " 配置", exact: true });
  const model = label => group(label).getByRole("textbox", { name: label + " 模型名称" });
  const url = label => group(label).getByRole("textbox", { name: label + " API 地址" });
  const click = (name, area = page) => area.getByRole("button", { name, exact: typeof name === "string" }).click();
  const ready = () => provider.and(page.locator(":enabled")).waitFor();
  const enter = async () => { await click(/^语音服务/, nav); await ready(); };
  const assertWrite = (index, body) => assert.deepEqual(writes.slice(index), [body]);
  const noSecrets = async () => {
    const html = await panel.evaluate(node => node.outerHTML);
    for (const value of historical) assert(!html.includes(value));
    for (const value of ["legacy-password", "legacy-path-token", "legacy-query-token"]) assert(!html.includes(value));
  };
  const layoutBounds = async () => {
    const { width, scroll, height, bounds } = await page.evaluate(() => ({
      width: innerWidth, scroll: document.documentElement.scrollWidth, height: innerHeight,
      bounds: [...document.querySelectorAll("[data-slot='dialog-content'],[data-slot='alert-dialog-content']")].map(node => node.getBoundingClientRect().toJSON()),
    }));
    assert(scroll <= width + 1, "horizontal overflow");
    for (const rect of bounds) assert(rect.left >= -1 && rect.right <= width + 1 && rect.top >= -1 && rect.bottom <= height + 1);
  };
  const screenshot = name => page.screenshot({ path: path.join(output, layout + "-" + width + "-" + name + ".png"), animations: "disabled" });
  const choose = async (label, value, fails = false) => {
    const index = writes.length;
    await provider.click();
    await page.getByRole("option", { name: label, exact: true }).click();
    if (fails) await panel.getByRole("alert").filter({ hasText: "保存失败" }).waitFor();
    await ready();
    assertWrite(index, { tts_provider: value });
    if (!fails) assert((await provider.textContent()).includes(label));
  };

  async function saveAddress(label, button, body) {
    const before = writes.length;
    await click(button, group(label));
    const confirm = page.getByRole("alertdialog", { name: "确认修改 API 地址" });
    await confirm.waitFor();
    await confirm.getByText(/现有凭据将用于新的目标地址/).waitFor();
    assert.equal(writes.length, before);
    await click("取消", confirm);
    await click(button, group(label));
    await click("确认保存", confirm);
    await ready();
    assertWrite(before, body);
    assert.equal(await url(label).inputValue(), "");
  }

  async function lifecycle(label, keyField, stale = false) {
    const area = group(label);
    const dialog = page.getByRole("dialog", { name: "编辑 " + label + " Key" });
    const clear = page.getByRole("alertdialog", { name: "清除 " + label + " Key" });
    const secret = area.locator("[aria-label='临时 " + label + " Key 明文']");
    await click("编辑凭据", area);
    const field = dialog.getByLabel("新 " + label + " Key");
    assert.equal(await field.getAttribute("type"), "password");
    assert.equal(await field.inputValue(), "");
    const save = dialog.getByRole("button", { name: "保存 Key" });
    await save.and(page.locator(":disabled")).waitFor();
    if (keys[keyField]) await field.fill(credential(keyField).masked);
    else await field.fill(" ");
    await save.and(page.locator(":disabled")).waitFor();
    const replacement = "fake-replacement-" + keyField;
    await field.fill(replacement);
    if (stale && width < 768) {
      await page.setViewportSize({ width, height: 460 });
      await field.focus();
      assert(await field.evaluate(node => node === document.activeElement));
      await layoutBounds();
      await screenshot("short-editor");
      await page.setViewportSize({ width, height });
    }
    const before = writes.length;
    await save.click();
    await dialog.waitFor({ state: "hidden" });
    await ready();
    assertWrite(before, { [keyField]: replacement });
    await click("查看凭据", area);
    await secret.waitFor();
    assert.equal(await secret.textContent(), replacement);
    await click("复制凭据", area);
    await page.waitForFunction(value => window.copiedFixtureValues.includes(value), replacement);
    await click("隐藏凭据", area);
    assert.equal(await secret.count(), 0);
    await click("清除凭据", area);
    const beforeClear = writes.length;
    await clear.waitFor();
    assert.equal(writes.length, beforeClear);
    if (stale) {
      mode = "stale";
      await click("确认清除", clear);
      await clear.getByRole("alert").filter({ hasText: "凭据引用已失效" }).waitFor();
      assertWrite(beforeClear, { clear: keyField });
      assert.equal(keys[keyField], replacement);
      assert(await clear.getByRole("button", { name: "确认清除" }).isDisabled());
      await click("取消", clear);
      await click("清除凭据", area);
    }
    await click("确认清除", clear);
    await clear.waitFor({ state: "hidden" });
    await ready();
    await area.getByText("未配置", { exact: true }).waitFor();
    assert.equal(keys[keyField], "");
  }

  try {
    await page.goto(origin + "/penumbra/" + (layout === "editorial" ? "editorial" : ""));
    await page.getByRole("button", { name: "打开设置", exact: true }).last().click();
    await enter();
    assert((await provider.textContent()).includes("MiniMax"));
    assert.equal(await model("MiniMax TTS").inputValue(), "fixture/minimax");
    assert.equal(await url("MiniMax TTS").inputValue(), "");
    assert.equal(await url("MiniMax ASR").inputValue(), "");
    await noSecrets();
    assert(!calls.some(call => /reveal|registry/.test(call)));
    assert.equal(await panel.getByRole("switch").count(), 0);
    await layoutBounds();
    await screenshot("minimax-asr");
    await model("MiniMax TTS").fill("retained/minimax");
    mode = "fail";
    await choose("ElevenLabs", "elevenlabs", true);
    assert((await provider.textContent()).includes("MiniMax"));
    await choose("ElevenLabs", "elevenlabs");
    assert.equal(await model("ElevenLabs TTS").inputValue(), "fixture/elevenlabs");
    assert.equal(await url("ElevenLabs TTS").inputValue(), "");
    await panel.getByText("mp3_44100_128", { exact: true }).waitFor();
    assert.equal(await panel.getByRole("textbox", { name: /输出格式/ }).count(), 0);
    await noSecrets();
    await model("ElevenLabs TTS").fill("retained/elevenlabs");
    await choose("SiliconFlow", "siliconflow");
    const sf = group("SiliconFlow TTS");
    assert.equal(await model("SiliconFlow TTS").getAttribute("placeholder"), "FunAudioLLM/CosyVoice2-0.5B");
    assert.equal(await sf.getByRole("textbox").count(), 1);
    await sf.getByRole("heading", { name: "与 Embedding 共用连接" }).waitFor();
    await screenshot("siliconflow");
    await model("SiliconFlow TTS").fill("fixture/cosy");
    let index = writes.length;
    await click("保存合成配置", sf);
    await ready();
    assertWrite(index, { siliconflow_tts_model: "fixture/cosy" });
    assert.equal(fields.embedding_model, "preserve-embedding");
    await choose("MiniMax", "minimax");
    assert.equal(await model("MiniMax TTS").inputValue(), "retained/minimax");

    await url("MiniMax TTS").fill("https://fixture.invalid/v1?key=unsafe");
    assert(await group("MiniMax TTS").getByRole("button", { name: "保存合成配置" }).isDisabled());
    await url("MiniMax TTS").fill(address);
    await saveAddress("MiniMax TTS", "保存合成配置", { minimax_tts_url: address, minimax_tts_model: "retained/minimax" });
    assert.equal(keys.minimax_tts_key, "fake-initial-minimax-key");
    await lifecycle("MiniMax TTS", "minimax_tts_key", true);

    await choose("ElevenLabs", "elevenlabs");
    assert.equal(await model("ElevenLabs TTS").inputValue(), "retained/elevenlabs");
    await url("ElevenLabs TTS").fill(address);
    await saveAddress("ElevenLabs TTS", "保存合成配置", { elevenlabs_tts_url: address, elevenlabs_tts_model: "retained/elevenlabs" });
    assert.equal(fields.elevenlabs_tts_output_format, "");
    await lifecycle("ElevenLabs TTS", "elevenlabs_tts_key");

    await group("MiniMax ASR").getByText("未配置", { exact: true }).waitFor();
    await model("MiniMax ASR").fill("fixture/asr-new");
    await url("MiniMax ASR").fill(address);
    await saveAddress("MiniMax ASR", "保存识别配置", { minimax_asr_url: address, minimax_asr_model: "fixture/asr-new" });
    await lifecycle("MiniMax ASR", "minimax_asr_key");

    await model("MiniMax ASR").fill("draft/unknown");
    mode = "lost";
    index = writes.length;
    await click("保存识别配置", group("MiniMax ASR"));
    await panel.getByRole("alert").filter({ hasText: "保存结果未确认" }).waitFor();
    assertWrite(index, { minimax_asr_model: "draft/unknown" });
    assert.equal(await model("MiniMax ASR").inputValue(), "draft/unknown");
    mode = "pending";
    index = writes.length;
    const asrSave = group("MiniMax ASR").getByRole("button", { name: "保存识别配置" });
    await asrSave.evaluate(node => { node.click(); node.click(); });
    await provider.and(page.locator(":disabled")).waitFor();
    assert(await group("ElevenLabs TTS").getByRole("button", { name: "编辑凭据" }).isDisabled());
    for (let attempt = 0; !releaseSave && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    assert(releaseSave);
    assertWrite(index, { minimax_asr_model: "draft/unknown" });
    releaseSave();
    await ready();

    await choose("SiliconFlow", "siliconflow");
    await page.reload();
    await ready();
    assert((await provider.textContent()).includes("SiliconFlow"));
    await click("管理共享连接", sf);
    const shared = page.locator("[data-connection-id='" + opaqueId + "']");
    const decoy = page.locator("[data-connection-id='" + decoyId + "']");
    await shared.getByText("API 地址", { exact: true }).waitFor();
    assert.equal(await decoy.getByText("API 地址", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("dialog").count(), 0);
    await click("返回上级设置");
    await ready();
    alias = "missing-row";
    await click("管理共享连接", sf);
    await page.getByText("尚未确认共享连接", { exact: true }).waitFor();
    assert.equal(await decoy.getByText("API 地址", { exact: true }).count(), 0);
    await click("返回上级设置");
    await ready();

    await choose("MiniMax", "minimax");
    keys.minimax_tts_key = "fake-initial-new-minimax";
    versions.minimax_tts_key++;
    await click("返回设置分类");
    await enter();
    mode = "late";
    await click("查看凭据", group("MiniMax TTS"));
    await group("MiniMax TTS").getByText("正在查看凭据…", { exact: true }).waitFor();
    await click("返回设置分类");
    releaseReveal?.();
    await enter();
    assert.equal(await panel.locator("[aria-label='临时 MiniMax TTS Key 明文']").count(), 0);
    await layoutBounds();
    const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, history: history.state }));
    assert(!/fixture-ref|fake-replacement|legacy-password|legacy-path-token|legacy-query-token/.test(storage));
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    return { layout, width, writes: writes.length, external: 0, errors: 0 };
  } finally {
    releaseSave?.();
    releaseReveal?.();
    await context.close();
  }
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try {
    const origin = "http://127.0.0.1:" + server.address().port;
    const results = [];
    for (const layout of process.env.SETTINGS_PR5_C_QUICK ? ["classic"] : ["classic", "editorial"]) {
      for (const width of process.env.SETTINGS_PR5_C_QUICK ? [320] : [320, 390, 1440]) results.push(await verify(browser, origin, layout, width));
    }
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise(done => server.close(done));
  }
})().catch(error => { console.error(error); server.closeAllConnections(); server.close(); process.exitCode = 1; });
