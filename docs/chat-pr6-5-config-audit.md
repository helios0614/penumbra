# Chat PR6.5-A — 聊天快捷配置与 Settings 归属审计

> 实施指引：本文件保留PR6.5-A审计快照；已确认的临时作用域与实施结果见[PR6.5-B记录](./chat-pr6-5-config-implementation.md)。长期覆盖状态只维护[settings-inventory.md](./settings-inventory.md)。

审计日期：2026-10-26（Asia/Shanghai）。Penumbra `31d1087`；AionHome `e7134ae`。两仓库开始时工作树均干净。本轮只新增本文档，不修改业务代码、测试、配置、运行数据或其他文档，不 commit、push、部署。

依据为当前工作树的静态调用链，不是旧 UI 的控件清单，也不是生产验收。未读取真实 settings.json、SQLite、凭据或浏览器 localStorage；未 import 后端模块、启动服务或调用配置/模型 API。下文“生效”表示存在可追踪的消费者，不保证某个上游模型接受参数。

**推荐结论：**

- PR6.5-B 第一版仅开放 **上下文消息数 `context_limit`、Temperature `temperature`**，作为手动 send/regenerate 的请求覆盖；模型、连接和接口格式继续使用 Composer 已有入口。
- **Thinking 不进入第一版通用开关。** 后端支持 Anthropic 请求级 effort，但没有针对任意 literal 模型的可靠 Thinking 能力声明；全局 `enable_thinking` 也不是 Main send/regenerate 的控制开关。
- 上述两项已有完整请求通道，**不需要修改 AionHome 生成链路，也不需要全局 Settings PUT**。若要求重启恢复、跨设备保存或服务端读取“快捷配置”，当前没有对应持久化契约，必须另行定义，不能伪装已存在。本报告推荐第一版只维护明确标注的临时请求草稿，见第 5、8、10 节，待实施方案确认。
- Header 的重命名/删除可以收口到现有会话侧栏；手机抽屉已经复用相同菜单、操作回调和确认弹窗。保留当前会话搜索与侧栏全局搜索原职责。依据：[ChatView][P1]、[ConversationsList][P2]、[ConversationActions][P3]。
- 现有统一盘点为 [settings-inventory.md][D1]，实施后应增量维护它；较早的 C1/Settings 审计保留为历史快照，不再复制一份总清单。

## 1. Chat Header、侧栏与移动端入口现状

| 区域 | 当前可到达行为 | 审计判断与最小调整 |
|---|---|---|
| Header | 返回桌面（有回调时）、手机会话抽屉按钮、标题、当前会话搜索、当前会话三点菜单 | `ChatWorkspaceView` 的 Header 使用 `ConversationMenu`；仅删除这份重复入口，原位增加“聊天快捷配置”即可。[P1] |
| PC 会话侧栏 | `md:flex` 的 `ConversationsList`；每个会话行均有独立 `ConversationMenu`，包含当前选中行 | 不是 hover 才挂载，也不要求先切到其他会话。已能重命名、删除当前及其他会话。[P2][P3] |
| 手机 | Header 的 `md:hidden` 按钮打开左侧 `Sheet`，渲染同一个 `ConversationsList`，传相同 `listManagement` | 菜单点击先关闭抽屉，再在外层打开同一个 `ConversationDialog`；保留这一衔接，避免抽屉和弹窗争夺焦点。[P1] |
| 操作状态 | `managementLocked` 汇总生成/结果确认、会话切换、配置保存等锁；Controller 另有同步 guard | 不因移动入口而绕过锁。生成中手机仍可打开列表查看，管理能力与 PC 一样受限。[P1][P4] |
| 删除/重命名 | 重命名 trim/拒绝空白，失败保留输入；删除必须确认；成功后更新列表，删除当前选剩余会话或进入空态 | 保留 `mutateConversation` 与原弹窗，不另写“当前会话专用”mutation。[P3][P4] |
| 搜索 | Header `useChatSearch` 是当前会话搜索；列表 `GlobalChatSearch` 是跨会话搜索 | PR6-B/PR6-C 不调整；快捷配置不复用搜索面板或其 history/navigation state。[P1][P2] |

**静态可达性未发现管理功能缺口。** 需要补的是入口变更后的验证：已有浏览器 PR3 测试的 `menu()` 主要定位 Header，虽然有侧栏删除其他会话用例，不能据此声称已经验证“移除 Header 后，手机通过抽屉管理当前会话”。最小补齐为将当前会话 rename/delete 的 PC/手机用例改走列表菜单，验证抽屉关闭→弹窗→焦点恢复、最后一项删除、失败保留草稿与生成期间禁用。[tests/browser/chat-pr3-smoke.cjs](/Users/remix/Desktop/Penumbra/tests/browser/chat-pr3-smoke.cjs:76)

## 2. 旧 Chat 配置完整字段盘点与归属矩阵

路径约定：`B` = `/Users/remix/Desktop/AionsHome-main/aion-chat`，`P` = `/Users/remix/Desktop/Penumbra`；链接均指当前源码。`S` 表示 `data/settings.json` 加进程内 `SETTINGS`，由 `config.load_settings/save_settings` 处理；v2 的 Connection 权威位于其中 `model_api_registry.connections`，不是另一份数据库。[B1][B2]

状态口径：**已接通且生效**、**已接通但部分路径生效**主要描述旧入口/API 到消费者；**前端未接入**描述 Penumbra 无入口（即使下层 mapper 已支持）；**存在旧字段但已无实际消费者**必须具体说明失效的是哪条链，不能据此删除兼容存储；无法从源码证明上游/设备实际支持的标为**无法确认，需要进一步验证**。Penumbra现状列始终独立报告，不把“后端可用”算作新前端已完成。

### 2.1 模型选择与调用参数

旧配置面板本体在 `static/chat.html:1291–1387`，下面额外纳入页面其他入口和实际发送字段；所有行均重新追踪，不沿用旧面板推断。[L1][L2][L3]

