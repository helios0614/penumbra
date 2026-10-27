# Chat 稳定性专项：失败消息、断流恢复与重新生成

日期：2026-10-24（Asia/Shanghai）。Penumbra 基线 `main @ 1abd6d0`（已提交 PR3）；AionHome 基线 `1b5e480`。两仓库开始时均干净。本轮修改两个本地仓库，未 commit、push、部署。

已阅读 PR0、PR1、PR2、PR3、日常 UI 修正文档，以及 AionHome AGENTS、runtime model、master plan、canonical regenerate contract；结论以当前源码和合成回归为准。没有读取真实 settings、凭据、聊天数据库或浏览器个人数据。

## 1. 真实链路与差异矩阵

| 场景 | 后端事实、字段和持久化 | 旧 Chat | PR3 Penumbra / 本轮修正 |
|---|---|---|---|
| 普通 send | `send_message` 先提交 user，再启动后台生成；SSE `start.id` / `chunk.content`；最终清理正文并 INSERT `messages` 的 assistant，广播 `msg_created`；`debug.has_error/error_text` 是诊断而非历史字段 | `sendMsg` 暂存 `aiContent/textContent`，分离 Thinking；`formatMsg → ChatErrorUI.formatChatErrorText` 替换错误标记，保留其前面的正文和后面的安全诊断 | 历史 presenter 只要发现 `provider_*_failed` 就整条改为“当前回复生成失败”；accumulator 丢弃包含错误码的整个 chunk。现改为分别投影正文和错误，保留同 chunk 的正文 |
| 上游非 2xx | `ai_providers` 生成如 `[Anthropic API 错误 524] provider_request_failed`，追加已筛选和脱敏的“上游类型 / 上游代码 / 上游信息 / 请求 ID”；普通 send 把这些文本存进 `messages.content` | 友好 Provider / HTTP 标题和原有安全诊断均可展示 | 保留 Provider / HTTP 事实，只加中性标题；移除按状态码推断原因的文案，优先显示安全上游原文，SSE 与历史使用同一格式器。补齐普通/legacy 路径对 Anthropic、自定义 API、部分正文后错误的 `has_error` 判定 |
| stream exception | 普通生成保留累计 `full_text`，追加 `[请求出错: provider_execution_failed]`，清理后持久化；不会安全暴露 exception 原文 | 已有正文仍在；客户端传输 catch 只清掉 `...` 占位，日志不是服务端停止凭据 | 显示已保存正文和安全失败说明；没有诊断时才使用通用文案。传输断开仍走只读确认 |
| MCP / POI / Route | 当前可达路径已经进入 `perform_reply_result_batch → ReplyResultBatch.run → _perform_mcp_round → stream_reply`；工具结果经 `prepare_mcp_results` 脱敏，保存在 system carrier 的 `messages.mcp_tool_calls`；synthetic user inputs 不落成用户聊天 | 收到 system/tool 通知；最终续写失败通常只有后台任务 debug 通知，没有可重生成的失败 Assistant | 后端在最终模型失败时，先落已有工具结果，再落一条普通 assistant（正文 + 既有错误标记），使用现有 `msg_created` 失效通知恢复。未重构工具执行器 |
| Web Search | 同一 batch finalizer 生成，但证据是独立 `web_context_events`，有原 user `anchor_message_id`；`web_search_feedback` 独立保存搜索结果、`follow_up_status` | 搜索成功不代表续写成功；原来失败只剩反馈，证据未随失败落盘 | 完成的 Web Evidence 与失败 Assistant 一起提交；原用户锚点不变，反馈仍标注续写失败。失败后 regenerate 可以恢复证据，默认不重新搜索 |
| Activity / Location / Camera 结果 | 现有 batch 中仍保留专用执行器、prompt 位置、附件与 guard；其结果 system carrier 不等同于 MCP JSON；camera 可使用自己的 provider/context builder | 由后台 WS 追加结果/回复 | 共用 finalizer 的模型最终失败可进入相同失败保存边界；成功路径、专用格式和副作用顺序保留。没有把这些工具改造成一套新执行契约 |
| canonical regenerate | `regenerate_target_message`；严格读取目标之前的 `(created_at,rowid)` 历史，成功事务 UPDATE 同 ID、保留 created_at；失败不覆盖目标；`persisted` receipt 后仍需 HTTP 比对 | 旧 `regenerateMsg` 是 DELETE + legacy append，不能搬到 Penumbra | 继续原 canonical endpoint / ID / receipt 校验。明确失败且 HTTP 已核对后，原消息按钮可直接使用；结果未知继续禁用 |
| HTTP / WS | `list_messages` 从 SQLite 读取，`canonicalize_drift_mapping` 投影 DRIFT；WS 是失效通知，不能当完整消息或执行终态 | `handleSync` 消费 message/debug，并恢复显示 | unknown 原来仍被当作活跃 SSE，刷新持续 defer。新增仅供 Realtime 的 `recovering` 标志，允许只读同步；发送、会话和 regenerate 锁仍由原 Send Controller 持有 |

主要源码入口：

- [后端 send / HTTP history / canonical / result finalizer](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1045)
- [追加生成缓冲与有限尝试](/Users/remix/Desktop/AionsHome-main/aion-chat/append_reply_runtime.py:276)
- [旧错误格式器](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat-error-ui.js:1)、[旧 Chat](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:4050)
- [新历史 presenter](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/presentation/chat-message-presenter.ts:28)、[SSE accumulator](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-accumulator.ts:65)

## 2. 根因和必要修复

### 普通回复

后端已经能保存“部分正文 + 安全错误”；HTTP DTO 没有单独 error 字段，错误本来就在 `content`。不是需要增加失败消息表或重做 DTO。新前端的全消息失败替换、整 chunk 丢弃才是正文和真实诊断消失的主因。

