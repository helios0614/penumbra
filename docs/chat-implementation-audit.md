# Penumbra · Chat PR0 — 前后端现状与组件复用审计

审计日期：2026-10-23（Asia/Shanghai）。性质：只读代码审计与后续迁移规划。唯一仓库写入为本文档。

## 1. 执行摘要与审计口径

**结论：应保留现有分层，先修契约，再渐进改交互。Penumbra Chat 已经接入真实业务链，但当前两个仓库的消息 DTO 与模型契约不兼容，不能把“有真实调用链”写成“当前联调可正常使用”。**

- **[现状]** `/app/chat` 已使用真实会话列表、最近历史、发送 SSE、乐观占位、目标消息重生成、HTTP 保存确认和 WS 失效协调。已有 loading/error/empty、切换失败重试、复制反馈、Markdown 与 Thinking 展示。真实入口不调用遗留 mock Hooks。
- **[问题：P0]** 当前 AionHome HTTP 历史与 canonical regenerate 回执使用 `drift`，移除 `simple_think`；Penumbra 两处仍强制读取 `simple_think`。非空历史会触发 `MessageContractError`；成功重生成回执会触发 `ChatExecutionContractError`。流式累加器也只识别旧 `[SIMPLETHINK:...]`，不识别当前 `[DRIFT:...]`，会把该标记留在正文中。见 §5.1、§12。
- **[问题：P0]** Penumbra 以旧 `conversation.model`、`/api/models` catalog 与 `readiness?model=`判定可发送；后端以会话 `main_selection` 的 connection/protocol/literal model 执行。新 reason codes、未列入 catalog 的有效 literal、原生 connection 选择均可能被错误阻断或错误诊断。见 §6。
- **[风险：P1]** 模型修改会更新会话 `updated_at`，可能让该会话成为 Camera Core、Location Core、闹钟、查岗、Activity greeting、速记 Step2 的“最近 Main 会话”。这是现有后端行为，不是本轮要修的 bug；UI 不得承诺“只影响当前聊天”。见 §6.4。
- **[现状]** 新建/删除/重命名会话的 Domain client 已存在，真实页面未接入入口；更早历史有 Application 能力，未接到 Controller/UI；附件按钮 disabled，历史附件只显示“不支持”；工具卡片文件存在但未接入真实时间线。停止生成、当前会话搜索和“放入输入框”尚未实现。
- **[建议]** 首个实施 PR 为 **Chat PR1：消息、模型与 Readiness 契约对齐及最小恢复闭环**。把消息兼容作为模型 PR 的必要验收前提合并交付，不拆成几个无法独立验收的字段修补 PR。之后再做共享 UI/Composer、会话及消息操作、搜索，最后处理 Markdown/通知/工具卡片视觉。详见 §11。

关键证据：[真实 Chat 装配](/Users/remix/Desktop/Penumbra/src/components/chat/ChatView.tsx:43)、[后端历史投影](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1044)、[DRIFT 转换](/Users/remix/Desktop/AionsHome-main/aion-chat/drift_compat.py:20)、[前端历史解析](/Users/remix/Desktop/Penumbra/src/domain/message/message-mappers.ts:29)、[Main 选择解析](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py:122)。

### 1.1 实际快照与执行边界

| 范围 | 实际位置 / Git 快照 | 开始状态 |
|---|---|---|
| Penumbra 新前端 | `/Users/remix/Desktop/Penumbra`；`main @ 50e89f1` | `git status --short` 为空 |
| AionHome 后端 | `/Users/remix/Desktop/AionsHome-main/aion-chat`；父仓库 `refactor-code-main @ 1b5e480` | `git status --short` 为空 |
| AionHome 旧 Chat | 同仓库 `aion-chat/static/chat.html`、相关静态 JS | 功能/行为参考，不作为新前端实现状态 |
| Settings 审计 | [settings-inventory.md](/Users/remix/Desktop/Penumbra/docs/settings-inventory.md:1) | 仅作线索；其记录的两仓库 commit 均早于本轮 |

已阅读 AionHome `AGENTS.md` 及其要求的 runtime model/master plan。本轮对应 Chat PR0／契约准备，不改变运行时行为。保护 message persistence、Prompt 输入顺序、WS type/payload/timing、command grammar/副作用顺序、后台任务目标与 Runtime 冻结边界，不把后端业务状态机复制到 Penumbra。

没有读取真实 `.env`、凭据配置、`data/chat.db`、个人聊天/导出内容或浏览器存储；没有 import/启动后端、调用 HTTP/WS、连接生产、发送消息、写配置、使用浏览器自动化、commit/push/部署或运行全量测试。§12 的检查只对前端纯函数使用人工数据，打包产物留在内存。

**状态口径：**“已实现”表示可到达的源码链路存在，不代表生产验证通过；“部分实现”明确缺 UI、契约或闭环；“仅旧前端”表示旧 UI 与调用存在而新 UI 没有；“后端已有”不等于新前端可用；“缺失”限定在本轮检查的 Main Chat 范围。下面单独列出的契约阻断适用于全部依赖历史读取的功能。

## 2. 当前组件与状态依赖图

以下均为**当前实际结构**；没有已经实现的通用 `ChatShell`、`ComposerMenu` 或 Diary Chat Adapter。

```text
Desktop / EditorialDesktop（外层 h-dvh、桌面导航）
└─ DesktopAppView（ToastProvider；Chat 自带页头）
   └─ ChatView [Main 装配]
      ├─ useChatWorkspace → chat-workspace-controller
      │  ├─ application/chat-workspace → chat-setup → domain/runtime
      │  ├─ domain/conversation → /api/conversations
      │  ├─ application/message-history → domain/message → HTTP history
      │  └─ application/realtime-reconciliation → HTTP 刷新/重建
      ├─ useChatSend → application/chat-send/chat-send-controller
      │  └─ application/chat-execution → openApiStream → SSE parser
      │       （send / canonical target regenerate；结束后回调 Workspace 重读）
      ├─ useChatRealtime → application/chat-realtime coordinator
      │  └─ application/realtime → /ws；事件触发 Workspace 失效/重读
      └─ ChatWorkspaceView [Main 状态驱动视图]
         ├─ presentChatConversations / composeVisibleChatMessages
         ├─ ConversationsList（PC 常驻；手机 Sheet）
         ├─ HeaderCopy + 返回桌面按钮 + 会话列表按钮
         ├─ ChatWorkspaceStates / ExecutionNotice / RealtimeNotice
         ├─ BubbleList（日期分组、底部跟随）
         │  └─ Bubble
         │     ├─ NeutralMessage（system/unknown）
         │     ├─ MessageAvatar / BubbleSegment / MarkdownRenderer
         │     ├─ ThinkingBlock / SimpleThink
         │     └─ MessageActions → useCopyFeedback → Toast
         └─ Sender（本地 value、textareaRef、提交锁；附件 disabled）

遗留、未接入上面真实路径：
useChat / useConversations → mock-data
Welcome；SystemCommandGroup → McpResultCard / SystemMessageLine
MusicResultCard（仅本地 playing 状态，没有真实音频播放）
```

证据：[容器](/Users/remix/Desktop/Penumbra/src/components/apps/DesktopAppView.tsx:80)、[视图装配](/Users/remix/Desktop/Penumbra/src/components/chat/ChatView.tsx:123)、[Workspace 装配](/Users/remix/Desktop/Penumbra/src/application/chat-workspace/chat-workspace-service.ts:28)、[SSE client](/Users/remix/Desktop/Penumbra/src/application/chat-execution/chat-execution-client.ts:23)、[遗留 mock](/Users/remix/Desktop/Penumbra/src/components/chat/useChat.ts:13)、[未接入的工具组](/Users/remix/Desktop/Penumbra/src/components/chat/system-command/SystemCommandGroup.tsx:19)、[音乐本地状态](/Users/remix/Desktop/Penumbra/src/components/chat/system-command/ResultCard.tsx:16)。

### 2.1 状态所有权

| 状态 | 当前所有者 | 是否可以原样共享给 Diary |
|---|---|---|
| 会话列表、选中会话、setup、持久化历史、pending switch | Main Workspace Controller；四类请求各有 AbortController/sequence | 否；绑定 `ConversationSummary`、Main history 与 setup |
| 发送/重生成 execution、optimistic user、stream overlay、保存回执与确认错误 | Main Send Controller | 否；绑定 Main canonical regenerate 与 HTTP 确认规则 |
| WS 连接/退避、dirty、SSE 执行期间延迟协调 | Main Realtime Coordinator | 否；当前 event/conv_id 语义属于 Main |
| 可见消息投影与 execution 合成 | `components/chat-workspace/presentation` | UI VM 可局部解耦；`composeVisibleChatMessages` 仍是 Main 适配逻辑 |
| 草稿、textarea 高度、提交中 | Sender 的组件内 state/ref | 基础交互可共享；当前无法从消息菜单追加，也没有按会话草稿策略 |
| 跟随底部、前一会话/强制跟随 key | BubbleList refs | 可局部解耦为不透明 timeline key；不共享 Main history 状态 |
| Thinking 展开、复制反馈、手机会话抽屉 | 对应 UI 组件 | 可共享交互；抽屉内容/返回目标由页面决定 |

这套分层已承担真实职责，并非“拆成文件但仍全部写在 ChatView”。需要调整的是 UI 类型依赖方向和少量接口，不是新增一个横跨 Main/Diary 的 Provider 或通用生成状态机。

## 3. 现有功能矩阵

