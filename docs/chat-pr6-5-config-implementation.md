# Chat PR6.5-C — 持久聊天设置、浮现策略与首次发送携带

更新：2026-10-26（Asia/Shanghai）。本记录的现行语义取代PR6.5-B第一版临时请求覆盖（c7cfd1b）；[PR6.5-A审计](./chat-pr6-5-config-audit.md)保留历史判断，长期字段状态只维护[settings-inventory.md](./settings-inventory.md)。本次改Penumbra及AionHome配置/默认解析边界，不commit、push或部署。

## 最终语义

Header保留当前会话搜索，原sliders图标改为三点，tooltip/accessible label为“聊天设置”。桌面、手机均为Header附近的轻量Popover；无大面积遮罩，材质沿用会话工具和当前历史搜索的`mist-glass-strong`半透明雾面，不单独覆盖底色或关闭背景模糊。按可用视口限宽/限高，短屏内部滚动。数值项共享Slider，Thinking使用开关和可换行五档按钮；显示名称、真实有效值；仅一句“修改后自动保存，对后续聊天生效”。外部点击/Escape关闭，键盘关闭回到触发按钮，不修改聊天草稿或搜索状态。

- **上下文消息数**：服务实例全局持久，严格整数1–100；没有保存覆盖时GET返回有效默认30。
- **Temperature**：同服务实例按实际protocol分别持久；Anthropic 0–1，OpenAI/Gemini 0–2；无覆盖时GET返回1.0。切协议读取其独立保存值或默认，不裁剪另一协议温度、不换模型。literal模型支持性仍由上游决定。
- **扩展思考**：按协议保存原子`{enabled, effort}`，默认关闭/medium。当前Anthropic仅确认请求格式可用，literal能力标为unknown，用户开启即手动尝试；其他协议不可开启，不将medium兼容no-op当启用。
- **记忆浮现间隔**：1–15轮、默认12，直接读写原全局`SETTINGS.float_interval`，Chat与Diary共享；非全部召回的总开关。
- **新会话携带历史数量**：服务实例全局0–50条实际消息，默认0；后端首次发送按数量选取来源合格消息，非轮数，不沿用旧UI的`count × 2`误标算法。
- 切会话/刷新/离开再进入保留服务器设置；旧身份的本地草稿失效。Connection/Protocol/Model仍只在Composer修改。原临时owner及send/regen注入参数逻辑已移除，不读写旧LS，不把本地预览冒充服务器事实。
- 拖动只更新显示，释放后单字段提交；键盘长按在keyup/blur时提交一次。无统一应用/取消按钮，无整行恢复默认；已保存项旁的小恢复图标仅清该项覆盖。

源码：[Popover与滑条](/Users/remix/Desktop/Penumbra/src/components/chat/ChatRequestParametersMenu.tsx:1)、[真实DTO/client](/Users/remix/Desktop/Penumbra/src/domain/runtime/chat-defaults.ts:1)、[唯一编辑owner](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/chat-settings-controller.ts:1)、[Chat集成与同步执行锁](/Users/remix/Desktop/Penumbra/src/components/chat/ChatView.tsx:59)。

## 服务端配置契约

复用现有`SETTINGS`、`data/settings.json`及`config.save_settings`的canonical/atomic保存，不另建配置文件、DB表或平行Settings系统。新键：

```text
main_chat_defaults:
  revision: 非负安全整数
  context_limit?: 整数1–100
  temperature_by_protocol: {已知protocol: 有限范围内数值}
  thinking_by_protocol: {anthropic_messages: {enabled: boolean, effort: low|medium|high|xhigh|max}}
  carryover_count?: 整数0–50
# float_interval?: 整数1–15 仍在SETTINGS根级，不复制到main_chat_defaults
```

后端“全局”仍是一个服务实例，不宣称已有用户ID偏好或多租户配置。缺失新键不迁移旧LS或旧`SETTINGS.temperature`，读取不写盘。

