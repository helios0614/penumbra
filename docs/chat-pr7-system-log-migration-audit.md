# Chat PR7-B-A：旧系统日志迁移专项审计

> **实施状态（PR7-B）**：核心迁移、必要修复及详情 UI 整理已在本地完成，最新交付、测试和部署/旧 Chat 兼容边界见[实施报告](./chat-pr7-system-log-implementation.md)。普通诊断改为字段阅读，Provider metadata 保留 JSON，私人请求分组保持实际协议顺序。下文保留 PR7-B-A 的只读基线；新需求已授权受控私人请求详情查看真实 Prompt/HEART/DRIFT，旧 `debug_prompt` 仍不迁移，由最终 HTTP JSON 边界快照取代。普通日志继续遵守安全摘要边界。

审计日期：2026-10-27。源码基线：Penumbra `e772959`，AionHome `bbe4bfc`，包含 PR6.5、PR7-A 及其会话导航 follow-up。本轮只读业务源码，仅新增本文；不 commit、push 或部署。AionHome 工作区已有的备份部署相关修改未触碰。

**建议延续旧日志的会话内列表、摘要、按需展开、复制和清空，补齐 Penumbra 的诊断适配；不建立新日志存储或生成状态机。** 需要单独处理的真实问题是私有内容投影、快速模式漏日志、canonical regenerate 的身份与诊断差异，以及错误详情在投影中丢失。

## 1. 旧系统实际功能与交互

- 入口在旧 Chat 侧栏底部“系统日志”；PC 与手机使用同一弹窗。打开时仅重绘内存数组，没有日志 GET、轮询或“刷新”请求。关闭不清空；“清空”只清本页；整页刷新会丢失即时诊断。
- `systemLogs` 是页面级数组，跨会话共用。新记录 `unshift`，时间是浏览器**收到记录**时的 `HH:mm:ss`，不是请求开始或服务端完成时间；没有条数上限、时间范围、分页或筛选。
- SSE 的 `debug` 经 `renderDebugBar()` 写入日志；WS 的有消息 ID 的 `debug` 只在 `!streamingAiId` 时写入。无消息 ID 的后台错误直接入表。send/regenerate 的前端异常经 `addErrorToSystemLog()` 入表。
- 同一 `msg_id` 合并；无 `msg_id` 时按 `task_id` 合并，保留最初时间和较完整的 `api_response`。这是有效的 send 双通道合并，不能直接套到复用目标 ID 的 canonical regenerate。
- 行摘要有时间、模型键、协议、输入/输出/总 Token、非零缓存读写、RAG 召回数量和错误标记。只有 `has_error` 二值标记，没有“生成中/已完成/结果未知”的生命周期展示。
- 一级详情包含错误文本、Anthropic 非正文返回 JSON、即时哨兵判断、话题/关键词/查询句、Top6 分数、实际 RAG 召回、生活速记、Prompt 投影。返回 JSON 有二级收起/展开和“复制返回 JSON”，成功/失败有反馈；**没有专用“复制错误”操作**。
- 新错误使侧栏按钮闪红；打开或清空会清除提醒。每次重绘替换全部列表 HTML，已展开详情会收起；合并分支提前返回，不重新触发错误提醒。
- 后台失败有例外：WS 连接建立后会重放数据库中的失败/取消任务，所以刷新后可能重新出现。旧“刷新后清空”只适用于即时诊断，不能覆盖全部来源。

证据：[旧入口与弹窗](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:1139)、[WS 分支](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:2578)、[`addSystemLog` 与前端错误](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:3151)、[列表及详情](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:3287)、[返回 JSON 与复制](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:3372)、[打开/关闭/清空](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:3607)。

**不能根据死代码认定已有能力：** `_buildTokenDetailHtml()` 和 `_buildApiPayloadHtmlLegacy()` 没有活动调用点。旧 UI 没有独立的原始 usage 详情面板，也没有展示完整实际发送 payload。当前 `api_payload` 已是 `_safe_provider_payload_summary()` 的无正文摘要；`renderDebugPrompt()` 则确实被调用，但只是每条最多 2000 字的历史投影，标题“完整 Prompt”并不准确，也不等于最终 Provider wire input。

## 2. 真实数据流、字段与保留范围

### 2.1 即时诊断与持久数据是不同来源

普通 send：`send_message()` 冻结 `resolved_request` → 本轮召回/上下文选择 → `stream_ai(..., usage_meta, binding=...)` → Provider adapter 填充 meta → assistant 落库并关联 send receipt → 原有副作用/收尾 → 构造 `debug_data` → SSE 队列与 WS `debug`。Anthropic `api_response` 只加入请求本地 SSE 副本，不扩大 WS 返回。