| 能力 | Penumbra 状态 | 真实范围 / 旧前端与后端对照 |
|---|---|---|
| 会话列表、选择 | 已实现链路，受 DTO 阻断 | 首次取全部摘要、默认选择；PC 列表/手机抽屉；切换成功原子替换，失败保留旧会话 |
| 新建、删除、重命名会话 | 后端已有；新前端仅 client | `create/update/deleteConversation` 存在，真实 UI 无按钮；空列表无法从当前页面创建第一条会话；旧 Chat 有完整入口 |
| 消息读取 | 部分实现 | 默认最近 50 条，隐藏三类 cam role；当前 `drift` 不兼容会使非空页失败 |
| 加载更早历史 | 后端与 Application 已有 | `loadOlderMessageHistory` 有分页/去重/stalled 防护，但 Controller 无端口、BubbleList 无入口；旧 Chat 有加载按钮和位置补偿 |
| 文本发送 | 已实现链路，受 setup/DTO 阻断 | 仅发送正文和 client UUID；不在 body 伪造 model/provider；尚无 generation 参数 UI |
| SSE 增量显示 | 部分实现 | start/chunk 累加、Thinking/旧 SIMPLETHINK 分离；当前 DRIFT/部分 command 文本会暂留正文；结束后读 HTTP 替换 |
| 保存状态与异常反馈 | 部分实现 | finalizing/uncertain、重读历史按钮、安全错误文案；不是完整执行状态恢复服务 |
| 停止生成 | 缺失 | 真实 Controller 无 stop 端口，UI 无 stop；dispose 只中止客户端读取；Main 后端没有受控 Stop API |
| 失败恢复 | 部分实现 | bootstrap/switch/uncertain 可重读；普通 send error 无直接恢复按钮，重新选择会话才 resetError；无自动重发 |
| 重生成 | 已实现 canonical 链路，受回执/历史契约阻断 | 只对前端判断的尾部 assistant 提供入口；保持同 ID，HTTP 比较保存回执；旧 Chat 仍调用 legacy regenerate |
| 消息复制 | 已实现 | 对持久化 user/assistant 的完整 `message.content` 复制，不是单个拆分气泡；Toast 显示成败 |
| 编辑/删除消息 | 仅旧前端；后端已有 | MessageActions 有可选 onDelete，但 Bubble 不传入；当前 message client 只有 history read，不能把 UI prop 当成已接通 |
| “放入输入框” | 缺失 | MessageActions 与 Sender 尚无组合端口，后端不需要新增引用能力 |
| Markdown / Thinking | 已实现基础渲染 | GFM/highlight、代码复制、Thinking 折叠；空行分块在 Markdown 解析前，复杂块结构有约束 |
| DRIFT / HEART | 部分实现 / 仅旧前端 | 新 UI 有 SimpleThink，但命名/字段落后；HEART 无真实 UI；后端独立存储/事件与上下文恢复，不应混入正文 |
| system 通知 | 部分实现 | 当前全部 system 纯文本，含原始 `[delayed]` 前缀；无结构化类别投影 |
| MCP/POI/Route 等工具结果 | 仅旧前端完整；后端已有 | 新 mapper 保留 JSON，presenter 未传入卡片；不能据 ResultCard 文件认定接通 |
| 音乐、语音、reaction、URL/Web Search 结果 | 仅旧前端完整；后端已有 | 新时间线没有对应消费；voice 在 Domain 保留但 UI 未用，其他部分字段被 mapper 舍弃；旧音乐组件本身也非真实播放 |
| 附件上传、待发送预览、移除 | 仅旧前端；后端已有 | 新 Sender disabled；API transport 支持 FormData，不等于有上传领域闭环 |
| 已存附件预览 | 部分实现 | 新 UI 一律“附件暂不支持”，不展示图片/视频/音乐；旧 UI 有预览/查看器 |
| 模型切换、参数菜单 | 仅旧前端；后端已有 | 新 UI 无入口，旧 Chat 使用 connection/protocol/literal 与 `/api/main/configuration` |
| 当前会话全文关键词搜索、结果定位、高亮 | 缺失 | 未找到 Main 搜索/窗口定位 API、消息全文索引或新前端定位端口；Memory 搜索不等于 Chat 搜索 |
| 悬浮 Composer、手机空输入聚焦展开 | 缺失，具备渐进基础 | 现有 Sender 单层、自动增高最多 144px；无焦点布局状态/Chat visualViewport 适配 |

矩阵证据集中在 §2 的可到达路径；具体缺口：[会话 client](/Users/remix/Desktop/Penumbra/src/domain/conversation/conversation-client.ts:35)、[分页 service](/Users/remix/Desktop/Penumbra/src/application/message-history/message-history-service.ts:43)、[附件占位](/Users/remix/Desktop/Penumbra/src/components/chat/Sender.tsx:126)、[附件投影](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/presentation/chat-message-presenter.ts:85)、[操作接线](/Users/remix/Desktop/Penumbra/src/components/chat/Bubble.tsx:210)、[旧会话管理](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:3932)、[旧消息菜单](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:2952)。

## 4. 前后端业务链与生命周期

### 4.1 会话创建、读取、选择、更新、删除

**[现状]** 新前端链为 `DesktopAppView → ChatView → useChatWorkspace → Controller.load/select → application/chat-workspace → domain/conversation + domain/runtime + message-history → api.ts → HTTP → snapshot → presenter → BubbleList`。发送传输目前直接位于 `application/chat-execution`，并不存在另一个“Domain send client”，不应为画层级图再造一层无职责包装。

后端真实 Main 会话契约如下：

| 操作 | 后端契约 | Penumbra 当前消费 |
|---|---|---|
| 列表/会话读取 | `GET /api/conversations` 返回完整摘要含 `main_selection`、diagnostic；按 updated_at DESC；message_count 只计非 carryover user/assistant | mapper 只取旧 model 等字段；没有单独 GET `/api/conversations/{id}`；单会话当前选择通过 configuration 读 |
| 创建 | `POST /api/conversations`，可指定 title/main_selection；省略选择时复制全局 main_chat 默认并校验；同时保存兼容 catalog model；返回创建实体 | client 仅支持 title/旧 model，UI 无调用 |
| 更新 | `PUT /api/conversations/{id}`，title/model/main_selection；model 与 main_selection 同传冲突；成功 `{ok:true}`；更新 updated_at，广播 conv_updated | client 仅 title/model；没有模型编辑或会话管理 UI |
| 删除 | `DELETE /api/conversations/{id}`，开启 FK，删除会话与级联记录、导出文件，广播 conv_deleted；返回 `{ok:true}` | client 有，真实 UI 无入口 |

首次选择由 `resolveWorkspaceConversationSelection` 决定；ChatView 未传 preferred/current，因此通常取服务端排序第一条，不读取旧 Chat 的 `aion_last_conv`。当前 Sender 没有 `key=conversationId`，草稿会随同一组件跨会话保留；离开 Chat 卸载后丢失。是否按会话保存是未来显式策略，不是既有功能。

切换时 abort 前一次请求、递增 sequence，并同时取目标 setup/history；成功后一次替换标题/选择/历史，失败保留旧 snapshot。执行活跃或 uncertain 时 UI 阻止切换。已有防串会话措施，不报告“切换必然串消息”。证据：[切换保护](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/chat-workspace-controller.ts:215)、[初次选择](/Users/remix/Desktop/Penumbra/src/application/chat-workspace/chat-workspace-service.ts:34)、[后端 CRUD](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:960)。

### 4.2 发送与流式生成

```text
Sender（trim、IME/Enter 判断、提交 ref 锁）
 → ChatView.sendMessage（绑定当前 conv_id）
 → useChatSend / ChatSendController（active 锁，crypto.randomUUID）
 → mapChatSendExecutionInput（仅显式 generation allowlist）
 → openSendExecution → api.openApiStream → POST /conversations/{id}/send
 → 后端读取会话 main_selection，冻结 binding/options，校验请求
 → client_msg_id 去重 → 写 user、更新时间并 commit → WS msg_created(user)
 → 读取历史、捕获 Prompt sources、上下文/记忆/能力编排
 → 后台 task → SSE start/chunk + 相关事件
 → 后处理/命令检查点、assistant commit、WS、结果与续写
 → 后台队列 done（不发给客户端），SSE EOF
 → 前端 flush accumulator → finalizing → HTTP history 重读
 → 确认 assistant ID / duplicate user ID → 清 overlay；否则 uncertain
```

Sender 的“接受成功”是**打开了 stream/收到 duplicate ack**，不是整轮生成或落盘完成；此时才清除未被修改的提交草稿。若 await 期间草稿已有新内容，则保留。生成期间 textarea 被 disabled，暂不支持一边生成一边编辑下一条草稿。证据：[Sender 提交](/Users/remix/Desktop/Penumbra/src/components/chat/Sender.tsx:63)、[前端 active 锁](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-controller.ts:289)、[后端入口及冻结](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1117)、[user 持久化/广播](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1172)、[assistant 持久化](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2410)。

**[边界]** SSE 增量是临时展示，不能当持久化事实；WS 通知也不是生成终止确认。当前代码已经以 HTTP 为最终历史权威。命令/后台追加回复可能继续写消息，不能把“首条 assistant 出现”或“SSE EOF”解释为所有后续工具任务已结束。

### 4.3 重生成：canonical 与 legacy 必须分开

Penumbra 实际调用 `POST /api/conversations/{conversation_id}/messages/{message_id}/regenerate`；参数通过 query 传 temperature/context_limit/thinking_effort/fast_mode/whisper_mode，不传 model 或新的 user input。旧 Chat 当前仍调用 `POST /api/conversations/{id}/regenerate`，其生成/新增行为不能替换 canonical 规则。

**[现状]** canonical 目标必须存在、属于该会话、为非 carryover assistant，且是按 `(created_at DESC,rowid DESC)` 判断的最新真实 user/assistant 消息。后端预留目标、捕获会话消息快照；只用严格早于目标的历史，排除原目标与之后消息，保留完整轮次，再构建原有上下文。成功提交前 `BEGIN IMMEDIATE` 重查快照/目标/设备上下文，冲突拒绝；成功**原地替换同 ID** 的正文/附件/DRIFT/Thinking/tool fields，保持 created_at，并在同事务清除旧 voice、替换 HEART；之后发 msg_updated、persisted 回执，再执行既有后续副作用。

前端生成期间只替换目标位置的 overlay；拿到 named SSE `persisted` 后仍等待 EOF，再比较 HTTP 中同 ID 的 content/thinking/私有展示字段。失败保留旧后端消息；“重读保存状态”不发起第二次 regenerate。该机制应保留。

