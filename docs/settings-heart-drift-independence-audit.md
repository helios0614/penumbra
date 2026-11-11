# HEART / DRIFT 配置独立性复审

2026-11-11 · Penumbra `70d71ac` 与工作区高级设置迁移，AionHome `6dc8217`。

## 结论

四个字段可以分别写入，后端的历史回注仍与生成开关单向耦合。对 HEART 和 DRIFT 都一样，**生成关、历史开时，历史仍被拦截**。反向依赖不存在，生成指令的构造条件只读生成开关。上一轮前端如实展示了现有依赖，本次复审按四种组合的新验收口径将它判为缺口。 [当前开关说明](/Users/remix/Desktop/Penumbra/src/components/chat/ChatAdvancedSettings.tsx:33) · [后端历史门控](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:185)

保存配置本身只写 `settings.json`，现存消息的读取和展示也没有使用这四个字段。另有两处输出边界缺口。Main 指定消息重生成可把重复或未闭合的禁用标记带入提交内容，Diary 可在最终清洗前预览意外 DRIFT。 [配置写入](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:300) · [重生成输出准备](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:3488) · [Diary 流式投影](/Users/remix/Desktop/Penumbra/src/application/diary-chat/diary-chat-send.ts:77)

## 字段、默认值和兼容契约

所有字段由同一 AionHome 实例存储，Chat 和 Diary 共用。GET `/api/settings` 投影四个原始偏好，返回值可以是「生成关、历史开」。Penumbra 写单字段并在成功后读回，前端没有重算历史开关的保存值。 [GET 投影](/Users/remix/Desktop/AionsHome-main/aion-chat/settings_secret_projection.py:278) · [Penumbra 客户端](/Users/remix/Desktop/Penumbra/src/domain/advanced-settings/advanced-settings-client.ts:56)

| 字段 | 默认值 | 写入和直接消费者 |
| --- | --- | --- |
| `include_heart` | `true` | PUT `/api/settings/context_toggle`。与 `hidden_heart_enabled()` 取 AND，供 Main、Diary、Anthropic builder、Memory 原文召回、Diary 记忆原文和速记 Step 2 使用。assistant 正文中的旧内嵌 HEART 也受历史清洗门控。 [路由](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:348) · [历史 gate 与清洗](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:280) |
| `include_drift` | `true` | PUT `/api/settings/context_toggle`。由 `drift_inclusion_setting()` 读取，再与 `hidden_drift_enabled()` 取 AND，供 Main、Diary 和 Anthropic builder 使用。 [路由](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:351) · [历史 gate](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:198) |
| `enable_hidden_heart` | `false` | PUT `/api/settings`。控制 HEART 生成指令、生成结果中的 HEART 清洗和持久化许可，并参与当前历史门控。 [写入](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:308) · [运行时](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:194) |
| `enable_hidden_drift` | `false` | PUT `/api/settings`。控制 DRIFT 生成指令、生成结果清洗和持久化许可、Main SSE 的 `drift_enabled`，并参与当前历史门控。 [写入](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:300) · [Main SSE](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2100) |

启动时将 `include_simplethink`、`enable_hidden_simplethink` 迁移到对应 DRIFT 字段，现代字段优先，保存时移除旧键。未迁移的内存 map 和兼容 PUT 仍能识别旧键。旧消息的 SQLite `simple_think`、正文里的完整 `[SIMPLETHINK:…]` 和 WS 兼容字段会归一成应用层 `drift`。配置切换不改这些历史数据。 [迁移](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:68) · [兼容读回](/Users/remix/Desktop/AionsHome-main/aion-chat/settings_secret_projection.py:283) · [消息与 WS 兼容](/Users/remix/Desktop/AionsHome-main/aion-chat/drift_compat.py:20)

旧前端在 Chat 内直接写历史开关，在独立 Settings 表单里随其他设置提交生成开关。Penumbra 在同一区域展示四项，按字段保存并读回。两代前端共用后端门控。Main 重生成入口不同，旧版按钮先删除目标再调用普通 Regenerate，Penumbra 走指定消息替换契约。 [旧端历史开关](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:1327) · [旧端生成开关](/Users/remix/Desktop/AionsHome-main/aion-chat/static/settings.html:1073) · [旧端重生成](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:4423) · [Penumbra 重生成](/Users/remix/Desktop/Penumbra/src/application/chat-execution/chat-execution-client.ts:133)

## 四种组合

表中的「指令」指各构造器的生成门控。Main 的 legacy AiPro／Custom OpenAI 路径还会过滤普通 system 能力块，开关开启时组装出的指令也可能未到达上游。现有 Custom OpenAI 的真实 payload 契约测试明确断言了这一行为。Anthropic 使用自身 system builder，Main canonical send 使用有效能力投影，Diary 自身的能力块以 user 消息进入历史。 [旧 OpenAI 过滤](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:2508) · [Main 能力投影](/Users/remix/Desktop/AionsHome-main/aion-chat/capability_registry.py:425) · [实际 payload 测试](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_main_capability_exposure.py:155) · [Diary 能力块](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1016)