legacy regenerate 的诊断结构基本相同；canonical regenerate 使用独立的目标替换流程，日志字段更少。**诊断产生晚于消息保存，而且收尾异常可能阻止诊断到达；“没看到日志”不能证明没有生成或没有持久化。** 客户端断开只结束 SSE 转发，普通 send 后台任务继续运行。

证据：[`send_message` 入口](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1310)、[Provider 调用与两类 renderer](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2190)、[assistant 与 receipt 同事务](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2606)、[`debug_data`](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2733)、[断开后的 SSE 转发](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2821)、[legacy regenerate](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:6136)。

| 来源 | 保存/恢复行为 | 对迁移的含义 |
| --- | --- | --- |
| SSE/WS `debug`、前端网络错误 | 浏览器会话内，没有系统日志表或查询接口；不补发已错过的普通 debug | 保留临时诊断，不虚构“刷新历史日志”按钮 |
| `messages`、`chat_send_receipts` | SQLite 持久化；receipt 只保存 user/primary assistant 身份 | 可确认同一 send 的持久结果，不能恢复完整 usage/召回/错误对象 |
| `append_reply_tasks` | SQLite 保存 source、conv、status、attempts、reason、时间；WS 重连重放 failed/cancelled；重启恢复中断任务 | 复用现有安全失败摘要和 `task_id` 去重；不是所有成功生成的日志库 |
| `cache_metrics` 与缓存指标文件 | `record_cache_metric()` 异步保存 usage、错误标记/文本等；另有缓存统计 API | 旧系统日志没有读取它；不改为从指标库重建日志，不把成本/TTL 估算当实际 usage |
| 服务端日志、Provider provenance | 包含诊断编号/堆栈位置或独立观测数据 | 不是旧日志列表来源，本轮不接入、不扩展为监控平台 |

证据：[`chat_send_receipts`](/Users/remix/Desktop/AionsHome-main/aion-chat/chat_send_receipts.py:8)、[`append_reply_tasks`、分页重放与重启恢复](/Users/remix/Desktop/AionsHome-main/aion-chat/append_reply_runtime.py:56)、[WS 重放入口](/Users/remix/Desktop/AionsHome-main/aion-chat/main.py:468)、[`record_cache_metric`](/Users/remix/Desktop/AionsHome-main/aion-chat/cache_service.py:35)。服务器重启不清浏览器已有数组，但不会恢复普通即时诊断；数据库和任务回执可跨重启保留。

### 2.2 字段到底代表什么

| 字段/信息 | 实际来源与限制 | 迁移规则 |
| --- | --- | --- |
| `_ts` / `_id` | 旧前端生成的接收时间和 UI ID；后台回执另有 `created_at`，其值实际取任务 `updated_at` | 即时记录标接收时间；回放用回执时间，保留来源；不能写成生成耗时 |
| `model` | 主路径来自 `main_selection.model`，不是返回模型，也不等于 Connection 名称 | 保留请求模型；如展示返回模型，单独取已收到的安全 response metadata，不互相覆盖 |
| Connection / Provider | 旧列表没有独立字段。后端 frozen binding 有 `profile_id/connection_id/backend_model/protocol/transport_kind`，debug 没完整投影 | 不从模型字符串拆解，不回读当前选择冒充当轮选择；没有就显示未提供 |
| `api_format` | Provider adapter 写入 `openai/anthropic/gemini`；canonical regenerate debug 未带此字段 | 保留实际已报告格式；缺失不默认 OpenAI。binding 协议与实际响应来源需区分 |
| `usage` | `_usage_meta_for_debug_event()` 只投影 Token/缓存计数字段 | 复用现有计数，不迁移完整 meta |
| 输入/输出/总 Token | OpenAI adapters 读取响应 `usage`；Anthropic 读取 message_start/message_delta 等 usage，跨事件保留已有值，总计为输入+输出 | 来自 Provider 的计数，不是本地 tokenizer 估算；但 null/部分缺字段会被归一成 0，不能声称全部精确或完整 |
| 缓存读/写 | Anthropic 等 adapter 从实际 usage 归一；部分 OpenAI adapter 只保存三项总数，未把原始 cached_tokens 投入 debug | 有值才展示；无字段不等于未命中。Anthropic 总计沿用现行归一口径，缓存读写单列，不重新定义账单总量 |
| `recalled_memories` | 本轮 RAG Top6 经阈值 0.38、去重、最多 5 条筛选后的 `recalled`，按创建时间排序；未带 memory ID | 可对应本轮选择；不是核心/背景/闪现/日记等所有注入记忆总数，也不能逐条链接记忆实体 |
| `debug_top6`、查询/关键词 | `recall_memories()` 的候选与 instant digest；候选正文旧版截到 100 字 | 保留评分诊断；标明候选与实际召回区别，不声称候选都送入模型 |
| `quick_notes` | 本轮 `qn_rows` 的日期、时段、output 投影 | 保留来源明确且通过安全投影的速记；不是再次读取“最新速记” |
| `has_error/error_text` | 普通/legacy 路径依据 Provider 错误、异常或空正文等设置；`error_text` 可能含“部分正文+错误”的整个 `stripped` | 只取错误段及安全字段，不能把全部 error_text 当安全错误对象 |
| `api_response` | `_anthropic_response_metadata_event()` 排除 content block 事件与 message.content，其余字段保留；仅部分 SSE 路径提供 | 保留返回诊断/复制交互，但“非正文”不自动等于已完成凭据/私有内容过滤 |