**[问题]** 当前前端回执要求 simple_think，后端返回 drift；另 canonical 失败流的 `error` 事件未专门映射，随后最小 `debug` 没有前端强制要求的 model/usage 字段，会退化为 contract error，丢失原始安全错误码。前端尾部目标策略遇到末尾 system 会返回 null，而后端忽略 system 判断最新 user/assistant，导致部分后台通知之后 UI 无重生成入口；这是可用范围收窄，不是后端允许任意旧消息重生成。

证据：[canonical route](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:3626)、[目标/历史检查](/Users/remix/Desktop/AionsHome-main/aion-chat/regenerate_contract.py:88)、[替换事务](/Users/remix/Desktop/AionsHome-main/aion-chat/regenerate_contract.py:163)、[回执及后续任务](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:3979)、[前端 finalize](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-controller.ts:145)、[前端尾部策略](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/chat-regenerate-policy.ts:72)、[失败事件](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:3428)、[前端事件 mapper](/Users/remix/Desktop/Penumbra/src/application/chat-execution/chat-execution-events.ts:102)。

### 4.4 SSE / WS 事件、终止、中断与恢复

| 通道 | 当前语义 | 新前端使用边界 |
|---|---|---|
| send SSE | `start{id}`、`chunk{content}`；可穿插 HEART、toy、cam、POI、activity、music、debug 等；正文在最终后处理中还会变化 | 累加 start/chunk、安全 usage/failure；多数业务事件即使 typed 映射了也没有 UI 消费 |
| canonical regenerate SSE | start 指向原目标 ID；chunk；成功 named `event: persisted`；失败 type:error + 最小 debug；队列 done 关闭流 | 需要对齐 drift 回执及失败事件，保留 receipt+HTTP 比较 |
| 终止 | Main 两条路径的内部 `{type:done}` 只使转发循环 break，客户端收到 EOF；不是已发送的 done 帧 | Controller 以 EOF 进入 finalizing 是符合当前 Main 传输的设计 |
| WS 消息事件 | msg_created/msg_updated/msg_deleted；可能是稀疏通知，不保证完整 Message DTO；wire 保持 simple_think 兼容字段 | 转为 ID/conv_id 的失效通知，再取 HTTP；不要直接把 WS payload 追加成 Domain Message |
| WS 会话事件 | conv_created/updated/deleted；main_selection 不加进旧事件，更新选择时 model 仍可能是原兼容值 | 必须主动失效当前 configuration/readiness，不能只比较旧 model 是否变了 |
| WS 断开重连 | 无消息流 resume cursor/通用事件日志；重连退避 1/2/5/10 秒，1008 鉴权失败不盲重连；后端另有 append task 失败 debug 重播 | Main coordinator 重读最近窗口/列表，执行中延迟；不意味着恢复 SSE 或后台任务进度 |
| 客户端 abort / 页面离开 | 后台 create_task 与 SSE 连接分离；send/regenerate 均继续执行 | dispose abort 是释放客户端资源，不能声称“停止生成”或“取消未写入” |
| 超时 | 新前端 api 默认总请求 30 秒，timer 覆盖 body 消费；后端 provider/追加任务可能运行更久 | 活跃输出也会触发总超时；需单独定义 stream deadline 与恢复语义，不宜直接去掉全部限制 |

**[风险]** 断流进入 finalize 时，如果已有 executionError，当前 Controller 不再要求 assistant ID 或 regenerate receipt 的成功匹配；一次成功 HTTP 读取即可变为普通 error 并清掉 active。此时后台可能仍在生成，后续会由 WS 再刷新。UI 对这种错误没有直接“仅重读恢复”入口，`getChatSenderAvailability` 在 error 时禁用输入，ChatView 只在选择会话时 resetError；同一会话重新点击可解除，但不够明确。不能用“重发原消息”替代恢复。

**[风险]** 还有响应头尚未返回的窗口：后端先提交 user，再做上下文准备，最后才返回 SSE；若此时客户端超时/断网，`openExecution` 的 catch 直接进入 error，并不先重读历史，草稿会保留。下一次人工发送会创建新 UUID，不能依赖原请求的进程内去重消除重复。建议先核对 HTTP 历史/原请求身份再提供重试，不把“客户端未收到接受响应”当成“后端没有写入”。证据：[前端 opening catch](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-controller.ts:340)、[后端先提交 user](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1181)。

**[建议]** PR1 先提供明确的恢复动作、区分请求失败/后台状态未确认，校准 stream timeout；保留不确定状态只做 HTTP 恢复。真正 Stop 需要服务端执行身份、取消确认、部分输出/副作用政策，当前未具备，应另定契约，不在 Composer 中把 AbortController 包装成停止。

证据：[SSE EOF/断开](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2623)、[regenerate 断开](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:4051)、[WS wire](/Users/remix/Desktop/AionsHome-main/aion-chat/drift_compat.py:38)、[重连协调](/Users/remix/Desktop/Penumbra/src/application/chat-realtime/chat-realtime-coordinator.ts:172)、[默认超时](/Users/remix/Desktop/Penumbra/src/lib/runtime-config.ts:3)、[stream 管理](/Users/remix/Desktop/Penumbra/src/lib/api.ts:293)、[总 timer](/Users/remix/Desktop/Penumbra/src/lib/api.ts:454)、[error 禁用](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/chat-sender-policy.ts:40)。

### 4.5 附件与消息操作链

**[现状]** 后端 `POST /api/upload` 接 multipart，检查声明 MIME 白名单与 20MiB，返回 `{url,type,name}`；不支持的类型/过大返回 `{error}`，不能只用 HTTP 2xx 判断成功。当前白名单覆盖指定图片/视频/音频格式，不是任意文件。send 接受 `attachments: string[]` URL，持久化为 JSON；assistant 音乐等附件则可能是结构化对象。生成时附件 materialization/prompt 选择属于后端，不要让 UI 通过 model 名称推断真实 vision 能力。

旧 Chat 有 file input、粘贴图片上传、pending preview/移除，提交 URL 数组；新前端只有 `UPLOAD_URL` 与 FormData transport 基础，无上传 client/队列/失败重试/预览/附件发送 UI。现有 `ChatGenerationUiValues` 支持 attachments，但 ChatView 没传 generation。Sender 当前要求非空文本，也未支持仅附件发送。

复制已经接通。编辑/删除后端分别为 `PUT /api/messages/{id}`、`DELETE /api/messages/{id}`，有消息/语音/interaction 及导出副作用；不能以本地 filter 冒充真实删除。新建“放入输入框”仅需 UI 草稿组合，见 §8.5，不需要上述 mutation。

证据：[上传 route](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/files.py:199)、[MIME 白名单](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:444)、[旧预览上传](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:4950)、[generation 映射](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-request.ts:10)、[消息操作副作用](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1073)。

## 5. 消息、内部上下文与展示投影

### 5.1 HTTP / SSE / WS 的 DRIFT 字段不是同一形状

| 边界 | 当前后端事实 | Penumbra 当前处理 | 判断 |
|---|---|---|---|
| SQLite | 物理列继续叫 `simple_think` | 不应直接消费 DB 命名 | 无需迁移 DB |
| HTTP history | `canonicalize_drift_mapping` 从旧列恢复 drift，随后 `pop("simple_think")`；旧正文中的 DRIFT/SIMPLETHINK 标记也提取/剥离 | parseMessage 强制 simple_think 为 string/null；undefined 不通过；完全未读 drift | **确定不兼容；不是只有存在随想的消息才失败** |
| regenerate `event:persisted` | `{id,content,thinking,drift}`，可空 | 强制 `{...,simple_think}` | **确定不兼容** |
| WS message event | broadcaster 在 wire 边界把 drift 转回 simple_think，维持旧事件形状 | 当前只取 ID/conv_id 做失效，不直接映射完整消息 | 该通道不要求为修 HTTP 而改后端 WS |
| SSE chunk | 当前生成文本使用 `[DRIFT:...]`；旧 `[SIMPLETHINK:...]` 只供读兼容；Thinking 有独立标记 | accumulator 识别 THINKING 与 SIMPLETHINK，未识别 DRIFT；其他命令文本也可能直到最终 HTTP 读回才消失 | 需局部修展示解析，不能在 UI 执行命令 |

**[建议]** 在 transport/Domain mapper 统一当前 canonical `drift`；如需兼容旧部署，只在边界接受 `simple_think` 并规定 drift 优先，冲突要明确处理，不扩散两套权威。UI 中暂存 `simpleThink` 名称可分步更名，关键是值与展示权限正确。流式标记按跨 chunk 前缀保留规则识别，避免半个标记闪入正文；持久化、marker 生成规则和 WS wire 保持原后端语义。

证据：[后端 DRIFT 兼容边界](/Users/remix/Desktop/AionsHome-main/aion-chat/drift_compat.py:14)、[HTTP 调用点](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1063)、[回执投影](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:3417)、[前端 required 字段](/Users/remix/Desktop/Penumbra/src/domain/message/message-mappers.ts:37)、[前端 SSE receipt](/Users/remix/Desktop/Penumbra/src/application/chat-execution/chat-execution-events.ts:25)、[累加器 marker](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-accumulator.ts:7)。

### 5.2 四类数据必须保持边界

| 类别 | 源码中的真实例子 | 允许的 UI 使用 |
|---|---|---|
| 用户可见聊天消息 | 真实 user input、已清理的 assistant content；carryover 是另有来源标记的历史复制，不是本轮新输入 | 气泡、正文复制、放入输入框、经可见性规则确认后的关键词搜索 |
| UI 通知 / 工具结果 | system 日程通知；`mcp_tool_calls` 的脱敏/有界 result、error、args、截断状态；web_search/url_read feedback | 使用显式结果投影；展示成功/失败/截断，不凭 emoji、关键词猜工具类型 |
| synthetic context | `[delayed]` system 在恢复时转 provider user；MCP/Location/Activity/CAM 结果组成 synthetic user inputs | 只在后端 prompt/续写组装内消费；不能因为 provider role=user 就做成新的用户气泡 |
| 模型内部证据与私有上下文 | persona/worldbook、召回记忆/日记/速记、设备事实、Prompt plan/timeline、debug.prompt_messages/api_payload；HEART/DRIFT 的上下文恢复 | 不进入普通正文、复制、草稿追加或搜索结果；既有 Thinking/DRIFT 专用辅助展示不等于授权显示全部内部上下文 |