- `GET /api/main/chat-defaults?conv_id=…`：既有session保护、no-store、安全投影。返回revision、实际protocol、数值项`value/source/default_value/min/max`；thinking含原子value/default_value/source及服务端capability(status/reason/allowed_efforts)，以及安全selection/conversation_id供身份核对。source区分`saved`与`backend_default`；协议无法可靠解析时temperature为null，不由UI猜测。
- `PATCH /api/main/chat-defaults`：严格单字段`{field, value, protocol, expected_revision}`，field允许context_limit/temperature/thinking/float_interval/carryover_count；value:null清单项，温度/Thinking仅清指定协议；Thinking的value为完整enabled/effort对象，禁止分次写出不一致状态。参数无效422、CAS冲突409、落盘错误503；不接收模型或凭据字段。无变化不写盘/不增revision。
- 保存候选先通过既有原子文件保存，成功后才发布共享RAM并返回确认投影；失败不先更新RAM。不承诺多worker或跨DB事务，也不改造全系统旧setter。旧`/api/settings/temperature`仍是另一兼容策略，本面板不调用。
- 前端串行保存并合并同字段最新意图，重复结束事件去重。revision、读取序号、scope对象及Abort保护旧响应；保存前发起的GET不能覆盖刚保存值。失败保留数值和显式重试，必要时GET核对；不会自动重复PATCH或显示虚假成功。读取失败提供重读，未获得真实元数据不造默认滑条。
- 生成/最终确认/结果未知期间禁止编辑；保存期间暂锁send/regen、模型和会话变更，允许继续滑动并排队提交同一身份的新意图。失败核对期间的新显式编辑也不会丢失。多页签revision冲突需重读后手动重试，不后台覆盖对方值。

源码：[存储校验/投影/候选保存](/Users/remix/Desktop/AionsHome-main/aion-chat/chat_defaults.py:1)、[GET/PATCH](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/main_configuration.py:1)、[既有Settings保存](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:135)。后端现有[generation options契约](/Users/remix/Desktop/AionsHome-main/docs/generation-options-contract.md)第1/5/6节已同步。

## send / canonical regenerate 的真实消费

普通send继续只组装原正文、client_msg_id和附件；canonical regenerate继续空body，不把保存值复制进query。现有显式请求mapper仍保留。Main HTTP共用`_resolve_chat_generation_request`显式启用新默认解析：

```text
显式请求字段 → 新持久Main默认 → generation_options后端默认
```

优先级按字段是否存在判断，temperature=0保留；thinking_effort显式null省略Thinking（canonical前端query会发送字符串null，避免被误当缺失），显式effort覆盖保存的开关与档位；显式temperature:null仍按原契约解析1.0，context:null仍422。协议来自已解析binding，不从模型名或UI推断。保存值与连接/模型binding在同一次Settings snapshot中捕获，随后保持immutable generation options；已经启动的请求及MCP/工具/deferred Camera后续链不重读新值。

只有Main HTTP send、canonical及原legacy regenerate在调用共用解析函数时显式opt-in；共用函数默认关闭，独立`/api/cam-check-trigger`不继承新值。`resolve_main_request`的新flag默认false，后台主动任务、辅助模型、probe/readiness继续各自策略；新Chat默认不改变旧全局温度/Thinking。Provider、Renderer、Prompt、消息持久化、SSE/WS、幂等、regenerate回执、历史窗口和未知结果恢复均未重构。上游参数不支持/网络错误沿原错误与草稿保护，用户手动修正，不自动换路由/重发。

源码：[Main snapshot与优先级](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py:123)、[HTTP共用opt-in](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:781)、[既有mapper](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-request.ts:1)、[后端合成消费测试](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_main_chat_defaults.py:1)。

## 会话管理与搜索

延续PR6.5-B收口：Header不恢复ConversationMenu；桌面侧栏和手机抽屉继续复用ConversationsList及原rename/delete mutation、删除确认、失败草稿、最后会话空态和焦点顺序。当前会话与其他会话均可管理。搜索入口和原文弹框契约不变；本轮PR3测试仅更新“聊天设置”定位名。