证据：[`RuntimeLLMBinding`](/Users/remix/Desktop/AionsHome-main/aion-chat/runtime_llm_resolution.py:108)、[usage 与 response 投影](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:383)、[OpenAI usage](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:968)、[Anthropic usage](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:1835)、[归一化与 metadata 事件](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:534)、[RAG 实际选择及 debug](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1850)、[速记投影](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1802)。

### 2.3 路径覆盖，不能把“有 assistant”当“有完整日志”

| 执行路径 | 当前诊断行为 | 结论 |
| --- | --- | --- |
| Main send，Anthropic/OpenAI，canonical/legacy renderer | 最终都进入现有 `stream_ai`/adapter 和 send debug；canonical renderer 改消息构建，不另建日志。旧 debug_prompt 仍是历史侧投影 | 主要可复用；不能把旧 Prompt 视为 canonical 最终输入 |
| legacy regenerate | 新 assistant ID，完整旧 debug，Anthropic SSE 有返回 metadata | 沿用字段；快速模式存在下述缺陷 |
| canonical regenerate 成功 | `start.id` 为原目标 ID；commit → WS msg_updated → SSE persisted → 原副作用 → SSE debug。debug 有模型、usage、少量 context.debug | 没有 `api_format/api_response`、具体 recalled/top6/quick_notes；不广播完整 WS debug；缺字段是路径差异 |
| canonical regenerate 失败 | SSE error/chunk/debug；debug 只有目标 ID、has_error、error_code，安全真实原因可能在前面的 chunk | 失败不替换原目标；不能展示原目标 usage 当本次 usage，也不能仅凭该 debug 恢复完整原因 |
| Camera/Location/Activity/Alarm/Monitor 主动回复 | 已接 `diagnose_reply(managed=True)`/`stream_reply`；成功没有统一的 debug usage/召回行；失败有持久任务通知 | 复用失败回执；“全部主动生成都有详细系统日志”不成立 |
| MCP/Web Search/POI/Route/Camera/Activity/Location 结果续写 | `_perform_mcp_round()` 收集本轮 meta、持久化工具事实和续写 assistant；成功没有普通 send 那样的 debug；失败可保存带安全错误的 assistant，再由 owner 发布 task 失败摘要 | 工具成功与续写失败是两件事实。task_id 与失败 assistant ID 没有完整公开关联，不能自动合并 |
| 直接 HTTP 预检拒绝 / duplicate ACK | 拒绝发生在 Provider debug 前；旧前端 catch 可记错误。duplicate 返回已保存 user 身份，不发起新生成 | 前端记录拒绝；ACK 不是新的 Provider 调用或完成证明 |

证据：[`stream_ai` 统一 binding/transport 入口](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:2419)、[canonical context.debug](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:3468)、[canonical failure](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:3671)、[canonical persisted 顺序](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:4230)、[canonical success debug](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:4291)、[续写 finalizer](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:4569)、[续写失败 assistant](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:3538)。主动路径调用点：[`camera._call_core`](/Users/remix/Desktop/AionsHome-main/aion-chat/camera.py:627)、[Location](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py:1084)、[Activity](/Users/remix/Desktop/AionsHome-main/aion-chat/activity.py:1182)、[Schedule](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py:394)。

## 3. 旧功能迁移矩阵

“直接迁移”指行为/契约可用，仍需用 React/Penumbra 组件实现，不复制旧 HTML/CSS。按下面 **18 项已有能力**计：4 项直接迁移、8 项轻量适配、5 项必要修复、1 项无需迁移；即 **12/18 项只需迁移接线与展示，另外 5 项局部修正后保留，1 项因隐私边界排除**。这不是代码复用率。