**[现状]** `list_messages` 返回原始历史行的若干投影，包含 hidden role/cache 字段，并非已完成安全分类的 VisibleMessage API。Penumbra mapper 把 cam_trigger/cam_user/cam_log 标为 hidden-runtime，presenter 不显示，这是应保留的正确边界。其他 unknown role 的 role 名称被清理，但其 content 仍原样展示；system 也全部作为纯文本显示。没有证据证明所有 system 都是私有 Prompt，也不能反向假设所有 system/unknown 都适合搜索或跨业务复用。

Camera/Location 的 core_prompt 写入 `cam_trigger`，另写简短 system 通知；两者不能合并。`history_semantics.py` 的分类是**模型历史语义**，其中 external_event/tool_result 不能直接当 UI 可见性枚举。结果 batch 会生成 role=user 的 synthetic 输入，但持久化的是 system carrier 与后续 assistant；搜索应查询用户可见存储投影，不查询 provider history 或导出/debug 文本。

MCP 的 `ai_result` 与 `result` 有不同预算，额外保存结果未必送入模型；其结构化内容已做脱敏/截断。以后卡片可以分别展示这些已允许的结果与预算事实，不能自行恢复更大的 AI 输入或把整份记录 JSON 当正文。新前端当前仅显示 system.content，没有保留这些卡片语义。

证据：[隐藏 role](/Users/remix/Desktop/Penumbra/src/domain/message/message-mappers.ts:128)、[可见 presenter](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/presentation/chat-message-presenter.ts:39)、[后端模型历史分类](/Users/remix/Desktop/AionsHome-main/aion-chat/history_semantics.py:121)、[Camera 双记录](/Users/remix/Desktop/AionsHome-main/aion-chat/camera.py:865)、[Location 双记录](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py:1305)、[synthetic batch](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:4183)、[持久化结果 carrier](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:4219)、[结果预算/脱敏](/Users/remix/Desktop/AionsHome-main/aion-chat/mcp_results.py:62)。

### 5.3 命令执行、追加回复与恢复

**[现状]** Main route 仍保留 pre-save/post-save 检查点，使用 `CommandRuntime`、`ReplyCommands`、`ReplyResultBatch` 等已有边界；结果型命令按源码位置排序并顺序执行，批次持久化/收尾有自己的 finally 语义。`append_reply_runtime` 对追加生成做有限尝试、冻结 wire、超时与任务失败回执，不重放 trigger/tool/command/message commit。后端 WS 建连时可重播这些失败通知；Penumbra 当前将其作为未知 debug 事件忽略，旧 Chat 有 system log 消费。

**[建议]** UI 只消费可见事件/结果。工具正在执行与后台续写失败不能靠重发用户消息恢复，更不能点击卡片重新执行全部 side effects。HEART 为独立记录/事件，Thinking 与 DRIFT 是不同字段，不能合并成正文。保留 debug mapper 只取安全 usage/failure 的白名单；不要为了卡片复用开放 Prompt/debug 原始 payload。

证据：[命令边界](/Users/remix/Desktop/AionsHome-main/aion-chat/command_runtime.py:1)、[结果命令顺序](/Users/remix/Desktop/AionsHome-main/aion-chat/command_runtime.py:28)、[追加任务边界](/Users/remix/Desktop/AionsHome-main/aion-chat/append_reply_runtime.py:1)、[失败回执](/Users/remix/Desktop/AionsHome-main/aion-chat/append_reply_runtime.py:61)、[WS 重播](/Users/remix/Desktop/AionsHome-main/aion-chat/main.py:468)、[SSE 安全 debug 摘要](/Users/remix/Desktop/Penumbra/src/application/chat-execution/chat-execution-events.ts:102)。

## 6. Registry v2 Main Selection / Readiness 专项

### 6.1 权威来源、初始化与冻结

| 层次 | 当前真实来源 | 生命周期 / 影响 |
|---|---|---|
| 全局 Main 新会话默认 | Registry v2 `usage_bindings[usage=main_chat]`；带 main authority 版本/诊断；无绑定时报 main_default_not_selected | 仅在新建等显式默认解析时读取，已有会话不随默认改动重选 |
| 新会话 | 显式 main_selection 优先，否则复制上述默认；保存至 conversations.main_selection | 完整身份是 connection_id + protocol + literal model；已有 profile_id 格式可兼容读取 |
| 已有会话 | conversation_main_selection(row)，缺失/无效直接 diagnostic/error | 不以旧 model 或“第一个可用连接”兜底 |
| 执行 | `resolve_main_request` 深拷贝 settings，按选定连接/协议取 endpoint/credential，使用 selection.model literal | 冻结 `RuntimeLLMBinding` 与 `ResolvedGenerationOptions`；不靠 catalog provider 重新选路 |
| 请求选项 | send body / regenerate query 中显式 generation 字段 | 与会话模型持久配置独立；每次请求解析，不是 global Settings PUT |
| 后续结果续写 | 传递 resolved_request，derive options 时保留父 binding | 不因用户改模型而把已开始的链切到另一连接；新生成再取新配置 |

MainSelection 当前新写法支持 `openai_chat_completions`、`anthropic_messages`；兼容 `profile_id`（含历史 Gemini）是读取/执行边界，不能假装新选择器支持所有 catalog provider 或自动把不支持格式换成默认连接。Connection 保存凭据/端点，protocol 属于 selection/binding；literal model 不要求属于 `/api/models` catalog。

旧 `conversations.model` 为兼容消费者保留：main_selection-only 写入不更新它；显式旧 catalog model 只在已选路由上转换 literal，不负责切连接。不能用双写旧 model 来掩盖新 UI 的错误来源。

证据：[MainSelection schema](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py:51)、[默认绑定](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py:94)、[连接/执行冻结](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py:122)、[兼容写入](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:940)、[连接事实](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:387)、[冻结 Runtime 类型](/Users/remix/Desktop/AionsHome-main/aion-chat/runtime_llm_resolution.py:108)。

### 6.2 `/api/main/configuration` 与 Readiness 应如何使用

**[现状]** 两者均为安全只读/no-store；读取不执行配置迁移，也不主动探测模型。

- `GET /api/main/configuration?conv_id=...`：读取当前会话；省略 conv_id 读取新会话默认。不存在的会话返回 404。返回 `connections`（不含 key/credential_ref；有 credential_configured）、`allowed_protocols`、兼容 `profiles/models/selection`、canonical `connection_selection` 与 diagnostic。保存的身份即使不可执行也应保留供纠正，不能自动选第一个连接。
- `GET /api/chat/readiness?conv_id=...`：按会话权威选择解析，返回 `{ready,model_key,reason_code,setup_action_required}`；不存在会话是 `ready:false/reason_code:conversation_not_found` 的响应。`model_key` 此处是当前 literal，不是旧 catalog key。
- 省略 conv_id 检查全局默认；legacy `?model=` 只试图改变默认 profile 上的 literal。它不是“检查这条会话的模型”，也不接受任意 connection/protocol 组合。
- Readiness 表示本地配置可解析且凭据存在，不证明网络/余额/模型远端能力或一次真实调用成功。`POST /api/main/test` / connection test 是不同能力，本轮未调用。

**reason_code 展示建议（未来）：**保留安全原码，按原因类别显示操作，不打印原请求、URL、Key 或内部异常。

| 类别 | 当前后端可返回的代表代码 | UI 最小处理 |
|---|---|---|
| 就绪 | ready | 允许当前作用域的发送/重生成 |
| 未选择/格式错误 | main_default_not_selected、main_selection_required、invalid_main_selection、literal_model_required | 显示需选择连接/协议/模型；默认与会话分别处理 |
| 连接/协议不可用 | missing_profile、disabled_profile、invalid_connection、invalid_profile、incompatible_protocol | 保留当前已存身份，进入更正选择或 Settings |
| 配置不完整 | missing_credential、missing_base_url、invalid_base_url、invalid_registry_configuration | 安全文案与完整设置入口；不是要求 Composer 输入 Key |
| 历史迁移诊断 | ambiguous_legacy_selection、unknown_legacy_model 等 MAIN_DIAGNOSTIC_CODES 白名单 | 显式纠正，禁止 silent fallback |
| 会话不存在 | conversation_not_found | 重读列表并恢复选择，不在新会话发送 |
| HTTP/网络/未知合法新代码 | 401/403、超时/服务不可用，或未来新增 reason | 区分鉴权/暂不可读/需设置；未知码安全降级为未确认，不丢掉全部可读历史 |

该表是现有返回值和未来 UI 分类建议，不承诺每个代码均在当前生产触发。证据：[configuration route](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/main_configuration.py:11)、[安全候选](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:406)、[readiness route](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat_readiness.py:24)、[diagnostic 白名单](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py:26)。

### 6.3 Penumbra 当前错位与最小对齐方案

**[现状]** Conversation mapper 舍弃 main_selection/diagnostic，把旧 model 变成 modelKey；chat-setup 用它调用 `readiness?model=`，再匹配 `/api/models` catalog 产生 modelLabel/modelKnown。**当前 ChatView 标题只显示会话标题，列表副标题只显示条数，尚无当前模型标签或选择器**；这里的“显示来源错位”首先存在于 setup 派生数据和可发送资格，并不是一个已存在模型菜单显示错了名称。

**[问题]** getChatSenderAvailability/getChatRegenerateAvailability 要求 selected.modelKey、setup.modelKey、readiness.modelKey 完全一致，且 modelKnown=true。后端有效 literal 不在 catalog 中也可执行，前端却会禁用。readiness 新原因不在五项白名单中会触发 RuntimeContractError；已是 connection_id 选择的默认，用 legacy model query 构造缺失 profile 的 MainSelection，还可能返回 invalid_main_selection。Settings 审计的这项结论在当前源码仍成立。

