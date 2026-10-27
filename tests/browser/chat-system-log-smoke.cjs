/* Real Chat, synthetic HTTP/SSE/WS and private projections; no real backend. */
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { fixture } = require('./chat-pr6-5-config-smoke.cjs');
const output = process.env.CHAT_LOG_OUTPUT || '/private/tmp/penumbra-pr7b-browser';
fs.mkdirSync(output, { recursive: true });
const frame = data => `data: ${JSON.stringify(data)}\n\n`;
const row = (id, role, content, stamp) => ({ id, conv_id:'a', role, content, created_at:stamp, drift:null, thinking:null, attachments:[], is_carryover:0, mcp_tool_calls:[], cache_region:null });
async function run(browser, width) {
  const { page, context, state, errors } = await fixture(browser,width);
  const pending = []; let number = 0;
  const privatePayload = JSON.stringify({ model:'synthetic-wire-model', system:[{type:'text',text:'PRIVATE_SYNTHETIC_SYSTEM [HEART:allowed] [DRIFT:allowed]'}], messages:[{role:'user',content:'history first'},{role:'assistant',content:'history second'},{role:'user',content:[{type:'image_url',image_url:{url:{_capture:'media placeholder',media_type:'image/png',estimated_bytes:1000}}}]}], tools:[{name:'synthetic-tool',input_schema:{type:'object'}}], tool_choice:{type:'auto'}, thinking:{type:'adaptive'}, output_config:{effort:'high'}, temperature:0, cache_control:{type:'ephemeral'} });
  await page.evaluate(() => { window.__copies=[]; Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.__copies.push(text)}}); });
  await page.route('**/api/chat/debug/drain', route => route.fulfill({ contentType:'application/json', body:JSON.stringify({records:pending.splice(0),dropped:0}) }));
  function snapshot(req, id, source='provider', payload=privatePayload) {
    const headers=req.headers(); assert.match(headers['x-penumbra-debug-page'],/^[a-f0-9]{32}$/); state.originExecution=headers['x-penumbra-debug-execution'];
    pending.push({ id, execution_id:headers['x-penumbra-debug-execution'], conversation_id:'a', kind:id.startsWith('regen')?'regenerate':'send', created_at:Date.now()/1000, model:'synthetic-wire-model', protocol:'anthropic', source, stage:'http_json_before_send', endpoint:'https://synthetic.invalid/v1?sig=%3Credacted%3E', payload_json:payload, complete:true, limitations:[] });
  }
  await page.route('**/api/conversations/a/send', route => {
    const req=route.request(), body=req.postDataJSON(), id=`log-main-${++number}`, stamp=++state.clock;
    state.messages.a.push(row(`user-${id}`,'user',body.content,stamp),row(id,'assistant','synthetic finished reply',++state.clock));
    snapshot(req,`request-${number}`);
    const debug={type:'debug',msg_id:id,model:'synthetic-model',has_error:false,api_format:'anthropic',usage:{prompt_tokens:0,completion_tokens:4,total_tokens:4,cache_read_input_tokens:12,cache_creation_input_tokens:3},recalled_memories:[{content:'ordinary synthetic memory',score:.8,type:'regular'}],debug_top6:[{content:'synthetic candidate',score:.7,vec_sim:.6,kw_score:.2,importance:.5}],quick_notes:[{date:'2026-10-27',period_label:'上午',output:'synthetic note'}],recall_topic:'synthetic topic',recall_keywords:'synthetic keyword',is_search_needed:false,api_response:{events:[{event:'message_start',data:{message:{id:'provider-safe',model:'synthetic-wire-model',usage:{input_tokens:0}}}}]}};
    state.lastDebug=debug;
    return route.fulfill({ contentType:'text/event-stream', body:frame({type:'start',id})+frame({type:'chunk',content:'synthetic finished reply'})+frame(debug) });
  });
  await page.route('**/api/conversations/a/messages/*/regenerate', route => {
    const req=route.request(), id=decodeURIComponent(new URL(req.url()).pathname.split('/').at(-2)), target=state.messages.a.find(item=>item.id===id);
    target.content=`synthetic regenerated ${++number}`; snapshot(req,`regen-${number}`);
    return route.fulfill({contentType:'text/event-stream',body:frame({type:'start',id})+frame({type:'chunk',content:target.content})+`event: persisted\ndata: ${JSON.stringify({id,content:target.content,thinking:null,drift:null})}\n\n`+frame({type:'debug',msg_id:id,model:'regen-model',has_error:false,api_format:'openai',usage:{prompt_tokens:7,completion_tokens:2,total_tokens:9},recalled_memories:[]})});
  });
  await page.getByRole('textbox',{name:'消息正文',exact:true}).fill('synthetic question');
  await page.getByRole('button',{name:'发送消息',exact:true}).click();
  await page.locator('[data-message-id="log-main-1"]').getByRole('button',{name:'重新生成回复',exact:true}).waitFor();
  state.ws.send(JSON.stringify({type:'debug',data:{...state.lastDebug,api_response:undefined}}));
  const open = async () => {
    if(width<768 && !await page.getByRole('button',{name:/^系统日志/}).filter({visible:true}).count()) await page.getByRole('button',{name:'打开会话列表',exact:true}).click();
    await page.getByRole('button',{name:/^系统日志/}).filter({visible:true}).click();
    await page.locator('[data-system-log-dialog]').waitFor();
  };
  await open(); const dialog=page.locator('[data-system-log-dialog]');
  assert.equal(await dialog.locator('.system-log-entry').count(),1);
  assert(!await dialog.textContent().then(t=>t.includes('PRIVATE_SYNTHETIC_SYSTEM')));
  await dialog.getByText('输入 0 · 输出 4 · 总计 4',{exact:true}).waitFor();
  await dialog.getByText('缓存读 12',{exact:true}).waitFor();
  await dialog.getByText('RAG 召回 1 条',{exact:true}).waitFor();
  await dialog.screenshot({path:`${output}/log-summary-${width}.png`});
  await dialog.getByRole('button',{name:'详情',exact:true}).click();
  await dialog.getByRole('button',{name:'本次模型请求（1）',exact:true}).waitFor();
  await dialog.getByRole('button',{name:'本次模型请求（1）',exact:true}).click();
  const request=dialog.locator('[data-request-id]').first();
  await request.getByRole('button',{name:/synthetic-wire-model/}).click();
  await request.getByRole('button',{name:'原始 JSON',exact:true}).click();
  const source=await request.locator('pre').textContent(); assert.equal(source,privatePayload);
  await request.getByRole('button',{name:'复制安全请求投影',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__copies.at(-1)),privatePayload);
  for(const secret of ['Authorization','Cookie','data:image/png;base64,']) assert(!source.includes(secret));
  // A late tool continuation has its own captured call and the same real HTTP origin.
  pending.push({id:'tool-followup',execution_id:state.originExecution,conversation_id:'a',kind:'send',created_at:Date.now()/1000,model:'tool-followup-model',protocol:'anthropic',source:'mcp',stage:'http_json_before_send',endpoint:'https://synthetic.invalid/v1',payload_json:JSON.stringify({messages:[{role:'tool',content:'large synthetic result '.repeat(8000)}]}),complete:true,limitations:[]});
  // A new, unrelated error must preserve this disclosure and reading anchor.
  await request.locator('pre').scrollIntoViewIfNeeded();
  const top=await request.locator('pre').boundingBox();
  const scrollBefore=await dialog.locator('[data-slot="dialog-body"]').evaluate(el=>({top:el.scrollTop,height:el.clientHeight,total:el.scrollHeight}));
  state.ws.send(JSON.stringify({type:'debug',data:{task_id:'task-failure',conv_id:'a',created_at:Date.now()/1000,source:'web',status:'failed',has_error:true,error_text:'工具成功，最终续写失败',usage:null}}));
  await dialog.locator('.system-log-entry').nth(1).waitFor();
  assert.equal(await request.getByRole('button',{name:/synthetic-wire-model/}).getAttribute('aria-expanded'),'true');
  const shifted=await request.locator('pre').boundingBox();
  if(Math.abs(top.y-shifted.y)>=5) {
    console.log('anchor',scrollBefore,await dialog.locator('[data-slot="dialog-body"]').evaluate(el=>({top:el.scrollTop,height:el.clientHeight,total:el.scrollHeight})),top,shifted);
    await dialog.getByRole('button',{name:'本次模型请求（2）',exact:true}).waitFor();
  const large=dialog.locator('[data-request-id="tool-followup"]');
  assert.equal(await large.locator('pre').count(),0);
  const started=Date.now(); await large.getByRole('button',{name:/tool-followup-model/}).click();
  await large.getByText('请求较大，按需加载分组。',{exact:true}).waitFor();
  assert(Date.now()-started<2000,'large request opening took too long');
  assert.equal(await large.getByRole('tree').count(),0);
  await large.getByRole('button',{name:/tool-followup-model/}).click();
  await dialog.screenshot({path:`${output}/anchor-failure-${width}.png`});
  }
  assert(Math.abs(top.y-shifted.y)<5,`reading anchor shifted ${shifted.y-top.y}`);
  await dialog.getByRole('button',{name:'本次模型请求（2）',exact:true}).waitFor();
  const large=dialog.locator('[data-request-id="tool-followup"]');
  assert.equal(await large.locator('pre').count(),0);
  const started=Date.now(); await large.getByRole('button',{name:/tool-followup-model/}).click();
  await large.getByText('请求较大，按需加载分组。',{exact:true}).waitFor();
  assert(Date.now()-started<2000,'large request opening took too long');
  assert.equal(await large.getByRole('tree').count(),0);
  await large.getByRole('button',{name:/tool-followup-model/}).click();
  await dialog.screenshot({path:`${output}/log-${width}.png`});
  await page.setViewportSize({width,height:320});
  await page.waitForTimeout(150);
  const bounds=await dialog.boundingBox(); assert(bounds.y>=0 && bounds.y+bounds.height<=321);
  assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await dialog.screenshot({path:`${output}/log-short-${width}.png`});
  await dialog.locator('[data-slot="dialog-footer"]').getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:'系统日志，有未读错误',exact:true}).filter({visible:true}).waitFor();
  await page.setViewportSize({width,height:844});
  if(width<768) await page.keyboard.press('Escape');
  for(let i=0;i<2;i++) {
    const regen=page.locator('[data-message-id="log-main-1"]').getByRole('button',{name:'重新生成回复',exact:true});
    const wanted=`synthetic regenerated ${number+1}`;
    await regen.click(); await page.waitForFunction(expected=>document.querySelector('[data-message-id="log-main-1"]')?.textContent.includes(expected),wanted);
    await regen.waitFor();
  }
  await open();
  assert.equal(await dialog.locator('.system-log-entry').count(),4); // main, task failure, two target regenerates
  assert.equal(await dialog.getByText('OPENAI',{exact:true}).count(),2);
  assert.equal(await dialog.getByText('RAG 召回 0 条',{exact:true}).count(),2);
  const ids=await dialog.locator('.system-log-entry').evaluateAll(els=>els.map(el=>el.dataset.logId)); assert.equal(new Set(ids).size,4);
  await dialog.getByRole('button',{name:'清空',exact:true}).click(); await dialog.getByText('暂无日志',{exact:true}).waitFor();
  await dialog.locator('[data-slot="dialog-footer"]').getByRole('button',{name:'关闭',exact:true}).click();
  // Closed dialog still receives failures and marks unread, then opening acknowledges them.
  state.ws.send(JSON.stringify({type:'debug',data:{task_id:'new-failure',created_at:Date.now()/1000,has_error:true,error_text:'后台最终失败',usage:null}}));
  await page.getByRole('button',{name:'系统日志，有未读错误',exact:true}).filter({visible:true}).waitFor();
  await open(); await dialog.getByRole('button',{name:'清空',exact:true}).click();
  await dialog.locator('[data-slot="dialog-footer"]').getByRole('button',{name:'关闭',exact:true}).click();
  await page.reload(); await page.locator('[data-message-id="a-initial"]').waitFor(); await open();
  await dialog.getByText('暂无日志',{exact:true}).waitFor();
  await page.keyboard.press('Escape'); await dialog.waitFor({state:'hidden'});
  assert.match(await page.evaluate(()=>document.activeElement?.textContent || ''),/系统日志/);
  assert.deepEqual(errors,[]); await context.close();
  return {width,shortHeight:320,errors,distinctExecutions:ids.length};
}
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try {const result=[];for(const width of [320,390,1280]) result.push(await run(browser,width)); fs.writeFileSync(`${output}/report.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
  finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
