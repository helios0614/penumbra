# Penumbra Chat PR7-C-A：Thinking 展示专项审计

实施状态（2026-10-28，PR7-C-B）：F1–F4 已实施最小修复，等待人工验收，未提交或部署。详见 [修复记录](/Users/remix/Desktop/Penumbra/docs/chat-pr7-thinking-fix.md)。**用户已澄清 F3：DRIFT 功能启用与 AI 历史回显是两个独立开关；无条件推迟所有 DRIFT 的原建议已撤销。** 当前实现由后端 SSE `start.drift_enabled` 声明功能状态，开启时完整合法 DRIFT 可流式显示，回显关闭不影响本轮保存/展示；仅缺少声明或畸形范围等待 HTTP。后端现有两个开关未混用，未修改其语义。以下正文保留为修复前审计快照。

审计日期：2026-10-28。范围：本地 Penumbra `8aaea87`、AionHome `c548547` 的源码、已有测试及合成事件。**尚不能判定 Thinking 展示链路整体通过**：正常标记链路基本成立，但确认存在控制标记隔离、Gemini 投影及流式/落库一致性缺口。

本轮仅新增本文档；未修改业务代码、配置或持久化语义，未 commit、push、deploy。未调用真实 Provider，未读取私人会话、数据库、运行配置或凭据。以下结论不代表线上版本或真实模型返回已验证。

## 1. 当前数据链路

1. **Provider → 文本流**：`stream_ai()` 选择已有 adapter。Anthropic 按 block index/type 校验 `thinking_delta`，将可读 thinking 转成 `[THINKING_START]…[THINKING_END]`；签名、`redacted_thinking` 密文不输出。OpenAI-compatible 仅输出 `choices[0].delta.content`；Gemini 目前仅输出首个 candidate 的首个 `part.text`。
2. **文本流 → SSE**：send、canonical/legacy regenerate 将 adapter 的字符串原样放进 `{type:"chunk", content:string}`，此前未做最终 HEART/DRIFT 清理。没有独立的 typed Thinking delta/完成事件，也没有保留 Thinking 来源、摘要/完整或 block index 的前端字段。
3. **SSE → 临时消息**：`parseSseStream`/事件 mapper → `reduceChatExecutionEvent` → `appendAssistantChunk`。`content`、`thinking`、`simpleThink` 分开累计；DRIFT 与旧 SIMPLETHINK 都进入 `simpleThink`，其他已知控制命令被隐藏。
4. **后处理 → 落库**：后端按既有命令清理顺序处理私有状态，再由 `extract_hidden_reasoning_blocks()` 收集完整、非嵌套 Thinking，每段 trim，以两个换行连接；丢弃未闭合/嵌套段。Assistant 分别保存 `content`、`thinking`、物理旧列 `simple_think`。**这些是显示字段，不表示完整、原始的 Provider 推理记录。**
5. **持久结果 → 恢复**：HTTP `messages?public_view=true` 保留独立 `thinking`，将旧列归一为 `drift`；前端映射为 `thinking`/`simpleThink`。WS `msg_created/msg_updated` 在 Penumbra 只用于身份/失效通知，再读取 HTTP，不直接用原始 WS 内容覆盖气泡。
6. **UI**：历史 presenter 过滤正文残留控制命令；`Bubble` 将独立 `thinking` 交给 `ThinkingBlock`，将 `simpleThink` 交给 `SimpleThink`。send 在持久结果到达后以 HTTP 为准；canonical regenerate 用命名 `persisted` 回执与 HTTP 目标行比对。

来源限制：扁平字符串中的 Thinking 标记也可能来自普通 `content`，与 adapter 包装的原生 Thinking 无法在当前前端 DTO 中区分；不能从“显示了 ThinkingBlock”反推 Provider 返回过原生 reasoning 字段。持久化字段只能证明后端接受了该显示投影。