模型变更同步还有一个确定缺口：后端 main_selection-only 更新的 conv_updated 仍携带原兼容 model；Workspace.refreshConversationList 只有 selected.modelKey 改变/会话消失才重新加载 setup。即使将来加上 PUT 按钮，若继续沿该判断，配置与 readiness 不会跟随会话选择变化。

**[建议：最小闭环，PR1 前置工作]**

1. 在现有 Domain/Application 边界增加安全 MainConfiguration 与 MainSelection DTO，保留合法 legacy profile 读取；新 UI 写 canonical connection/protocol/model。扩展已有 conversation client，避免另建 Provider/Registry 状态系统。
2. bootstrap 读默认 configuration；选会话读 `configuration?conv_id` 与 `readiness?conv_id`。以服务端选择/诊断决定可执行性，移除 catalog membership 作为发送必需条件；catalog 只提供建议，保留用户 literal 输入。connection/protocol 与 literal 一起展示。
3. 持久写 `PUT /api/conversations/{id}` 的 main_selection；成功后重读同一会话 configuration、readiness、摘要，按 owner+sequence 丢弃过期结果；失败保留草稿和已存身份，不先展示“已切换”。切会话期间不得将旧菜单草稿写到新会话。
4. 当前会话的 conv_updated 即使旧 model 不变也使配置失效；候选刷新与已存选择/未保存草稿分开。Settings 修改连接返回后主动重读；当前未找到通用 Registry 变更广播，不能宣称跨设备自动实时同步已具备。
5. `main_chat` 默认如需要修改，复用 `PUT /api/registry/feature-bindings/main_chat`，由 Settings 承担完整管理；明确“新会话默认”与“当前会话模型”是两个操作。旧 `/api/registry/bindings/{usage}` 写路由现在拒绝并要求 connection API，不应重新接旧接口。
6. 同步处理 §5.1 的 drift/receipt/stream 与 canonical failure 事件契约，提供配置读取重试与安全错误码 UI，保护可读历史。验证当前请求 frozen binding 不变、后续请求取新选择。这个闭环不改后端执行链、消息写入或后台绑定。

证据：[前端 mapper](/Users/remix/Desktop/Penumbra/src/domain/conversation/conversation-mappers.ts:50)、[setup 调用](/Users/remix/Desktop/Penumbra/src/application/chat-setup/chat-setup-service.ts:25)、[catalog gate](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/chat-sender-policy.ts:57)、[setup VM](/Users/remix/Desktop/Penumbra/src/application/chat-setup/chat-setup-view-model.ts:24)、[当前配置重读判断](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/chat-workspace-controller.ts:437)、[旧写路由已拒绝](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/registry.py:87)、[v2 功能绑定](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/registry.py:165)、[旧 UI owner/sequence 参考](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:2747)。

### 6.4 切换 Main 会话模型的实际后台影响

**结论：会间接影响部分后续任务，并可能改变它们写入的会话。** 下表是当前消费者重新核对结果，不把 KNOWN_USAGES 中的名称等同于已独立生效的任务绑定。

| 消费者 | 当前取值与目标 | 影响边界 / 证据 |
|---|---|---|
| Camera Core | 最近 updated_at 的 Main 会话 → resolve_conversation_main | 会受该会话选择影响；[目标](/Users/remix/Desktop/AionsHome-main/aion-chat/camera.py:652)、[解析](/Users/remix/Desktop/AionsHome-main/aion-chat/camera.py:767) |
| Location Core | 同上 | [目标](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py:1100)、[解析](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py:1198) |
| 闹钟 Core / 查岗 Monitor | 选择最近 Main，再冻结请求 | [Alarm](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py:416)、[Alarm 解析](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py:428)、[Monitor](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py:802)、[Monitor 解析](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py:830) |
| Activity greeting | 最近 Main → resolve_conversation_main | [目标](/Users/remix/Desktop/AionsHome-main/aion-chat/activity.py:1050)、[解析](/Users/remix/Desktop/AionsHome-main/aion-chat/activity.py:1124) |
| 速记 Step2 主生成 | 最近 Main → resolve_conversation_main；无会话时 helper 使用默认 | [调用](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py:1292)、[helper](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py:189) |
| Sentinel / 压缩 / Memory 等已迁移辅助任务 | 各自 Registry feature binding | 不因当前 Main 选择字段直接改绑；共用同一 Connection 时，修改连接本身会影响后续请求 |
| Diary 兼容路径 | 显式请求 → Entry JSON 选择；否则最近 Main **旧 catalog model** → Entry 旧值/默认 | 不等于跟随 Main literal；main_selection-only 写入不更新旧 model，但 updated_at 可能改变兼容路径取到哪个 Main；[优先级](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:288) |

模型/title 写入均更新 updated_at；选择会话的只读操作本身不更新它。**已开始且已冻结请求的 Runtime 不被本次选择热切换；尚未捕获配置的下一任务会读当时最近会话。** 不能扩大为“整个服务的所有状态都被冻结”，冻结对象主要是 binding/options 及各路径已有 snapshot。

**[建议]** 模型面板明确说明“当前会话选择也可能被跟随最近 Main 的后台任务使用”。是否将 Camera/Location/闹钟/速记改为独立绑定，应另做业务决策/契约，不夹带在 Chat 视觉或组件抽取 PR 中。

### 6.5 单次 generation options 与持久配置

Main 正常请求默认 temperature=1.0、context_limit=30、fast_mode=false、whisper_mode=false，thinking_effort 未显式设置时为 None；temperature 范围按协议，context_limit 当前 1–100，thinking 支持策略也按协议。省略和 null 不总是同义，例如 context_limit=null 无效；应保持现有 allowlist 对显式 false/0/null 的区分。它们不是从全局 Settings 自动完整继承，也没有现成“会话参数持久配置”接口。

Main 后台 legacy_optionless 路径另有全局 temperature/thinking 兼容策略，Diary 也有自身的默认来源；共享参数控件只展示适配层给出的 effective/source，不共用这些默认推导。新 Composer 参数如需跨请求保存，可先明确本地 UI 偏好与后端会话持久设置的区别，不能用全局 PUT 伪装本会话设置。

证据：[generation defaults/schema](/Users/remix/Desktop/AionsHome-main/aion-chat/generation_options.py:20)、[参数解析](/Users/remix/Desktop/AionsHome-main/aion-chat/generation_options.py:86)、[legacy optionless](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py:176)、[前端显式值映射](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-request.ts:20)。

## 7. 组件复用性与目标边界

### 7.1 当前组件逐项判断

“可直接复用”指 UI 的 props 已足以表达交互，Diary Adapter 提供合适输入即可；不代表可以把 Main Message/Controller 直接交给 Diary。

| 组件 / 文件 | 当前职责与真实接线 | Main 依赖 / 过重或重复点 | Diary 复用判断与建议 |
|---|---|---|---|
| `ChatView.tsx` / DesktopAppView | Main Hooks、page 状态与业务动作装配；页面容器已接通 | 强依赖三个 Main Controller/策略；同文件还有 header/notice | **保留 Main 专属装配**；只在确有第二使用方时提取纯壳，不复制整个页面 |
| `ChatWorkspaceView`（同文件） | 将 Workspace/Send/Realtime 状态转 UI，手机抽屉、header、消息/输入布局 | props 直接接受 Main 状态；不能称为 Shared Chat UI | **局部拆边界**：未来壳只收 header/sidebar/body/composer/notice slots；不要把 Main state union 移到共享包 |
| `BubbleList.tsx` | 日期分组、角色间距、ScrollArea、96px 底部跟随、强制跟随 key | 使用 presentation VM 与 conversationId，但不发 API；滚动与列表布局同文件，规模尚可 | **局部解耦后复用**：conversationId 改为不透明 timelineKey；消息 item/定位接口通用，分页数据仍由 Adapter 提供 |
| `Bubble.tsx` | user/assistant/system/unknown；分块、头像、固定人名、时间、Thinking、附件占位、操作条 | 无 API；直接依赖 Main presentation 类型，硬编码“你/知远”与头像；混合内容 renderer；system 与 SystemMessageLine 有重复文本展示 | **局部解耦后复用**：共用小型 UI VM，身份通过 props；保留现有 BubbleSegment；system/tool 走显式呈现，不借机重写气泡 |
| `Sender.tsx` | 一行 textarea 自动增长、Enter/Shift+Enter/IME、async 接受、ref 防双提交、草稿清除保护 | **无 conv_id/API/model 依赖**；value/ref 私有，附件占位；没有焦点布局状态 | **基础组件可直接复用**；新增受控 value/onValueChange 与 focus 端口即可组合草稿/菜单；不引入通用生成 Hook |
| `MessageActions.tsx` | 复制完整 content、可选 regenerate/delete 回调 | 无 message ID/API；依赖 Toast；role 仅决定 assistant 是否显示 regenerate | **可直接复用**（上层提供合法动作）；扩展 onAppendToDraft；不要把 Main regenerate 资格放入组件 |
| `copy-feedback.ts` | clipboard + 安全 Toast 成败反馈 | 无 Main 依赖；两处复制共用 | **可直接复用**；保留 ToastProvider 宿主 |
| `MarkdownRenderer.tsx` | GFM/highlight、无语言代码块、Markdown 代码预览、代码复制 | 内容纯 props，颜色沿既有 AI tokens；与 Bubble 解析前分块组合有约束 | **可直接复用**；本轮不改视觉；共享时先保持当前行为 |
| `InlineIndicator.tsx` 的 ThinkingBlock/SimpleThink | 内容展示、Thinking 本地折叠 | 不识别 API/会话；命名仍旧 SIMPLETHINK | **可直接复用 UI**；由 Adapter 决定是否提供这些字段，不能据组件存在扩大私有内容展示 |
| `SystemMessageLine.tsx` | 纯文本通知、轻量清理 | 无 API；未接真实时间线 | **叶子 UI 可直接用**；通知识别/可见性不放这里 |
| `SystemCommandGroup.tsx` / `ResultCard.tsx` | 遗留 MCP/音乐 UI | 绑定旧 `chat/types.ts`；真实 Bubble 未调用；MCP 没有当前预算/版本等完整投影，音乐按钮仅切 state | **不能直接算真实复用能力**；后续局部适配有界结果 VM 再接线，保留合理布局 |
| `ConversationsList.tsx` | 摘要列表、选择/pending/disabled、PC 与手机外观 | 无 API；类型有 Main modelKey；本身无 CRUD。Diary 入口通常是 Entry，不是 Main 会话 | **列表交互可借用**，不强迫 Diary 使用 Main 会话列表；有需要再缩成中性 item props |
| `ChatWorkspaceStates.tsx` | Main loading/error/empty 与返回桌面 | 接 Main safe error、固定会话/创建文案；并非通用状态组件 | **保留业务文案**；可共用基础空态/加载外壳，不先抽新框架 |
| `chat-workspace/presentation/*` | Domain → 可见 VM，Main execution overlay、会话摘要 | UI 类型和业务 composer 同目录；与 mock `chat/types.ts` 两套类型并存 | **抽出最小 UI 类型，保留 Main presenter/composer**；不以旧 types 注释“对齐后端”当事实 |
| `chat-sender-policy` / `chat-regenerate-policy` | Main readiness gate、尾部目标策略 | Main setup/历史/persistence 规则 | **Main 专属**；先对齐契约，不共享到 Diary |
| `useChat` / `useConversations` / Welcome | 遗留 mock、演示内容 | 有另一套 send/stop/regenerate 逻辑，但不可达 | **不复用业务逻辑**；未来按引用核验清理，不能把其 stop 标为真实能力 |