`assistant-failure.ts` 识别既有错误边界；presenter 先切开正文/错误，再沿用现有内部命令和 Thinking 过滤。VM 增加可选 `error`，在原 Assistant Bubble 内用纯文本显示；标题只说明失败和来源，不按 HTTP/type 推断实际原因。没有新聊天消息类型、错误详情面板或工具重试入口。复制、放入输入框不会把诊断当作正常正文；失败消息保持原有禁止插入策略。

普通/legacy 后端的旧 `has_error` 前缀列表漏掉 Anthropic 和自定义 API，也漏掉正文之后追加的错误。补判定后，device snapshot、auto digest 等原有失败分支收到正确事实；没有重新安排命令和成功提交顺序。

### 工具续写

`stream_reply` 已有两次以内尝试、冻结 binding/wire、时间预算：只有成功的缓冲结果才 yield。最终失败时，`AppendGenerationFailed(reason)` 原来丢掉缓冲文本；`_perform_mcp_round` 在 assistant INSERT 之前退出；finally 只保存工具记录。此外真实 Anthropic `_append_reply` 分支原本用确定性摘要替代普通 Chat 的安全上游详情，单用假 Provider 返回完整错误的测试无法覆盖该差异。这个后端缺口同时影响新旧 UI，前端不能凭通知补造持久化 Assistant。

现在异常只在请求局部携带**最后一次尝试**的 partial text 和现有安全诊断；不把两次失败尝试拼接，也不保存中间失败后已成功的尝试。`_persist_failed_result_reply`：

1. 纯清理正文，丢弃 Thinking、完整/残缺私有命令；不执行失败输出中的命令。
2. 复用 Provider 脱敏和安全异常摘要，构造原有错误文本。
3. 调用原结果持久化函数，确保 system/tool carrier 在失败 assistant 之前。
4. 提交普通 assistant；有已完成 Web Evidence 时在同一事务保存原 user 锚定事件，再广播既有 `msg_created`。
5. 继续原任务失败收尾与反馈，不将模型失败改成任务成功，不重放工具。

工具失败本身仍保留在工具记录的 `success/error/status`；模型能正常解释工具失败时，Assistant 依然是正常回复。搜索成功、证据未进入模型、模型输出失败三个事实也继续区分；`follow_up_status` 没有被成功工具结果覆盖。

## 3. 错误与脱敏边界

服务端权威仍在 `ai_providers._anthropic_error_diagnostic → _project_provider_error_json → _anthropic_client_error_detail → _redact_provider_error_text`：读取限长 body，只保留白名单错误字段和 request ID，替换配置中的凭据及常见凭据语法。本轮补齐既有函数对 Cookie/Set-Cookie、非 Bearer Authorization、常见 token 别名及 URL 凭据/query 的覆盖。

工具结果继续使用原 `mcp_results.configured_secrets / prepare_mcp_results`。追加失败使用 Provider 的同一个 redactor 和 `append_reply_diagnostics.safe_reply_failure`。仅结果 batch finalizer 通过 `stream_reply(include_error_details=True)` 开启内部 `_chat_failure_details` 标志，让 Anthropic 复用普通 Chat 的安全详情；该参数不进入 Provider 请求，其他后台 owner 继续原确定性摘要。真实 `call_anthropic` 的 HTTP 边界回归验证了 524、类型、Proxy Read Timeout、request ID 和凭据过滤，不只依赖假 Provider 输出。没有回显 exception body、prompt、raw history 或 synthetic inputs。

前端不透传整个 HTTP HTML、JSON 或 debug payload。格式化支持的错误边界时，保留其后安全的具体说明，包括无“上游信息”标签的旧错误文本；HTTP 只投影常见标量 message/msg/detail/reason/error 等字段及辅助 type/code/request ID。凭据语法或私有内容不能安全投影时拒绝显示相应文本；安全诊断 URL 不因含 URL 就整条丢弃。这是显示拒绝守卫，不是另一套凭据替换规则。仅没有可用安全内容时使用通用提示；同一状态码不会触发固定原因翻译。

直接 HTTP 524 使用 `ApiError.status`，Provider 错误里的 524 只作为上游说明。取消/网络错误的 status 为 0，不推断为 524；正文里的“HTTP 524”不改变真实 HTTP status。ABORTED 只表示读取取消，TIMEOUT 区分等待超时，均不证明后台已停止。

## 4. 保存和展示规则

| 已知事实 | 行为 |
|---|---|
| 已保存正文 + 错误 | 同一 Assistant 中分别显示；重读后仍来自 `messages.content`，不整条替换正文 |
| 无正文但已保存明确模型错误 | 原 Assistant 的正文位置显示错误；有 canonical ID 和原有消息操作 |
| 只有 SSE partial，没有对应历史 | 明确标记“结果待确认”；只作为临时 overlay，不声称保存成功，不提供临时消息 regenerate |
| 首次 HTTP 重读成功但仍缺目标 | 不清空临时正文/错误；不重复乐观用户消息，保持未知锁 |
| HTTP 已有同 ID send Assistant | HTTP 内容优先，旧 SSE 不再遮住它；锁和确认逻辑独立判断 |
| canonical regenerate 失败 | 原持久化目标保持；本次安全错误附于目标。新的 HTTP 内容改变后，不再把旧 attempt 错误附到新结果 |
| regenerate 成功 | receipt + HTTP 同 ID/content/Thinking/DRIFT 比较通过后退出 overlay，原失败展示被新结果替换 |

HEART、内部命令、meta 和合成工具输入不进入公开正文。Thinking/DRIFT 继续留在原专用辅助展示边界，未把它们转为正文。