| 字段 | 旧前端入口 | Penumbra 现状 | 后端事实来源 | 保存 API | 实际消费点 | 生效范围/时机 | 建议归属 | 状态 |
|---|---|---|---|---|---|---|---|---|
| `main_selection.connection_id` | API 配置选择 | Composer `MainModelSelection` 已可切换 | DB `conversations.main_selection`；GET `/api/main/configuration?conv_id` | PUT `/api/conversations/{id}` 的 `main_selection` | `resolve_main_request`→`connection_profile_facts`→frozen binding [B3][B4] | 当前会话持久；下一请求解析；相关后台 Main 消费者也可能跟随 | Chat 保留现有 Composer；连接管理归 Settings，避免重复编辑器 | 已接通且生效 |
| `main_selection.protocol` | OpenAI/Anthropic 下拉 | Composer“手动调整→接口格式”已接通 | 同上；canonical `connection_selection` 优先 | 同上，完整三元组原子提交 | binding.protocol 决定 provider/renderer；不读旧 chat_format 选路 [B3][B5] | 会话持久→每请求冻结 | 保留 Composer；不是普通生成参数 | 已接通且生效 |
| `main_selection.model` | literal 输入、获取模型建议 | Composer 快选 default_model/手填 literal 已接通 | 同上；不要求在静态 catalog | 同上 | `binding.backend_model` 原 literal [B3] | 会话持久；不随连接 default_model 后续变化 | 保留 Composer，快捷面板至多展示摘要/定位原入口 | 已接通且生效 |
| `main_selection.profile_id` | 历史 Profile 兼容格式 | Domain 可读取，编辑使用 Connection 三元组 | 历史 JSON/alias，GET 只做投影 | 新 UI 不创建这类选择 | `parse_main_selection`、alias→Connection [B3][B4] | 旧选择兼容读取；GET 不回写 | 保留旧兼容但不显示为第二种选择系统 | 已接通但部分路径生效 |
| `conversations.model` | 旧 catalog 模型字段 | mapper 仍保留 modelKey；执行资格使用 Main setup | DB 兼容列 | 旧 `model` 输入兼容；新 UI 只写 main_selection | `_selection_for_write` 兼容转换；Diary 等历史 catalog 使用 [B6] | 不再是当前 Main 执行身份 | 保留旧兼容但不显示为“实际模型” | 已接通但部分路径生效 |
| `context_limit` / `aion_context_limit` | 上下文滑块，LS；send body、regen query | transport/application 支持，production 无控件 | 当前请求→`resolve_generation_options`；无 S/会话字段 | 无配置保存 API；提交 send/regen 请求 | send SQL LIMIT；`load_history_rows`；Anthropic builder [G1][G2][B7] | 本次调用初始历史消息行数；默认 30、1–100，不是轮数/分页大小 | Chat 快捷配置：频繁且直接影响后续手动调用 | 前端未接入；旧入口已接通且生效 |
| 请求 `temperature` / LS `aion_temperature` | 滑块；同时调用全局温度 PUT，且每次请求带值 | mapper 支持，包括 0；production 未组装 | 当前请求→resolver，**不继承 S.temperature** | 本次 send/regen；持久化全局 PUT 是下一表另一字段语义 | `provider_generation_payload`；OpenAI/Gemini/Anthropic adapters [G1][B5] | 请求冻结；缺失/null=1.0；OpenAI/Gemini 0–2，Anthropic 0–1 | Chat 快捷配置；不复制旧双写副作用 | 前端未接入；请求链已接通且生效 |
| 请求 `thinking_effort` | 强度按钮存 LS/全局；勾选 Thinking 时额外附请求 | mapper 支持，无 UI | 请求值；不是全局 getter | send body/regen query；请求不保存 S | Anthropic `thinking:{type:adaptive,display:summarized}` + `output_config.effort` [G1][B5] | low/medium/high/xhigh/max；缺失/null不附 thinking；非 Anthropic medium仅兼容 no-op，其他 effort 422 | 未来 Chat 快捷配置候选；模型能力契约不足，第一版暂缓 | 前端未接入；已接通但部分路径生效 |
| `fast_mode` | 普通 Web Chat 无开关；后端本机 Voice 尝试固定 true | mapper 支持，无 UI | 请求 strict bool，默认 false | send/regen 请求，无持久配置 | recall/context 分支跳过即时摘要/记忆等；不进入 provider 参数 [G1][B7] | 每次调用；normal renderer cutover排除 fast；本机 Voice链另有缺口 | 保留兼容、不开放普通快捷项：会改变召回语义，并非普通“加速” | 前端未接入；已接通但部分路径生效 |
| `whisper_mode` | 独立密语面板/URL 模式；发送时附值 | mapper 支持，无 UI | 请求 strict bool，默认 false | send/regen 请求 | `build_system_prompt`/Anthropic ability builder 的设备能力上下文 [B7][B8] | 本次调用；不是持久 Persona | 其他独立功能页：设备/密语能力；不进入普通配置 | 前端未接入；已接通但部分路径生效 |

`attachments`、`client_msg_id` 是消息附件与幂等字段，不是快捷配置；Penumbra已组装它们，不能用新参数对象覆盖附件快照或重建幂等 ID。[P5][P6]

### 2.2 旧面板的全局字段与隐藏状态

| 字段 | 旧前端入口 | Penumbra 现状 | 后端事实来源 | 保存 API | 实际消费点 | 生效范围/时机 | 建议归属 | 状态 |
|---|---|---|---|---|---|---|---|---|
| S.`temperature` | Chat温度滑块双写LS/S | 无管理UI | S；**GET /api/settings 不投影它** | PUT `/api/settings/temperature` | optionless + `use_global_temperature=True` 的 Camera/Location Core、Alarm/Monitor；Activity follow-up另投影 [B3][B9] | 服务全局；各任务capture后冻结；Main手动请求不继承 | Settings高级兼容项；需说明跨业务影响，不能充当快捷面板默认 | 已接通但部分路径生效 |
| S.`enable_thinking` | 扩展思考开关 | 无 | S；GET settings默认true | PUT `/api/settings/context_toggle` | `_legacy_thinking_snapshot`；optionless请求/未带resolved options的Anthropic兼容分支 [B10][B5] | 全局兼容；Main请求是否Thinking由请求effort决定 | Settings高级兼容；不命名为“当前Chat Thinking” | 已接通但部分路径生效 |
| S.`thinking_effort` | 强度按钮，另存LS镜像 | 无 | S；GET规范化；缺失medium | PUT context_toggle→`set_thinking_effort` | optionless snapshot [B10] | 全局；setter非法字符串归一medium，而请求effort非法会422 | Settings高级兼容；与请求effort分开标识 | 已接通但部分路径生效 |
| S.`float_interval` | “记忆浮现间隔”滑块1–15，LS镜像 | 无 | S；**GET settings不投影**；读取fallback12 | PUT `/api/settings/float_interval` | send、canonical/legacy regen、Diary 的低频浮现分支 [B11] | 跨会话/Chat与Diary；RAG非fast分支执行时读取；计数在chat_status，不是所有召回间隔 | Settings记忆高级项：共享策略、低频、不宜占Header | 已接通但部分路径生效 |
| `chat_status.float_rounds` | 无用户直接编辑 | 无 | `data/chat_status.json`；旧包裹status格式兼容 | 无独立配置写；运行时 `save_chat_status` | 浮现分支增量/达间隔重置 [B11][B1] | 服务全局派生计数，非每会话参数 | 保留内部运行状态，不显示为可配置字段 | 已接通且生效 |
| S.`include_heart` | 代入旧HEART | 无 | S，GET缺失true | PUT context_toggle | `include_hidden_heart`→history恢复、builder、memory等 [B12][B8] | 须 `enable_hidden_heart=true` 才恢复；有其他业务消费者 | 保留旧兼容但不显示；确需调试仅Settings高级 | 已接通但部分路径生效 |
| S.`include_drift` | 代入旧DRIFT | 无 | S，GET缺失true | PUT context_toggle | `include_hidden_drift`→history/builder [B12][B8] | 须 `enable_hidden_drift=true`，并非原生Thinking | 保留旧兼容但不显示 | 已接通但部分路径生效 |
| `include_simplethink` | 旧请求字段名兼容 | 不接入 | load/PUT将它规范化为include_drift，canonical优先 | context_toggle兼容接收 | 无独立运行策略；消费者读canonical gate [B1][B12] | 迁移别名，不是第二个开关 | 保留兼容输入，不另建UI | 已接通但部分路径生效 |
| S.`enable_hidden_heart` | 旧Settings调试总开关 | 无 | S，默认false | PUT `/api/settings` | `hidden_heart_enabled`、输出清理/command执行、上下文恢复 [B12] | 全局私有状态调试gate | Settings高级/兼容；普通Chat不展示 | 已接通且生效 |
| S.`enable_hidden_drift` | 旧Settings调试总开关 | 无 | S，默认false | PUT `/api/settings` | `hidden_drift_enabled`、输出清理、prompt恢复 [B12] | 同上 | Settings高级/兼容；普通Chat不展示 | 已接通且生效 |
| `enable_hidden_simplethink` | 更旧调试字段名 | 不接入 | load/Settings PUT规范化为enable_hidden_drift | PUT settings兼容接收 | 无独立消费者；经迁移影响canonical gate [B1][B12] | 迁移别名 | 保留旧兼容但不显示 | 已接通但部分路径生效 |

### 2.3 新会话携带、TTS和语音