源码入口：[Provider adapter](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:1436)、[send 转发](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2314)、[SSE reader](/Users/remix/Desktop/Penumbra/src/lib/sse/sse-stream.ts)、[前端 accumulator](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-accumulator.ts:129)、[后端 Thinking 提取](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:195)、[send 持久化](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2622)、[历史 API](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1149)、[公共投影](/Users/remix/Desktop/AionsHome-main/aion-chat/chat_public_display.py:146)、[WS mapper](/Users/remix/Desktop/Penumbra/src/application/realtime/realtime-events.ts:58)、[历史 presenter](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/presentation/chat-message-presenter.ts:45)。

## 2. 协议支持矩阵

| 实际路径 | 上游内容与当前解析 | 后端/前端可展示的 Thinking | 限制 |
| --- | --- | --- | --- |
| Anthropic 原生，含现有直连/网关及两类请求 renderer | `thinking` block 的初始值和匹配的 `thinking_delta`；匹配 stop 生成结束标记 | 支持独立 Thinking 字段；完整多段可落库 | `signature_delta`、`redacted_thinking` 不展示；未知/错配事件丢弃。只有原样返回的可读内容，不能恢复被隐藏部分 |
| Anthropic 摘要输出 | 现有 generation payload 可指定 `thinking.display="summarized"` | 返回的摘要也显示为“思考过程” | 当前 DTO 不标注摘要/完整，不能宣称 UI 是完整推理；本轮不改输出设置 |
| OpenAI-compatible：SiliconFlow、AiPro OpenAI、Custom OpenAI | 仅消费 `choices[0].delta.content`；不消费 `reasoning_content`、`reasoning` | 原生结构化 reasoning **未接入**；若 content 本身有既有 Thinking 标记，前端会解析 | 没有 Responses API reasoning/summary 事件适配；不应将普通正文、usage 中 reasoning token 数或任意 `<think>` 文本猜成 Thinking |
| Gemini adapter | 读取 `candidates[0].content.parts[0].text`，未检查 `thought` | 无正确的原生 thought 分流 | **F2：** thought 可误进普通正文，后续 parts 可丢失。不能据此认定 Gemini Thinking 已支持；修复不需要改请求参数 |

证据：[Anthropic 开始/结束/内容校验](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:1937)、[摘要模式现有声明](/Users/remix/Desktop/AionsHome-main/aion-chat/generation_options.py:226)、[SiliconFlow](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:985)、[AiPro](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:1136)、[Custom](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:1261)、[Gemini](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:1047)。表中描述本地解析能力，不推断任何真实模型一定提供 Thinking。

## 3. 流式、历史与 Regenerate 行为矩阵

“成立”指源码及合成/已有测试覆盖的正常契约；不包含真实网络或模型验证。