证据：[BubbleList](/Users/remix/Desktop/Penumbra/src/components/chat/BubbleList.tsx:61)、[Bubble 的身份/类型](/Users/remix/Desktop/Penumbra/src/components/chat/Bubble.tsx:158)、[Sender props](/Users/remix/Desktop/Penumbra/src/components/chat/Sender.tsx:14)、[MessageActions props](/Users/remix/Desktop/Penumbra/src/components/chat/MessageActions.tsx:12)、[Markdown props](/Users/remix/Desktop/Penumbra/src/components/chat/MarkdownRenderer.tsx:159)、[Thinking props](/Users/remix/Desktop/Penumbra/src/components/chat/system-command/InlineIndicator.tsx:35)、[UI VM](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/presentation/chat-presentation-types.ts:16)、[遗留类型](/Users/remix/Desktop/Penumbra/src/components/chat/types.ts:42)。

### 7.2 推荐目标结构（未实现）

```text
Main Chat Page
├─ 现有 Main Workspace / Send / Realtime + Main model/readiness adapter
│  └─ Main Domain messages → 可见 UI VM；Main overlay/receipt/history 仍在此
└─ Shared Chat UI（渐进整理现有组件）
   ├─ ChatShell [新增薄布局，仅 slots/几何]
   ├─ BubbleList / Bubble [现有，局部解耦]
   ├─ MessageActions [现有，小扩展]
   ├─ MarkdownRenderer / ThinkingBlock [现有，保留]
   ├─ Sender → Composer [现有基础，局部扩展受控草稿/焦点]
   ├─ ComposerMenu [新增，纯候选项/回调]
   └─ History navigation [扩展现有滚动，加载/定位数据由业务提供]

Diary Chat Page [未来，当前 Penumbra 没有 Diary Chat 页面链]
├─ Diary Adapter / Entry-owned generation/persistence [未来]
└─ 按需复用 Composer、MessageActions、Markdown/Thinking、消息列表外观
   （不接 Main conv_id、Main readiness 或 Main regenerate Controller）
```

新增共享内容限于：薄 ChatShell、轻量 ComposerMenu、最小可见消息/动作类型，以及满足历史/搜索需要的列表定位接口。附件预览/上传队列在确定接入时作为有状态 UI 小组件，上传 client 仍放业务/领域边界。没有必要先造 ChatProvider、通用 Runtime、任意消息 bus、跨 Main/Diary 的大状态机或新的模型配置系统。

### 7.3 Diary 为什么不能直接套 Main 业务层

当前后端 Diary 按 `entry_id` 操作 `diary_messages`，不是 `conv_id/messages`；模型有 Entry 显式 JSON/兼容 catalog 优先级；发送包含素材、日期与 auto-feed 语义。其 SSE 在生成器中保存 assistant，并实际发送 `type:done` 帧，WS 为 `diary_msg_created`。Main canonical regenerate 则同 ID 事务替换、named persisted 回执及 HTTP 对比。Diary 自己还管理日记素材/记忆导入，不能通过复制 Main Controller 自动获得正确行为。

可直接共享的 UI：Sender 的基础输入行为、MessageActions 的复制/回调、MarkdownRenderer、ThinkingBlock/SimpleThink、SystemMessageLine 与复制反馈。Bubble/BubbleList 只需局部类型/身份/定位解耦；Diary 在自身 Adapter 中投影 UI VM 即可。**共享交互，不共享不相容的业务状态机。**

证据：[Diary history/send](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:641)、[Diary 结束/保存](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1102)、[独立冻结解析](/Users/remix/Desktop/AionsHome-main/aion-chat/independent_llm.py:40)。

## 8. 已确认交互目标的渐进实现可行性

### 8.1 PC 悬浮输入与手机聚焦展开

**[现状]** Sender 通过 scrollHeight 自动增高，最多 `6×24=144px`；textarea 没禁用原生溢出滚动，仅隐藏滚动条。它处于 flex 栏的 shrink-0 流内，BubbleList 为 min-h-0/flex-1，已有随 Composer 高度分配剩余空间的基础。当前外层仍为整条 border-top 输入区，不是悬浮框。

手机/PC 使用同一单层布局，无 onFocus/onBlur 或 focused state，空输入聚焦不会展开。Chat 本身无 visualViewport resize/scroll 监听，也无专门 safe-area padding；外层 h-dvh 不能覆盖“键盘只缩 visualViewport”的所有情况。Quick Note/Diary dialog 已有局部 viewport 几何跟踪，可参考其事件清理和 CSS 变量方式，不能直接宣称 Chat 已具备键盘适配，也不应复制 modal 定位公式到整个 Chat。

**[建议]** 保留 Sender 组件增高/IME/提交保护，增加 focused/value 驱动的双层布局。手机 blur+空内容时单行，focus 即展开，工具行放底部；PC 维持紧凑自然增长/上限内滚动。工具浮框交互不能因 textarea blur 立刻卸载导致点击丢失，可按整个 Composer 的 focus-within/浮框打开状态决定展开。

悬浮效果优先让 Composer 宿主仍占实际布局高度；若以后覆盖消息区，必须量测 Composer 高度并为消息尾部预留同等空间与 safe-area。由局部 ChatShell 跟踪 visualViewport height/offsetTop，与容器边界共同算可用高度；Composer resize 后，只有原本跟随底部时才重新对齐尾部，向上阅读不跳底。当前 BubbleList effect 只依赖消息/会话/force key，没有尺寸变化触发，需补几何协调。

**验收边界（未来）**：手机空输入聚焦立即两层；中文 IME 不误发；长文到上限后内部滚动；横竖屏、键盘开合、带安全区设备下发送按钮可达且尾部消息不被挡；向上阅读时不因输入高度或 Thinking 展开强制到底。无浏览器/真机验证的本轮不对实际键盘效果下结论。

证据：[自动高度](/Users/remix/Desktop/Penumbra/src/components/chat/Sender.tsx:50)、[流内宿主](/Users/remix/Desktop/Penumbra/src/components/chat/Sender.tsx:116)、[列表 effect](/Users/remix/Desktop/Penumbra/src/components/chat/BubbleList.tsx:91)、[已有局部 viewport 参考](/Users/remix/Desktop/Penumbra/src/components/quick-note/quick-note-dialog-viewport.ts:5)。

### 8.2 左下角 `+` 轻量菜单

**[现状]** 当前仅 disabled Paperclip，没有 `+` 或 ComposerMenu。已有通用 UI 浮层原语可用，不需要全屏操作页。

**[建议]** 菜单 UI 只收 items、选中值与回调，业务适配层分别提供：附件上传/待发送队列（待实现）、当前会话模型选择（PR1 契约后接 UI）、单次 generation options（无现成 UI）和进入完整 Settings 的真实导航。只有可工作的项目才显示；不能把未接通项伪装成能力。

Connection CRUD、Key 管理、任务模型分配属于 Settings；Composer 不保存新一套 Provider 凭据，也不复刻 Registry 管理。模型面板应说明 §6.4 的已有后台跟随影响，参数明确是本次调用还是持久设置。

### 8.3 顶部会话操作

**[现状]** 手机是“返回桌面 + 会话列表”两个按钮，没有 `···`、查找、信息、设置或删除入口。onBack 在当前宿主总会提供，ChatView 未做 md:hidden，因此 PC 也会出现返回桌面。桌面本身还有导航/布局边界，不能机械给 PC 新加移动返回模式。

**[建议]** 移动端返回/`···` 管理当前会话；会话列表仍有可到达入口。删除/重命名可接现有会话 client；会话信息可显示已读到的事实。会话设置只有真实可读写字段才显示；当前会话查找在 PR4 接通前不放无行为菜单项。PC 沿桌面导航决定返回与侧栏，不共享“返回桌面”硬编码文案。

证据：[当前 header](/Users/remix/Desktop/Penumbra/src/components/chat/ChatView.tsx:190)、[宿主回调](/Users/remix/Desktop/Penumbra/src/components/apps/DesktopAppView.tsx:126)。

### 8.4 当前会话查找

现有基础不足以只加前端输入框完成目标。后端搜索/安全投影/锚点窗口与前端阅读模式需形成一个可验收 PR，详见 §9。