| 字段 | 旧前端入口 | Penumbra 现状 | 后端事实来源 | 保存 API | 实际消费点 | 生效范围/时机 | 建议归属 | 状态 |
|---|---|---|---|---|---|---|---|---|
| `aion_carryover_count` | 新窗口携带数量，0–50，LS默认0 | 无UI/请求字段 | 浏览器LS；不是服务端设置 | 无；旧newConv后保存待携带引用 | `newConv`选最近实际user/assistant，slice(-count*2) [L4] | UI写“条”，实际按最多N*2条取；只影响新会话首次send准备 | 暂不迁移；以后归新建会话流程，不归当前调用参数 | 前端未接入；旧入口已接通且生效 |
| `carryover.source_conv_id` | 自动生成，LS `aion_carryover_{convId}` | 明确未接入 | 请求引用→后端DB读取，拒绝同目标来源 | 首次send，无配置保存API | `_resolve_carryover_rows` [B13] | 目标已有实际消息时忽略残留引用 | 新会话高级动作；不先加孤立滑块 | 前端未接入；已接通但部分路径生效 |
| `carryover.message_ids` | 自动选择来源消息ID | 明确未接入 | 1–100个ID；去重、归属、role、非carryover校验 | 首次send | `_persist_send_messages`写入is_carryover消息 [B13] | 正式业务持久化副作用，写事务再次检查首次发送条件 | 暂缓完整迁移；需单独覆盖原文/失败/并发契约 | 前端未接入；已接通但部分路径生效 |
| `carryover_messages` | 更旧raw消息数组 | 不发送 | 空/null只兼容；非空拒绝 | send兼容输入 | `_send_generation_request_options`，不消费非空正文 [B7] | 空值no-op；非空422，在写消息前拒绝 | 保留旧兼容但不显示，不恢复raw history传入 | 存在旧字段但已无实际消费者（非空旧功能已禁用） |
| `aion_tts_enabled` | Header自动播放，LS默认false | 无自动TTS；已有音频手动播放 | 本设备LS/内存ttsEnabled | 无配置API；播放时POST `/api/tts` | send/regen后`ttsSpeak`→`playNextTTS`；WS助手消息仅特定条件播报 [L5] | 旧Chat设备偏好，浏览器播放权限另限；不是模型参数 | 其他独立语音能力；未来可有就近播放控制，首版不迁 | 前端未接入；已接通但部分路径生效 |
| `aion_tts_voice` | 音色选择，LS；列表无当前音色时选首项 | 无音色编辑 | LS；GET `/api/tts/voices`依赖服务全局TTS provider | 无配置保存API；POST tts的voice参数 | `refreshTTSVoices`、播放/合成请求 [L5][B14] | 本设备偏好→每次合成；不是全局统一音色 | 语音能力设置；Provider/Key另归Settings | 前端未接入；已接通且生效（实际provider可用性待验证） |
| `aion_voice_auto_generate` | 自动生成语音条，LS默认false | 无自动合成 | 本设备LS/内存 | 无配置API；POST tts，附msg_id | send/regen结束：自动播放未开启时执行`synthesizeMessageVoice(...,false)` [L5] | 生成音频资产，不等于播放；改变消息附属资源 | 独立语音能力，不借快捷配置顺带接资产写入 | 前端未接入；已接通但部分路径生效 |
| `aion_voice_enabled` / runtime `voice.enabled` | 语音监听；LS写入 | 无语音监听页 | LS仅记录；本机后端Voice实例，remote则前端实例 | POST `/api/voice/toggle`；GET `/api/voice/status` | voice.start/stop或remoteVoice.start/stop [L6][B15] | 运行时开关，不落服务配置；旧initVoice不读LS enabled自动恢复 | 其他独立语音页（Penumbra尚不存在，不能假称已迁） | 已接通但部分路径生效；完整本机链有缺口，见第7节 |
| `aion_voice_wakeword` / `wake_word` | 唤醒词输入，LS默认“老公” | 无 | 浏览器偏好→Voice/remoteVoice运行实例 | POST voice/toggle附wake_word | 本机/remote识别匹配 [L6][B15] | 本设备持久+服务进程临时；已启用时重启监听应用 | 独立语音页，不是Persona或模型参数 | 前端未接入；设备实际效果无法确认，需要进一步验证 |
| `aion_voice_mic_source` | 本机local/手机remote | 无 | LS；未保存时按App/mobile选择remote，否则local | 无服务配置保存API | `onMicSourceChange`、local Voice或remote录音/remote-asr [L6] | 切源先关闭旧监听；权限和设备选择属于设备能力 | 独立语音页；本轮不新增该页 | 前端未接入；设备实际效果无法确认，需要进一步验证 |

**TTS同步纠偏：** 目前 `static/chat.html` 的 `toggleTTS`/`changeTTSVoice` 只修改LS和本页状态，未发送 `tts_state`；全文件和 `static/common.js` 中未找到替代发送点。后端 `main.py` 能接收 `tts_state`，现存发送者是 `static/theater.html::sendTTSState`。`ws.py::set_tts_fallback` 在当前源码中没有调用者。因此不能把旧Chat开关描述为已同步后台主动TTS状态；后台Alarm/Location确实消费manager状态，是另一条链。[L5][B16]

## 3. AionHome读取、保存与实际生效契约

### 3.1 Main路由与Renderer事实

```text
已有会话：DB conversations.main_selection
新建会话：复制 usage_bindings.main_chat（之后独立）
  → resolve_main_request：复制SETTINGS快照
  → 指定Connection + 指定protocol + 原样literal model
  → frozen RuntimeLLMBinding + ResolvedGenerationOptions
  → stream_ai / provider adapter / 当前renderer路径
```

`GET /api/main/configuration?conv_id` 提供当前会话的 `connection_selection`、诊断、连接候选及允许协议；省略conv_id是**新会话默认**。它不包含 generation defaults、Thinking能力或快捷参数保存值。已有选择失效时保留其身份和diagnostic，不选另一连接。[B3][B4]

Registry v2的连接保存URL/Key/transport，协议属于使用位置。direct连接可使用显式OpenAI/Anthropic；Cloudflare transport只接受Anthropic，历史Gemini profile仅兼容读取/执行。`Connection.default_model`只是交互预填，不覆盖持久化literal；`MODEL_REGISTRY`是静态目录，`GET /api/models`不是当前连接的远端模型全集，更不是Thinking能力服务。[B4][B17]

当前生产入口同时存在OpenAI与Anthropic的受控canonical Main-direct路径及legacy renderer；选择由backend cutover policy、协议、normal/fast等条件决定。**渲染路径差异不授予UI重新选协议/模型的权力。** `stream_ai`有binding时依binding选路，Anthropic异常目前直接抛出，不再偷偷执行第二次OpenAI格式请求。不能沿用早期renderer决策记录中的natural fallback描述来实现新UI。[B5][B18]

### 3.2 请求参数默认值、边界和失败行为

| 字段 | 缺失 | 显式null | 有效值与错误 | 消费差异 |
|---|---|---|---|---|
| temperature | 1.0 | 1.0 | finite number；bool/string拒绝；OpenAI/Gemini 0–2、Anthropic 0–1 | 0原样保留；上游模型可能进一步拒绝，后端没有逐literal温度能力判定 |
| context_limit | 30 | 422 | strict int 1–100；0/小数/bool拒绝 | send取包含新user的历史；canonical regen只取目标前的历史，再retain_complete_turns；不是精确N轮 |
| thinking_effort | None | None | Anthropic五档；未知字符串/空串422；非Anthropic的medium兼容no-op，其余unsupported 422 | None表示不附thinking/output_config，**不等于发送上游显式disabled指令** |
| fast_mode | false | 422 | strict bool | true跳过完整召回；不作为上游sampling参数 |
| whisper_mode | false | 422 | strict bool | 改能力prompt；不是模型路由字段 |

来源：[generation_options.py::resolve_generation_options/provider_generation_payload][G1]。generation-options错误返回422和安全`code/field`；send校验先于用户消息落库。canonical regenerate要求空body，使用query transport，拒绝未知/重复query key；Penumbra当前mapper对nullable温度/effort在regenerate中省略query，符合缺失回退语义。[B7][P6]

`context_limit`只保证初始历史选择，不能宣传“最终只发送N条”。Anthropic cache-window可基于DB freeze/slide区域重建上下文，prompt还会注入系统、记忆、日程等消息；现有后端契约明确不保证它是最终payload总条数上限。[B8][G2]

Thinking当前没有公开的独立request `enable_thinking`、`thinking_budget`、`budget_tokens`、OpenAI `reasoning_effort`、`max_tokens`编辑字段。未知字段会被请求allowlist拒绝；Anthropic现有max_tokens在适配器中固定为16384，不能照旧模型UI推导新预算滑块。[G1][B5][B7]

