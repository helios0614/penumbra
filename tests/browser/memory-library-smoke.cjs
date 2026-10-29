/* Production MemoryView + synthetic HTTP only. Never contacts AionHome.
 * Start Vite on 45414 with empty VITE_API_BASE_URL/VITE_API_BASE/PENUMBRA_DEV_PROXY_TARGET.
 * node tests/browser/memory-library-smoke.cjs <playwright module> [chromium executable]
 */
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const origin = process.env.MEMORY_SMOKE_ORIGIN || 'http://127.0.0.1:45414';
const output = '/private/tmp/penumbra-memory-library-smoke';
const delay = ms => new Promise(r=>setTimeout(r,ms));
async function run(browser,width) {
  const context=await browser.newContext({viewport:{width,height:844},isMobile:width<768,hasTouch:width<768});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const diagnostics=[];page.on('console',message=>{if(message.type()==='error')diagnostics.push(message.text());});
  page.on('requestfailed',request=>diagnostics.push(`${request.url()}: ${request.failure()?.errorText}`));
  const state={rows:Array.from({length:31},(_,i)=>({id:`m${i+1}`,content:i===30 ? '长篇记忆\n'+('合成材料中的一行正文。\n'.repeat(14)) : `合成记忆 ${i+1}`,type:'digest',created_at:Date.now()/1000+i,source_conv:i===30?'synthetic-conversation':null,keywords:JSON.stringify(Array.from({length:i===30?40:2},(_,n)=>`tag-${n}`)),importance:i===30?0.456:0.5,unresolved:0,source_start_ts:1,source_end_ts:10})),requests:[],tasks:{},mode:'success',failEdit:false,failResummary:false,failCombo:false,holdTask:null,holdDigest:null};
  const aiSummaryType=`${width===320?'新名字':width===390?'旧名字':'AI'}总结`;
  Object.assign(state.rows.find(r=>r.id==='m28'),{type:aiSummaryType,source_conv:'synthetic-conversation',source_start_ts:null,source_end_ts:null});
  // Refuse every external request, including fonts; the API handler below serves synthetic data.
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin ? route.continue() : route.abort('blockedbyclient'));
  await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),method=req.method(),path=url.pathname;
    const body=req.postData() ? req.postDataJSON() : undefined;state.requests.push({path,method,body,query:Object.fromEntries(url.searchParams)});
    const json=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)}).catch(()=>{});
    if(path==='/api/memories' && method==='GET') {
      const p=Number(url.searchParams.get('page')),size=Number(url.searchParams.get('page_size'));assert.equal(size,30);
      let rows=state.rows.filter(r=>!url.searchParams.get('q') || r.content.includes(url.searchParams.get('q')));
      rows=[...rows].sort((a,b)=>(url.searchParams.get('pin_first')==='true' ? b.unresolved-a.unresolved : 0)||b.created_at-a.created_at||b.id.localeCompare(a.id));
      const items=rows.slice((p-1)*size,p*size);
      return json({items,page:p,page_size:size,total:rows.length,total_all:state.rows.length,has_more:p*size<rows.length});
    }
    if(path==='/api/memories/digest') {
      if(state.holdDigest) await state.holdDigest;
      if(state.mode==='network')return route.abort('failed');
      if(state.mode==='empty')return json({ok:true,message:'当前没有新增内容需要总结',new_memories_count:0,processed_messages:0});
      if(state.mode==='failure')return json({ok:false,message:'总结中断：辅助模型未完成，任务已保留',new_memories_count:0,processed_messages:0,outcome:'llm_failure'});
      let count=1;
      state.rows.push({ ...state.rows[0],id:'incremental',content:'增量总结的服务端结果',created_at:Date.now()/1000+1000 });
      for(const task of Object.values(state.tasks))if(task.state==='pending'){
        task.state='completed';task.result_memory_id='regenerated';task.last_error=null;count++;
        state.rows.push({...state.rows[0],id:'regenerated',content:'历史来源重新总结的服务端结果',created_at:Date.now()/1000+1001});
      }
      return json({ok:true,message:'记忆总结完成',new_memories_count:count,processed_messages:10,history_completed_tasks:count-1,history_pending_tasks:0,history_reused_memories:0});
    }
    const taskRead=path.match(/^\/api\/memories\/requeue\/tasks\/(.+)$/);
    if(taskRead){if(state.holdTask)await state.holdTask;return json(state.tasks[taskRead[1]]);}
    const original=path.match(/^\/api\/memories\/(.+)\/source$/);
    if(original){
      if(state.sourceMode==='failure')return json({detail:'private synthetic failure'},503);
      if(state.sourceMode==='missing')return json({ok:false,message:'该记忆没有可追溯的原文'});
      return json({ok:true,messages:state.sourceMode==='empty'?[]:[
        {role:'user',name:'合成用户',content:'原始聊天材料\n保持换行，不推断消息锚点。',created_at:1},
        {role:'system',name:'系统事件',content:'合成事件记录：<script>不可执行</script>',created_at:2},
        {role:'assistant',name:'合成助手',content:'原始回复\n'+('长原文阅读内容。'.repeat(80)),created_at:3},
      ]});
    }
    const source=path.match(/^\/api\/memories\/(.+)\/requeue-source$/);
    if(source)return json(source[1]==='m30'?{supported:false,reason:'source_untracked'}:state.sourceReasons?.[source[1]]?{supported:false,reason:state.sourceReasons[source[1]]}:{supported:true,source_count:10});
    const combo=path.match(/^\/api\/memories\/(.+)\/delete-and-requeue$/);
    if(combo){
      if(state.failCombo){state.failCombo=false;return json({detail:{code:'source_changed'}},409);}
      state.rows=state.rows.filter(r=>r.id!==combo[1]);
      const task={ok:true,task_id:`task-${Object.keys(state.tasks).length+1}`,state:'pending',deleted_memory_id:combo[1],result_memory_id:null,source_count:10,last_error:null,deduplicated:false};state.tasks[task.task_id]=task;return json(task);
    }
    const summary=path.match(/^\/api\/memories\/(.+)\/re_summarize$/);
    if(summary){
      if(state.failResummary){state.failResummary=false;return json({ok:false,message:'生成的摘要过短，请重试'});}
      const row=state.rows.find(r=>r.id===summary[1]);Object.assign(row,{content:'同一 ID 的服务端重新总结',keywords:'["新关键词"]',importance:0.9,unresolved:1});
      return json({ok:true,id:row.id,content:row.content,keywords:row.keywords,importance:row.importance,unresolved:row.unresolved});
    }
    const pin=path.match(/^\/api\/memories\/(.+)\/unresolved$/);
    if(pin){const row=state.rows.find(r=>r.id===pin[1]);row.unresolved=body.unresolved?1:0;return json({ok:true,id:row.id,unresolved:row.unresolved});}
    const single=path.match(/^\/api\/memories\/([^/]+)$/);
    if(single && method==='PUT') {
      if(state.failEdit){state.failEdit=false;return json({detail:'synthetic persistence failure'},503);}
      const row=state.rows.find(r=>r.id===single[1]);Object.assign(row,body);row.content='服务端保存：'+body.content;return json({ok:true,id:row.id});
    }
    if(single && method==='DELETE'){state.rows=state.rows.filter(r=>r.id!==single[1]);return json({ok:true});}
    throw new Error(`Unexpected synthetic request ${method} ${path}`);
  });
  const row=id=>page.locator(`[data-memory-id="${id}"]`);
  const activeMenu=()=>page.locator('[role="menu"][data-open]');
  const menu=async id=>{await row(id).getByRole('button',{name:'记忆操作',exact:true}).click();await activeMenu().waitFor();};
  const choose=async(id,label)=>{await menu(id);await activeMenu().getByRole('menuitem',{name:label,exact:true}).click();};
  const confirm=()=>page.getByRole('alertdialog');
  const waitText=async(selector,text)=>{await page.waitForFunction(({selector,text})=>document.querySelector(selector)?.textContent.includes(text),{selector,text});};
  const geometry=async selector=>assert(await page.locator(selector).evaluate(el=>{
    const r=el.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1&&el.scrollWidth<=el.clientWidth+1;
  }),`overflow at ${width}: ${selector}`);
  try {
    await page.goto(`${origin}/tests/browser/memory-library.html`);await row('m31').waitFor();
    assert((await page.getByLabel('记忆分页').innerText()).includes('第 1 / 2 页'));
    const listReads=state.requests.filter(r=>r.path==='/api/memories');assert(listReads.every(r=>r.query.page_size==='30'&&!r.query.created_from&&!r.query.pin_first));
    await geometry('main');assert(await row('m31').getByRole('button',{name:'记忆操作',exact:true}).isVisible());
    assert.equal(await row('m28').getByRole('button',{name:'查看原文',exact:true}).count(),0);
    await menu('m28');assert.equal(await activeMenu().getByRole('menuitem').count(),2);
    assert.equal(await activeMenu().getByRole('menuitem',{name:/重新总结/}).count(),0);
    assert(await activeMenu().getByRole('menuitem',{name:'编辑',exact:true}).isEnabled());assert(await activeMenu().getByRole('menuitem',{name:'删除',exact:true}).isEnabled());
    await page.keyboard.press('Escape');await row('m28').getByRole('button',{name:'标记为待继续',exact:true}).click();
    await row('m28').getByRole('button',{name:'取消待继续标记',exact:true}).waitFor();await row('m28').getByRole('button',{name:'取消待继续标记',exact:true}).click();
    await row('m28').getByRole('button',{name:'标记为待继续',exact:true}).waitFor();
    assert(!state.requests.some(r=>/\/m28\/(source|requeue-source|re_summarize|delete-and-requeue)$/.test(r.path)));
    const sourceDialog=()=>page.getByRole('dialog',{name:'原文对话',exact:true});
    const openSource=async id=>{await row(id).getByRole('button',{name:'查看原文',exact:true}).click();await sourceDialog().waitFor();};
    const closeSource=async()=>{await page.keyboard.press('Escape');await sourceDialog().waitFor({state:'hidden'});};
    await openSource('m31');await sourceDialog().getByText('原始聊天材料',{exact:false}).waitFor();
    assert.equal(await sourceDialog().locator('.context-message').count(),3);assert.equal(await sourceDialog().locator('[data-context-event]').count(),1);
    assert.equal(await sourceDialog().getByRole('button',{name:/重新生成|编辑|删除|重新总结/}).count(),0);
    assert.equal(await sourceDialog().locator('[aria-current],[data-context-message],script,a[href],img').count(),0);
    await geometry('[role="dialog"]');await geometry('[data-memory-id="m31"] [data-memory-item-actions="true"]');
    await page.screenshot({path:`${output}/source-${width}.png`});await closeSource();
    state.sourceMode='empty';await openSource('m30');await sourceDialog().getByText('此来源范围内没有可显示的原文消息。',{exact:true}).waitFor();await closeSource();
    state.sourceMode='missing';await openSource('m30');await sourceDialog().getByText('原文已不可用',{exact:false}).waitFor();await closeSource();
    state.sourceMode='failure';await openSource('m31');await sourceDialog().getByRole('alert').waitFor();assert(!(await sourceDialog().innerText()).includes('private'));
    state.sourceMode='messages';await sourceDialog().getByRole('button',{name:'重新读取',exact:true}).click();await sourceDialog().getByText('原始聊天材料',{exact:false}).waitFor();
    await page.goBack();await sourceDialog().waitFor({state:'hidden'});assert(await row('m31').isVisible());
    await row('m31').getByRole('button',{name:'展开',exact:true}).click();assert.equal(await row('m31').getByRole('button',{name:'收起',exact:true}).count(),1);
    await menu('m31');await geometry('[role="menu"][data-open]');await delay(200);await page.screenshot({path:`${output}/menu-${width}.png`});await page.keyboard.press('Escape');
    await choose('m31','编辑');const edit=page.getByRole('dialog',{name:'编辑记忆',exact:true});await edit.waitFor();
    assert((await edit.getByRole('textbox',{name:'关键词',exact:true}).inputValue()).includes('tag-39'));
    assert.equal(await edit.getByRole('spinbutton',{name:'重要度',exact:true}).inputValue(),'0.456');
    await edit.getByRole('textbox',{name:'正文',exact:true}).fill('取消的草稿');await edit.getByRole('button',{name:'取消',exact:true}).click();await edit.waitFor({state:'hidden'});
    assert.equal(state.requests.filter(r=>r.method==='PUT'&&r.path==='/api/memories/m31').length,0);
    await choose('m31','编辑');await edit.getByRole('textbox',{name:'正文',exact:true}).fill('新的正文\n保留换行');
    await page.setViewportSize({width,height:360});await geometry('[role="dialog"]');await edit.getByRole('button',{name:'保存修改',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:`${output}/editor-short-${width}.png`});state.failEdit=true;
    await edit.getByRole('button',{name:'保存修改',exact:true}).click();await edit.getByRole('alert').waitFor();assert.equal(await edit.getByRole('textbox',{name:'正文',exact:true}).inputValue(),'新的正文\n保留换行');
    await edit.getByRole('button',{name:'保存修改',exact:true}).click();await edit.waitFor({state:'hidden'});await waitText('[data-memory-id="m31"]','服务端保存：新的正文');
    const writes=state.requests.filter(r=>r.method==='PUT'&&r.path==='/api/memories/m31');assert.deepEqual(writes.at(-1).body,{content:'新的正文\n保留换行'});
    assert.equal(JSON.parse(state.rows.find(r=>r.id==='m31').keywords).length,40);
    await page.setViewportSize({width,height:844});
    // Keyboard navigation and finalFocus return to the stable reading region.
    await menu('m31');await page.waitForFunction(()=>![...document.querySelectorAll('[role=menu][data-open] [role=menuitem]')].find(el=>el.textContent.includes('删除并重新总结来源'))?.disabled);await activeMenu().evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));await activeMenu().getByRole('menuitem',{name:'编辑',exact:true}).focus();await page.keyboard.press('End');assert.equal(await page.locator(':focus').innerText(),'删除并重新总结来源');await page.keyboard.press('Escape');
    state.failResummary=true;await choose('m31','重新总结');await confirm().getByRole('button',{name:'确认重新总结',exact:true}).click();await confirm().getByRole('alert').waitFor();
    assert.equal(state.rows.find(r=>r.id==='m31').content,'服务端保存：新的正文\n保留换行');await confirm().getByRole('button',{name:'取消',exact:true}).click();
    await choose('m31','重新总结');await confirm().getByRole('button',{name:'确认重新总结',exact:true}).click();await confirm().waitFor({state:'hidden'});await waitText('[data-memory-id="m31"]','同一 ID 的服务端重新总结');
    assert.equal(await row('m31').getByRole('button',{name:'取消待继续标记',exact:true}).getAttribute('aria-pressed'),'true');
    await row('m31').getByRole('button',{name:'取消待继续标记',exact:true}).click();await row('m31').getByRole('button',{name:'标记为待继续',exact:true}).waitFor();
    await menu('m30');await activeMenu().getByText('没有精确来源',{exact:false}).waitFor();assert(await activeMenu().getByRole('menuitem',{name:'删除并重新总结来源',exact:true}).isDisabled());await page.keyboard.press('Escape');
    await choose('m31','删除并重新总结来源');await confirm().getByText('来源检查通过',{exact:false}).waitFor();state.failCombo=true;
    await confirm().getByRole('button',{name:'确认删除并入队',exact:true}).click();await confirm().getByRole('alert').waitFor();assert(await confirm().getByRole('button',{name:'确认删除并入队',exact:true}).isDisabled());assert(state.rows.some(r=>r.id==='m31'));
    await confirm().getByRole('button',{name:'重新检查来源',exact:true}).click();await confirm().getByText('来源检查通过',{exact:false}).waitFor();await geometry('[role="alertdialog"]');
    await confirm().getByRole('button',{name:'确认删除并入队',exact:true}).click();await confirm().waitFor({state:'hidden'});await row('m31').waitFor({state:'detached'});
    await waitText('[data-memory-task="task-1"]','来源已加入待总结队列');const reads=state.requests.filter(r=>r.path.includes('/requeue/tasks/')).length;await delay(150);assert.equal(state.requests.filter(r=>r.path.includes('/requeue/tasks/')).length,reads);
    await page.screenshot({path:`${output}/queued-${width}.png`});
    let releaseDigest;state.holdDigest=new Promise(resolve=>{releaseDigest=resolve;});
    const beforeDigest=state.requests.filter(r=>r.path==='/api/memories/digest').length;
    await page.getByRole('button',{name:'总结新记忆',exact:true}).click();
    await page.getByText('正在批量总结，可能包含新增消息和已入队的历史来源，请稍候…',{exact:true}).waitFor();
    assert(await page.getByRole('button',{name:'总结新记忆',exact:true}).isDisabled());assert(await page.getByRole('button',{name:'标记为待继续',exact:true}).first().isDisabled());
    await page.getByRole('button',{name:'总结新记忆',exact:true}).dispatchEvent('click');assert.equal(state.requests.filter(r=>r.path==='/api/memories/digest').length,beforeDigest+1);
    let releasePostDigestTask;state.holdTask=new Promise(resolve=>{releasePostDigestTask=resolve;});
    const beforeSourceReads=state.requests.filter(r=>r.path==='/api/memories/m30/requeue-source').length;
    releaseDigest();state.holdDigest=null;
    await page.waitForFunction(()=>!document.querySelector('button[aria-label="总结新记忆"]')?.disabled);
    assert(state.requests.filter(r=>r.path==='/api/memories/m30/requeue-source').length>beforeSourceReads);
    await menu('m30');await activeMenu().getByText('没有精确来源',{exact:false}).waitFor();assert(await activeMenu().getByRole('menuitem',{name:'删除并重新总结来源',exact:true}).isDisabled());await page.keyboard.press('Escape');
    await menu('m29');await page.waitForFunction(()=>!document.querySelector('[role="menu"][data-open] [role="menuitem"]:last-of-type')?.disabled);
    assert(await activeMenu().getByRole('menuitem',{name:'删除并重新总结来源',exact:true}).isEnabled());await page.keyboard.press('Escape');
    releasePostDigestTask();state.holdTask=null;await waitText('[data-memory-task="task-1"]','来源总结已完成');await row('regenerated').waitFor();assert.equal(state.rows.find(r=>r.id==='regenerated').content,'历史来源重新总结的服务端结果');
    assert.equal(await page.locator('[data-memory-task]').getByRole('button',{name:'查询状态',exact:true}).count(),0);
    state.mode='empty';await page.getByRole('button',{name:'总结新记忆',exact:true}).click();await page.getByText('当前没有新增内容需要总结',{exact:true}).waitFor();assert((await page.locator('[data-memory-management-feedback]').innerText()).includes('新增 0 条记忆'));
    state.mode='failure';await page.getByRole('button',{name:'总结新记忆',exact:true}).click();await page.getByText('总结中断：辅助模型未完成，任务已保留',{exact:true}).waitFor();
    // Ordinary DELETE and empty tail page recovery, with no combined POST for that ID.
    while(!await page.getByRole('button',{name:'下一页',exact:true}).isDisabled()) {await page.getByRole('button',{name:'下一页',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="记忆阅读区"]')?.getAttribute('aria-busy')==='false');}
    const tailIds=await page.locator('[data-memory-id]').evaluateAll(els=>els.map(el=>el.dataset.memoryId));
    for(const id of tailIds){await choose(id,'删除');assert((await confirm().innerText()).includes('不自动重新总结'));await confirm().getByRole('button',{name:'确认删除',exact:true}).click();await confirm().waitFor({state:'hidden'});}
    assert((await page.getByLabel('记忆分页').innerText()).includes('第 1 / 1 页'));
    assert(!state.requests.some(r=>tailIds.some(id=>r.path===`/api/memories/${id}/delete-and-requeue`)));
    // Server search/filter/Pin-first parameters remain intact.
    await page.getByRole('searchbox',{name:'搜索记忆',exact:true}).fill('合成记忆');await page.waitForFunction(()=>document.querySelector('[data-memory-id]')?.textContent.includes('合成记忆'));
    await page.getByRole('button',{name:'近 7 天',exact:true}).click();await page.getByRole('button',{name:'钉选优先',exact:true}).click();await delay(100);
    assert(state.requests.some(r=>r.path==='/api/memories'&&r.query.q==='合成记忆'&&r.query.created_from&&r.query.pin_first==='true'));
    await geometry('main');
    // A pending task read must be aborted on unmount; no permanent polling/recovery registry.
    await choose('m29','删除并重新总结来源');await confirm().getByText('来源检查通过',{exact:false}).waitFor();await confirm().getByRole('button',{name:'确认删除并入队',exact:true}).click();await confirm().waitFor({state:'hidden'});
    await waitText('[data-memory-task="task-2"]','来源已加入待总结队列');await delay(100);
    let releaseTask;state.holdTask=new Promise(resolve=>{releaseTask=resolve;});const beforeTask=state.requests.filter(r=>r.path.includes('/requeue/tasks/')).length;
    await page.locator('[data-memory-task="task-2"]').getByRole('button',{name:'查询状态',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-memory-task="task-2"] button')?.getAttribute('aria-busy')==='true');
    await page.getByRole('button',{name:'返回桌面',exact:true}).click();releaseTask();state.holdTask=null;await delay(150);
    assert.equal(state.requests.filter(r=>r.path.includes('/requeue/tasks/')).length,beforeTask+1);await page.getByRole('button',{name:'重新进入记忆库',exact:true}).click();await page.locator('[data-memory-id]').first().waitFor();assert.equal(await page.locator('[data-memory-task]').count(),0);
    await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.screenshot({path:`${output}/dark-${width}.png`});assert.deepEqual(errors,[]);
    console.log(JSON.stringify({width,requests:state.requests.length,edits:writes.length,taskReads:reads,errors}));
  } catch(error) {
    console.error(JSON.stringify({width,url:page.url(),errors,diagnostics,requests:state.requests,body:await page.locator('body').innerText()}));
    await page.screenshot({path:`${output}/failure-${width}.png`});throw error;
  } finally {await context.close();}
}
(async()=>{fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});try{for(const width of [320,390,1280])await run(browser,width);}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