| 生成 | 历史 | HEART 实际 | DRIFT 实际 | 验收 |
| --- | --- | --- | --- | --- |
| 开 | 开 | 有指令，回注已选范围内的 HEART | 有指令，回注已选范围内的 DRIFT | 历史符合，指令受上述协议路径限制 |
| 开 | 关 | 有指令，停止回注 HEART | 有指令，停止回注 DRIFT | 历史符合，指令受上述协议路径限制 |
| 关 | 开 | 无指令，历史也被拦截 | 无指令，历史也被拦截 | **两项均不符合** |
| 关 | 关 | 无指令，无历史回注 | 无指令，无历史回注 | 两项符合，异常输出见下文 |

这里的回注指 Runtime 恢复的历史标记，取决于会话范围、缓存窗口或 Memory 召回结果。表中的「有指令」表示允许模型生成，HEART 原本是按需记录的独立心语，DRIFT 则是面向每轮回复的随想。 [Anthropic 指令](/Users/remix/Desktop/AionsHome-main/aion-chat/prompts/builder.py:284) · [Anthropic 缓存区历史恢复](/Users/remix/Desktop/AionsHome-main/aion-chat/prompts/builder.py:967)

## 实际调用路径

| 路径 | 历史与生成指令 | 输出与持久化 |
| --- | --- | --- |
| Main 普通发送 `POST /api/conversations/{conv_id}/send` | 规范化历史行，按 AND 门控从 `drift` 和 `heart_whispers` 恢复内容，canonical 路径亦从相同门控捕获私有历史。指令由旧 builder、Anthropic system 或 canonical 能力投影按生成开关构造。 [历史](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1457) · [恢复](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1550) · [canonical 能力](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2006) | 流式 start 传生成许可。最终先清洗禁用标记，再按现有命令流程处理。HEART 写独立行，DRIFT 写 assistant 行的 `simple_think`。 [清洗](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2271) · [HEART](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2364) · [DRIFT](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2519) |
| Main 普通 Regenerate `POST /api/conversations/{conv_id}/regenerate` | 走自己的历史组装，使用相同 AND，指令仍走现有 builder 和协议分支。 [历史](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:5180) · [指令](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:5274) | start 带生成许可，最终先清洗禁用标记，再提取 HEART／DRIFT，追加新 assistant 行。端点自身的追加与旧页面先 DELETE 的行为应分开验证。 [输出](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:5747) · [HEART](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:5816) · [提交](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:5888) |
| Main 指定消息 Regenerate `POST /api/conversations/{conv_id}/messages/{message_id}/regenerate` | 按目标快照恢复既有上下文，普通内容和私有历史投影都依赖同一 AND。指令仍按生成开关构造。 [历史](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2756) · [恢复](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2888) · [指令](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:3003) | start 带生成许可，先通用解析，再把禁用的 DRIFT 值和 HEART 行清空。成功时同事务替换目标正文、DRIFT 和旧 HEART 行，下面的残留问题发生在准备提交内容时。 [输出准备](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:3488) · [替换事务](/Users/remix/Desktop/AionsHome-main/aion-chat/regenerate_contract.py:214) |
| Diary 普通对话 `POST /api/diary/entries/{entry_id}/messages` | 读取本条目，历史 AND 控制 assistant 拼接，从共享 `heart_whispers` 取 HEART，从 Diary 行取 DRIFT。能力块分别检查生成开关。Anthropic provider 构造还会检查相同历史门控。 [历史](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:895) · [指令](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1016) · [Anthropic builder](/Users/remix/Desktop/AionsHome-main/aion-chat/prompts/builder.py:645) | 原始 chunk 先发，最终先清洗禁用标记。DRIFT 写 `diary_messages.simple_think`，HEART 用条目 ID 和消息 ID 写共享表，并发独立事件。 [SSE 与清洗](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1147) · [消息](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1219) · [HEART](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1263) |
| Diary Regenerate `POST /api/diary/entries/{entry_id}/messages/{msg_id}/regenerate` | 从目标前的历史快照组装，历史和生成规则与普通 Diary 相同。 [历史](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1429) · [指令](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1537) | 同样先发原始 chunk，最终清洗。成功提交时替换快照后缀，并走现有 HEART 处理。替换会影响旧后缀行上的 DRIFT，属于重生成操作自身。 [SSE 与清洗](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1665) · [替换](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1722) · [HEART](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1771) |
| Memory 的 HEART 原文召回 | `fetch_source_details()` 按来源时间和关键词筛选 Main 消息，只有 AND 为真才查表并附上 HEART。Main 三条路径均可使用该原文。Diary 的 `get_memory_source_text()` 会先查关联 HEART，返回给模型的原文只在 AND 为真时拼入。两者也通过 assistant 正文清洗处理旧内嵌标记。 [Memory](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:447) · [查表与拼接](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:518) · [Diary 查看原文](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:211) | 该读取链不生成 HEART 指令或改写历史行。已存 Memory 摘要文字没有随设置重写，回注门控的可验证边界是历史标记和此次原文附加。 |