### 3.3 各执行路径的实际参数来源

| 执行路径 | 模型/连接/协议来源 | Temperature / Thinking | Context / 其他全局配置 | 读取时机 |
|---|---|---|---|---|
| Main send | 当前会话Main selection | 请求显式值→canonical defaults；不读全局兼容值 | 请求context/fast/whisper；float、隐藏gate、cache仍各点读取 | route开始resolve冻结generation/binding；不是所有Settings一并冻结 [B7] |
| canonical target regenerate | 当前会话Main selection，目标资格由后端校验 | 与send相同，无原消息“参数重放”契约 | 目标前有界历史；RAG/float等保留本路径 | 本次route resolve；所以新请求参数可用于旧消息重新生成 [B7][G2] |
| legacy regenerate | 当前会话Main selection | 同一resolver/query契约 | 旧append路径自己的历史/持久化行为 | route resolve；Penumbra不调用该legacy路径 [B7] |
| Main的MCP/延迟检查follow-up | 复用父request binding | `_follow_up_generation_kwargs`复用父options | follow-up有自己的context编排，不等于再次用同一个SQL LIMIT | 不因中途改Settings重新选路/采样 [B19] |
| Camera/Location Core、Alarm/Monitor | 相应目标/最近Main会话；无会话时按既有默认规则 | legacy_optionless；显式use_global_temperature=True；Thinking来自捕获的全局policy | 各自上下文窗口/trigger prompt，不使用快捷面板草稿 | 各任务自己的capture点，不一定在HTTP入口 [B9] |
| Activity greeting/Core | 最近Main会话 | initial optionless温度省略；follow-up单独派生当时全局温度；Thinking全局snapshot | Activity上下文 | 同一次任务分别冻结initial/follow-up投影 [B9] |
| Quick Note Step2 | 最近Main/无会话默认 | optionless温度省略；Thinking全局snapshot | 独立速记prompt | Step2任务解析时 [B9] |
| Memory Sentinel/Digest、Quick Note Step1、Web Compression等辅助任务 | 各自Feature Binding，不继承Chat当前model | 自身显式调用策略；例Memory辅助complete_text固定temperature=1.0 | 不使用Chat临时context/effort | 每个任务capture并同binding重试 [B20] |

因此，**改会话模型可能影响后续主动消息；改请求级温度不等于改主动消息温度。** 快捷UI不得声称控制所有后台生成，也不能顺带写global值来“让它们一致”。

### 3.4 保存、缺失旧数据与并发

- S在进程启动时`load_settings`读取；已有文件不会统一merge全部默认，而由getter/投影/各消费点fallback。include_simplethink等旧键会在加载时迁移为canonical；坏JSON没有通用静默恢复。GET settings是安全allowlist和computed值，**未包含temperature/float_interval**，不能把缺键显示成“服务器当前为1/12”。[B1][B21]
- 普通Settings PUT先构造candidate、保存后发布；Registry同样以candidate保存。相比之下，temperature、float_interval、context_toggle及部分旧setter是**先改共享SETTINGS，再save**。磁盘保存失败可能返回错误而RAM已改变；原子文件替换只保证文件完整，不代表旧专用endpoint具备内存回滚。[B1][B2][B21]
- context_toggle传无效effort会归一medium；TempUpdate仅float类型、FloatIntervalUpdate仅int类型，没有与请求resolver一致的范围约束。旧滑块的0–2/1–15不是服务端全局字段校验边界。不能复用这两条PUT当作新快捷参数保存。[B21][B10]
- 旧Chat的`api(..., checkStatus=false)`默认只解析JSON、不检查HTTP状态；温度/float/context_toggle保存未启用checkStatus，且先改LS/控件。401或JSON错误响应可能不触发回退，网络异常也没有一致的草稿恢复。其Main选择请求已显式开启状态检查，不能将这条较完善的模型保存链误套到全部旧滑块。[旧Chat API包装](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:2418)[L2]
- 没有统一配置revision/CAS或通用Settings WS失效事件。请求/binding冻结能保证这一调用不漂移；它不能解决多个浏览器全局设置互相覆盖，也不保证较早GET不会覆盖较新UI草稿。现有owner/sequence仅是前端局部请求保护。[P4][B2]
- float和隐藏gate在context构建阶段读取，cache也有builder期读取，cache-config PUT更会清全库freeze/slide区域；不能承诺“修改任何设置都只影响下一轮”。这也是它们不进入第一版快捷面板的原因。[B8][B11][B22]

## 4. Penumbra已有设置入口、状态与重叠问题

| 边界 | 当前事实 | PR6.5-B应复用/避免 |
|---|---|---|
| Composer | `MainModelSelection`已有快选及“手动调整”，后者编辑连接/literal/接口格式；不是Temperature/Thinking编辑器 | 保持唯一模型编辑器，不在Header再复制三元组表单。[P7] |
| 保存模型 | `useMainModelSelectionDraft`串行意图；`saveMainSelection` PUT后重读list、configuration、readiness；失败保留草稿、阻断未确认发送 | 参数应用不得触发它，不能写main_selection、全局main_chat或旧active指针；模型切换仍沿原事务边界。[P4][P7] |
| send/regen参数 | application/domain类型与mapper已有五个字段；production `ChatView`只组合content、client_msg_id和附件，regen未带generation | 从同一临时参数快照向send和regen组装；只改其中一路会形成表面接入。[P5][P6] |
| Settings页面 | 真实主题模式、主题色/AI色、壁纸本地持久化；运行概览仅安全GET session/models/bootstrap readiness；日历占位 | 没有Provider CRUD或运行参数保存UI；占位不能计为已接通。[P8] |
| 状态管理 | React state/ref + application controllers；SettingsOverview/Workspace各自有AbortController和sequence；package无React Query | 不为本任务引入Query cache/store；参数草稿由Chat上层一个owner持有；组件只投影/编辑。[P4][P8] |
| 音频 | PR5已有message voice/音频播放和共享AudioController，无自动TTS生成/播放设置 | 音频能播放不代表TTS设置已迁移；不增加第二个播放状态源。[P9] |
| 组件与token | Popover、Dialog（Header/Body/Footer）、Sheet、Input、AppSelect、Switch、Slider、Toast及control size/focus规则已存在 | 小表单复用这些组件与`mist-glass-strong`、surface/foreground/ring token；不拷旧HTML样式。[P10] |

明确重叠风险：模型事实目前属于Workspace setup；Settings运行概览是bootstrap视图，不能用它覆盖当前会话。快捷字段属于request input，不能用SettingsOverview当配置缓存，也不能分别由Sender、Header和Settings维护可写副本。一个表单draft与一个已应用request snapshot是编辑事务，不是两个事实源；同一字段未来有多个入口时必须连接同一个owner/client。

## 5. 推荐的Chat快捷配置最小字段列表

| 第一版选项 | UI与初始语义 | 应用契约 | 为什么现在适合 |
|---|---|---|---|
| 上下文消息数 | 默认“未覆盖（后端默认）”；用户显式编辑整数1–100；说明“影响历史选择，非最终总消息数” | 应用后组装`generation.contextLimit`，send与regen均提交；恢复默认即省略字段 | 已有严格后端契约、无全局保存副作用、频繁调整价值直接 [G1][P6] |
| Temperature | 默认“未覆盖（后端默认）”；按**已确认protocol**使用契约范围；未知/兼容profile未提供协议时不猜测 | 应用后组装`generation.temperature`，0保留；恢复默认省略，不能把null当“关闭采样” | 直接影响provider payload，已有协议边界；不借模型名猜支持性 [G1][P6] |

可以展示当前模型/接口摘要，点击引导已有Composer入口；**不再提供连接、协议、模型第二套控件**。第一版不包含float、carryover、fast、whisper、HEART/DRIFT、自动TTS、麦克风或预算。

**Thinking的后续门槛：** 后端目前只验证protocol与五档字符串。`resolve_main_request`为任意literal构造仅含chat能力的descriptor，Main configuration和readiness也不输出Thinking支持与否。Connection测试仅basic_nonstream，模型列表只给名称，均不足以证明adaptive/某档effort可用。[B3][B17]