| 旧功能 | 旧前端行为 | 后端来源 | Penumbra 现状 | 建议处理 |
| --- | --- | --- | --- | --- |
| 1. 侧栏入口、日志 Dialog | 打开/关闭同一列表 | 无请求 | 无入口 | **轻量适配**：桌面侧栏底部、手机会话抽屉同入口 |
| 2. 实时收集、关闭保留、跨会话列表 | 非弹窗打开期间也收集 | SSE/WS debug | SSE 仅执行摘要；WS debug 为 unknown | **轻量适配**：现有通道投影至页面会话内 store |
| 3. 条数与空态 | 全部本页记录计数、暂无日志 | 本页数组 | 未实现 | **直接迁移** |
| 4. 手动清空 | 清本地列表和提醒 | 无后端删除 | 未实现 | **直接迁移**；重连仍可能重放任务失败，不能称删除服务端日志 |
| 5. 接收时间、最新在前 | unshift、HH:mm:ss | 本地时钟；回放另有时间 | 未实现 | **必要修复**：区分回放时间；旧回放先按服务端倒序发送再 unshift，会逆序且显示成当前时间 |
| 6. 模型名 | 原样显示模型键 | `main_selection.model` | 执行 mapper 有 modelKey | **轻量适配**；缺失为未提供 |
| 7. 接口格式标签 | 缺失默认 OpenAI | adapter `api_format` | SSE mapper 丢弃 | **必要修复**：保留实际值，缺失显示未提供；canonical 在原 debug 小范围补齐 |
| 8. 输入/输出/总 Token | 三项摘要；空值可能成 0 | Provider usage 投影 | 已有三项安全摘要 | **轻量适配**：保留原口径；明确缺失与非完整 usage，不伪造计数 |
| 9. 缓存读/写 | 非零 chip | usage cache 字段 | mapper 丢弃 | **轻量适配**：恢复现有字段，无需重写计量 |
| 10. RAG 实际召回数量/内容 | 条数、score/type/content | 本轮 `recalled` | mapper 丢弃，canonical 未投影 | **轻量适配**：保留安全子集；缺失是未提供，不能显示零召回 |
| 11. 哨兵、话题、查询、Top6 | 详情按需看候选评分 | 本轮 digest/recall | 大多未消费 | **轻量适配**：按路径保留已有数据；数值缺失不直接 `.toFixed()` |
| 12. 生活速记详情 | 日期、时段、output | 本轮 qn_rows | 未消费 | **轻量适配**：安全字段投影，不重新查询 |
| 13. 错误标记、真实错误文本 | 标红、详情文本 | debug/error chunk/前端 catch | 已有有限错误文本与反馈 | **必要修复**：保留安全真实原因；补 mapper 丢失，禁止展示整个 stripped |
| 14. Anthropic 返回 JSON、收起与复制 | 一级详情内二级展开、复制完整投影 | 请求本地 `api_response` | 未消费；已有共享 JsonViewer | **必要修复**：现有 metadata 还需安全允许字段投影，再接共享 Viewer；没有返回对象时不制造 |
| 15. 同事件合并、保留较完整详情 | 优先按 msg_id，再 task_id | SSE/WS 双通道、任务重放 | 无日志 store | **必要修复**：send 合并保留；regenerate 改 execution 粒度；无关联证据不合并 |
| 16. 详情总开关 | 默认收起、点击展开 | 本地 UI | 现有 disclosure/Dialog 可复用 | **直接迁移**；用稳定 key 保留展开，不每次事件重置 |
| 17. 未读错误提醒 | 新错误闪红，打开清除 | 本地 has_error | 无日志提醒 | **直接迁移**行为；用语义色小点替代持续闪烁，合并升级失败也要提醒 |
| 18. “完整 Prompt”详情 | 截断历史，可能拼 HEART/DRIFT | `debug_prompt` | 安全 mapper 已丢弃 | **无需迁移**：与本轮明确隐私要求冲突；保留安全 prompt_count，不读取/复制正文 |

Connection 展示、专用错误复制、生命周期状态、跳转消息、最近失败定位并非旧版已具备的独立功能，作为可选增强另列于第 6 节。无证据支持将旧系统日志整体判为退役。

## 4. 新 Chat 与 PR7-A 的必要适配

### 4.1 接通诊断，不更换执行与恢复机制

Penumbra `mapChatExecutionEvent()` 当前把 debug 收敛成 `debug-summary`，仅保留 `messageId/modelKey/hasError/failureCode/error` 和三项 usage；`safeUsage()` 没保留 cache 字段，recall、api_format、api_response 都被丢弃。`safeFailureText()` 仅接受已知错误前缀的后缀。WS `mapRealtimeEvent()` 未处理 debug，coordinator 忽略 unknown。

建议增加**独立的安全日志投影/观察出口**，接在现有 SSE/WS 解析边界；保留现有 execution reducer 输入语义。日志不能因可选详情格式错误而中断 SSE、触发请求失败或阻止 HTTP 对账。继续共用一条现有 WS，不新开日志 socket，不把 WS debug 构造成 Message。日志 store 跨 Dialog 开关/会话切换保留，SPA 返回 Chat 时不重复订阅；只承诺当前页面会话及已连接期间的事件，不承诺离开 Chat 后覆盖所有后台成功诊断。