## PR6.5-C 的消费与可靠性边界

Thinking默认只补缺失的请求effort：开启的Anthropic偏好补保存档位，关闭时不附`thinking/output_config`；不保证停止模型内部推理。canonical renderer冻结的request semantics及legacy renderer传入的generation options都不回读旧全局开关；MCP/工具/deferred Camera继承父请求。旧`enable_thinking/thinking_effort`继续供optionless/后台兼容消费者使用，不导入、不覆盖。上游400等错误沿既有安全错误投影返回，不自动降档、换协议/模型或重发。Thinking内容解析和展示仍属PR7。

`float_interval`通过chat-defaults GET安全投影有效值与source；PATCH与其他项共享revision。旧`PUT /api/settings/float_interval`也改为同一候选保存器，限定1–15并增加同一revision，使旧界面的更新可被新界面CAS发现。先原子保存，再发布共享RAM；失败不改RAM。Chat/send、canonical/legacy regenerate和Diary原来的读取时机、float_rounds计数及force条件均未改动，既有在途策略保持原读时机。冻结承诺针对Main generation options，不把浮现策略改造为新的请求参数。

新建会话只在原POST里附`carryover_source_conv_id`；Main Selection仍使用后端默认。来源存入conversations新增的可空TEXT列，刷新/切换后仍归属于目标会话。首次send在后端捕获已保存数量，以`created_at DESC, id DESC`选最近的user/assistant且非carryover消息，逆序组成原`CarryoverReference(source_conv_id,message_ids)`，继续走归属/role/重复ID/资格验证。数量是消息条数；不足取全部，0/无来源/来源已空则不附引用。普通send envelope仍只含正文/client_msg_id/附件，无历史正文或隐藏系统提示。

写入前`BEGIN IMMEDIATE`先取得SQLite写锁，再复核首次发送条件，避免不同连接/worker并发复制。携带行仍先于当前user行写入并标is_carryover=1；来源在同一事务中清空。携带首发使用带随机后缀的消息ID避免并发毫秒碰撞。预检失败不消费来源；落库异常后只有DB确认user未提交才清除该client_msg_id预登记，确认不了时保持未知；provider失败或连接未知但user已提交时，来源已消费，原HTTP历史恢复/幂等逻辑确认结果，不重发、不二次携带。零数量也随首次user提交消费来源。已有显式legacy引用仍受原校验，不恢复carryover_messages。

## 仍不在本轮的边界

- **适合聊天操作的TTS（C22/C23/C24）**：旧Chat自动播放/音色是LS偏好，POST /api/tts只是执行合成；Chat未发送tts_state，Theater另有发送者，后台状态同步并未完成。下一步先定义可靠保存的偏好及当前客户端启用边界，再接共享AudioController、浏览器播放授权和必要握手；Provider/Key继续Settings。Voice本机认证/非法请求字段的现存缺口不在此修复。[旧Chat播放](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:2151)、[WS状态](/Users/remix/Desktop/AionsHome-main/aion-chat/ws.py:30)。

HEART/DRIFT仍有gate和消费者，不标为全部退役；不加无效占位开关。

## 验证与文档

以下首组为PR6.5-B既有基线；PR6.5-C新增验收见末尾。

