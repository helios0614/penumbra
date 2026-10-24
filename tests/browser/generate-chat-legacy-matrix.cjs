/* Regenerate synthetic fixtures against the actual legacy renderer and public DTO.
 * node tests/browser/generate-chat-legacy-matrix.cjs D:/path/to/AionHome/aion-chat
 * No server, browser, model, user database, or command side effects are involved.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const backend = path.resolve(process.argv[2]);
const source = fs.readFileSync(path.join(backend, 'static/chat.html'), 'utf8');
const mcpSource = fs.readFileSync(path.join(backend, 'static/mcp-result-ui.js'), 'utf8');
const start = source.indexOf('function renderMessages() {');
const end = source.indexOf('\nfunction renderVoiceBar(', start);
if (start < 0 || end < 0) throw new Error('Legacy renderMessages boundaries changed');
const cases = JSON.parse(fs.readFileSync(path.join(backend, 'tests/fixtures/chat_legacy_matrix.json'), 'utf8'));
const rows = cases.map((test, index) => ({ id:test.id, conv_id:'legacy-matrix', role:test.role || 'system',
  content:test.content, created_at:1792800000 + index, attachments:[], mcp_tool_calls:test.mcp_tool_calls || [],
  is_carryover:0, thinking:null, drift:null, cache_region:null,
  ...(test.public_display ? {public_display:test.public_display} : {}) }));
const project = 'import sys,json; from chat_public_display import project_message; print(json.dumps([project_message(row) for row in json.load(sys.stdin)],ensure_ascii=False))';
const python = path.join(backend, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const paired = JSON.parse(execFileSync(python, ['-c', project], {cwd:backend,input:JSON.stringify(rows),encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'}}));
const escape = value => String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fixture = cases.map((test,index) => {
  const container = {innerHTML:''};
  const context = vm.createContext({ currentMessages:[rows[index]], currentConvId:'legacy-matrix', pendingWebSearchResults:{},
    hasMoreMessages:false, msgMusicCards:{}, camCheckMsgId:null, poiSearchMsgId:null, activityCheckMsgId:null,
    locationCheckMsgId:null, mcpToolCallsMap:{}, _heartWhisperMsgIds:[], pendingMcpLoading:{},
    $:()=>container, escHtml:escape, scrollBottom:()=>{} });
  vm.runInContext(mcpSource,context);
  vm.runInContext(source.slice(start,end) + '\nrenderMessages();',context);
  return {...test, raw:rows[index], paired:paired[index], legacyHtml:container.innerHTML};
});
const readable = fixture.filter(test=>!test.hidden && (test.content.trim() || test.mcp_tool_calls?.length));
const missing = readable.filter(test=>test.paired.public_display?.capability === 'legacy').map(test=>test.id);
const report = {legacyReadable:readable.length,penumbraReadable:readable.length-missing.length,remainingPlaceholders:missing,
  excluded:fixture.filter(test=>!readable.includes(test)).map(test=>({id:test.id,reason:test.hidden?'旧前端和新前端均隐藏此角色':'没有可读内容，保留占位'}))};
fs.writeFileSync(path.join(__dirname,'chat-pr4-legacy-matrix.json'),JSON.stringify({legacyRendererSha256:createHash('sha256').update(source.slice(start,end)).digest('hex'),report,cases:fixture},null,2)+'\n');
// Refresh the previous visual fixture with the revised projection too.
const previousPath=path.join(__dirname,'chat-pr4-followup-fixture.json');
const previous=JSON.parse(fs.readFileSync(previousPath,'utf8'));
previous.paired=JSON.parse(execFileSync(python,['-c',project],{cwd:backend,input:JSON.stringify(previous.old),encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'}}));
fs.writeFileSync(previousPath,JSON.stringify(previous,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
