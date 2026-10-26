# Chat PR6.5 — 持久聊天设置与轻量悬浮面板

更新：2026-10-26（Asia/Shanghai）。本记录的现行语义取代PR6.5-B第一版临时请求覆盖（c7cfd1b）；[PR6.5-A审计](./chat-pr6-5-config-audit.md)保留历史判断，长期字段状态只维护[settings-inventory.md](./settings-inventory.md)。本次改Penumbra及AionHome配置/默认解析边界，不commit、push或部署。

## 最终语义

Header保留当前会话搜索，原sliders图标改为三点，tooltip/accessible label为“聊天设置”。桌面、手机均为Header附近的轻量Popover；无大面积遮罩，材质沿用会话工具和当前历史搜索的`mist-glass-strong`半透明雾面，不单独覆盖底色或关闭背景模糊。按可用视口限宽/限高，短屏内部滚动。两项共享Slider，显示名称、真实有效值；仅一句“修改后自动保存，对后续聊天生效”。外部点击/Escape关闭，键盘关闭回到触发按钮，不修改聊天草稿或搜索状态。

- **上下文消息数**：服务实例全局持久，严格整数1–100；没有保存覆盖时GET返回有效默认30。
- **Temperature**：同服务实例按实际protocol分别持久；Anthropic 0–1，OpenAI/Gemini 0–2；无覆盖时GET返回1.0。切协议读取其独立保存值或默认，不裁剪另一协议温度、不换模型。literal模型支持性仍由上游决定。
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
```

后端“全局”仍是一个服务实例，不宣称已有用户ID偏好或多租户配置。缺失新键不迁移旧LS或旧`SETTINGS.temperature`，读取不写盘。

- `GET /api/main/chat-defaults?conv_id=…`：既有session保护、no-store、安全投影。返回revision、实际protocol、每项`value/source/default_value/min/max`，以及安全selection/conversation_id供身份核对。source区分`saved`与`backend_default`；协议无法可靠解析时temperature为null，不由UI猜测。
- `PATCH /api/main/chat-defaults`：严格单字段`{field, value, protocol, expected_revision}`，field只允许context_limit/temperature；value:null清单项，温度仅清指定协议。参数无效422、CAS冲突409、落盘错误503；不接收模型或凭据字段。无变化不写盘/不增revision。
- 保存候选先通过既有原子文件保存，成功后才发布共享RAM并返回确认投影；失败不先更新RAM。不承诺多worker或跨DB事务，也不改造全系统旧setter。旧`/api/settings/temperature`仍是另一兼容策略，本面板不调用。
- 前端串行保存并合并同字段最新意图，重复结束事件去重。revision、读取序号、scope对象及Abort保护旧响应；保存前发起的GET不能覆盖刚保存值。失败保留数值和显式重试，必要时GET核对；不会自动重复PATCH或显示虚假成功。读取失败提供重读，未获得真实元数据不造默认滑条。
- 生成/最终确认/结果未知期间禁止编辑；保存期间暂锁send/regen、模型和会话变更，允许继续滑动并排队提交同一身份的新意图。失败核对期间的新显式编辑也不会丢失。多页签revision冲突需重读后手动重试，不后台覆盖对方值。

源码：[存储校验/投影/候选保存](/Users/remix/Desktop/AionsHome-main/aion-chat/chat_defaults.py:1)、[GET/PATCH](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/main_configuration.py:1)、[既有Settings保存](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:135)。后端现有[generation options契约](/Users/remix/Desktop/AionsHome-main/docs/generation-options-contract.md)第1/5/6节已同步。

## send / canonical regenerate 的真实消费

普通send继续只组装原正文、client_msg_id和附件；canonical regenerate继续空body，不把保存值复制进query。现有显式请求mapper仍保留。Main HTTP共用`_resolve_chat_generation_request`显式启用新默认解析：

```text
显式请求字段 → 新持久Main默认 → generation_options后端默认
```

优先级按字段是否存在判断，temperature=0保留；显式temperature:null仍按原契约解析1.0，context:null仍422。协议来自已解析binding，不从模型名或UI推断。保存值与连接/模型binding在同一次Settings snapshot中捕获，随后保持immutable generation options；已经启动的请求及MCP/工具/deferred Camera后续链不重读新值。

只有Main HTTP send、canonical及原legacy regenerate在调用共用解析函数时显式opt-in；共用函数默认关闭，独立`/api/cam-check-trigger`不继承新值。`resolve_main_request`的新flag默认false，后台主动任务、辅助模型、probe/readiness继续各自策略；新Chat默认不改变旧全局温度/Thinking。Provider、Renderer、Prompt、消息持久化、SSE/WS、幂等、regenerate回执、历史窗口和未知结果恢复均未重构。上游参数不支持/网络错误沿原错误与草稿保护，用户手动修正，不自动换路由/重发。

源码：[Main snapshot与优先级](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py:123)、[HTTP共用opt-in](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:781)、[既有mapper](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-request.ts:1)、[后端合成消费测试](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_main_chat_defaults.py:1)。

## 会话管理与搜索

延续PR6.5-B收口：Header不恢复ConversationMenu；桌面侧栏和手机抽屉继续复用ConversationsList及原rename/delete mutation、删除确认、失败草稿、最后会话空态和焦点顺序。当前会话与其他会话均可管理。搜索入口和原文弹框契约不变；本轮PR3测试仅更新“聊天设置”定位名。

## 后续候选的最小边界（本轮不实现）

全局字段也可以放Chat就近操作，以下延后原因是契约缺口：

- **Thinking开关/强度（C04/C09/C10）**：全局GET/保存存在，但Main当前只消费请求effort；协议可接受某字符串不证明模型支持。先提供后端模型级supported/unsupported/unknown、允许effort与关闭/省略的准确含义，再定义可靠持久偏好与Main解析。预算、正文解析/展示与私有内容边界不混入本轮。[generation_options.py](/Users/remix/Desktop/AionsHome-main/aion-chat/generation_options.py:122)、[Main模型描述](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py:139)。
- **记忆浮现间隔（C11）**：旧PUT会持久写S，Chat send/regen及Diary低频浮现确有消费者；safe GET缺字段、旧setter先改RAM。下一步先补effective/source读取与可靠单字段保存，再接滑条；说明Chat/Diary共享策略，保持float_rounds计数及运行时读取时机。[旧setter](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:259)、[Diary消费](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:968)。
- **新会话携带数量（C07）**：当前数量仅旧LS偏好，无服务器偏好契约。先明确单位/边界并持久化数量；新建后的首次send才发送`source_conv_id/message_ids`受限引用，保留后端归属、role、非carryover及写事务内首次发送校验；不恢复raw carryover_messages。[引用校验/持久化](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:676)、[旧数量逻辑](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:3903)。
- **适合聊天操作的TTS（C22/C23/C24）**：旧Chat自动播放/音色是LS偏好，POST /api/tts只是执行合成；Chat未发送tts_state，Theater另有发送者，后台状态同步并未完成。下一步先定义可靠保存的偏好及当前客户端启用边界，再接共享AudioController、浏览器播放授权和必要握手；Provider/Key继续Settings。Voice本机认证/非法请求字段的现存缺口不在此修复。[旧Chat播放](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:2151)、[WS状态](/Users/remix/Desktop/AionsHome-main/aion-chat/ws.py:30)。

HEART/DRIFT仍有gate和消费者，不标为全部退役；不加无效占位开关。

## 验证与文档

- 前端全量：`npm test`，**161文件 / 2125项通过**；独立TypeScript检查通过；`npm run build`包含tsc与生产构建通过。旧临时语义测试替换为服务端读取/单字段保存、串行/冲突/失败、迟到读取及scope/执行锁测试，保留模型、附件、未知恢复、regen回执现有回归。
- 后端隔离副本：`test_main_chat_defaults.py`、`test_generation_options_pipeline.py`、`test_main_registry_runtime.py`、`test_canonical_regenerate_route.py`，**94项通过**。验证原子保存失败不改RAM/旧文件、协议隔离、restart读取、CAS、显式覆盖优先、温度0、父请求冻结/后台不继承；canonical route实际把持久值传给context和fake provider。独立cam-check-trigger也验证不继承新值。另跑send冻结binding、runtime resolution及regenerate/tool/deferred Camera冻结回归**63项通过**，后端合计**157项**。只使用合成字典、临时文件/DB及fake provider。
- `chat-pr6-5-config-smoke.cjs`：**320 / 390 / 1280px通过**。真实Chat组件+合成HTTP/WS；验证GET有效值、拖动/触摸/长按合批、失败/重试、刷新及跨会话持久、协议隔离、最小send/空body regen、260px短屏内部滚动、外部关闭/焦点恢复及两类搜索。
- `chat-pr3-smoke.cjs`：桌面/手机通过，覆盖当前/其他/最后会话管理、删除恢复、失败与草稿、执行/未知结果锁及原导航/阅读回归。

截图已检查：[320px](/private/tmp/penumbra-chat-pr65/persistent-320.png)、[390px](/private/tmp/penumbra-chat-pr65/persistent-390.png)、[1280px](/private/tmp/penumbra-chat-pr65/persistent-1280.png)。headless视口缩短/键盘测试不代替真实手机软键盘和原生返回手势验收；未调用真实模型，也未读写私人配置/DB。

增量更新：统一`settings-inventory.md`（C02/C03分别列入口/读取/保存/消费/范围/状态，C01与旧兼容项保持独立）、`frontend-contracts.md`、`frontend-migration-plan.md`、`chat-model-menu-ux.md`、`chat-pr3-conversations.md`；审计只补现行状态指引。AionHome只同步既有generation-options-contract的相关章节，没有第二份大型Settings矩阵。

待人工验收：真实设备触摸、短横屏/软键盘、关闭焦点；保存后刷新/跨会话仍保留，切协议显示其独立温度；真实上游不支持温度时保留错误并手动修正。未部署，需前后端同批交付；新前端遇到旧后端会显示读取失败，不伪造“已保存”。