## 5. regenerate 验证

原按钮仍调用 `POST /api/conversations/{conv_id}/messages/{message_id}/regenerate`，不新增重试续写/重跑工具按钮。最新非 carryover assistant、同会话、readiness、配置确认、owner/sequence、发送锁均保留。

Controller 的 `confirmedFailure + failedMessageId` 只开放已经明确失败、且适用持久化确认已经完成的原目标；send 在收到 start/failure ID 后还必须在 HTTP 找到对应 assistant。收到错误但失败消息尚未落盘不会解除未知保护。send 和 regenerate 的失败 ID 都核对当前执行目标，不能把其他 ID 的 failure 当作本次终止。

后端实测：MCP/POI 的记录按原顺序落在失败目标前；canonical context 排除目标失败正文，保留原用户及 system 工具事实；Web Evidence 按原用户 anchor 恢复，`allow_web_search=false`，没有第二次搜索。成功后 ID 和 created_at 均不变；工具只调用一次。前端实测：失败消息按钮直接可点，同 ID 成功后移除失败显示，其他 Assistant 不变。

这不承诺新模型永远不会生成新的命令。canonical 成功输出仍按原 contract 执行新命令；不会自动撤销既有外部副作用。旧 Chat 的 legacy DELETE + append 行为未迁移，也不作为新前端恢复方案。

## 6. SSE canceled / 524 与 HTTP、WS 恢复

- 继续响应头等待与 stream idle timeout；没有新轮询、任务查询服务或自动重发。
- streaming / finalizing 时仍 defer WS 历史同步；消费结束后未知状态允许只读刷新。WS 当前 assistant 的保存通知在 recovering 阶段不再被吞掉。
- Realtime 的只读回调在 unknown 时进入原 `retryFinalization`，使用既有 HTTP owner/sequence 和 canonical receipt 判定；WS payload 本身不创建消息、不确认结束。
- 新 HTTP 优先于 send 的旧 overlay；未知 regenerate 在成功 HTTP 重读后显示持久目标，仍不能缺少 receipt 就宣称成功。
- A/B 切换、WS/历史/分页并发继续由 Workspace sequence/AbortSignal 隔离。没有为了恢复而允许活跃/未知期间切换或发送。
- Composer 轻量入口保留只读核对；明确失败的详细错误留在 Assistant，入口只提示可使用原重新生成按钮。

## 7. 仍存在的契约限制

1. **PR7-A 已补齐新 send 的持久身份关联和只读查询（见第 11 节）**。没有回执的旧请求、主回复未落盘、查询/历史不可用仍保持未知；HTTP 524、浏览器 canceled、AbortController 都不证明服务端取消。
2. `append_reply_tasks` 是已有后台任务的计数/失败回执，并非普通 send/canonical 的统一执行身份或完整恢复接口。SSE 主回复结束后，还可能存在已调度的工具追加任务；历史出现第一条 assistant 不保证所有后续任务都结束。
3. MCP/POI carrier 主要依靠会话内顺序恢复，没有 Web 那样的原 user 外键。本轮保证自己的 tool-result → failed assistant 顺序；不能对其他设备/后台并发写入虚构完整轮次身份。canonical snapshot conflict 保护仍在。
4. canonical 失败按原不变量不覆盖目标；失败 attempt 的临时诊断刷新页面后可能消失，原已保存正文/错误仍在。receipt 丢失时即使后台提交成功，也可能保持未知，不能伪造成功回执。
5. task cancellation、进程崩溃、DB/上下文/提交收尾失败不都能保证产生新的失败 Assistant。新增持久化边界针对结果 batch 的最终模型失败；既有任务失败通知继续承担其余失败报告。未承诺任意崩溃都能保存内存 partial。
6. 既有 Provider 若干路径缺少统一终态标记；干净 EOF 仍有无法区分的情况。本轮不重新设计 Provider/Chat 状态机。
7. PR3 同时间戳分页游标缺口保留：普通历史 API 仍是 `created_at < before`。没有扩大页大小或改游标。

## 8. 修改文件与验证

Penumbra：新增 `src/domain/message/assistant-failure.ts`、`src/components/chat/chat-stability.test.tsx`、`src/components/chat/chat-upstream-errors.test.tsx`、`tests/browser/chat-stability-smoke.cjs` 和本文；修改原 chat-execution 的事件类型/安全错误文本投影与回归，chat-send 的 accumulator/controller/errors/types 与 send 回归、Realtime coordinator/types/回归、`useChatRealtime`/回归、regenerate policy、presentation composer/presenter/回归、`Bubble`、`ChatView`、`chat-ui-types`。没有修改 Message DB schema、HTTP history DTO 或新增消息 mutation endpoint。

AionHome：`aion-chat/ai_providers.py`、`append_reply_runtime.py`、`routes/chat.py`；新增 `tests/contract/test_chat_stability.py`，更新 `test_append_reply_runtime.py`、`test_append_reply_entry_retry.py`、`test_web_search_v1.py` 的失败持久化断言，并在 `test_append_reply_provider_diagnostics.py` 增加真实 transport 的 524 合成响应。补充更新 `static/chat-error-ui.js` 的中性标题和 HTTP 安全正文投影，以及 `test_chat_error_ui.py`、`test_generation_options_pipeline.py`、`test_provider_runtime_resolution.py`；新增 `test_chat_upstream_errors.py`。旧 HTML 调用点保留，formatter 不再用状态码覆盖原文。

测试用从 AionHome 已提交 Git 内容导出的临时源码副本，排除 data / .env；所有 DB、配置、Provider、工具、HTTP/SSE/WS 数据均为合成。没有 import 原仓库运行时、启动真实后端或连接模型服务。补丁应用后校验业务/测试文件与测试副本逐字节一致。