| 场景 | 当前流式行为 | 保存/刷新/再进入 | 结论 |
| --- | --- | --- | --- |
| Thinking 先到、正文后到 | 分区累计；正常 END 后正文进入 content | 独立字段恢复 | 成立；首次正文不会主动改变折叠状态 |
| Thinking/正文交替、多段 Thinking | 两类内容各自累计；原先交错位置不会重建 | Thinking 聚合在正文之前 | 既有展示模型；段间连接存在 F4 |
| 只有正文 | 无 ThinkingBlock；无正文前“思考中”只是等待指示 | 正文恢复 | 不据等待文案推断模型进行了 Thinking |
| 只有 Thinking | 可见折叠 Thinking，正文前仍有等待指示 | Anthropic 已有“未返回正文”处理；send/legacy 保存 Thinking 加提示；canonical 失败并保留原目标 | 保留既有生成策略，不把 Thinking 充当正文成功结果 |
| 文本、起止标签跨多个 chunk | 已知完整标记可跨任意切点/单字符输入；正文模式的残缺前缀不会在 EOF 放出 | 正常完整字段恢复 | 普通场景成立；嵌套/未闭合见 F1/F4 |
| Thinking 未闭合、结束标记只有前缀 | 前端保留已经显示的开放段；EOF 还可能追加残缺 END 前缀 | 后端不保存未闭合段 | F4；流式临时值不能当持久事实 |
| Provider 错误/网络中断 | 已识别错误独立投影；临时 Thinking 可保留，显示待确认或失败 | send/legacy 捕获异常时会补 END 后处理；canonical 失败不替换原行；浏览器断流按既有对账读取 HTTP | 不修改 PR7-A；终态显示应遵守权威字段，不能无条件丢弃所有部分 Thinking |
| 页面刷新/重新进入 | 内存 overlay、展开状态不跨刷新保存 | 只恢复已提交独立字段；未提交部分不会凭空恢复 | 成立；不新增草稿/私有内容持久化 |
| 会话 A/B 切换 | sessions 按 conversation 隔离，选择器有异步序列检查 | 返回 A 可显示 A 的执行或 HTTP 结果 | 已有合成测试覆盖执行隔离；不代表 Thinking 专属浏览器场景全部验证 |
| canonical regenerate | 临时内容投影到原 target ID；`persisted` 带 content/thinking/drift | 原行事务替换；回执与 HTTP 四字段一致才确认；失败保留旧行并可另示临时部分 | 正常契约成立；不是按流式字符串相等来确认 |
| legacy regenerate | 后端 `/conversations/{id}/regenerate` 创建新 assistant ID，SSE/WS 与 send 相似，无 canonical persisted 回执 | 旧页面先 DELETE 目标再 append 新行 | 独立旧契约；Penumbra 只调用 target-aware canonical，无自动降级，不改删除/替换语义 |
| 历史搜索、Context Dialog | 搜索只用服务端公开 segments；Context 复用同一白名单 | Thinking/DRIFT/HEART 不进入搜索片段或只读正文 | 有意隐私边界；不是要求在这些路径增加 Thinking |
| 旧记录仅 content 内有 Thinking 标记 | 主 Chat presenter 去掉该段，只展示显式 thinking 字段 | 不补造字段；有独立 thinking 的旧行正常显示 | 兼容限制：旧静态页曾回退提取 content；本轮不将被过滤的原文重新公开 |

证据：[send 对账与权威结果](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-controller.ts:203)、[regenerate 比对](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-regenerate-persistence.ts:36)、[临时/持久消息组合](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/presentation/chat-execution-composer.ts:30)、[跨会话 sessions](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/useChatSend.ts:23)、[canonical 提交/回执](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:4227)、[legacy 新行](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:6058)、[旧页面删除后重生成](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:4416)、[Penumbra regenerate client](/Users/remix/Desktop/Penumbra/src/application/chat-execution/chat-execution-client.ts:67)、[搜索 segments](/Users/remix/Desktop/AionsHome-main/aion-chat/chat_history_read.py:129)、[只读 Context](/Users/remix/Desktop/Penumbra/src/components/chat/ReadonlyConversation.tsx:42)。

### 展示与交互现状

| 项目 | 已核对行为 | 判断 |
| --- | --- | --- |
| 默认/展开/收起 | `useState(false)` 默认折叠，按钮支持 `aria-expanded`；重新挂载后折叠 | 既有策略，无需重设计 |
| 预览/更新 | 折叠时前 80 个 JS 字符单位预览并截断；content props 随流更新；展开状态不会因 chunk 自动收起 | 成立；预览是摘取，不是生成摘要 |
| Thinking 完成 | 组件只有 content，没有 block phase、完成状态或计时；正文出现不改变它 | 能区分消息执行状态，不能单独表达每段 Thinking 完成；属于能力限制 |
| Markdown/代码 | Thinking 与 SimpleThink 都按 React 纯文本展示，保留换行；不执行 HTML、不做 Markdown/代码高亮 | Markdown 符号/代码围栏会原样出现；正文气泡拆分不作用于 Thinking，本轮不改全局渲染 |
| 长内容/滚动 | 展开区无独立 max-height/overflow-y，随 Chat 主滚动；尾部 revision 包括 thinking/simpleThink 长度 | 不能宣称已有局部滚动；是否增加属于交互选择 |
| 窄屏 | 父级 `min-w-0 max-w-[85%]`，文本 `break-words`，预览 truncate | 源码有边界约束；未做手机真实排版/超长 token 的浏览器验收，不能据源码宣称无溢出 |