- 前端全量：`npm test`，**161文件 / 2125项通过**；独立TypeScript检查通过；`npm run build`包含tsc与生产构建通过。旧临时语义测试替换为服务端读取/单字段保存、串行/冲突/失败、迟到读取及scope/执行锁测试，保留模型、附件、未知恢复、regen回执现有回归。
- 后端隔离副本：`test_main_chat_defaults.py`、`test_generation_options_pipeline.py`、`test_main_registry_runtime.py`、`test_canonical_regenerate_route.py`，**94项通过**。验证原子保存失败不改RAM/旧文件、协议隔离、restart读取、CAS、显式覆盖优先、温度0、父请求冻结/后台不继承；canonical route实际把持久值传给context和fake provider。独立cam-check-trigger也验证不继承新值。另跑send冻结binding、runtime resolution及regenerate/tool/deferred Camera冻结回归**63项通过**，后端合计**157项**。只使用合成字典、临时文件/DB及fake provider。
- `chat-pr6-5-config-smoke.cjs`：**320 / 390 / 1280px通过**。真实Chat组件+合成HTTP/WS；验证GET有效值、拖动/触摸/长按合批、失败/重试、刷新及跨会话持久、协议隔离、最小send/空body regen、260px短屏内部滚动、外部关闭/焦点恢复及两类搜索。
- `chat-pr3-smoke.cjs`：桌面/手机通过，覆盖当前/其他/最后会话管理、删除恢复、失败与草稿、执行/未知结果锁及原导航/阅读回归。

截图已检查：[320px](/private/tmp/penumbra-chat-pr65/persistent-320.png)、[390px](/private/tmp/penumbra-chat-pr65/persistent-390.png)、[1280px](/private/tmp/penumbra-chat-pr65/persistent-1280.png)。headless视口缩短/键盘测试不代替真实手机软键盘和原生返回手势验收；未调用真实模型，也未读写私人配置/DB。

增量更新：统一`settings-inventory.md`（C02/C03分别列入口/读取/保存/消费/范围/状态，C01与旧兼容项保持独立）、`frontend-contracts.md`、`frontend-migration-plan.md`、`chat-model-menu-ux.md`、`chat-pr3-conversations.md`；审计只补现行状态指引。AionHome只同步既有generation-options-contract的相关章节，没有第二份大型Settings矩阵。

待人工验收：真实设备触摸、短横屏/软键盘、关闭焦点；保存后刷新/跨会话仍保留，切协议显示其独立温度；真实上游不支持温度时保留错误并手动修正。未部署，需前后端同批交付；新前端遇到旧后端会显示读取失败，不伪造“已保存”。


### PR6.5-C 验证与人工验收

- 前端全量 **161文件 / 2132项通过**，TypeScript/生产构建通过；新增五档/关闭、跨刷新、非支持协议、unknown说明、对象偏好合并、错误确认/CAS/迟到响应/执行锁及来源创建DTO测试。
- 后端相关回归 **193项通过**，在仅复制tracked源码、排除data/凭据的隔离副本运行。新增Thinking测试检查两条Anthropic最终wire、五档及关闭、400不重发、HTTP单字段CAS、显式覆盖、旧全局隔离；新增context测试检查原float字段、旧setter失败不发布、Chat/regenerate/Diary真实force消费，真实create/send/SQLite携带及并发。
- `chat-pr6-5-config-smoke.cjs`：320/390/1280px、260px短屏、五档换行、刷新与协议切换、浮现/携带滑块、自动保存失败重试通过。`chat-pr3-smoke.cjs`桌面/手机会话管理、草稿、搜索与未知结果锁通过。模型菜单退出后恢复焦点完成再开设置，避免测试跨Popover退出动画竞争。
- `chat-pr6-5-carryover-e2e.cjs`经真实Chat UI→真实FastAPI/原子设置→隔离SQLite/fake provider，验证0/4/50条、创建来源、离开返回/刷新、目标消息实际入库和第二次send不重复。后端fixture为`aion-chat/tests/ui/chat_pr65c_fixture_server.py`，只能针对隔离源码运行。

人工验收重点：真实设备短屏/软键盘的滚动和焦点；Anthropic literal上手动开启五档及真实拒绝错误；关闭后请求不附Thinking；设置浮现间隔后Chat/Diary沿原策略工作；从有历史会话新建后首次发送看到准确数量、第二次不再携带。真实模型能力仍未验证，不能将unknown显示为支持。需前后端同批交付并运行既有DB初始化以补来源列；未commit、push或部署。