以后若纳入Thinking，必须由后端明确提供当前选择的参数policy/能力状态：区分unsupported与unknown、可用effort、关闭/省略的准确含义；不能查模型名子串或把所有Anthropic当成已验证支持。请求开关应投影为effort或省略字段，**不能保存全局enable_thinking代替**。budget、内容解析、流式Thinking、历史恢复和私有内容边界继续留PR7。

## 6. 保留在Settings或独立能力页的字段

以下为相关字段的补充矩阵，未重新开展全系统Settings审计。每个连接字段列开，避免“API配置”掩盖不同作用范围。

| 字段 | 旧前端入口 | Penumbra 现状 | 后端事实来源 | 保存 API | 实际消费点 | 生效范围/时机 | 建议归属 | 状态 |
|---|---|---|---|---|---|---|---|---|
| Connection.`name` | 旧Settings连接卡片 | 只在Composer读候选名 | S.registry.connections | POST connections / PATCH connections/{id} | UI展示/诊断 [B17] | 全局连接元数据 | Settings：管理复用连接，无需聊天频改 | 前端未接入管理 |
| Connection.`base_url` | 同上 | 无编辑 | 同上 | 同上 | `connection_profile_facts`→endpoint [B3][B17] | 所有引用该连接的新runtime | Settings：跨业务地址权威 | 前端未接入 |
| Connection.`credential`（磁盘key） | 连接密钥操作 | 无管理 | 同上；GET仅metadata | POST/PATCH；专用reveal/clear带secret_ref | credential resolution [B17] | 全局连接凭据 | Settings：专用保存/清除契约，Header不应持有 | 前端未接入 |
| Connection.`enabled` | 启用/停用 | 读取并显示不可用候选 | 同上 | PATCH connection | Main resolver拒绝disabled，不自动换连接 [B3] | 该连接所有新调用 | Settings：共享影响 | 前端未接入编辑 |
| Connection.`default_model` | 默认模型输入 | 已作为快捷选择预填消费 | 同上，nullable | POST/PATCH connection | `MainModelSelection.selectConnection` [P7] | 交互提示，不是持久化选择默认继承 | Settings编辑；Chat复用读取 | 已接通但部分路径生效 |
| Connection.`transport` | 传输方式 | 读用于候选摘要/协议派生边界 | 同上；direct/cloudflare_rest/cloudflare_anthropic | POST/PATCH connection | 认证、URL、协议约束 [B17] | 连接全局属性 | Settings：低频基础设施 | 前端未接入编辑 |
| Connection.`gateway_id` | 网关输入 | 无编辑 | 同上，nullable | POST/PATCH connection | Anthropic网关URL/headers [B3] | 全局连接传输 | Settings，同上 | 前端未接入 |
| main_chat binding.`connection_id` | 旧Settings功能默认 | 无默认编辑；bootstrap只读 | S.registry.usage_bindings | PUT `/api/registry/feature-bindings/main_chat` | `default_main_selection`→创建会话复制 [B3][B17] | 新会话/无会话caller，不覆写已有会话 | Settings：明确全局默认动作 | 前端未接入编辑 |
| main_chat binding.`protocol` | 同上 | 同上 | 同上 | 同上，完整三元组 | 同上 | 同上 | Settings，不能因快捷保存改协议 | 前端未接入编辑 |
| main_chat binding.`model` | 同上 | 同上 | 同上 | 同上，literal | 同上 | 同上 | Settings，不能用连接default_model代替 | 前端未接入编辑 |
| `selected_api_config_id` | 历史active API选择，当前旧Settings已移除活动编辑 | 无 | S兼容指针 | 旧api-configs/select保留 | `_catalog_selection`的部分独立legacy任务；不控制Main [B23] | 兼容全局，不是当前会话 | 保留旧兼容但不显示 | 已接通但部分路径生效 |
| `chat_format` | 旧Settings/历史选择 | 无 | S，GET/PUT chat-format | PUT `/api/settings/chat-format` | independent catalog兼容解释；Main依显式protocol [B23] | 全局兼容格式；openai/anthropic，非法400 | 保留旧兼容但不显示为Main协议开关 | 已接通但部分路径生效 |
| `cache_enabled` | 旧Settings缓存开关 | 无 | S/get_cache_enabled，默认true | PUT `/api/settings/cache-toggle` | Anthropic system/history builder与路径policy [B8][B22] | 全局策略，不同renderer有各自边界 | Settings高级：共享prompt/cache语义 | 前端未接入；已接通但部分路径生效 |
| `cache_freeze_size` / API `freeze_size` | 冻结区数量 | 无 | S/getter默认20；cache_region在DB | GET/PUT `/api/settings/cache-config` | cache_window/build_anthropic_messages [B8][B22] | 全局；写入重置所有freeze/slide区域 | Settings高级：有DB副作用，不是快捷context替代物 | 前端未接入 |
| `cache_slide_max` / API `slide_max` | 滑动区数量 | 无 | S/getter默认10 | 同上 | 同上 | 同上；二者仅校验非负 | Settings高级，同上 | 前端未接入 |
| `anthropic_system_cache_ttl` / API `ttl` | 旧Settings TTL | 无 | S/getter，5m或1h，fallback1h | PUT `/api/settings/anthropic-system-cache-ttl` | Anthropic system cache；非冻结历史TTL [B22] | 全局协议专有策略 | Settings高级：低频 | 前端未接入 |
| `cache_keepalive_enabled` | 未发现旧用户控件 | 无 | S，GET keepalive默认true | GET/PUT `/api/settings/keepalive` | activity.check_cache_keepalive [B24] | 后台周期任务 | Settings高级：主动调度，不是聊天采样 | 前端未接入；后端有消费者 |
| `cache_keepalive_threshold_min` | 同上 | 无 | S，默认50 | 同上，写入clamp1–55 | 同上 | 后台检查时读取 | Settings高级，同上 | 前端未接入；后端有消费者 |
| `anthropic_schedule_in_system` | 旧兼容开关，当前无有效关闭入口 | 无 | getter固定true，GET也投影true | 兼容PUT忽略false，保存true | builder消费恒定策略，**不消费保存值的开关语义** [B22] | 已非可关闭配置 | 保留旧兼容但不显示 | 存在旧字段但已无实际消费者（可变开关语义） |

其他不展开复制的Settings领域：Memory/辅助模型Feature Bindings、Embedding、TTS/ASR Provider与Key、MCP链深、Web全局许可、Persona/用户前缀、renderer cutover/调试gate。它们在现有`settings-inventory.md`的B/D/E/F分类已有逐字段盘点；Chat Header不承接其管理表单。Memory/Location/Activity/Diary已各有业务设置，不新增第二份开关。[D1][P8][B17]

语音唤醒/麦克风推荐独立能力页，但当前Penumbra `DesktopAppId`和挂载列表**没有Voice页**；此处是归属建议，不声称已有页面。后端已有`routes/voice.py`并不足以表示前端迁移完成。[DesktopAppView](/Users/remix/Desktop/Penumbra/src/components/apps/DesktopAppView.tsx:40)[B15]

**“更多设置”评估：** 可以有一个导航项，打开既有Settings外壳或既有legacy Settings，明确目标；不在Popover内嵌Settings。当前Settings仍无连接管理页，单纯跳到Penumbra Settings不能承诺能修改API。它由两个桌面各自的`isSettingsOpen`控制，不是可直接假定存在的`/settings`新前端路由。第一版可以省略此项；若实现，应传宿主导航回调，保留返回Chat的方式，不在Chat创建第二份Settings state。[经典桌面宿主](/Users/remix/Desktop/Penumbra/src/widgets/Desktop.tsx:552)、[Editorial宿主](/Users/remix/Desktop/Penumbra/src/components/desktop-v2/EditorialDesktop.tsx:119)[P8]

## 7. 退役、部分生效与暂不迁移的准确区分