证据：[ThinkingBlock/SimpleThink](/Users/remix/Desktop/Penumbra/src/components/chat/system-command/InlineIndicator.tsx:14)、[Bubble 展示和等待状态](/Users/remix/Desktop/Penumbra/src/components/chat/Bubble.tsx:159)、[ThinkingBlock 挂载](/Users/remix/Desktop/Penumbra/src/components/chat/Bubble.tsx:221)、[滚动 revision](/Users/remix/Desktop/Penumbra/src/components/chat/BubbleList.tsx:157)。

## 4. 已确认问题及最小复现

以下所有字符串均为合成值，不是真实会话。P1 为内容隔离风险；P2 为显示一致性问题。

### F1 · P1：嵌套控制标记可提前结束隔离，泄露到正文

输入 `before[THINKING_START]outer[THINKING_START]inner[THINKING_END]PRIVATE_TAIL[THINKING_END]after`：前端正文得到 `beforePRIVATE_TAILafter`，Thinking 内还留下内层 START；后端提取结果是正文 `beforeafter`、Thinking `null`。前端只找第一个 END，没有后端已有的 depth/malformed 规则。历史 presenter 复用该 accumulator，因此异常旧 content 也受影响。

输入 `before[DRIFT:note[HEART:PRIVATE_INNER]PRIVATE_TAIL]after`：前端正文得到 `beforePRIVATE_TAIL]after`，SimpleThink 中出现未完整的 HEART 标记。`simple-think` 模式只找第一个 `]`，不像 hidden 模式检查嵌套。**这是解析隔离缺口，不是要求改变 DRIFT 的业务语法。**

依据：[模式切换/首个结束符](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-accumulator.ts:143)、[后端嵌套丢弃](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:205)。最小修复：只修显示扫描器；Thinking 跟踪嵌套并对畸形段保守隐藏，DRIFT/SIMPLETHINK 隔离完整括号范围，不能在内层结束符后回到正文。

### F2 · P1：Gemini thought 被当正文，后续正文 part 丢失

fake HTTP SSE 的 `parts=[{thought:true,text:"SYNTH_THOUGHT"},{text:"SYNTH_ANSWER"}]` 经实际 `call_gemini()` 仅输出 `SYNTH_THOUGHT`。该串之后进入普通 chunk/content 并可持久化为正文；`SYNTH_ANSWER` 没被读取。这是源码与合成返回确认的条件性错误，不表示已观察到真实 Provider 泄露。

依据：[首 part 无类型过滤](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:1047)。最小修复：在现有 response adapter 中遍历已有 candidate 的 parts，排除 `thought:true`，只发出允许的普通文本。原生 thought 的独立展示若没有明确契约继续不接入；不改 includeThoughts、预算、路由或请求 JSON。

### F3 · P1：DRIFT/SIMPLETHINK 流式提前公开，绕过后端私有状态过滤

send/regen 先发原始 chunk，之后后端才执行 disabled-state 过滤或 canonical gate；前端无论 gate 状态都将 `[DRIFT:…]` / `[SIMPLETHINK:…]` 显示为 SimpleThink。禁用时，合成 `body[DRIFT:SYNTH_DRIFT][HEART:SYNTH_HEART]` 后端清理成 `body`，但前端此前已公开随想。多个 DRIFT 也会在前端连接全部值，后端正常提取只取第一个。

另一个边界是 `[THINKING_START]plan[HEART:SYNTH_PRIVATE][THINKING_END]`：thinking 模式不处理内部 HEART，整个控制串可直接进入预览/展开区；后端命令清理在 Thinking 提取之前。不能因为位于“思考过程”区域就视为获准公开的私有状态。

依据：[原始 chunk 转发](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2344)、[禁用过滤](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:181)、[canonical gate](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:3623)、[DRIFT 仅提取首项](/Users/remix/Desktop/AionsHome-main/aion-chat/command_parser.py:390)、[前端无 gate 分支](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-accumulator.ts:149)。最小修复：先在展示侧暂存原始流 DRIFT/SIMPLETHINK，等权威 `drift` 字段确认后使用现有 SimpleThink 展示；Thinking 内的已知私有控制范围同样不能直接公开。不新增前端配置推断，不修改历史字段、gate 或 WS 时机。