| 检查 | 结果 |
|---|---|
| Chat 定向回归 | 正文/真实错误、无正文、未知持久化、取消/status 区分、陈旧 SSE/attempt 与新 HTTP 竞争通过 |
| 前端全量 `npm test -- --reporter=dot` | 123 个文件、1798 项通过 |
| `npx tsc --noEmit` | 通过 |
| `npm run build` | 通过；现有 Vite 大 chunk 提示仍存在，不影响产物生成 |
| PR3 浏览器回归 | PC 1440×1000 / 手机尺寸 390×844 + touch emulation 通过，包括 A/B/C 竞争、分页/WS、未知导航保护 |
| 稳定性浏览器 E2E | PC / 手机尺寸通过：同为 HTTP 403/permission_error 的不同原文经 WS/历史重读仍独立显示，跨 chunk 真实错误、两段正文、重读、工具无正文失败、原按钮同 ID regenerate、canceled 后 WS/HTTP 回填、直接 524、未知不自动 mutation |
| 后端相关回归 | 462 项通过；覆盖所有 append_reply、普通 send、真实 Anthropic 分支的 mock HTTP 错误、command/result batch、MCP/POI、Web Evidence、canonical/atomic regenerate、frozen binding 和旧错误 UI；1 条测试依赖的 Starlette 弃用提示 |
| 两仓库 `git diff --check` | 通过 |

浏览器复现：本地 Vite 默认端口 45340（本次补充最终在新启动、已核对源码版本的 45341 实例验证；可设置 `CHAT_STABILITY_ORIGIN` / `CHAT_PR3_ORIGIN`）；使用 Playwright 执行 `tests/browser/chat-pr3-smoke.cjs` 和 `tests/browser/chat-stability-smoke.cjs`，两个脚本依次接受 Playwright 模块路径、Chrome 可执行文件路径。全部业务 API/WS 都被 fixture 拦截，新的 SSE 用真实 `ReadableStream` 合成。

后端回归包含 `test_chat_upstream_errors.py`、`test_chat_stability.py`、`test_append_reply_*.py`、`test_reply_result_batch.py`、`test_command_runtime_production.py`、`test_location_command_runtime.py`、`test_mcp_chain_diagnostics.py`、`test_mcp_follow_up_prompt.py`、`test_mcp_history_provider_roles.py`、`test_canonical_regenerate_route.py`、`test_atomic_regenerate_persistence.py`、`test_regenerate_followup_frozen_llm_binding.py`、`test_main_regenerate_effective_input_characterization.py`、`test_send_frozen_llm_binding.py`、`test_provider_runtime_resolution.py`、`test_generation_options_pipeline.py`、`test_anthropic_controlled_cutover.py`、`test_openai_production_handoff.py`、`test_web_search_v1.py`、`test_web_evidence_delivery_diagnostics.py`、`test_chat_error_ui.py`。未宣称后端全量测试通过。

## 9. 人工验收

在隔离测试环境和专用合成会话中操作，不使用生产聊天或 API Key：

1. 普通生成直接上游 524，检查 Assistant 有 Provider、HTTP、`bad_response_status_code`、`Proxy Read Timeout`、request ID；包含测试凭据的上游错误先脱敏。
2. 输出两段正文后失败，检查正文与错误同时存在；刷新页面、WS 重读后各出现一次，不出现 Thinking/HEART/命令/synthetic 输入。
3. 分别运行成功与失败的 MCP/POI 工具，让后续模型失败。核对工具事实/失败记录仍在，无正文续写也有 Assistant 错误；点击该消息原有 regenerate，检查请求路径 ID、同 ID 成功替换和工具调用计数。
4. Web 搜索成功后使模型续写失败；核对搜索成功与续写失败分别记录；regenerate 恢复原用户锚定证据，不自动搜索。
5. 原失败消息 regenerate 再次失败：保留旧已保存正文，显示这次安全错误；再成功时原 ID/时间不变，其他消息和会话不受影响。
6. 断开 SSE 或模拟 canceled，让后台稍后落盘并发送 WS。HTTP 能回填；没有保存身份/receipt 时仍显示未知，不能点击 regenerate 或自动重发。检查网络没有第二次 POST。
7. 模拟慢 HTTP、WS 连续事件及 A/B 快速切换；确认新 HTTP 不被旧 overlay/错误覆盖，A 的错误/响应不进入 B。发送和未知期间保留原导航与管理锁。
8. PC 与真实手机检查长错误换行、消息动作、Composer 轻量恢复入口。自动化手机尺寸不等于 iOS/Android 原生浏览器人工验收；本轮未做真实模型或真机验收。


## 10. 补充审计：真实错误优先，禁止过度映射

本补充纠正上一轮仍存在的过度映射，不把旧 UI 的固定状态码文案作为标准。只增加中性标题、来源和必要长度限制；保留安全的原始含义。HTTP/type 相同不等于原因相同。