## 用户历史与异常输出

- **已存 DRIFT。** Main 的普通列表、窗口及单条 public 读取从行数据和兼容标记构建展示值，`project_message()` 保留 assistant 的 `drift`，对系统或隐藏角色的既有裁剪照常执行。Diary 读自己的消息表。旧端与 Penumbra 都按消息数据展示，四种设置组合都不会因开关隐藏已有 DRIFT。切换后重新开启也无需恢复或重写记录。这个结论基于读写链，尚无跨所有组合的真实浏览器切换测试。 [Main 列表](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1151) · [窗口投影](/Users/remix/Desktop/AionsHome-main/aion-chat/chat_history_read.py:185) · [单条](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1247) · [public DTO](/Users/remix/Desktop/AionsHome-main/aion-chat/chat_public_display.py:146) · [Diary 读取](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:763) · [Penumbra 气泡](/Users/remix/Desktop/Penumbra/src/components/chat/Bubble.tsx:177)
- **已存 HEART。** Main public 列表和单条通过真实 assistant 锚点附加 `has_heart` 与 `heart_revision`，心语正文由按消息查询或独立心语列表读取。Diary 也写共享表，但 Diary 历史 DTO 和 Penumbra Diary 气泡没有 Main 的按消息心语入口，现有旧版心语列表可读取共享表中的记录。指定消息重生成明确替换目标原有 HEART，Diary 后缀替换也可能使旧记录失去原消息关联。这些属于既有操作，设置切换本身不触发。 [HEART 可用性](/Users/remix/Desktop/AionsHome-main/aion-chat/chat_public_display.py:222) · [心语 API](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/heart_whispers.py:12) · [旧版列表](/Users/remix/Desktop/AionsHome-main/aion-chat/static/heart-whispers.html:78) · [Diary 气泡](/Users/remix/Desktop/Penumbra/src/components/diary/diary-chat-presenter.ts:20)
- **Main 指定消息重生成的残留。** 关闭生成时，单个合法 DRIFT／HEART 会被解析移除且不保存为新元数据。内存探针复现 `reply[DRIFT:first][DRIFT:second]` 只移除首项，第二项仍在待写正文中，且规范化回执会将它重新读为 `drift: "second"`。未闭合的 `[DRIFT:open` 或 `[HEART:open` 也留在待写正文。根据调用链，成功事务会写入该正文，SSE 回执和公开读链均可能收到残留。此处验证了实际解析和回执函数，未写数据库。 [解析](/Users/remix/Desktop/AionsHome-main/aion-chat/command_parser.py:373) · [提交调用](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:4107) · [回执](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:3564) · [兼容恢复](/Users/remix/Desktop/AionsHome-main/aion-chat/drift_compat.py:20)
- **Diary DRIFT 的流式预览。** 两条 Diary SSE 的 start 均无 `drift_enabled`，chunk 在清洗前发送。内存探针确认 Penumbra 的 `diaryStreamText()` 会把完整、未闭合及旧拼写标记提取为预览 DRIFT。由控制器直接应用该值可推断，关闭生成后意外输出仍可能短暂出现在当前回复气泡，随后由已保存回执或 HTTP 读回纠正。HEART chunk 会从 Diary 普通正文过滤，未发现对应的心语预览。Main 新端的 DRIFT 预览已有显式生成许可且只展示完整合法值。 [Diary start/chunk](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1147) · [Diary 扫描](/Users/remix/Desktop/Penumbra/src/application/diary-chat/diary-chat-stream-text.ts:2) · [应用预览与回执](/Users/remix/Desktop/Penumbra/src/application/diary-chat/diary-chat-send.ts:77) · [Main 预览 gate](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-accumulator.ts:169)

## 证据和现有测试

**本轮已确认。** 阅读实际路由、Prompt、存储与展示链。用无文件写入的内存探针执行两项历史 gate 的四种组合、Main 指定消息重生成的输出准备与回执映射，以及 Diary 的实际 TS 流式扫描器。未导入完整后端应用，未运行数据库、浏览器或真实 Provider。以下为现有测试的断言覆盖，本轮未重跑套件。