### F4 · P2：Thinking 的段边界、未闭合尾部与持久化投影不一致

| 合成输入 | 前端流式/flush | 后端可持久化投影 |
| --- | --- | --- |
| 两个完整段 `one`、`two` | `onetwo` | `one\n\ntwo`（分别 trim） |
| 完整段 `one` 后接未闭合 `tail[THINK` | `onetail[THINK` | 只保留 `one` |
| 开放段后只收到结束符前缀 `[THINKING_EN` | flush 将该残缺前缀写进 Thinking | 不保存开放段 |

前端会在结束符到齐后正确分流普通正文，但未保留“完整段/开放临时段”的区别；`flush` 也没有在 Thinking 内拒绝未完成控制前缀。结果是刷新后内容/分段改变，部分标记可在 Thinking 展示中出现。**后端丢弃未闭合段是既有隐私契约，不应通过补 END 或恢复原始流来强行保存。**

依据：[累计/flush](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-accumulator.ts:178)、[后端聚合](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:234)。最小修复：显示解析保留完整段与临时段，完整段按既有后端规则投影；终态不刷出残缺控制标记。存在补 END 的后端错误路径仍以最终权威字段为准，不改变失败持久化策略。

## 5. 私有状态与普通 Thinking 的边界

- **Provider Thinking**：只代表 adapter 已明确识别且上游实际提供的可读文本；可能只是摘要。不得从正文、usage、签名或密文补造推理。
- **应用内部状态**：HEART、DRIFT 是 app-private 命令；SIMPLETHINK 是 DRIFT 的旧名称/只读兼容语义，不是另一种 Provider reasoning。前端 `simpleThink` 只是沿用的属性名，不能将其改名解释成模型 Thinking。
- **既有用户入口**：已持久化 `drift` 通过 SimpleThink 展示；HEART 通过 `has_heart` 与用户展开的 HeartMarker 专属读取展示。这些现有权限/语义应保留，不混入 ThinkingBlock、普通气泡、搜索或新增日志。
- **控制内容**：MCP、MEMORY_WRITE、schedule、Location、REACTION、`<meta>` 等继续由后端独占执行；前端只过滤显示。已知 hidden 范围的普通跨 chunk 用例通过，不代表畸形嵌套已安全。
- **历史与诊断**：公开搜索/Context 只使用白名单 segments；不回填被过滤的 Thinking/私有原文。现有前端 trace 只收身份、阶段、长度等元数据；后续测试与修复不增加原始 chunk/私有值日志，不扩大 PR7-B 快照访问范围。

依据：[DRIFT 兼容约定](/Users/remix/Desktop/AionsHome-main/aion-chat/drift_compat.py:1)、[HeartMarker 显式读取](/Users/remix/Desktop/Penumbra/src/components/chat/capabilities/HeartMarker.tsx:13)、[trace 白名单](/Users/remix/Desktop/Penumbra/src/lib/chat-timeline.ts:1)。

## 6. 最小修复范围（仅建议，未实施）

| 顺序 | 修改位置 | 内容与边界 |
| --- | --- | --- |
| 1 | Penumbra `src/application/chat-send/chat-send-accumulator.ts`；对应 `chat-current-wire.test.ts` / `chat-send.test.ts` | 修 F1/F3/F4 的显示扫描、私有范围隔离、完整段聚合；不执行命令，不复制后端业务状态机 |
| 2 | AionHome `aion-chat/ai_providers.py`；新增专用 response contract 测试 | 修 F2 的 Gemini parts/`thought` 过滤；普通正文顺序保留，不启用额外 reasoning 字段、不改请求 |
| 3 | Penumbra `src/components/chat-workspace/presentation/chat-execution-composer.ts` 及测试（如权威 drift 展示需要）；`chat-generation-flow.test.tsx` | 权威字段替换临时投影时验证 Thinking/DRIFT 一致；不改 controller 的 PR7-A 对账、超时、幂等或恢复 |
| 4 | `InlineIndicator.tsx` 的针对性交互/浏览器测试；只有验证出实际问题才改组件 | 验证折叠更新、长文本与窄屏；无需先改 Markdown、气泡拆分、全局样式或增加复杂 UI |