| 信息丢失点 | 实际问题 | 最终处理 |
|---|---|---|
| 非 Anthropic HTTP Adapter | `call_siliconflow/gemini/aipro/custom` 只返回品牌错误码和确定性摘要，没有读取具体正文；原测试甚至以“不读 body”为目标 | 复用既有 `_anthropic_error_diagnostic` 限长读取与 `_anthropic_client_error_detail` 的白名单/脱敏；不建立另一套 Provider 错误码翻译表 |
| JSON 标量或嵌套 error/errors | 只取字典的 message，JSON 字符串、error 字符串/列表可能已有原因却被舍弃 | 在已筛选的投影上收集原始 message/msg/detail/reason/description 等具体说明；去重和整理分隔，不翻译原因 |
| SSE `error` / named `event:error` | 部分 Adapter 只记录失败标志或把已解析错误当作未知事件，正文没有进入 Chat | 五种 Adapter 将具体安全错误输出为既有失败标记 + 原文。SSE payload 的 code/type 不是 HTTP 响应状态；不据此合成 HTTP 403/429/524 |
| HTTPStatusError catch | 普通/legacy/canonical 和追加缓冲收尾只保留 `provider_execution_failed`，异常携带的实际 HTTP response body 丢失 | 对真实 `httpx.HTTPStatusError.response` 复用同一有界安全投影；其他无法证明为上游正文的内部异常继续安全降级。成功持久化/失败不替换 canonical 的不变量保持 |
| SSE 错误 DTO | 只读取 error_code，连已有安全的 error_text 也会被丢弃 | 仅投影受支持错误边界内的安全文本，不开放整个 debug 对象；后来的通用摘要不覆盖已有具体原因 |
| 前端和旧 formatter | 403 自动补成“鉴权失败”、429 补成“频率/并发/额度受限”；只留四种标签还会丢掉安全的无标签说明 | 删除上游状态码原因翻译，保留中性 Provider/HTTP 标题与安全正文；直接 HTTP 错误也优先具体正文。已有本地 preflight code 仅在没有具体正文时提供契约提示，不覆盖上游内容 |
| HTTP history DTO / Bubble | `messages.content` 本来完整；主要丢失发生在写入前和显示投影 | DTO 不增加独立失败类型，Bubble 继续纯文本显示原文，不再替换为预设原因 |

直接 HTTP 拒绝尚未产生持久化 Assistant 时，只在现有 Bubble 内临时显示安全错误，没有 canonical ID，不伪造可重生成的已保存消息。HTML/不支持结构、读取失败、无安全可用文本仍可回退中性提示；不能因此把有具体安全说明的错误一并泛化。

新增对照回归：同为 **HTTP 403 + permission_error**，分别返回 `Adaptive thinking is disabled by this workspace policy.` 和 `This region is not enabled for the requested deployment.`。五种真实 Adapter（mock transport）的非 2xx、普通 SSE error 和 named error、普通生成/工具后追加/失败 canonical regenerate，以及 Penumbra 最终 Assistant 和浏览器 WS/HTTP 重读均保留各自原因；没有添加“鉴权失败/检查 API Key”的猜测。上游原本只有 `Request failed.` 的用例忠实保留这句话。另覆盖 JSON 字符串、无标签旧错误、实际 HTTPStatusError body、安全诊断 URL 与敏感凭据拒绝。

补充前新用例复现了前端 5 项失败、后端 19 项失败（仅 Anthropic 既有普通 HTTP detail 用例通过）；最终结果见 §8。修复只改变错误信息的读取/投影和临时展示，不新增重发、轮询、恢复任务或工具重执行。


## 11. PR7-A：生成状态与持久化结果对账（2026-10-27）

本节更新上文的旧限制与临时结果生命周期。针对 Main send、canonical regenerate、SubmissionRecovery、SSE/WS 失效通知和历史窗口审计；没有全系统架构审计、生成链路重构、自动重发或日志 UI 迁移。两仓库均只留本地修改，未 commit、push 或部署。所有测试在合成 HTTP/SSE/WS、排除 `data/` 的后端源码副本、临时 SQLite 和 fake provider 中执行。

### 11.1 实际根因与代码路径

1. `chat-send-controller.finalize` 找到同 ID assistant 后仍把先前的 `executionError` 发布成 `error`；消息 overlay 虽已退出，composer 的“回复状态需要处理”仍残留。只有再次手动刷新才清除。现在同次持久结果完成对账即一次退出临时状态。
2. HTTP 524 在响应头或 `start` 前发生时没有 assistant ID。后端原 `client_msg_id` 仅在进程内 `_recent_client_ids` 关联 user ID（注释称 500ms，但源码没有过期/持久化机制），历史和 WS 不带请求到主回复的可查询关联。不能靠相近时间、相同正文、最新 assistant 补造关系。
3. duplicate ACK 只含 user ID；旧前端把该 user 出现在历史当作本轮生成成功。现在 ACK 只证明用户提交，仍须确认关联 assistant。
4. `SubmissionRecovery` 原来只记 owner/content/attachments，没有执行 ID。524 后暂存提交即使已生成成功仍残留。现在保存本次 `clientMessageId`，只有明确成功的同 conversation/client ID 能清除对应恢复副本，其他恢复项及下一条草稿/附件保留；人工解除未知不产生成功标记。
5. regenerate 在一次成功 HTTP 重读后无条件隐藏 SSE partial；明确失败时 controller 也直接丢掉 partial。现在旧 target 保持服务器内容，本次未保存正文另以既有“结果待确认”临时行保留；成功 receipt 对账后移除临时行。没有给临时行 target 的可操作身份。
6. `useChatSend` 原来在 view 卸载时 dispose 并丢失执行。现在只保留一个应用会话内存 controller，脱离 view 时不把它当服务器 stop；重新进入优先恢复执行所属会话，绑定新的历史 owner，ready 后只读核对。不将正文写入浏览器存储，不恢复发送动作。整页刷新/进程退出仍不承诺保留仅内存 partial。

前端主要路径：`application/chat-send/{chat-send-controller,chat-send-errors,chat-send-result,chat-send-types,chat-regenerate-persistence}.ts`、`application/chat-media/attachment-drafts.ts`、`components/chat-workspace/{useChatSend,chat-workspace-controller}.ts`、`presentation/chat-execution-composer.ts`、`components/chat/ChatView.tsx`。后端主要路径：`routes/chat.py::_persist_send_messages/send_message/get_send_result`、`database.init_db`、新增 `chat_send_receipts.py`。canonical endpoint、Provider、ReplyCommands 和结果 batch executor 未修改。