证据：[`mapChatExecutionEvent`](/Users/remix/Desktop/Penumbra/src/application/chat-execution/chat-execution-events.ts:114)、[`safeUsage`](/Users/remix/Desktop/Penumbra/src/application/chat-execution/chat-execution-events.ts:296)、[`mapRealtimeEvent`](/Users/remix/Desktop/Penumbra/src/application/realtime/realtime-events.ts:9)、[coordinator 的 unknown 分支](/Users/remix/Desktop/Penumbra/src/application/chat-realtime/chat-realtime-coordinator.ts:288)、[跨会话执行 sessions](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/useChatSend.ts:23)。

### 4.2 身份关联的能力与硬限制

- 本页 send 可以使用现成 `executionId = execution:<client_msg_id>`、提交时 conversation、SSE start assistant ID；丢 start 时仍由 PR7-A 的 `readChatSendResult()` 与 HTTP history 确认，日志只接收现有结果，不再发起另一套恢复。
- canonical regenerate 每次已有独立 `execution:regenerate:<uuid>`，但目标 `message_id` 不变。每次执行各一条；不能按目标 ID 覆盖原 send 或上一次 regenerate。SSE persisted+既有 HTTP 核对仍是成功依据，失败保留原目标的规则不变。
- WS 普通 debug 常只有 msg_id，没有 conv_id/client_msg_id/执行类型/attempt ID；旧 task 回执有 task_id/conv_id，但没有对应失败 assistant ID。仅能对**已有确切映射**做关联；未映射事件保留“未关联”，不能按接收时当前会话、时间相近、最新 Assistant 或 ID 后缀推断。
- send receipt 只指向 primary assistant，不能套给 MCP/Web 等后续 assistant。重启/刷新不会恢复本地 execution ID；没有服务端 attempt 身份就不能精确拆分历史上针对同一目标的多次 regenerate。

证据：[`executionId` 创建及 start 校验](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-controller.ts:275)、[send 本地身份](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-controller.ts:389)、[regenerate 本地身份](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-controller.ts:475)、[`readChatSendResult`](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-result.ts:12)、[后端 receipt GET](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1298)。

### 4.3 错误与结果语义

| 情况 | 日志可记录的事实 | 不可推断的结论 |
| --- | --- | --- |
| 明确应用预检拒绝 | 现有 `isDefiniteChatRejection()` 的拒绝、HTTP status、安全详情 | 不是一次 Provider 生成失败 |
| Provider 返回非 2xx / SSE error | `provider_request_failed/provider_execution_failed`，真实安全原因和可用 usage | HTTP 状态本身不能翻译成唯一原因；不同 403 应保留不同上游说明 |
| 浏览器收到代理 524/408/502、断网/断流 | 连接/HTTP 观察事实，现有 session 的结果未知；后续可接既有权威对账结论 | 不能直接标执行失败。Provider 自身返回 524 并被后端投影为 Provider failure，是另一来源 |
| 部分正文后 Provider 失败 | 保留“收到部分输出”与安全错误；最终状态沿同一执行的对账 | 不复制正文/Thinking 作错误详情，不把断流自动当 Provider failure |
| 已持久化失败 assistant | 主 send 通常有同 ID debug 和历史错误文本；刷新后可保留历史内已有说明，但 usage/原始对象未必可恢复 | 不能承诺每条失败 assistant 都有完整独立诊断对象 |
| 工具成功、最终续写失败 | 保留已完成工具事实、失败 assistant；后台 task 摘要为独立来源 | 不能把工具成功写成整轮成功，也不能把 Main send 成功覆盖成续写失败 |
| debug `has_error=false`，或只看到 msg_created | 原诊断未报错/消息变更通知 | 不单独作为请求已完成依据；WS 只触发现有 HTTP 重读 |

现有 `toSafeChatExecutionError()`、`isDefiniteChatRejection()`、`performFinalization()` 已实现上述区分。日志沿用结果，不改冻结 request/binding/options、会话锁、结果未知解除条件或自动重发策略。

证据：[HTTP/网络错误投影](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-errors.ts:24)、[明确拒绝边界](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-rejection.ts:6)、[持久失败对账](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-controller.ts:155)、[工具事实与失败续写持久化](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:3538)。

## 5. 已证实问题与最小修复