| 项目 | 当前证据与分类 | 本轮结论 |
|---|---|---|
| include_heart/include_drift、隐藏gate | 有真实context/command消费者，默认总gate关闭 [B12] | **不是死字段**；普通UI不迁移，兼容/调试保留。PR6.5不重构私有内容边界 |
| 全局温度/Thinking | 部分optionless/后台路径仍消费；Main手动请求不继承 [B3][B9][B10] | **部分路径生效**，不删；不能当当前Chat快捷保存API |
| float_interval | 仍影响Chat/regen/Diary低频浮现；safe GET缺字段 [B11][B21] | 有效但全局低频；延后专用读取/错误恢复契约，不迁旧LS双写 |
| anthropic_schedule_in_system | getter/setter固定true [B22] | 可变开关已退役；不恢复UI |
| raw carryover_messages | 非空在持久化前拒绝；空仅兼容 [B7][B13] | 旧raw传消息功能已退役；受限引用carryover仍有效且是另一契约 |
| include_simplethink/enable_hidden_simplethink | canonical迁移别名 [B1][B12] | 别名不再显示为独立设置；不删除兼容接受 |
| 旧Profile CRUD/test、旧fetch-models | 路由明确409 use_connection_api；当前Connection API为替代 [B17] | 已退役入口，不在新前端恢复；旧Pool部分兼容写仍转Connection，不能笼统说全部删除 |
| fast_mode | API仍可达，改变recall；normal cutover排除fast [G1][B18] | 未退役完成；不开放普通UI，不借本轮修底层fast分支 |
| Thinking budget/OpenAI reasoning effort | Main请求契约没有字段 [G1][B7] | 不是“旧字段待迁”，而是未实现能力；不建空控件 |
| Chat TTS→后台状态同步 | Chat toggle未发tts_state，fallback setter无调用者；Theater有发送者 [L5][B16] | 同步链未接，不应按旧文档认定有效；旧Chat本地合成/播放仍有效 |
| 本机Voice→Main | `voice._async_send`无session调用受保护send，且附allowlist外tts_enabled/tts_voice；未检查HTTP状态 [B25] | 在当前标准鉴权下会先401；即使补认证，现有额外字段仍会422。监听开关可启动不等于完整语音聊天已接通；单独修复，不带入快捷配置 |
| remote Voice→Main | `remoteVoice._sendToChat`调用本页send，走当前浏览器会话与普通参数 [L6] | 与本机路径不同；设备录音、ASR、权限及播放实际效果需独立验证 |

未发现理由支持“把整个旧Chat配置弹层原样迁移”。源码能确认的失效应写明具体链路；上游是否接受某literal的adaptive thinking、手机权限和生产实际值仍属“无法确认，需要进一步验证”。

## 8. 最小实施边界、读写交互与必要测试

### 8.1 第一版交互契约（建议，尚未实施）

| 问题 | 推荐契约 |
|---|---|
| 初始值从哪里读 | 当前模型三元组只读Workspace `setup.configuration`；generation draft初始为空，显示“未覆盖（后端默认）”。不读旧LS、不从GET settings补温度/float，不为默认值拼请求。若显示1.0/30的说明，必须标“后端契约默认”而非“已保存值”，并用现有后端契约测试核对 |
| 保存范围 | 两字段是**当前请求覆盖的编辑草稿**，由一个Chat上层owner持有；不落DB、全局Settings或localStorage。刷新/离开Chat不承诺恢复，不新增每会话generation偏好。此范围需在PR6.5-B方案确认；若目标是持久配置，应先另定契约 |
| 即时还是确认 | 建议显式“应用到后续请求”按钮，滑动/输入只改draft；取消不改已应用snapshot。成功文案“已应用到后续手动调用”，不用“已保存到服务器” |
| 真正使用 | send与canonical regenerate统一读取同一已应用snapshot，分别经现有mapChatSendExecutionInput/mapChatRegenerateExecutionInput；附件单独合并，不覆盖它们。UI apply不调用provider，也不保存模型 |
| 是否重读Chat配置 | 临时apply无服务器写，无需额外GET；已发生模型保存仍沿用原PUT+readback/readiness流程，不能削弱 |
| 生成中能否修改 | 第一版沿现有management/execution锁禁用应用与身份切换，最多只读查看。即使未来允许编辑，也只影响未发起请求；request snapshot一经提交不可热更新，不把Abort当后端停止 |
| 下一次send/regen | 均使用新snapshot；重生成按当前配置而非复原旧消息的采样参数。恢复默认从snapshot删键，默认行为与现在省略字段保持一致 |
| 会话/Connection切换 | 草稿绑定owner与已确认三元组；切换后作废旧草稿/临时覆盖并可见提示“已恢复后端默认”，不从新会话读值反写全局，不将旧effort/超范围温度带入新协议。保留当前模型，不为兼容参数改协议或切其他连接。也可选择要求重新确认，不能静默clamp |
| 并发/旧响应 | 不引入generation GET竞态；模型身份变更的owner/sequence及configurationPending继续有效。面板打开时记录身份，apply前同步核对；不依赖仅一次React render的disabled |
| 本地应用失败 | 校验不通过保留draft、已应用snapshot不变，字段内提示；不先乐观覆盖后再回滚。无远程保存，因此无虚假的“网络保存成功” |
| send/regen失败 | 复用安全invalid/unsupported generation error提示；保留用户输入与参数供修正，不自动换模型、不自动重发、不自动降档；结果未知仍走原HTTP持久化核对 |
| 主动/辅助生成 | 不使用这个浏览器草稿；其全局/任务策略保持第3.3节现状。若未来产品要控制它们，是另一设置契约 |

如果后续要求**服务器持久保存**，最小后端工作应只切配置边界：先明确服务全局还是会话范围、返回effective/source/scope、允许字段/协议policy、missing/null/clear、revision冲突、保存后重读和RAM/磁盘失败语义，再实现domain client及共享owner。不能只增加一个GET却宣称Main会自动继承S，也不能把全局temperature PUT改成隐式改变全部Main请求。若继续管理原全局float/温度，至少需补安全读取与失败回滚，再接Settings；这些不属于推荐两字段第一版。

### 8.2 前后端边界

前端可改范围：Header入口、一个小型参数表单/临时draft owner、send和regen的既有generation组合点、相应安全错误投影、必要测试与原有文档。Controller/Execution分层保持；不在UI实现history选择、Provider能力猜测或配置继承算法。

后端：推荐第一版无需改生产代码。Thinking可靠能力契约、全局设置读写补齐、持久化新作用域都应按明确批准的范围单独评估。**不改Main生成链、Prompt顺序、renderer cutover、MCP副作用、message persistence或WS/SSE。** 本机Voice缺口只登记，不在PR6.5-B顺带修复。

### 8.3 必要验证（实施时执行，本轮未运行）

| 边界 | 必需用例 | 现有可复用基础 |
|---|---|---|
| 默认行为 | 未操作面板时send/regen仍省略generation字段；不请求全局Settings；不读旧LS；附件/幂等ID保持 | `chat-current-wire.test.ts`、`chat-send.test.ts`、`chat-media-send.test.ts`、`chat-regenerate.test.ts` |
| 请求有效性 | context 1/100、非法0/小数/null；temperature 0、Anthropic 1/越界、OpenAI 2；两个请求通道同snapshot，reset删键 | `chat-execution.test.ts`及后端`test_generation_options_contract.py`/`test_generation_options_pipeline.py` |
| 真实消费 | 隔离fixture/fake provider捕获实际wire temperature与history选择；改全局temperature/Thinking不得影响未显式覆盖的Main；不要以“请求带了字段”替代payload断言 | 后端generation pipeline与send frozen binding、canonical regenerate suites |
| 身份保护 | quick apply不发main_selection/registry写；连接/协议/模型原样；不兼容新协议提示；快速A/B切换、旧apply、卸载和GET迟到不能覆盖新owner | `chat-main-selection.test.ts`、`MainModelSelection.test.tsx`及Workspace controller tests |
| 执行锁/错误 | 生成、finalizing/unknown期间一致禁用；422保留draft，provider failure不重发/换路由；模型PUT成功而readback失败仍阻断 | 原send/regen controller及model draft tests |
| 会话管理 | PC侧栏与390px手机抽屉管理当前/其他/最后会话；rename失败保留、delete确认/失败、触摸可达、关闭抽屉后焦点落对弹窗 | `ConversationsList.test.tsx`、`ConversationActions.test.tsx`、`chat-pr3-smoke.cjs`，调整Header定位 |
| 布局与搜索 | 配置面板短屏/键盘可滚、Escape/外部关闭/焦点/IME；搜索当前/全局职责及返回位置不变 | 公共Dialog/Popover/control tests，PR6搜索已有定向用例 |