OpenAI-compatible 未接入结构化 reasoning 是支持限制，本轮不建议猜字段或批量兼容。旧 content-only Thinking 继续保守过滤；如未来要恢复，需单独确定获准公开的历史契约。若只改 UI 无法阻止 Gemini 混流，应保留第 2 项小范围后端响应投影补丁，不能用前端正文关键词过滤代替。

## 7. 验证与针对性测试建议

### 本轮实际验证

- 前端 11 个现有 Vitest 文件、**263 项通过**：`chat-current-wire`、`chat-send`、`chat-regenerate`、`chat-result-reconciliation`、`chat-execution-sessions`、`chat-execution`、`chat-generation-flow`、`GenerationIndicator`、`ConversationContextDialog`、`chat-presentation`、`chat-execution-composer`。覆盖正常跨 chunk、部分结果、原目标回执、会话隔离；不据此宣称 F1–F4 已覆盖。
- 补跑 `src/lib/sse/sse.test.ts`，**19 项通过**，覆盖分帧/字段/UTF-8 跨网络 chunk、不完整 frame/编码及取消；不完整网络帧会报错，不把半个 JSON 当正文。前端合计 **12 个文件、282 项通过**。
- 后端只复制 Python 源码/测试及旧静态 Chat 源码到 `/private/tmp/penumbra-pr7c-thinking-audit`，运行 `test_cloudflare_anthropic_provider.py`、`test_hidden_app_state_switches.py`、`test_drift_compatibility.py`、`test_canonical_regenerate_route.py`：**70 项通过、2 项 deselected**，均为 fake HTTP/Provider、临时 SQLite。
- 后端首跑另有 2 个配置 round-trip 测试因期待旧 `api_configs` 键失败，位于本轮排除的配置范围，未修复，最终明确 deselect；隔离副本最初遗漏 `static/chat.html` 导致的另一失败，补入源码后通过。不能把上述结果写成整个后端 suite 全绿。
- 直接调用真实前端 accumulator/presenter，逐字符喂入合成嵌套/截断/多段输入；在隔离副本用 fake `httpx.AsyncClient` 调用实际 Gemini 及三个 OpenAI-compatible adapter，复现 F1–F4 的相关投影。没有启动真实后端或使用登录态。
- 未执行手机/桌面视觉验收、真实断网/长流；文档改动未运行生产构建。

### 修复前应补的最小回归

1. **解析/隔离**：对 F1–F4 输入枚举所有切点及逐字符输入；每个中间投影都检查普通正文、Thinking 预览与 SimpleThink 不含未获准私有范围。包含嵌套 START、孤立 END、开放段、残缺 END、HEART 内嵌、连续 DRIFT、disabled gate。
2. **协议 fixture**：Anthropic Thinking→正文→Thinking、只有 Thinking、redacted/signature、错配 index/type、EOF/error；Gemini 同一帧多个 parts、thought 在前/后、只有 thought、无 thought；OpenAI delta 仅 content/仅 reasoning/两者并存，验证不猜字段、不误识正文。
3. **恢复等价**：完整段以相同语义贯穿 live → HTTP → 刷新 → A/B 返回；send 与 canonical regenerate 的 content/thinking/drift 对应原消息，失败保留原目标；legacy 单独验证新 ID，不将其套入 canonical 回执。未提交/未闭合尾部不从日志或草稿重建。
4. **交互/阅读**：只用合成 Thinking，在 320/390/768px 与桌面检查折叠/展开后持续流式更新、首正文出现、键盘操作、1 万字内容、长 URL/无空格代码、Markdown 围栏、滚动后手动阅读；验证无横向溢出且不会意外滚离阅读位置。只修实际失败，不预先重设计。