### 8.5 消息“放入输入框”

**[现状]** MessageActions 已接收整条可见正文，复制不是单个 Markdown 分块；回调组合简单。阻碍是 Sender 内部持有 value/ref，父页面没有追加/聚焦端口，并非缺后端引用协议。

**[建议]** 在页面 UI 层持有当前草稿，Composer 接受 `value/onValueChange` 与简单 `focus()` ref；MessageActions 提供 `onAppendToDraft(visibleBody)`。上层采用函数式追加：空草稿直接放正文，非空草稿保留原字节并加分隔换行，再追加整条正文；聚焦时自然触发手机展开，必要时把光标放末尾。用最新 draft 计算，不能取菜单打开前的闭包快照覆盖新输入。

只传 Adapter 已确认的正文，不拼 DOM textContent（会混入按钮/时间），不拼 thinking/drift/HEART、tool JSON、内部上下文或 debug。默认对持久化 user/assistant 开放，保留当前流式 overlay 隐藏操作的做法；不自动发送、不建立引用、不扩展 Android 文字选区。对于正在生成导致 Composer disabled 的情况，应明确禁用此项，或先定义可编辑下一条草稿的业务规则，不能聚焦一个 disabled textarea 却显示成功。

切会话时草稿要继续沿明确的页面策略；若保留“共用一份草稿”，不要在接入动作时无意变成清空；若改按会话保留，应在 PR3 中完整验收。证据：[操作 content](/Users/remix/Desktop/Penumbra/src/components/chat/MessageActions.tsx:21)、[整条正文传入](/Users/remix/Desktop/Penumbra/src/components/chat/Bubble.tsx:212)、[私有草稿/ref](/Users/remix/Desktop/Penumbra/src/components/chat/Sender.tsx:44)、[草稿清除保护](/Users/remix/Desktop/Penumbra/src/components/chat/Sender.tsx:30)。

### 8.6 延后的视觉约束

本轮不改 Markdown、系统通知、工具结果卡片或 Motion。现有 Bubble 在 Markdown 解析前按空行拆块，只追踪行首三反引号，可能割裂多段列表、引用、表格及其他 fence 形式；源码已留 TODO。Thinking、附件和卡片尺寸变化也会影响阅读锚点。后续视觉 PR 应保留消息级复制/操作、既有多气泡表现与纯文本工具结果安全性，不以重写 parser/Runtime 为前提。

证据：[分块 TODO](/Users/remix/Desktop/Penumbra/src/components/chat/Bubble.tsx:21)、[Markdown 渲染](/Users/remix/Desktop/Penumbra/src/components/chat/MarkdownRenderer.tsx:165)。

## 9. 当前会话搜索：基础、缺口与最小契约

### 9.1 已有基础和明确缺口

| 层 | 可复用基础 | 当前缺口 |
|---|---|---|
| DB | messages 主键 id、conv_id、created_at；`idx_messages_conv_id(conv_id,created_at)` | 未找到 Main messages FTS/关键词全文索引；已有 Memory 的 LIKE 搜索查的是 memories |
| 历史 HTTP | limit=1–500；before 时间戳；默认 50，倒序取再反转 | 没有 q/cursor/around/anchor/message ID 定位或向后窗口接口；没有 has_more 元数据；不是整会话搜索 |
| 后端按 ID 访问 | edit/delete/regenerate 内部可查消息并确认目标 | 不是可用的只读“定位窗口”API；不能借 regenerate 查找消息 |
| 前端 History service | 按 ID 去重、同会话验证、旧页 cursor/stalled、最新页合并 | Controller/UI 尚未接旧页；没有窗口加载模式/搜索状态 |
| BubbleList | bottomRef、距底 96px 跟随、按会话/执行 key 跳底 | 没有 message DOM id/ref map、scrollToMessage/highlight、前插锚点保持、搜索阅读模式 |
| 旧 Chat | 加载更早、`id=m_${id}` DOM 标识、prepend 后补 scrollHeight | 没有找到整会话关键词 API/结果分页/专用搜索定位；旧 DOM 标识只能参考，不能复用为 React 数据层 |

**[风险]** 当前历史分页只有 `created_at < before` 且没有次序 tie-break。若一页边界有相同 created_at 的多条消息，下一页会跳过同时间戳剩余记录；前端 stable sort/去重无法恢复未返回的行。没有读取真实记录，不能量化发生率。搜索与定位不能建立在“循环 before 直到碰到目标”的方案上。

证据：[现有历史 SQL](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1045)、[现有索引](/Users/remix/Desktop/AionsHome-main/aion-chat/database.py:99)、[Memory LIKE 参考](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/memories.py:86)、[前端历史排序/游标](/Users/remix/Desktop/Penumbra/src/application/message-history/message-history-state.ts:232)、[旧历史位置补偿](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:3972)。

### 9.2 最小后端建议（新增只读契约，尚未实现）

1. **搜索**：`GET /api/conversations/{id}/messages/search?q=...&limit=...&cursor=...`；首版普通字面子串匹配，限定 query 长度/页大小，`%/_/反斜杠` 按普通字符转义。搜索整个当前会话的授权可见消息，不受前端已加载窗口限制。返回 `{items:[{message_id,role,created_at,snippet,match_ranges}],next_cursor,has_more}`，不返回 Prompt/记忆证据/私有字段/全部工具 JSON。
2. **锚点窗口**：`GET /api/conversations/{id}/messages/window?anchor_id=...&before_limit=...&after_limit=...`；返回安全可见 messages、anchor_id、前后 cursor/has_more；也支持以 before_cursor/after_cursor 扩展相邻窗口，限制单次条数。校验 anchor 属于该会话且可见；不存在/被删/隐藏使用明确 404 或安全错误码，不退到其他会话。
3. **稳定顺序**：新查询采用后端现有 canonical 目标判断的 `(created_at,rowid)` 次序，opaque cursor 封装并绑定会话/查询，不把 rowid 当 UI 身份。搜索与窗口同一排序键；旧 timestamp API 保持兼容。若后续改用独立稳定键，必须另行定迁移，不能只按字符串 msg_id 假设时间序。
4. **统一可见正文投影**：结果和定位窗口使用同一读取投影；user/assistant 正文剥离内部 marker，绝不索引 thinking/drift/HEART、hidden roles、Prompt/timeline/debug/召回证据。carryover 若按当前时间线可见则可搜索并标来源，仍不能作最新 regenerate 目标。system 只纳入明确确认的可见通知正文，工具结果若要支持也只采用专门安全展示字段；未分类的记录先排除，不 blanket 搜索 system/unknown 或 SELECT *。
5. **匹配语义**：结果 snippet 与 match_ranges 以投影后的正文为基准；约定大小写/Unicode 与 offset 单位（建议 Unicode code point，前端转换到切片索引），禁止返回未经转义的高亮 HTML。代码/Markdown 符号也按正文字符匹配，首版无需语义搜索。

可先使用 SQLite 有界结果的参数化 LIKE/INSTR 与会话索引；“返回有限页”不代表子串查询无需扫描。实现阶段用合成大数据检查查询代价，必要时再加适合中文子串的索引；不要求先搭搜索引擎，也不能误称现有 B-tree 是全文索引。隐藏项不计入可见分页；需要明确扫描游标/结果游标与超时策略，避免大量隐藏行使分页卡住。

该建议只新增查询/可见性投影，不改变 messages 持久化、命令、Prompt 或 Runtime。若第一版只覆盖 user/assistant，UI 必须明确“消息正文”范围；不能声称支持所有通知/工具详情。目标是完整会话范围的可见内容搜索，不是把内部证据做成结果。

### 9.3 最小前端建议

- Main Adapter 管理 query、结果页、pending/error、owner/sequence 与 AbortController；输入变化/切会话取消旧请求，旧结果不覆盖新会话。共享 SearchPanel 只接结果/回调，不直接请求 Main API。
- 点击结果先取 anchor window，再由 BubbleList 的 message ref map 定位/聚焦，短暂高亮匹配；目标删除显示“消息已不存在”，可继续看其他结果。
- 高亮使用安全文本节点/Markdown renderer 的展示扩展，不把关键字替换成未经转义的 HTML，也不直接改写存储正文或打断 Markdown 语法。snippet 与时间线统一匹配规则，原文位置与渲染文本索引的差异需要适配。
- 维护显式 `latest / history-window` 阅读意图。window 模式不把缺少中间段的两批数组直接拼接；需要相邻窗口或 gap 标识。打开搜索前记录当前 anchor/offset，关闭搜索保留当前阅读位置，不重建 BubbleList 强制到底；“回到最新”是独立动作。
- 现有 forceFollowKey 仅在**明确发送新消息/用户选择回最新**时应用。自动刷新、WS 新消息、Composer 高度变化和关闭搜索不应覆盖用户历史阅读意图。
- 现有 finalize/reconnect 使用 scratch reload 最近页；搜索窗口接入后必须分开“执行保存确认”与“当前阅读窗口”，否则重连/后台消息会把定位结果丢掉。HTTP 对目标的确认可查询目标窗口，不要求浏览器保留整个会话。

**独立验收**：目标在未加载的很早历史也能检出；结果分页；同时间戳跨页不漏重；特殊字符/中文/Markdown；隐藏 Prompt 与 DRIFT/Thinking 不可搜；点击准确定位且短暂高亮；离开搜索/重连保持位置；新消息到达不强拉到底；删除/切会话/慢响应安全。用合成记录验收，不接触生产聊天。

## 10. 业务不变量、已有保护与回归风险

### 10.1 已有保护应继续保留

