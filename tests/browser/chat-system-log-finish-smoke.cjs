/* One synthetic log page: scoped final visual/keyboard boundaries, no screenshots. */
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const origin = process.env.CHAT_LOG_FINISH_ORIGIN || 'http://127.0.0.1:45383';
(async () => {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  const results=[];
  try {
    for(const width of [320,390,1280]) {
      const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
      const page=await context.newPage(); page.setDefaultTimeout(5000);
      const errors=[],api=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/')) api.push(request.url());});
      await page.addInitScript(()=>{window.__copies=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.__copies.push(text)}});});
      await page.goto(`${origin}/tests/browser/chat-system-log-details.html`);
      const dialog=page.locator('[data-system-log-dialog]'); await dialog.waitFor();
      const entry=dialog.locator('[data-log-id="send:synthetic-ui"]');
      await entry.getByRole('button',{name:'详情',exact:true}).click();
      const notes=entry.getByRole('region',{name:'生活速记',exact:true});
      const mixed=notes.locator('[data-quick-note="0"]');
      const date=await mixed.locator('.system-log-note-context').boundingBox(),hidden=await mixed.getByText('已隐藏',{exact:true}).boundingBox();
      assert(Math.abs(date.y-hidden.y)<3,'hidden note status should share the date line');
      await notes.getByRole('button',{name:'复制 速记 2 正文',exact:true}).click();
      assert.equal(await page.evaluate(()=>window.__copies.at(-1)),'synthetic safe note');
      await page.evaluate(()=>window.__detailHiddenNotes());
      assert.equal((await notes.textContent()).match(/已隐藏/g).length,1);
      assert.equal(await notes.locator('[data-quick-note]').count(),2);
      for(const row of await notes.locator('[data-quick-note]').all()) assert((await row.boundingBox()).height<24,'hidden note expanded into extra lines');
      assert(!(await dialog.textContent()).includes('NEVER_SHOW'));
      const candidate=entry.getByRole('button',{name:'RAG 候选评分 · 1 条',exact:true});
      await candidate.focus(); await page.keyboard.press('Enter');
      assert.equal(await candidate.getAttribute('aria-expanded'),'true');
      assert.equal(await candidate.locator('svg').evaluate(el=>el.classList.contains('rotate-90')),true);
      assert.equal(await entry.locator('[data-diagnostic-field="importance"] dd').last().textContent(),'0.4');
      await page.keyboard.press('Space');
      assert.equal(await candidate.getAttribute('aria-expanded'),'false');
      assert.equal(await candidate.evaluate(el=>el===document.activeElement),true);
      const lefts=await entry.evaluate(el=>[
        el.querySelector('[aria-label="RAG 实际召回"] h4').getBoundingClientRect().left,
        ...[...el.querySelectorAll('[aria-label="RAG 候选评分"] > .system-log-disclosure > button .system-log-toggle-label, [aria-label="Provider 返回 metadata"] > .system-log-disclosure > button .system-log-toggle-label')].map(node=>node.getBoundingClientRect().left),
      ]);
      assert(Math.max(...lefts)-Math.min(...lefts)<1,'diagnostic peer titles do not align');
      await entry.getByRole('button',{name:'模型请求',exact:true}).click();
      const request=entry.locator('[data-request-id="ui-request"]'); await request.waitFor();
      assert.equal(await request.getByText(/^https:\/\/synthetic\.invalid\/?$/).count(),0);
      const auxiliary=request.getByRole('button',{name:'请求辅助信息',exact:true});
      await auxiliary.focus(); await page.keyboard.press('Enter');
      await request.getByText(/^https:\/\/synthetic\.invalid\/?$/).waitFor();
      await request.getByText('http_json_before_send',{exact:true}).waitFor();
      assert(await request.locator('[data-private-request-body]').evaluate(el=>!!(el.compareDocumentPosition(el.parentElement.querySelector('.system-log-request-meta'))&Node.DOCUMENT_POSITION_FOLLOWING)));
      await page.keyboard.press('Space');
      assert.equal(await auxiliary.getAttribute('aria-expanded'),'false');
      const other=request.getByRole('button',{name:'其他请求字段',exact:true});
      await other.click({position:{x:30,y:12}});
      assert.equal(await other.getAttribute('aria-expanded'),'true');
      const long=request.getByRole('button',{name:/^synthetic-long-parameter-/});
      await long.waitFor(); assert((await long.boundingBox()).height>35 || width===1280,'long title did not wrap');
      const peers=await request.evaluate(el=>[
        ...[...el.querySelectorAll('[data-wire-section="parameters"] h4, [data-wire-section="messages"] h4')].map(node=>node.getBoundingClientRect().left),
        ...[...el.querySelectorAll('[data-wire-section="parameters"] > .system-log-disclosure > button .system-log-toggle-label, [data-wire-section="system"] > .system-log-disclosure > button .system-log-toggle-label, [data-wire-section="tools"] > .system-log-disclosure > button .system-log-toggle-label, .system-log-request-meta > button .system-log-toggle-label')].map(node=>node.getBoundingClientRect().left),
      ]);
      assert(Math.max(...peers)-Math.min(...peers)<1,'request peer titles do not align');
      const geometry=await dialog.locator('.system-log-toggle:visible').evaluateAll(rows=>rows.map(row=>{
        const box=row.getBoundingClientRect(),label=row.querySelector('.system-log-toggle-label').getBoundingClientRect(),arrow=row.querySelector('svg').getBoundingClientRect();
        return {start:label.left-box.left,end:box.right-arrow.right,width:box.width,parent:row.parentElement.getBoundingClientRect().width,overlap:label.right>arrow.left};
      }));
      for(const row of geometry) {assert(Math.abs(row.start)<1);assert(Math.abs(row.end)<1);assert(Math.abs(row.width-row.parent)<1);assert.equal(row.overlap,false);}
      await request.getByRole('button',{name:'展开较早的 23 条消息',exact:true}).focus(); await page.keyboard.press('Enter');
      await request.getByText('SYNTHETIC_HISTORY_1',{exact:true}).waitFor();
      await request.getByRole('button',{name:'System · 2 块 · system',exact:true}).click();
      const reading=request.locator('[data-wire-block="system[0]"] .system-log-prose').first();
      await reading.scrollIntoViewIfNeeded(); const before=await reading.boundingBox();
      await page.evaluate(()=>window.__detailAppend()); await dialog.locator('.system-log-entry').nth(1).waitFor();
      assert(Math.abs(before.y-(await reading.boundingBox()).y)<5,'new log shifted reading position');
      await request.getByRole('button',{name:'复制安全请求投影',exact:true}).click();
      assert.equal(await page.evaluate(()=>window.__copies.at(-1)),await page.evaluate(()=>window.__detailPayload));
      for(const height of [844,320]) {
        await page.setViewportSize({width,height});
        const box=await dialog.boundingBox();assert(box.y>=0 && box.y+box.height<=height+1);
        assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
        assert.deepEqual(await dialog.locator('*').evaluateAll(els=>els.filter(el=>el.clientWidth>0 && el.scrollWidth>el.clientWidth+2 && !el.classList.contains('sr-only')).map(el=>el.className)),[]);
        const footer=await dialog.locator('[data-slot="dialog-footer"]').boundingBox();assert(footer.y+footer.height<=box.y+box.height+1);
      }
      assert.deepEqual(errors,[]);assert.deepEqual(api,[]);results.push({width,shortHeight:320,keyboard:true,aligned:true,pageerrors:0});
      await context.close();
    }
    console.log(JSON.stringify(results));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