### 11.2 最小后端补充与权威关系

新增 `chat_send_receipts`，主键 `(conv_id, client_msg_id)`，只保存 user ID 和可空的主 assistant ID，不复制正文、Provider 状态或工具任务状态。user 与 receipt 同一事务提交；主 assistant 与其关联同一事务提交。并发相同 ID 的提交在 SQLite 写事务中去重；重复 ACK 形状不变，不开启第二次生成。幂等身份从进程缓存改为持久且按会话隔离；旧数据不回填猜测关联。

新增只读 `GET /api/conversations/{conv_id}/send-results/{client_msg_id}`，沿用 Chat 路由认证边界，成功 `Cache-Control: no-store`。返回 `conv_id/client_msg_id/user_message_id/assistant_message_id`；SQL 同时核对会话、user/assistant role 和真实行存在。没有记录返回 `404 send_result_not_found`，不代表失败；只有 user 时 assistant 为 null。查询不是执行终态 API，也不代表工具追加任务全部完成。

前端在缺少 `start` 身份或只有 duplicate ACK 时读取关联，再用当前受 owner/sequence 保护的 HTTP history window 核对该 assistant。正常已有 start 的 send 直接使用其 assistant ID。生产 reconciler 返回 assistant 投影，user/system/tool 不可充当完成证据。WS 仍只触发 HTTP 失效重读；不改事件 type/payload/timing，不以 WS payload 建消息或解除未知锁。并发只读恢复合并为一次 finalization，保留既有历史并发保护。

| 证据 | 本次处理 |
|---|---|
| 请求关联的主 assistant 已在 HTTP history 中，正文无既有失败标记 | 服务器内容为权威，controller idle，移除本次错误/未知/partial 和关联 SubmissionRecovery；不需刷新页面 |
| 同 assistant 已保存“部分正文 + Provider 失败” | 显示已保存正文与真实诊断，保持确定失败和原消息操作；不伪装成功 |
| 明确 SSE Provider failure，但消息尚未落盘 | 保留安全失败事实及 partial，同时结果/持久化仍待确认，不能据此假定可重发 |
| HTTP 4xx 明确拒绝（排除 408）、已知 503 provider_not_configured | 保持明确拒绝；不把全部上游失败改成 unknown |
| 524、408、其他未证明拒绝的 5xx、timeout、Abort、网络断开或协议损坏 | 结果未知，先做只读核对；HTTP 状态本身不是后台失败证据 |
| 只有 user、receipt/assistant 缺失、缺少回执的旧服务端、历史查询失败 | 继续未知及锁，不加超时升级，不更换模型/协议/Connection，不自动第二次生成 |
| 无关 AI、工具追加回复或重复/乱序 WS | 可以触发只读核对，不能解除另一执行的错误或 unknown |

普通 assistant 的成功不代表 MCP/搜索/其他后台续写全部结束；后端只关联当前 send 的主回复，不把追加回复改成主回复。已有工具结果、system carrier、parent message ID、命令副作用和消息顺序均沿用现状。

### 11.3 partial、regenerate 与安全边界

SSE partial 继续经过同一 accumulator，保留 Markdown、独立 Thinking/DRIFT 和内部命令过滤，不复制私有 command 到公开正文。send 的对应 HTTP assistant 一旦出现就替换本地 partial。regenerate 不能用相同 target ID 的旧内容假冒本次提交：必须满足同 target start、有效 `persisted` receipt、HTTP 同 ID/content/Thinking/DRIFT；receipt + HTTP 是提交证据，可以消除之前的连接错误及迟到的失败提示。

receipt 丢失时，目标即使变化、甚至恰好与 partial 相同，也不能确认是哪次 attempt 的结果。保留原 HTTP target 和独立未确认 partial；不清普通 send 或其他 target 的错误。明确失败仍不覆盖原 target，失败 attempt 的 partial 暂留到新执行/人工处理。已有 receipt ID 错误和冲突约束不放宽。

保留既有安全上游错误及 `providerFailure`；若历史只保存短错误标记，已收到的安全 SSE 详情仍附于同 ID、内容未变的目标，不因对账缩成通用提示。发现的既有投影缺口留给 PR7-B：HTTP `safeHttpErrorContent` 只识别固定标量字段，最多深度 4、数组前 8 项、文本 1536 字；仅有 type/code/request ID 而无可识别 body 时会回退通用提示；`upstream_message/upstream_status` 等非白名单字段不能完整保留。SSE `error_text` 只接受既有错误前缀，完整 debug/多层 Provider 对象不进入状态；没有新建完整错误对象或日志查看入口。

### 11.4 回归与人工验收边界

- `chat-result-reconciliation.test.ts`：12 条新回归，覆盖正常/未知到持久结果、524/408/502 无 start、只 user、错误角色、缺 history、无关 AI、保留 partial/Thinking、权威失败、短历史错误保留 SSE 详情、并发恢复、regenerate receipt 丢失与成功收尾。
- `ChatView.drafts.test.tsx` 新增两条，验证精确清理恢复项、保留无关恢复/下一轮附件，以及旧成功状态不会误删新拒绝输入；更新旧的错误残留、duplicate-user 假成功和丢弃 regenerate partial 断言。
- `chat-stability-smoke.cjs` 以真实 ChatView 验证桌面/移动端：当前页面清除临时气泡、composer 提示及对应恢复项；保留下一条草稿；无关/重复/乱序 WS、重复 start、正常 send、regenerate 断流+receipt、组件卸载重进均不额外 POST。夹具更新到现有 history window 和单工具直接详情结构。
- 后端 `test_chat_send_receipts.py`：4 条新回归，真实 send 后断开 SSE、迟到持久化与只读查询；进程缓存丢失后的幂等；附件/消息顺序；跨会话隔离；并发相同 client ID/事务回滚；主回复关联不被工具追加回复取代；明确失败内容原样保存。
- 相关现有后端 suite 共 148 条通过：canonical regenerate、Chat stability、send frozen binding、command runtime、Chat defaults、Thinking defaults 和新会话携带上下文。
- 前端全量、build 和浏览器最终结果见本节末的验收记录。浏览器使用全新隔离 profile，后端仅临时 DB/config/fake provider。