| 问题、影响 | 最小建议 | 范围 |
| --- | --- | --- |
| **私有内容边界**：`debug_prompt` 按开关显式拼 HEART/DRIFT；`error_text` 可能混部分正文；Anthropic metadata 只是去正文，并非通用安全对象。直接交给 JsonViewer/复制会扩大暴露 | 日志 DTO 白名单；排除 prompt_messages、历史、HEART/DRIFT/Thinking、binding/headers/config。错误只保留既有安全投影；response metadata 再做允许字段投影/脱敏。普通召回/速记只保留允许的业务展示字段，不附原始来源上下文 | 前端投影；需要保留可复制复杂详情时，在后端现有诊断投影处做小补丁 |
| **快速模式漏日志**：send/legacy regenerate 的 `debug_qn=[]` 仅在 fast_mode 的 else 内赋值，后台 debug 无条件读取；生成已落库后可发生未绑定变量异常，导致 debug 不发出 | 将空 debug_qn 初始化放到分支前；仍让 fast_mode 跳过召回，不补查速记 | 后端 routes/chat.py 两处；源码 AST 已确认赋值/读取作用域 |
| **canonical regenerate 诊断不齐**：成功缺协议/返回 metadata/具体召回，失败 debug 缺模型/usage/原因。旧 UI 把它显示成 OpenAI、零召回且按目标 ID 合并 | 原 debug 增补已存在的 request-local 安全字段；无需再次召回/调用 Provider。失败取已有安全错误段；无数据明确未提供。本地 execution 区分每次 regen | 后端只补原 SSE debug；前端适配。具体召回详情补齐可后移，不伪造零 |
| **安全上游详情仍会丢失**：后端已有 JSON 白名单与脱敏，但当前通常转成字符串，并未把完整安全 diagnostic 对象传给前端；前端 `safeHttpErrorContent()` 要有已识别 body 才附 type/code/request ID，丢弃 upstream_message/upstream_status 等未知字段；SSE 前缀过滤也会丢非标准诊断 | 复用 `_anthropic_error_diagnostic/_project_provider_error_json/_anthropic_client_error_detail/_redact_provider_error_text`，仅按真实 fixture 补允许的错误语义字段；如保留结构对象，沿 request-local meta → 现有 SSE debug 增加可选安全诊断。前端 HTTP 投影补无 message 的元数据情况，继续拒绝 raw HTTP/proxy body | 前后端定点修复；不建错误码翻译表，不放宽为任意对象序列化 |
| **回放时间/顺序与 msg_id 去重**：回放误写当前时间，重放倒序被 unshift 反转；canonical 多次执行互相覆盖 | 按来源处理时间、task_id 去重；本地按 executionId 归档。只有确切的 send 跨通道身份才合并；合并保留已有非空安全详情 | 前端 store；不新增服务端 attempt 存储 |
| **旧 WS 全局 streaming gate 会漏无关后台 debug**；新前端目前完全忽略 debug | 在既有 WS consumer 加安全日志分支，不用“当前是否 streaming”过滤其他记录；未知字段只影响该条诊断 | 前端；WS 事件 type/payload/timing 不变 |

安全投影的现有优势应保留：后端 HTTP 错误正文读取上限 4096 bytes，JSON 最大深度 4、数组前 8 项；已知字段/配置 secret 脱敏，客户端文本有限长。它保留真实原因，但**不是任意上游对象的安全通行证**：允许字段里的自由文本仍可能回显请求，不能因为键名是 message 就直接复制。含私有标记或可识别请求/配置回显的字段应舍弃并注明隐藏，不扩大通用 allowlist。错误对象未提供时展示已有安全文本和“详情未提供”，不重发请求补抓，也不将服务端 traceback/locals 发给 UI。

证据：[旧 Prompt 私有拼接](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1921)、[fast_mode 分支](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1694)、[`debug_qn` 分支内初始化](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1803)、[legacy 同类问题](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:5440)、[后端安全错误投影](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:184)、[HTTP 错误读取及客户端格式化](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:296)、[前端安全错误投影](/Users/remix/Desktop/Penumbra/src/domain/message/assistant-failure.ts:25)。[PR7-A 已记录的投影缺口](/Users/remix/Desktop/Penumbra/docs/chat-stability-audit-and-fix.md:203)与当前源码一致。

## 6. 少量补充功能的取舍