前端验证以相关Vitest为主，加一次type/build；浏览器只覆盖入口和移动端交互变化。后端如果无改动，选择既有契约夹具做定向核验即可；需要跑Python测试时使用隔离临时data/DB和fake provider，不启动真实服务。本轮仅静态审计，不把上述计划记成已通过。

## 9. 现有Settings文档的增量更新计划

**已有统一盘点，无需重建总规划。** 以`settings-inventory.md`保留稳定ID维护覆盖状态；本审计仅为PR6.5的调用链补充，不成为第二份长期全系统清单。本轮不修改下列原文档，实施后按实际结果更新。

| 文档与具体章节 | 已过时/需细化的信息 | PR6.5-B后的最小更新 |
|---|---|---|
| [settings-inventory.md][D1] §1、§2.3 C01、§3 Chat、§5.2、§8 P0 Main契约项 | 仍说Penumbra无模型编辑、仅旧model/readiness、无真实切换；当前PR1和Composer已闭环 | C01标已接通且生效，引用Main configuration、conv_id readiness、PUT+readback；撤掉已解决blocker；若保留状态统计则重算受影响ID |
| 同文 §2.3 C02/C03、§3/§4/§7 Chat轻量入口 | 目前下层支持无UI；旧建议包含thinking/fast/TTS等，不能直接视作首版范围 | 两项实施后标已接通；写清临时请求范围、send/regen实际消费者、无server保存。C04–C06仍未接入，勿统改“Chat配置已完成” |
| 同文 §2.3 C08–C13、§5.2/§5.4 | 全局兼容与请求级拆分基本正确；缺GET和失败语义 | 保留部分路径生效；追加safe GET不含温度/float、旧setter先RAM后save的限制 |
| 同文 §2.3 C22/C23、§4语音待迁项 | 将Chat LS→WS tts_state/HTTP fallback写成已接通；当前Chat并未发送，fallback无调用 | 改为本地合成/播放与Theater/后台状态链分开；C25本机Voice链登记401/额外字段缺口，独立页仍未接入 |
| 同文 §2.2 B17/B23/B24、§4 | 旧test/fetch描述可能混淆仍可用API与已退役入口 | 指向Connection test/fetch；标旧接口409 use_connection_api，模型发现仍未在Penumbra接入 |
| [configuration-ownership-audit.md][D2] §3.2/3.3、§4/5、§7、§12/14 | C1历史描述send忽略temperature、effort写global、context0有效、MODELS重复/无Registry、raw secrets等，与当前实现不符 | 保留历史正文，在开头或相应节加“已被C2A2/Registry/Main closure及本审计取代”的状态索引；不重写成第二份现行总表 |
| [frontend-migration-plan.md][D3] Settings Domain Audit“稳定决策/路线调整”、§4 Settings/Chat行 | conversation.model仍被称事实来源；多个endpoint返回raw secret、只存title/model等旧陈述 | 改为Main selection/请求参数各自权威，安全投影已完成；更新两快捷项状态，其他Settings独立推进 |
| [frontend-contracts.md][D4] §1 Conversation/Chat Setup、§5 Request contract、§9 Carryover、§12 Settings Safe Basics、§13 Provider | 某些段落仍称send模型来自Conversation.model；Settings只读边界仍正确；carryover已有受限引用但Penumbra未接 | 模型依据main_selection；写明两项只显式组装、默认省略和临时范围；Settings继续只读，不因快捷配置上线标Provider管理完成 |
| [chat-pr3-conversations.md][D5] “定向审计与实现矩阵”“会话管理与请求边界”“PC/手机人工验收”“Header视觉收口” | Header三点与侧栏重复的现状将改变 | 改入口描述与测试路径，注明管理统一侧栏/抽屉，保留Controller与锁定语义 |
| [chat-model-menu-ux.md][D6] “最终菜单与状态规则”“自动保存与协议保留回归” | Composer模型控制已存在，且现在另有附件；不能再把它当待建设或整个工具仅模型 | 仅增量说明Header参数入口和Composer模型分工、配置应用不触发模型保存；保留现有自动保存/协议保护 |
| [audits/settings-domain-audit-2026-07-31.md][D7] §3/4/6/7/10 | 历史快照包含Chat mock、无安全readiness/secret DTO等已解决事项 | 保留日期与历史正文，补“现行状态见settings-inventory及后续契约”的短指引，不逐项重审全系统 |
| AionHome [phase5d-unified-settings-contract.md][D8] §2/3/6/7/9；[generation-options-contract.md][D9] §5–11 | 5-D已有唯一Connection权威与退役契约；generation文档主体请求语义正确，个别旧fallback记录过时 | 若B仅前端，无需为UI重复写backend契约；如新增参数policy/持久化API，仅原章节增量补schema、failure/readback/scope；不把历史fallback当现行行为 |

状态更新必须分列“前端入口、保存、运行时消费”。例如Appearance本地保存已接通；Settings运行概览只读已接通；日历仅占位未接通；Composer模型已接通；两个快捷项本轮仍未实施；全局Thinking仅部分路径；固定日程开关已退役。不能用一个勾选统一覆盖这些差异。

## 10. PR6.5-B推荐步骤与待确认边界

1. **先确认实施语义**：采用本报告两字段、临时请求覆盖的最小版；Thinking和持久化配置另议。若实际目标要求跨设备保存，应先定scope/后端契约，不能只做旧Settings PUT表单。
2. 复用现有Chat/Workspace owner和公共控件建立小面板，初始不覆盖任何字段；模型摘要来自现有setup。PC可用Popover，手机优先可滚Dialog/相同字段表单；不复制两份业务state。
3. 把临时snapshot接入send **以及canonical target regenerate**；通过已有mapper传递，合并附件，保留锁、幂等、HTTP持久化核对及安全错误。应用参数不触发模型/Registry/global设置保存。
4. 移除Header的重复ConversationMenu；保留当前搜索按钮，追加快捷配置按钮；侧栏/手机抽屉继续相同管理回调。先补当前会话侧栏/抽屉回归，再移除依赖Header的测试定位。
5. 验证新协议/会话切换清理、温度0/范围、默认省略、send/regen同值、失败不改模型、生成锁、手机键盘与搜索不回归。无需为低频Settings新增完整管理表单。
6. 按第9节维护原有文档的对应ID/章节，以实际实施结果改状态；不新建另一份Settings总清单。若没有后端生产改动，明确记录“不需后端改动”，不要顺带修Voice、fast、cache或PR7。
7. 完成实施后报告修改边界与验证证据；发布/部署仍按后续明确指令。本轮到本文档即止，等待实施方案确认。

剩余无法确认项仅限：生产实际配置/运行版本、具体上游模型对温度及adaptive effort的支持、手机麦克风/播放权限、真实Voice/TTS端到端效果，以及用户是否需要持久化快捷偏好。源码已证明的链路差异不以“需要验证”模糊处理。

完成核验：源码/文档链接的文件和行号有效，Markdown表格列数、引用标签及空白检查通过。Penumbra仅新增本文档，tracked及staged业务文件均无diff；AionHome工作树与暂存区均无diff。未运行业务测试或真实生成调用。审计到此暂停，等待PR6.5-B实施方案确认。

## 源码与契约索引

以下链接是矩阵中的证据索引；函数/字段名称为检索锚点，行号以本轮快照为准。