真实环境仍需人工验证 Cloudflare 524 的断开时点、反向代理/浏览器取消、后台进程重启、真实 Provider 无终态 EOF 和设备重连时序。没有 receipt 的旧请求及丢失 regenerate receipt 继续保守未知；部署顺序需先提供后端关联能力，旧后端前端仍安全降级未知。仅内存 partial 无法跨整页刷新或进程退出恢复。真实上游未接入本轮测试。


最终验收记录（PR7-A）：`npm test` 162 个文件、2148 条通过；`npm run build` 通过。隔离后端上述 8 个 suite 合并执行 148 条通过。`chat-stability-smoke.cjs` 桌面与移动端均通过；`chat-pr6-5-config-smoke.cjs` 在 320/390/1280 宽度通过；`chat-pr6-5-carryover-e2e.cjs` 通过真实 Chat UI → 临时 FastAPI/SQLite 的 carryover=0/4/50、新建会话导航与刷新、首发持久化和第二次发送不重复携带。临时测试依赖、日志、截图位于 `/private/tmp/penumbra-pr7-*`，未运行私人数据库或真实 Provider。


## 12. PR7-A Follow-up：冻结请求，不冻结 UI（2026-10-27）

本轮只调整 Main Chat 的执行所有权、导航/配置锁与恢复入口；AionHome 业务源码、消息事务、WS payload/timing、工具副作用、canonical target/receipt/HTTP 契约均未修改。前端原本把同一执行总锁重复用于 `ChatView.executionGuard/navigationLocked/managementLocked`、Workspace `canNavigate`、设置 hook `canEdit` 和 Composer error；其中返回首页、阅读其他会话、保存后续请求配置并不与已冻结请求冲突。

### 12.1 原因、隔离与保留的局部锁

不能只移除 disabled：PR7-A 的单个 session controller 绑定“当前选中 Workspace”的历史重读，切到 B 后 A 的 finalization 会失去 owner，并把 A 的活跃/未知状态带到 B。现在 `chat-execution-sessions.ts` 按 conversation ID 保存 controller；`useChatSend` 只投影当前会话，输入/回调也按提交时 owner 取状态。同一会话的 send/regenerate/unknown 继续互斥，A/B 由用户显式发起的请求可独立运行；导航、重入和对账不调用新的生成 POST。

当前 owner 的历史核对沿用原 Workspace sequence/AbortSignal。非当前 owner 或已卸载 view 使用 `chat-background-reconciliation.ts` 的独立只读 window，结果不发布进 B 的 Workspace、不移动 B 的阅读窗口。canonical 按自己的 target 读取 anchor 并核对原 receipt，不能用目标内容变化猜测成功。会话切换/重连/WS 失效通知、重新进入、online/focus 会触发安全只读核对；没有无限轮询、超时升级失败或自动重发。未知仍只在服务器证据足够时解除。

| 操作 | Follow-up 规则 |
|---|---|
| 返回桌面首页 | send、regenerate、工具追加、finalization、unknown、配置写入期间都允许；返回按钮始终表示回首页，搜索另有关闭入口；离开不 Abort SSE 或服务器生成 |
| 切换会话、阅读、搜索、复制/放入下一条草稿 | 不再受生成/设置保存总锁限制，A 的 partial/error/unknown 不投影到 B；结构性会话 CRUD 提交期间仍按原 Workspace owner 完成后再切换 |
| 更改后续请求的模型/协议/连接、保存五项 Chat Settings | 生成期间允许；模型写入原子 readback、失败后的 readiness 回退、字段版本、CAS 和旧 scope 响应隔离不变 |
| 启动新 send/regenerate | 同一会话已有执行或 unknown 时禁止；配置/save/readback 尚未确认时，新的请求等本地提交边界完成，已有请求不受影响 |
| 新建、重命名会话 | 不再因生成而禁用；沿用原 Workspace mutation 防重入 |
| 删除会话 | 只禁止删除仍有该会话 Main 执行/unknown 的 owner，菜单和提交回调都校验；不能删除当前 target/恢复凭据。没有把别的会话一起锁住，也没有声称前端能枚举全部后台工具任务 |

执行、会话原文草稿、上传附件及暂存提交保存在应用会话内存。`chat-draft-session.ts` / retained attachment store 保证返回首页再进入时下一条草稿与附件仍在，A/B 不混用；没有新增浏览器持久化或跨整页刷新恢复保证。

### 12.2 后端快照核对

已针对性核对 `routes/chat.py::send_message/regenerate_target_message`、`ReplyCommands.dispatch`、`_follow_up_generation_kwargs`、canonical 的 `commit_replacement`。Main 的 `ResolvedGenerationRequest` 在 preflight 捕获 binding/options，后续 stream 和工具结果续写传递同一父请求对象。前端模型写入仅更新 Main selection，不改 canonical 消息快照；保存 Temperature/Thinking 等不会热更新已经捕获的对象、不重新开始生成。模型持久化、readback 和设置 CAS 均保留。