| 候选 | 旧版已有程度 | 实际收益、是否改后端 | PR7-B 建议 |
| --- | --- | --- | --- |
| 快速展开详细错误 | 已有行内“详情”与错误文本 | 保留一个展开动作即可；无须新后端查询 | **直接保留**，不用另建错误弹窗 |
| 复制安全错误详情 | 只有 response JSON 复制，没有专用错误复制 | 排查可直接分享安全投影；文本可纯前端，结构对象需上节小补丁 | **可选增强，值得顺带做**；复用 JsonViewer/共享复制反馈，不阻塞列表迁移 |
| 生成中/已完成/失败/结果未知 | 原来只有错误二值；task 自带终态 | 本页有现成 session 状态，避免把连接失败当生成失败；纯前端只读观察可做。后台成功无完整诊断，刷新无 execution 恢复 | **可选增强**；最低必须正确标错误来源/未知，完整四态列表不作前提 |
| 关联会话/生成消息 | 有 msg_id，task 有 conv_id，旧 UI 没跳转 | 本页确切映射可复用 Context Dialog；无映射不猜。全设备/跨刷新精确 attempt 关联需后端补契约 | **可选增强，后移**；不扩大 receipt/生命周期重构 |
| 找到最近失败 | 新错误按钮提醒+最新在前，无专门定位 | 有失败时一个“最近失败”动作即可；纯前端，无筛选器体系 | **可选增强，低成本时顺带做**，不阻塞 |
| 所有主动/工具成功均补详细日志 | 旧版没有 | 需给多个 producer 增加记录，明显扩大范围 | **可选增强，本 PR 不做**，明确当前覆盖即可 |

## 7. 推荐 Penumbra UI

保留“侧栏入口 → 一个日志 Dialog → 摘要列表 → 行内详情”的旧信息架构。标题只写“系统日志”，旁放条数；一行必要来源说明，例如“本页即时诊断；后台失败可在重连后恢复”。不堆英文 eyebrow、说明段和重复分组标题；来源提示按实际数据展示，不解释 Token 等常见字段。

- 默认行：时间、请求模型、已报告协议、Token 摘要、非零缓存用量、RAG 条数、错误/未知标记；窄屏自然换行。Connection 只有可靠字段时才加，缺失明确“未提供”，不能补猜测值。
- 详情默认收起：错误优先；再按存在的数据显示返回参数、召回/评分、速记。缺字段与真实零值区分；没有安全详情就直说未提供。不迁移 Prompt/私有状态段。
- `Dialog/DialogHeader/DialogBody` 承载 Mist 浮层，正文用暖纸张/中性表面；强调用现有柔和珊瑚主题与语义错误 token。桌面可约 52–56rem，手机受动态视口/安全区限制，不强压成 Composer 小设置面板。
- 整个列表使用一个主要滚动 Body，长详情随 Body 滚动；`JsonViewer` 负责自然换行、树/原文与复制，不再叠独立同向滚动框。复用大 JSON 的延迟解析与原文回退，保留完整**安全投影**的复制值，明确服务端已截断的情况。
- 展开状态按稳定日志 key 保存，后台新事件不收起用户正在读的项、不强拉滚动。关闭、Esc、键盘焦点恢复和触控目标沿现有 Dialog；提醒改为克制的未读点，不持续闪红。
- 底部保留“清空”和“关闭”；不增加没有数据 API 支撑的全量刷新，不在日志面板放重新生成、重试工具或改变成功/失败的操作。

复用证据：[`DialogBody`](/Users/remix/Desktop/Penumbra/src/components/ui/dialog.tsx:103)、[History/Context Dialog](/Users/remix/Desktop/Penumbra/src/components/chat/ConversationContextDialog.tsx:1)、[系统事件详情](/Users/remix/Desktop/Penumbra/src/components/chat/capabilities/CapabilityDetails.tsx:1)、[`JsonViewer` 已清洗输入约定](/Users/remix/Desktop/Penumbra/src/components/ui/json-viewer.tsx:11)、[Viewer 换行及性能边界](/Users/remix/Desktop/Penumbra/docs/json-viewer-implementation.md:37)、[Penumbra 视觉和常驻文案原则](/Users/remix/Desktop/Penumbra/docs/ui-guidelines.md:18)。Viewer 本身不脱敏、不判断执行状态。

## 8. 预计修改范围

**前端必需：** 新增小型 `application/chat-system-log` 安全 DTO/mapper/内存 store 和 `components/chat` 日志 Dialog/entry；调整 `ConversationsList.tsx/ChatView.tsx` 接入口。现有 `chat-execution-client/events/types`、`realtime-events/types` 及消费边界增加诊断观察，`useChatSend`/sessions 只提供现有执行身份与结果观察，错误安全投影定点补齐。日志正文不进入 persistent Message、不写 localStorage/IndexedDB，也不记录 raw SSE/HTTP 到 console。

**后端推荐的最小补丁：** `routes/chat.py` 两处 debug_qn 初始化；现有 request-local SSE debug 安全投影与 canonical 的协议/错误摘要补齐；`ai_providers.py` 复用已有 projector，按确证缺失补安全错误字段/response metadata 边界。可新增一个很小的纯投影 helper 和针对性 contract tests，不抽生成 orchestrator、不重新采集召回、不改计量。结构化安全错误若需要跨到前端，只增加可选诊断字段，旧字段保持兼容，缺字段客户端可降级。