- [B1] `config.py::load_settings/save_settings/load_chat_status`：Settings加载、迁移、路径与共享计数。
- [B2] `settings_persistence.py::atomic_save_settings`：原子替换与持久性边界。
- [B3] `main_configuration.py::default_main_selection/resolve_main_request`：Main选择与冻结、optionless区别。
- [B4] `routes/main_configuration.py::read_main_configuration`：安全GET、canonical选择与diagnostic。
- [B5] `ai_providers.py::call_anthropic/stream_ai`：generation payload与冻结路由；Anthropic失败不换协议。
- [B6] `routes/chat.py::_selection_for_write/create_conversation/update_conversation`：会话模型/兼容列写入。
- [B7] `routes/chat.py::_send_generation_request_options/send_message/regenerate_target_message/regenerate_message`：请求白名单、开始时解析、两类regen。
- [B8] `prompts/builder.py::build_anthropic_messages`及[cache_window.py](/Users/remix/Desktop/AionsHome-main/aion-chat/cache_window.py:30)：上下文恢复/cache窗口；调用参数不能等同最终消息总数。
- [B9] `camera.py::_call_core`、[location.py::_call_core_location](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py:1204)、[schedule.py Alarm](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py:429)/[Monitor](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py:838)/[Quick Note Step2](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py:1307)、[activity.py initial/follow-up](/Users/remix/Desktop/AionsHome-main/aion-chat/activity.py:1132)：逐任务捕获点。
- [B10] `runtime_llm_resolution.py::_legacy_thinking_snapshot`、[config.py::get_thinking_effort/set_thinking_effort](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:459)：全局兼容Thinking。
- [B11] `routes/chat.py` send与[canonical regen浮现分支](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:3294)；[routes/diary.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:968)亦消费float_interval。
- [B12] `config.py::hidden_heart_enabled/include_hidden_heart/hidden_drift_enabled/include_hidden_drift`：默认隔离与双gate。
- [B13] `routes/chat.py::_resolve_carryover_rows/_persist_send_messages`：受限引用读取与首次写入。
- [B14] `routes/settings.py::tts_voice_list/tts_synthesize`：语音列表与合成接口。
- [B15] `routes/voice.py::voice_status/voice_toggle/remote_asr`：运行时语音能力。
- [B16] `ws.py::set_tts_state/set_tts_fallback/any_tts_enabled`；[main.py入站WS](/Users/remix/Desktop/AionsHome-main/aion-chat/main.py:484)；[static/theater.html::sendTTSState](/Users/remix/Desktop/AionsHome-main/aion-chat/static/theater.html:449)。
- [B17] `connection_registry.py` ConnectionDefinition/ConnectionRegistrySupport；[routes/registry.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/registry.py:110)：v2权威与管理；[model_registry.py](/Users/remix/Desktop/AionsHome-main/aion-chat/model_registry.py:58)静态目录；[连接探测](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:614)仅basic_nonstream。
- [B18] `openai_main_direct_cutover.py`、[anthropic_main_direct_cutover.py](/Users/remix/Desktop/AionsHome-main/aion-chat/anthropic_main_direct_cutover.py:31)：受控renderer选择，不由前端配置保存切路；[stream_ai无跨协议fallback](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:2705)。
- [B19] `routes/chat.py::_follow_up_generation_kwargs/_follow_up_temperature`：父request传播。
- [B20] `memory.py::instant_digest/_call_aux_model`及`RegistryConfigurationService.resolve_feature_request`：辅助绑定/独立采样策略。
- [B21] `routes/settings.py::get_settings/update_temperature/update_float_interval/update_context_toggle`；[settings_secret_projection.py::project_settings](/Users/remix/Desktop/AionsHome-main/aion-chat/settings_secret_projection.py:270)与[公开字段白名单](/Users/remix/Desktop/AionsHome-main/aion-chat/settings_secret_projection.py:47)。
- [B22] `routes/settings.py` cache相关API；[config.py cache getters](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:470)/[固定schedule策略](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:531)。
- [B23] `independent_llm.py::_catalog_selection/resolve_independent_request`：剩余兼容指针/格式的消费者。
- [B24] `activity.py::check_cache_keepalive`：后台保活读取。
- [B25] `voice.py::VoiceWakeup._async_send`、[main.py::auth_middleware](/Users/remix/Desktop/AionsHome-main/aion-chat/main.py:255)与Main send allowlist：本机语音请求不匹配。
- [G1] `generation_options.py`：完整请求字段、严格校验、默认与provider映射。
- [G2] `regenerate_contract.py::load_history_rows`：目标前有界历史。

[P1]: /Users/remix/Desktop/Penumbra/src/components/chat/ChatView.tsx:390
[P2]: /Users/remix/Desktop/Penumbra/src/components/chat/ConversationsList.tsx:143
[P3]: /Users/remix/Desktop/Penumbra/src/components/chat/ConversationActions.tsx:11
[P4]: /Users/remix/Desktop/Penumbra/src/components/chat-workspace/chat-workspace-controller.ts:598
[P5]: /Users/remix/Desktop/Penumbra/src/components/chat/ChatView.tsx:88
[P6]: /Users/remix/Desktop/Penumbra/src/application/chat-execution/chat-execution-request.ts:15
[P7]: /Users/remix/Desktop/Penumbra/src/components/chat/MainModelSelection.tsx:28
[P8]: /Users/remix/Desktop/Penumbra/src/components/settings/SettingsView.tsx:53
[P9]: /Users/remix/Desktop/Penumbra/src/application/chat-media/audio-controller.ts:8
[P10]: /Users/remix/Desktop/Penumbra/src/components/ui/control-styles.ts:1
[L1]: /Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:1291
[L2]: /Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:1469
[L3]: /Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:4108
[L4]: /Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:3904
[L5]: /Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:2151
[L6]: /Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:1611
[G1]: /Users/remix/Desktop/AionsHome-main/aion-chat/generation_options.py:136
[G2]: /Users/remix/Desktop/AionsHome-main/aion-chat/regenerate_contract.py:132
[B1]: /Users/remix/Desktop/AionsHome-main/aion-chat/config.py:63
[B2]: /Users/remix/Desktop/AionsHome-main/aion-chat/settings_persistence.py:9
[B3]: /Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py:122
[B4]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/main_configuration.py:12
[B5]: /Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:1505
[B6]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:945
[B7]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:667
[B8]: /Users/remix/Desktop/AionsHome-main/aion-chat/prompts/builder.py:599
[B9]: /Users/remix/Desktop/AionsHome-main/aion-chat/camera.py:767
[B10]: /Users/remix/Desktop/AionsHome-main/aion-chat/runtime_llm_resolution.py:96
[B11]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1772
[B12]: /Users/remix/Desktop/AionsHome-main/aion-chat/config.py:152
[B13]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:702
[B14]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:392
[B15]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/voice.py:25
[B16]: /Users/remix/Desktop/AionsHome-main/aion-chat/ws.py:30
[B17]: /Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:44
[B18]: /Users/remix/Desktop/AionsHome-main/aion-chat/openai_main_direct_cutover.py:159
[B19]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:839
[B20]: /Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:823
[B21]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:250
[B22]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:489
[B23]: /Users/remix/Desktop/AionsHome-main/aion-chat/independent_llm.py:71
[B24]: /Users/remix/Desktop/AionsHome-main/aion-chat/activity.py:847
[B25]: /Users/remix/Desktop/AionsHome-main/aion-chat/voice.py:231
[D1]: /Users/remix/Desktop/Penumbra/docs/settings-inventory.md:112
[D2]: /Users/remix/Desktop/Penumbra/docs/configuration-ownership-audit.md:214
[D3]: /Users/remix/Desktop/Penumbra/docs/frontend-migration-plan.md:110
[D4]: /Users/remix/Desktop/Penumbra/docs/frontend-contracts.md:332
[D5]: /Users/remix/Desktop/Penumbra/docs/chat-pr3-conversations.md:22
[D6]: /Users/remix/Desktop/Penumbra/docs/chat-model-menu-ux.md:11
[D7]: /Users/remix/Desktop/Penumbra/docs/audits/settings-domain-audit-2026-07-31.md:88
[D8]: /Users/remix/Desktop/AionsHome-main/docs/refactor/phase5d-unified-settings-contract.md:7
[D9]: /Users/remix/Desktop/AionsHome-main/docs/generation-options-contract.md:272