冻结边界是**后端 preflight 已捕获的请求**。Temperature、Thinking、context/fast/whisper 等生成 options 属于快照。首次携带数量按原 send 的早期捕获时机使用。`float_interval` 是全局运行策略，在 Main 上下文准备后段仍读取当时 SETTINGS；本轮没有提前冻结它，也没有改变后台主动任务/辅助模型的原策略。设置失败只保留该字段编辑及错误，不改变本次生成的 accumulator、receipt 或结果。

### 12.3 三类恢复与点击次数

- **已提交 User + 明确失败 Assistant**：安全错误和持久正文留在原消息，显示一个可见的“重新生成”主按钮；一次点击直接 canonical regenerate，无需恢复输入或人工核对。失败后可再次点击；成功按原 ID/receipt/HTTP 替换。旧的悬浮重复 regenerate 图标和 Composer“回复状态需要处理”不再叠加。非最新/不合格或配置未就绪时说明真实原因，不展示永远禁用的主按钮。`acceptedSend` 证据会清理同 client ID 的暂存提交，明确失败不会被误当作未提交输入。
- **有应用层未接受证据的拒绝**：`rejectedSubmission` 保留原输入/附件身份，直接回到可编辑 Composer；原上传 URL 恢复，下一条独立草稿/附件沿用原分离逻辑。没有新建临时 AI 错误气泡或要求“恢复提交”。修正配置/文字后，点击原发送按钮一次，才发起新的显式请求；不会自动重试。
- **结果未知**：一条“回复结果待确认”及一个直接的“重新核对”入口（一次点击、只读）。原请求对应的 SubmissionRecovery 保存在底层但不再与状态提示并排显示，不暴露“已核对历史，返回编辑”来绕过未知执行。通常 WS/重连/重新进入会自行完成核对，用户无需点击。其他不相关的暂存提交仍可独立处理。

已有 user 但 assistant 仍未确认时，现有 send 回执/幂等只能防重复提交，不能安全启动已接受请求的第二次生成；canonical 也需要合格的持久 assistant。缺少“按原执行身份原子判断停止/接续、且不重放工具副作用”的恢复契约，因此本轮不提供再次生成按钮。丢失 canonical receipt 同样不能凭内容变化解锁。

### 12.4 HTTP 4xx 接受证据

删除“所有非 408 的 4xx 都明确失败”的推断。`chat-send-rejection.ts` 只接受已核对源码的应用 preflight 响应：认证中间件 401 的 `error=未登录`、send 的明确会话不存在、已知参数/配置错误码，以及 canonical 对应的目标拒绝码；HTTP status 与 endpoint kind 必须匹配。499 即使携带相同错误码也不在白名单。裸 400/401/403/422/429、408、499、代理 HTML、普通 Provider HTTP 错误对象均保守未知；安全上游细节继续保留，HTTP 失败不等于生成失败。新/未识别格式也只读核对，不猜测未提交。

### 12.5 回归记录与剩余验收

新增 `chat-execution-sessions.test.ts` 覆盖 A/B 独立 stream/finalization、防重复提交、499/裸 4xx、已证明拒绝及原输入身份。更新旧的“生成时不能导航”和“未知状态必须手动恢复”断言；暂存提交成功/明确失败两种接受证据都测试精确清理。

`chat-pr7-interaction-smoke.cjs` 使用真实 ChatView、合成 HTTP/SSE/WS 和隔离 Chrome，在 1280/390 宽度验证：生成时回首页/卸载重进，独立草稿和上传附件保留；A 生成时阅读搜索 B 并显式发送 B，A 的迟到结果不覆盖 B；流中修改模型/协议及全部五项设置、保存失败不重新 POST；确定失败一次点击 canonical，连续失败后成功；拒绝后原文/附件直接编辑；499/524 未知离开重进、B 阅读后按精确回执自动恢复，无额外 POST。浏览器捕获后续请求配置，后端 frozen-binding/follow-up suites 验证真实冻结契约，两者不混淆。

仍需真实环境验收反向代理 499/524/断网时序、真实 Provider 长流、跨设备并发和延迟工具追加；同一会话未知无法安全再生成、canonical receipt 丢失、跨整页刷新内存 partial/草稿不恢复的边界仍在。本轮未改 PR7-B 日志或 PR7-C Thinking 内容展示，未重构 Settings。没有读取私人生产数据，未 commit、push 或部署。


Follow-up 最终验证：前端 `npm test` 163 个文件、2159 条通过；最后的 owner 回调补验 14 条通过；`npm run build`（含 TypeScript）通过。隔离后端上述 6 个 frozen-binding / regenerate-follow-up / defaults / Thinking / carryover / send-receipt suites 合计 100 条通过。新交互 smoke 在 1280/390 宽度通过；原稳定性桌面/手机、PR6.5 设置 320/390/1280、真实 UI → 临时 FastAPI/SQLite 的 carryover 0/4/50 均通过。日志保存在 `/private/tmp/pr7-followup-*`；AionHome 业务仓库无本轮改动。没有 commit、push 或部署。


## PR7-B：日志迁移实施状态（2026-10-27）

系统日志和受控的实际模型请求查看已本地实现，见[实施报告](./chat-pr7-system-log-implementation.md)。本轮只在传输边界观察诊断，未修改 PR7-A receipt、30 秒超时修复、User 去重、A/B sessions、导航、冻结 binding/options、canonical persisted/HTTP 对账或工具重试。普通 debug 不再广播旧 Prompt；真实请求另走有界、登录/页面隔离的临时交接。HTTP type/code/request ID 无 message 时及 upstream_message/upstream_status 的安全详情已补入日志投影；未放宽为任意错误对象。Thinking 展示仍留 PR7-C。