**继续保留：** WS type/payload/timing，消息提交与 receipt 顺序，send/regenerate 的冻结和对账，PR6.5 设置与 Main Selection 路由、现有后台重试预算、工具执行和持久化。后台失败重放直接消费原契约；不修改 `append_reply_tasks`、`chat_send_receipts`、cache_metrics 表，也不添加日志查询服务。安全诊断优先走已有请求本地 SSE；WS 不扩展成完整错误/Prompt 传输通道。Thinking 内容解析与私有状态恢复留在 PR7-C。

## 9. PR7-B 最小实施顺序与测试边界

1. 固化合成 fixture：普通 send 成功/失败、两协议、canonical/legacy renderer、legacy/canonical regenerate、后台失败重放、工具成功后续写失败；明确 safe 字段、缺失值、来源与身份。先确认第 8 节的小范围后端补丁是否一并纳入。
2. 修 debug_qn、现有安全投影和 canonical 协议/错误摘要；沿原位置发诊断。具体 canonical 召回/返回详情只复用已选结果，可单独后移；无字段时前端明确未提供。
3. 前端接同一 SSE/WS 的安全观察与临时 store，先迁移矩阵里的核心列表/详情/清空/提醒/缓存；对账仍由原 controller 负责。send 的确切双通道记录合并、canonical 各次 execution 分离、task replay 去重。
4. 接 Penumbra Dialog 与共享 JsonViewer，桌面/手机验证。专用错误复制可顺带做；生命周期完整四态、消息跳转、最近失败按钮均独立，不阻塞核心迁移。

| 检查 | 必须证明 |
| --- | --- |
| 后端合成 contract | fast_mode send/legacy regen 保存后仍发 debug、不进行召回；Anthropic/OpenAI usage 来自 fake Provider；canonical 成败诊断不混原目标数据；补投影不改变 SSE/WS 相对顺序或消息/receipt 提交 |
| 安全 fixture | Key/Bearer/Cookie/Authorization、URL 凭据、Prompt/history、HEART/DRIFT/Thinking、请求/配置回显不进入列表、store、复制；未知嵌套字段 fail closed；安全上游 type/code/request ID 和不同错误原文按界限保留；截断显式标明 |
| 前端数据与身份 | SSE+WS 同一 send 合并保留完整安全详情；同 target 两次 regen 分离；无 conv/attempt 的 WS 不猜；task 回放去重/原时间/排序；缺 usage/recall/协议区别于零和 OpenAI；诊断畸形不破坏生成 |
| PR7-A 回归 | 明确拒绝、Provider failure、代理 524/断流未知、部分正文+错误、同 ID 持久失败；丢 start/duplicate/丢 regen persisted；A/B 并发与切换、回首页后只读对账；日志操作不增加生成 POST、不解除未知锁 |
| 工具/后台边界 | 工具事实成功且续写失败可同时成立；Main 成功与续写失败不互相覆盖；主动成功无详细日志不造记录；重连/重启失败回执保持现行行为，不新增后台重放或重试 |
| UI smoke | 320/390/1280px、短视口、长错误/JSON、大对象原文回退及完整安全复制；键盘/Esc/焦点恢复、关闭继续收集、展开/阅读锚点；不影响 History Search、Context Dialog、系统卡片和 Chat 参数 |

实施时运行针对性 Vitest、相关后端 fake Provider/临时 SQLite suites，再完成仓库要求的类型检查/构建和适当回归。真实代理 524、真实 Provider 长流及手机软键盘列人工边界，不用单元测试宣称覆盖。本轮只做源码、AST 作用域和文档链接/diff 检查，未运行真实服务/Provider、未读取私人数据库或凭据，也未把既有测试文档的通过结果当本轮验证。

**最终答复：**

- **有多少可原样迁移？** 18 项旧能力中，4 项直接迁移、8 项轻量适配；5 项局部修正后保留；Prompt/私有上下文详情 1 项排除。旧版信息架构无需重做，17 项能力仍保留。
- **真正要改什么？** 补 Penumbra 丢失的安全诊断字段和 WS debug；修 fast_mode 初始化、错误详情投影、缺失协议/召回的误展示、回放时间，以及 canonical regenerate 的 execution 粒度。
- **必须改 AionHome 后端吗？** 基础列表/现有安全摘要可以纯前端落地；**若按推荐范围同时修已证实漏日志、保留可靠复杂诊断并补 canonical 协议/错误摘要，则需要小范围后端补丁**。不需要存储、生成生命周期、路由或 Provider 调用架构重构。
- **哪些不应阻塞迁移？** 专用错误复制、完整四态、消息跳转、最近失败按钮、canonical 详细召回补齐、后台成功的全覆盖。跨刷新精确 attempt 追踪和日志持久化不纳入 PR7-B 最小范围。

PR7-B 实施已完成，以上为审计基线；当前等待人工验收，详见实施报告。