| 风险主题 | 已存在的具体保护 | 仍需注意的范围 |
|---|---|---|
| 双击/Enter 重入 | Sender.submittingRef + Controller.active；同一次 send 生成一个 UUID；后端进程内 `_dedup_lock/_recent_client_ids` | 不是跨重启持久幂等，也不是跨页面会话级生成锁；每次新调用生成新 UUID，不应自动重发恢复 |
| 过期读取覆盖 | bootstrap/switch/history/list 各自 AbortController 与 sequence；提交前检查 selectedConversationId | 已有实现，未发现必须重写整个 Controller 的证据；新模型/搜索 mutation 必须沿用 owner/sequence |
| 切换串消息 | 执行中禁切；目标 setup/history 一起加载；overlay 按 conversationId 投影；dispose 清理 | onBack 仍可卸载，后台继续；返回后要按 HTTP 恢复，不解释为取消 |
| WS 与 SSE 重复消息 | execution 中 defer history dirty；当前 assistant persistence 通知不直接 append；最终 HTTP 统一 | 当前纯通知路由正确；不可为了工具 UI 把稀疏 WS 当完整历史消息 |
| 流结束与落盘不一致 | finalizing/uncertain；success 检查 expected ID；regenerate receipt 字段比较；retryFinalization 只读 | 先修 drift 才有意义；断流 error 路径的状态未确认见 §4.4；成功 duplicate ack 也只证明 user 去重，不证明回复生成完成 |
| 草稿丢失 | 只在 accepted 后且当前草稿等于提交值时清空 | 仍是单个内存草稿；新 focus/菜单/会话管理不应无意卸载清空 |
| 内部数据误展示 | 隐藏三种 cam role；SSE debug 白名单；provider failure 安全文案 | DRIFT stream 不兼容、system/unknown 未统一可见性分类；搜索/复用必须补安全投影 |

证据：[四类请求生命周期](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/chat-workspace-controller.ts:139)、[history stale 校验](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/chat-workspace-controller.ts:283)、[实时延迟协调](/Users/remix/Desktop/Penumbra/src/application/chat-realtime/chat-realtime-coordinator.ts:261)、[overlay 会话隔离](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/presentation/chat-execution-composer.ts:89)、[dedup 实现](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1172)。

### 10.2 后续必须保护的不变量

1. Main 与 Diary 的存储表、消息身份、Runtime、生成与持久化语义各自独立；共享 UI 不共享 conv_id 或默认模型推导。
2. HTTP 持久历史是权威；SSE overlay/WS notification/receipt 各有职责，既不提前认定成功，也不为了重试重放副作用。
3. canonical regenerate 同 ID、排除原目标的历史、事务重查、旧 voice/HEART 处理和后续副作用顺序保持；不照搬旧 UI “先删再生成”的实现。[旧行为证据](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:4416)
4. 不改变 command grammar、顺序、MCP/位置/监控等外部 side effects、Prompt 来源/顺序、cache/carryover/hidden/delayed 语义；UI 不解析并执行 command。
5. 新默认、当前会话选择、单次参数、已冻结请求分别保持作用域；修改模型/标题会更新最近 Main 的事实不能隐藏或偷偷修掉。
6. 复制、放入输入框、搜索只操作明确可见正文，既不传内部对象也不从 DOM 拼“全文”；tool result 卡片按受控投影展示。
7. 历史阅读位置是 UI 事实；新增分页/搜索后，WS、重连、保存确认、附件/Thinking 高度变化不能无条件重置窗口或拉到底。
8. 新会话删除/选择失败/外部删除时保持一致的标题、model/readiness、历史与草稿；更新后以服务端重读为准，不做本地业务双写。

## 11. 建议的 Chat PR 顺序与验收边界

本节是后续规划，不是本轮实现承诺。采用五个语义完整 PR；PR1 包含让真实链路可验收的消息兼容前提，不为单个组件拆碎发布。

| 顺序 | PR 边界与交付结果 | 独立验收 / 不夹带范围 |
|---|---|---|
| **PR1：消息、模型与 Readiness 契约对齐** | 对齐 drift history/receipt/stream 与 canonical failure；安全 MainConfiguration/Selection DTO；conv_id readiness；现有 gate/配置失效重读；最小模型选择入口与明确错误恢复、stream timeout 语义 | 非空历史可读；有效非 catalog literal 可发；missing/disabled/credential/invalid selection 原因正确；选择保存后 readback；A→B 慢响应不串；已有 Runtime frozen；后台跟随影响说明；canonical regenerate success/failure/uncertain 恢复。新旧 WS/持久化/命令不变，不做 Provider CRUD 或完整视觉重做 |
| **PR2：共享 Chat 骨架与 Composer 交互** | 整理最小 UI VM/身份 props，保留现有 Bubble/Markdown/Thinking；薄 Shell；受控草稿、手机 focus 双层、PC 自动增长、轻量 + 菜单、viewport/safe-area/尾部协调；附件若纳入则完成上传/预览/移除/提交/失败保留闭环 | Main 真实收发回归；手机空 focus 立即展开；键盘/长文/浮框焦点不丢；阅读不跳底；UI 不依赖 Main API；如附件量大，可整条闭环并入 PR3，不能只交可点击但无行为按钮；不创建 Diary Runtime 或通用 Provider |
| **PR3：会话与消息操作闭环** | 创建/重命名/删除会话接真实 client；移动返回/···、PC 导航；“放入输入框”追加/聚焦；消息菜单保留复制与 canonical regenerate；决定草稿切会话政策；接更早历史与 prepend 锚点保持 | 空列表可创建并发送；删当前/非当前与外部删除可恢复；draft 不覆盖/不自动发送；整条正文复制/追加；system/hidden 不混入；重复点击/慢响应/执行中受控；加载更早不改变当前阅读。编辑/删除消息如纳入，连同真实 API 副作用一起验收，不先露空按钮 |
| **PR4：当前会话搜索与定位** | §9 的只读安全搜索、分页/稳定 cursor、anchor window；搜索结果列表、定位/高亮/关闭保持、窗口模式与实时更新协调 | 搜索整个会话、有限结果；同时间戳/长历史不漏重；不可见数据不泄露；离开不强制到底；不存在目标/重连/新消息/切会话正确；不要求浏览器加载全量，不改执行链 |
| **PR5：Markdown、系统通知与工具卡片** | 在前述投影/滚动边界稳定后处理 Markdown 分块、通知样式、已脱敏工具结果/预算/截断/错误卡片，按需音乐/语音/reaction/Web feedback；Motion 另定完整规范 | 不改变文本复制/搜索/正文身份；工具参数/结果安全且截断事实准确；历史恢复与实时结果一致；尺寸变化不扰阅读；不执行命令/重放工具、不展示 Prompt/debug；高级语义搜索继续暂缓 |

PR2/PR3 的附件归属由实际改造量确定，必须是完整能力，不拆成 UI、上传、发送三个反复部署的碎 PR。真正 Stop API 是新的执行契约；若产品要求，另行确定取消与已发生副作用语义，不承诺仅靠上述 UI PR 完成。

**视觉改造前必须完成：**drift/receipt/failure 的消息协议；Main selection/readiness 权威与失效策略；可见正文与私有上下文边界；异常恢复及客户端超时的真实含义。现有消息/实时协调继续使用，经过这些修正后再提取 UI，风险和回归量最低。

## 12. 验证记录、限制与完成检查

### 12.1 本轮纯函数检查

使用仓库现有 esbuild 将以下前端纯模块 bundle 到内存后调用，不写源码/测试/构建文件，不初始化 API/后端。输入全部为人工示例，未读真实会话。

| 检查 | 实际结果 |
|---|---|
| 当前 HTTP 形状：有 drift、无 simple_think，其他必需字段齐全 | `MessageContractError` |
| 同一人工记录补上旧 simple_think 基线 | accepted |
| 当前 named persisted 回执：有 drift、无 simple_think | `ChatExecutionContractError` |
| 旧 simple_think 回执基线 | accepted |
| 当前合法 readiness 原因 missing_credential | `RuntimeContractError` |
| readiness ready 基线 | accepted |
| accumulator 输入 canonical DRIFT marker + 正文 | marker 仍留在 `message.content`，验证缺少分离处理 |

这些结果验证的是**当前代码的边界行为**。没有跑服务、真实模型或浏览器，不代表做过用户会话联调。已有单测覆盖提交锁、sequence、防串、uncertain、receipt/HTTP、WS 退避/延迟、滚动跟随；但部分 fixtures 仍写 simple_think，不能据这些测试存在断言当前两仓库契约一致。

证据：[旧 history fixture/断言](/Users/remix/Desktop/Penumbra/src/domain/message/message.test.ts:15)、[旧 receipt 测试](/Users/remix/Desktop/Penumbra/src/application/chat-execution/chat-execution.test.ts:484)、[发送确认测试](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send.test.ts:229)、[实时延迟测试](/Users/remix/Desktop/Penumbra/src/application/chat-realtime/chat-realtime-coordinator.test.ts:237)、[滚动测试](/Users/remix/Desktop/Penumbra/src/components/chat/chat-scroll.test.tsx:42)。后续 PR1 应用人工 current-wire fixtures 补跨边界验证，本轮未修改或新增测试。

### 12.2 限制与既有审计的关系

- 当前生产部署 commit、真实 Registry 选择/readiness、Provider 可达性、消息内容、上传文件/持久卷、设备权限、真实键盘行为均未检查。
- 未做负载或真实会话分页测试；相同时间戳丢页是 SQL 边界推导，发生频率未知。搜索性能必须后续用合成数据测量。
- 旧前端能力仅是迁移参考。旧 regenerate 先删后生、庞大页面全局状态、debug 详情 UI 均不应自动搬入新前端。
- Settings 审计的 Main selection/readiness 错位与最近 Main 后台跟随结论，本轮已重追当前消费者，仍成立；**新增 DRIFT HTTP/receipt/stream 错位是当前快照必须补充的结论**，不能只沿用其“真实 Chat 已接入”描述。
- 本文没有把后端重构“相对稳定”当作所有对外契约已冻结，也没有把字段变化推断为生产故障；结论限定在两个当前本地 commit 的配对兼容性。

### 12.3 交付检查

已检查文档内本地证据路径/行号、Markdown 表格列数、代码围栏与空白；最终 Git 状态仅 Penumbra 新增 `docs/chat-implementation-audit.md`，AionHome 无改动。未暂存、commit、push 或部署。业务代码/CSS/组件/API/数据库/测试均未修改。