| 已有覆盖 | 缺失或需要更新的验收 |
| --- | --- |
| Main 的 DRIFT 测试覆盖三条路由及四种组合，验证 start 许可、单标记清洗、DB 元数据和下一轮 Prompt。Main 能力测试覆盖 OpenAI／Anthropic 的真实 payload，并固定 `生成 && 历史` 为历史预期。 [DRIFT 测试](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_drift_display_contract.py:14) · [能力测试](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_main_capability_exposure.py:209) | 解耦后需将旧 AND 预期改为历史开关单独决定。分别给两种能力和三条路由准备预先存在的历史标记与不同的新输出值，检查最终上游 payload，避免用同一值掩盖来源。保留 legacy OpenAI 指令过滤的独立基线。 |
| HEART 原文召回、旧内嵌标记、Anthropic 有无缓存窗口及 Diary 查看原文已有测试。部分用例固定「生成关、历史开」不回注。 [HEART 原文测试](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_source_detail_heart_inclusion.py:22) | Memory 和 Diary 原文需更新独立矩阵，验证既有 HEART 仍存在且正确关联。Diary 两条完整请求仍缺两种能力的四组合上游 payload 与持久化对照。 |
| 指定消息重生成已有单个合法禁用标记测试。Diary 有现有私有输出和消息提交顺序测试。新前端测试覆盖四项分别写入、DRIFT 历史可见，以及 Main 流式预览许可。 [指定重生成](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_canonical_regenerate_route.py:218) · [Diary 顺序](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_diary_message_order.py:579) · [高级设置浏览器测试](/Users/remix/Desktop/Penumbra/tests/browser/chat-advanced-settings-smoke.cjs:49) · [Main 流式测试](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-thinking-display.test.ts:93) | 缺少禁用后重复、未闭合标记经过提交、SSE 回执、public 历史的对照，及 Diary 禁用时意外 DRIFT 的流式与最终结果对照。需要覆盖保留旧数据、切换后重开、Main 心语可读和 Diary DRIFT 可见。 |
| 旧 DRIFT 字段／标记迁移、HEART public 可用性已有测试。 [DRIFT 迁移](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_drift_compatibility.py:155) · [HEART public](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_chat_public_producers.py:177) | 两个旧写入别名与现代字段同时出现时的优先级，可加在既有 Settings 路由测试中。真实 Provider 对「有历史、无指令」的输出倾向仍待验证。 |

## 待确认的最小修复

1. **在历史读取层解除 AND。** `include_hidden_heart()` 只读 `include_heart`，`include_hidden_drift()` 只读 `drift_inclusion_setting()`。同时分开 assistant 历史清洗与生成输出清洗。当前 `sanitize_assistant_prompt_content()` 先调用按生成开关清洗的函数，只改历史 helper 会继续丢失部分旧内嵌 HEART。保留历史 DRIFT 的规范化与去重，也保留生成开关对指令、新输出清洗和保存的作用。验证 Main 各组装路径、Anthropic 缓存区、Diary、Memory 和共用 helper 的速记 Step 2。速记 Step 1 直接用生成开关决定是否把 DRIFT 发给辅助模型，属于独立的既有消费者，若要使历史偏好也覆盖该路径应单列决定。 [历史清洗](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:280) · [速记 Step 1](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py:1113) · [速记 Step 2](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py:1243)
2. **分别修两条输出边界。** 指定消息重生成在输出准备时沿用禁用标记清洗，防止重复或未闭合标记进入待写正文和回执。验证相邻与嵌套命令，维持现有事务和副作用顺序。Diary 两条 start 可携带可选生成许可，前端只在明确允许时预览完整合法 DRIFT，旧后端缺字段时等已保存结果。历史读取继续独立。兼容旧 UI 的实际流式表现需单独核验。 [现有清洗器](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:214) · [指定重生成输出](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:3488) · [Diary SSE 客户端](/Users/remix/Desktop/Penumbra/src/domain/diary/diary-chat-send-client.ts:16)
3. **按影响验收后更新文案。** 解耦后，缺失字段仍默认「生成关、历史开」，已有 HEART／DRIFT 可能从原先被拦截变为进入后续请求。显式历史关闭的配置仍会拦截。这个行为变化应在批准修复时一并确认，避免为兼容旧行为而默默重写已保存偏好。更新高级控制说明与旧测试断言。legacy OpenAI 的能力过滤如果需要补齐，只处理这两条能力并单独验证实际 payload，避免放开其他旧能力。保留 HEART 独立记录、DRIFT 消息字段及现有重生成替换范围。 [默认值](/Users/remix/Desktop/AionsHome-main/aion-chat/settings_secret_projection.py:75) · [当前 UI 说明](/Users/remix/Desktop/Penumbra/src/components/chat/ChatAdvancedSettings.tsx:33)

本次交付仅新增复审报告，等待人工确认修复范围。
