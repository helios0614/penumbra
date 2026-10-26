# Penumbra 前端契约摘要

> 最后更新：2026-10-26（Main配置与PR6.5-B请求边界）

导航：[架构原则](./penumbra-architecture.md) · [迁移路线图](./frontend-migration-plan.md) · [前端契约](./frontend-contracts.md)

本文记录 Penumbra 接入现有 AionsHome 后端时必须遵守的契约和已知风险，只保留前端所需摘要。每节注明的 AionsHome 文档、实现和 contract tests 仍是权威来源；本文不得被当作完整后端规范。

## 1. Source of truth

- Conversation、message、schedule、activity、location 等业务事实来自后端。
- 本地 optimistic state 只能用于临时展示，不能成为持久事实。
- 客户端状态必须能通过服务端 ID、snapshot、重新加载结果或明确的 event 规则对账。
- WebSocket 连接状态只说明传输是否在线，不能代替业务状态。

### Conversation Domain（S3A）

当前 AionHome conversation HTTP 契约如下：

| Method | Path | Request | Response |
|---|---|---|---|
| `GET` | `/api/conversations` | 无 | 按后端 `updated_at DESC` 顺序返回裸数组；列表项含 `id/title/model/main_selection/main_selection_diagnostic/created_at/updated_at/message_count` |
| `POST` | `/api/conversations` | JSON object `{ title?: string, main_selection?: MainSelection, model?: string }`；新客户端创建发送`{}`，复制后端Main默认 | `id/title/model/created_at/updated_at`；不含 `message_count` |
| `PUT` | `/api/conversations/{conv_id}` | `{ title?: string\|null, main_selection?: MainSelection, model?: string\|null }`；不混传新选择与旧model | `{ ok: true }` |
| `DELETE` | `/api/conversations/{conv_id}` | 无 | `{ ok: true }` |

后端没有单个 conversation 详情 endpoint。时间字段是 Unix 秒数；ID、标题和模型是非空数据库列，列表的 `message_count` 是非 carryover user/assistant message 数量。当前契约没有 pinned 或 archived 字段。创建时省略字段会使用服务端标题和模型默认值。PUT 中 null 与省略字段都不会更新持久化值；不存在 ID 的 PUT/DELETE 当前仍返回成功，不能由前端假设 404。conversation create/update/delete 还会触发既有 WebSocket 广播与 Markdown 导出维护，delete 会级联删除 messages；这些副作用仍由后端拥有，Conversation Domain client 不复制或消费它们。

Wire DTO 只存在于 `src/domain/conversation` 边界。mapper 将 snake_case 转换成 camelCase domain model：`model -> modelKey`、`created_at -> createdAt`、`updated_at -> updatedAt`，列表额外映射 `message_count -> messageCount`；raw DTO 不进入 React 组件。

Main执行身份是DB `conversations.main_selection`；前端优先使用`GET /api/main/configuration?conv_id`返回的canonical `connection_selection`。旧`conversation.model`保留兼容，不参与当前发送资格。模型为明确Connection/Protocol/literal；不因catalog缺项改选。新建`{}`复制服务端main_chat默认；已有会话独立，不随全局默认变化。

Conversation Domain 不拥有 available models、readiness、active API config、provider config、provider routing、fallback、message state、streaming 或 WebSocket 状态。Runtime Domain拥有目录只读摘要及按`conv_id`读取的Main configuration/readiness；模型 registry、provider routing 和 fallback 继续由后端拥有。

### Chat Setup Application Layer（S3B）

Chat Setup 是 Conversation Domain 与 Runtime Domain 之上的 application composition，不定义新的后端 DTO，也不拥有任何一个领域的 wire contract。它把当前Conversation、Main configuration和readiness组合为UI安全ViewModel；Main不以静态目录membership决定执行资格。Runtime Domain 的 `ChatReadiness` 仍只表示成功校验的后端事实；application 层另用 `ChatReadinessState` 明确区分已取得的事实与无法取得的降级状态。

- 有conversation时，configuration/readiness均传conv_id；模型身份来自已保存Main选择，readiness.modelKey须与该选择literal一致。
- 已确认Main选择与readiness不一致时阻断发送并保留历史，不用旧modelKey纠正服务端身份，不自动换路由。
- bootstrap省略conv_id读取新会话Main默认，只读；不把它写入已有会话。
- 禁止从 available models 第一项推断默认模型，也禁止在前端硬编码服务端默认模型。
- 模型目录保留后端顺序供Settings只读概览；Main候选来自configuration.connections，不把目录当远端模型全集。
- 历史或bootstrap literal不在目录时照常保留；未知/失效选择显示后端diagnostic，不自动改模型、连接或协议。
- readiness reason 与 `setupActionRequired` 直接进入最小 ViewModel；`ready=false` 是正常业务状态，不转为异常，也不在本层重新判断 endpoint、secret、auth mode、provider 或 provider health。
- `ChatReadinessState` 为 `{ kind: "available", value: ChatReadiness } | { kind: "unavailable", reason: SafeReadinessReason }`。`available` 只表示响应成功且 DTO 合法，不等于 `value.ready=true`；`unavailable` 只保留 `not-found/network/timeout/service/contract/unknown` 安全分类，不保留 response、endpoint、stack、内部 target 或 provider exception。
- Chat Setup对configuration/readiness的非认证失败降级为不可发送状态，保留安全错误；401/403与abort继续抛出，不伪造readiness或自动重试。
- 本层不读取 Settings 或 active API config，不拥有 provider routing、fallback、secret、endpoint、raw readiness 或 raw DTO，也不请求 messages。
- 本层提供纯组合函数与异步load service；真实Workspace/Composer消费它，不让旧Chat mock或全局配置缓存成为事实源。

模型选择已由Composer接入：`updateConversation(id,{mainSelection})` → 重读列表 → 按conv_id读取Main configuration/readiness。PUT只传main_selection，不双写旧model或全局默认；readback失败保留草稿并阻断发送。Header参数应用不调用这条保存链。

**AionsHome 权威来源**：`docs/aionhome-runtime-model.md`、`docs/aionhome-refactor-master-plan.md` 及相关领域实现和 contract tests。

### Chat Workspace Read Model & Controller（S6A）

Chat Workspace 位于 Chat Setup、Conversation Domain 与 Message History Application 之上，为未来 Chat 页面组合一次 bootstrap setup、真实 conversation list、当前前端 selection 和所选 conversation 的初始持久化 history。它不定义新的 wire DTO，也不直接调用 transport 或 `fetch`。

```ts
type ChatWorkspaceSnapshot = {
  readonly setup: ChatSetupViewModel;
  readonly conversations: readonly ConversationSummary[];
  readonly selectedConversationId: string | null;
  readonly selectedConversation: ConversationSummary | null;
  readonly history: MessageHistoryState | null;
};
```

- 现有 Chat Setup 的公开 bootstrap loader 只组合 models 与 bootstrap readiness state，不读取 conversation list 或 session；Workspace 对它只调用一次，并通过 Conversation Domain 对真实列表只调用一次。Workspace 不拆开重复请求 models/readiness，也不借用 Settings Overview。Session 的独立安全概览仍属于 Settings；Workspace 任一受 session 保护的请求返回 401/403 时，controller 继续进入 unauthenticated fatal error。
- `setup` 是一次 bootstrap Chat Setup 结果，与 conversation selection 分离；它不从 models 第一项推断模型。conversation 的模型事实仍由 `selectedConversation.modelKey` 提供。conversation switch 不重新请求 setup、list、session、models 或 readiness。
- Snapshot 只包含成功读取的 application 数据，不包含 loading、error、pending、retry、streaming、sending、realtime、scroll 或 toast 状态，也不复制第二份 `Message[]`。Domain Message 尚未映射成现有 Chat UI 的 mock `ChatMessage`。
- selection 是前端 UI policy，不是后端 default conversation。为保持当前 Penumbra Chat 的用户可见行为，初次加载先采用存在于列表中的 `preferredConversationId`，否则采用后端原顺序的第一项；这不改变后端 `updated_at DESC` 顺序，也不使用 model、`messageCount` 或 mock ID 推导选择。
- 重新 bootstrap 时优先保持仍存在的 current selection；若已删除，则重新应用 preferred/第一项策略。空列表不创建 conversation，selection 与 history 都为 null。无 selection 时不请求 history。
- 有 selection 时只调用一次 `loadInitialMessageHistory`。selected ID、selected Conversation 与 `history.conversationId` 必须一致；任何内部不一致以不含 ID、message content 或 raw state 的 `ChatWorkspaceContractError` 拒绝。
- conversation switch 只对真实列表内的目标 ID 请求一次 initial history，不重新加载 Chat Setup 或 conversation list，不预加载相邻 conversation。未知 ID 在 HTTP 前拒绝，不回退第一项，也不创建临时 conversation。
- switch 请求期间 controller 保留完整旧 Snapshot；目标 history 成功后 selected ID、selected Conversation 与 history 一次性原子替换。失败时保留旧 Snapshot，只公开安全 UI error。标题、选中项与消息 history 因而始终属于同一 conversation。
- React controller 为 bootstrap 与 switch 分别维护 AbortController 和递增 request generation。retry、快速 A→B→C、abort、unmount 和 Strict Mode 下的 stale success/error 都不能覆盖更新选择；abort 不作为普通 UI error。
- S6A 的 `useChatWorkspace` 最初只公开 controller state、bootstrap retry、`selectConversation(id)` 与 switch retry；S6D 在不改变 Snapshot ownership 的前提下增加了应用既有 reconciliation result、reconnect scratch reload 和 conversation-list refresh 三个受 abort/generation 保护的更新端口。它仍不公开 raw socket、event payload、send、regenerate、stop、older pagination、streaming text 或 optimistic message。
- Chat Workspace Snapshot 不依赖 Chat Execution、SSE、WebSocket 或 Settings，也不持有 realtime state。S6D coordinator 只通过 controller 更新端口把 HTTP/reconciliation 结果原子写回 Snapshot；S6A 本身没有修改当时的 Chat page/view、`useChat` 或 mock，S6B 的可见页面接入边界见下一节。

#### Read-only Workspace 与 send readiness 解耦（S6B.1）

- Workspace 先读取真实 conversation list 并解析 selection；有 selection 时以该 `Conversation.model` 并行读取 models/readiness 与 initial history，无 selection 时才读取 bootstrap setup。readiness 的非认证失败仍收敛为安全降级 ViewModel，不阻止真实只读 history。
- 致命边界不变：models 或 conversation list 请求失败、conversation/message DTO 无法安全解析、初始选中 history 失败、401/403 认证失败及 Workspace selection/history 状态不一致都会阻止 Workspace。readiness 404、network、timeout、非认证服务错误、业务 `ready=false` 与 readiness DTO contract error 不阻止只读 Workspace。
- `ready=false` 保留为 `readiness.kind="available"` 下的真实业务值；请求或 DTO 无法取得事实时使用 `readiness.kind="unavailable"`。两者都不能被解释为 provider ready。S6C 还要求 readiness model、setup model 与 selected `Conversation.model` 完全一致。
- `/api/chat/readiness` 404 只表示 send readiness unavailable，不表示 conversation service unavailable，也不表示 provider ready；Sender 保持 disabled。
- readiness 降级不自动重试。现有显式 bootstrap retry 可重新取得 readiness，并优先保持仍存在的 current selection；conversation list 与 history 的权威读取语义不变。

**AionsHome 权威来源**：`aion-chat/routes/chat.py` 中 conversation list 与 initial history 的当前读取语义；Penumbra composition 事实见 `src/application/chat-setup`、`src/domain/conversation` 与 `src/application/message-history`。

### Chat Read-Only UI Integration（S6B）

Chat 页面现在只通过 `useChatWorkspace()` 读取真实 conversation list、前端 selection 与所选 conversation 的 initial persistent history。production `ChatView` 不再 import `useChat`、`useConversations` 或 mock conversations/messages；旧 mock 文件与 hooks 可以暂留用于后续 cleanup，但不得再次成为 production Chat 的事实来源。HTTP history 是本阶段 BubbleList 的唯一 persistent Message 来源。

UI 不直接消费 snake_case DTO，也不把 Domain `Message` 塞入旧 mock `ChatMessage`。presentation boundary 位于 `src/components/chat-workspace/presentation`，当前公开结构为：

```ts
type ChatConversationItemViewModel = {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly modelKey: string | null;
  readonly updatedAt: number | null;
  readonly isSelected: boolean;
  readonly isPending: boolean;
};

type ChatMessageViewModel =
  | { readonly kind: "user"; readonly id: string; readonly content: string; readonly createdAt: number; readonly attachments: readonly ChatAttachmentViewModel[] }
  | { readonly kind: "assistant"; readonly id: string; readonly content: string; readonly createdAt: number; readonly thinking: string | null; readonly simpleThink: string | null; readonly attachments: readonly ChatAttachmentViewModel[] }
  | { readonly kind: "system"; readonly id: string; readonly content: string; readonly createdAt: number }
  | { readonly kind: "unknown"; readonly id: string; readonly rawRole: string; readonly content: string; readonly createdAt: number };
```

- conversation mapper 保持后端列表顺序，标题为空时只使用固定 UI fallback，不写回 Domain；subtitle 只使用真实 `messageCount`，不伪造 preview、unread 或 online。header 的模型只来自 selected conversation `modelKey`，不使用 models 第一项或 readiness model 覆盖。
- `user` 显示用户气泡；`assistant` 显示知远气泡；`system` 使用带“系统消息”文字标签和图标的中性样式，不使用 assistant 头像；`unknown` 使用带“暂不支持的消息类型”标签的中性样式，并只保留经过字符、长度与敏感词约束的安全 `rawRole`。unknown 不投影为 assistant，也不把内容解释为系统指令。
- `hidden-runtime` 明确由 message presenter 返回 `null`；当前已知 `cam_trigger/cam_user/cam_log` 不进入可见 BubbleList。Domain Message 与 History 保持不变，隐藏数量不冒充可见消息数。
- assistant 的 `thinking/simpleThink` 只复用现有纯文本轻量展示，不做 thinking UI 重构。Domain attachments 缺少稳定 item schema，因此不猜 MIME、URL 或图片；presentation 丢弃 raw capability，只为每个 item 生成不含原对象的“附件暂不支持”占位。music、MCP、voice、command 与其他 capability rendering 延后。
- user 与 unknown content 按纯文本显示；assistant 继续使用现有 `react-markdown` 默认安全 URL/HTML 策略，不启用 `rehypeRaw` 或 `dangerouslySetInnerHTML`。长标题、model key、消息和 unknown role label 使用 truncate、break-all 或 break-words 控制溢出。
- idle/loading 使用稳定双栏 skeleton 与 `aria-busy`；bootstrap error 只展示 controller 的安全分类摘要和 retry；unauthenticated 不自动登录；空列表不创建 conversation；ready/no-selection 不请求或伪造 history；空或仅 hidden-runtime 的 history 使用稳定 empty state。
- conversation switch 直接调用 `selectConversation(id)`。pending item 只显示局部 spinner，旧 selected item、header 与 history 保持一致；成功后由 controller 原子替换；失败保留旧 workspace 并调用 `retryConversationSwitch()`。UI 不提前高亮目标、不清空旧 history，也不使用 timer 模拟。
- BubbleList 在 conversation switch 和用户明确发送时滚动到底部；streaming/final reconciliation 仅在用户仍接近底部时跟随，用户向上阅读后不强拉。首版不实现复杂 anchor 或 per-conversation scroll memory。
- S6C Sender 已接真实 send，S6E1 已把 Bubble 的最小 regenerate affordance 接到 canonical target endpoint；附件、server cancel、Settings generation mock 与 capability mutation 仍不接入。

### Chat Send & Streaming Composition（S6C）

S6C 建立的 execution state 在 S6E1 扩展为统一 send/regenerate ownership；send 继续表达 `sending-user / streaming / finalizing / finalization-uncertain`，regenerate 使用对应的 streaming/finalizing/uncertain 分支。任一时刻最多一个 active Chat execution。`MessageHistoryState` 始终只包含 HTTP 已持久化的 Domain Message；可见消息由纯函数 `persistent presentation + send overlay + regenerate replacement overlay` 组合，overlay 不修改 persistent input、conversation `messageCount` 或 Domain Message。

- Sender 只有 Workspace ready、存在 selection、没有 switch、selected-model readiness available 且 `ready=true`、当前 send state 为 idle 时启用。unknown model、provider not configured、generation unsupported、readiness unavailable、execution active、uncertain 和 fatal error 都 disabled；models 第一项永不作为 default 或发送依据。
- 每次明确 send 使用 `crypto.randomUUID()` 生成一个 `client_msg_id`，同一 execution 与 finalization retry 保持该 ID；conversation ID、时间戳或伪造 persisted message ID 都不作为幂等 ID。
- 点击发送后先创建 `OptimisticUserMessage` overlay 并进入 `sending-user`。只有 `openSendExecution()` 成功返回 stream/duplicate 分支后 Sender 才清空 draft；HTTP 前置失败会移除 optimistic overlay、保留输入并显示安全错误。
- production 首版只发送 `content + client_msg_id`。request mapper 的完整 C2A2 allowlist 是 `content/attachments/client_msg_id/temperature/context_limit/thinking_effort/fast_mode/whisper_mode`；没有真实 UI state 的可选字段全部省略，后端 canonical defaults 为唯一默认事实来源。不得发送 model/provider/cache/carryover/raw history/Settings/MCP/cookie/Authorization。
- SSE `start/chunk/debug-summary/persisted/unknown/capability` 仍由同一 parser 与 Execution mapper 处理。composition reducer 只保留 assistant content、thinking、simple-think、safe usage、server assistant ID 与两个固定 provider failure code；regenerate controller 单独保存 normalized persistence receipt，send 不使用它。raw SSE object、debug body、provider response、endpoint、payload、prompt、key 和 stack 不进入 React state。
- `[THINKING_START]...[THINKING_END]`、`[SIMPLETHINK:...]` 与 `provider_request_failed/provider_execution_failed` marker 都支持跨 chunk 累积；provider failure 只映射成固定安全错误，包含 marker 的 provider 文本不展示。
- transport EOF 不等于持久化成功。EOF 后进入 finalizing 并调用 `reloadMessageHistoryFromScratch()`；正常 stream 已取得 `start.assistantMessageId` 时，只有 HTTP history 包含同一真实 ID 才移除 overlay。HTTP 暂时只有 user 时进入 finalization uncertain；明确 provider failure 仍以 HTTP reload 为最终状态。若 persisted assistant content 含固定 provider failure marker，presentation mapper 只投影通用安全文案，不修改 Domain Message，也不展示 provider 名称或状态码。
- finalization uncertain 保留 optimistic/partial assistant overlay 并标记“未确认保存”，只提供“重新加载历史”。retry 不重新调用 provider、不生成新 `client_msg_id`、不按文本去重。
- execution active 时所有 conversation selection disabled，避免 A 的 SSE 投影到 B。client dispose/abort 只停止本地继续读取，不承诺 server/provider cancel；production S6C 不展示 Stop。
- S6C send controller 本身不调用 `openRealtimeEvents()`、`reconcileRealtimeEvent()` 或 reconnect reconciliation。SSE 只服务当前 HTTP execution；已完成的 S6D coordinator 在其外层负责 WebSocket post-commit coordination。

### Chat Realtime Coordination（S6D）

S6D 在 Chat Workspace 可用且受保护 HTTP bootstrap 已成功（因此当前 lifecycle 已认证）时建立一条全局浏览器 realtime connection。Coordinator 只消费 `openRealtimeEvents()` 已映射的 `RealtimeEvent`，并复用 `reconcileRealtimeEvent()`、`reconcileMessageHistoryAfterReconnect()` 与 Workspace 更新端口；它不解析第二套 WebSocket payload，也不拥有 persistent `Message[]`。

```ts
type ChatRealtimeState =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "connected" }
  | { kind: "reconnecting" }
  | { kind: "unavailable"; reason: SafeRealtimeReason };

type RealtimeDirtyState = {
  currentConversationHistory: boolean;
  conversationList: boolean;
};
```

| 来源 | 唯一职责 | 明确不拥有 |
|---|---|---|
| SSE | 当前页面当前 execution 的临时增量与 overlay；regenerate `persisted` 是 commit acknowledgement | authoritative history、其他客户端变化 |
| WebSocket | 服务端已发生/已提交变化的通知与失效提示 | 最终 Message content、完整事件 replay |
| HTTP History | 可重读的 persisted final truth | 当前尚未提交的 streaming 增量 |

- mount/start 只安排一个延迟到 microtask 的 open；同步 `start → stop → start` 会取消第一代 open，因此 React Strict Mode 不产生双 socket。重复 start 幂等，conversation switch 只更新 context、不重建 socket；unmount/Workspace 离开可用生命周期会 abort opening、close 当前 connection 并取消 reconnect timer。
- 初始 open/network failure 或非本地断开进入最小退避 reconnect；open 前后的 1008 policy/auth close 都只通过安全 close code 映射为 `unavailable/authentication` 并锁定当前 lifecycle，不无限 reconnect。untrusted close reason 不复制到 error；state 不保存 URL、close reason、raw exception、Cookie、payload、stack、provider 或 endpoint。reconnecting/unavailable 只显示轻量降级提示，不改变 HTTP read 或 S6C Sender readiness。
- `message-created` 属于其他 conversation 时只合并 conversation-list refresh，不加载该 conversation history，也不污染当前 BubbleList。属于当前 conversation 且 execution idle 时交给既有 latest HTTP reconciliation；WS payload 永不构造 Message。
- 当前 execution active 时，若 `message-created.messageId` 等于 SSE assistant ID 或当前 `client_msg_id`，该事件只视为 server-side persistence notification：保留 SSE overlay，不刷新或插入 bubble，等待 S6C finalization HTTP reload。包括 `finalizing/finalization-uncertain` 在内，WS 都不抢 execution ownership，因此不会形成 SSE assistant + WS assistant 双气泡。
- active execution 收到当前 conversation 的 unrelated create/update/delete/file sync，或 reconnect 需要收敛时，只设置 `currentConversationHistory` dirty；不保存 event payload、不打断 overlay。execution 变 idle 后统一做一次 scratch HTTP reconciliation。current conversation 的 conversation update/delete 同样延后 sidebar refresh，避免 staged selection/model reload 干扰 SSE。
- idle `message-deleted` 继续复用既有严格 server message ID 本地删除；active execution 下的任何 delete（包括命中 current user/assistant ID）都保守延后，不按 content/index 删除 overlay。idle `message-updated` 只复用 `latest-window-only` refresh，既不伪造 content，也不宣称旧历史已完整更新。
- conversation create/update/delete 与非当前 message 变化只置 conversation-list dirty。list-only refresh 保留当前 history；只有 list 证明当前 conversation 已删除或 model metadata 已变化时，才在不发布 loading/清空旧 UI 的情况下 staged full Workspace reload。
- history 与 conversation-list 各自最多一个 in-flight request；in-flight 期间的多个通知只合并成一个后继 dirty refresh。失败会恢复对应 dirty 位，允许下一事件、context transition、reconnect 或显式 coordinator retry 再次收敛；Coordinator 不无限积累 mapped/raw event。
- 后端没有 event ID、sequence、resume cursor 或 replay。任一 reconnect success 都把当前 selected history 和 conversation list 标 dirty；若 execution active 则等待 SSE finalization，idle 后调用 `reconcileMessageHistoryAfterReconnect()` scratch reload。该过程不重发 send、不调用 provider、不生成或改变 `client_msg_id`。
- 浏览器/WebView 活跃进程内的 `/ws` 是本阶段唯一 realtime 范围。Android 进程挂起、通知栏 push、FCM、native foreground service、后台唤醒与 APK true-background delivery 均不属于 S6D。

### Chat Canonical Target Regenerate（S6E1）

S6E1 只使用 `POST /api/conversations/{conversationId}/messages/{messageId}/regenerate`。请求无 body；query 只来自显式 UI generation state 的 `temperature/context_limit/thinking_effort/fast_mode/whisper_mode`，不存在 UI state 时全部省略。模型只来自服务端 `Conversation.model`。production client 不调用 legacy `/api/conversations/{conversationId}/regenerate`，也不在 regenerate 前后 DELETE target。

- UI guard 只选择当前 selected conversation 中由 HTTP history 读取的、`roleKind=assistant`、`isCarryover=false` 的 latest tail assistant。Workspace/readiness 必须 available + ready，setup/readiness model 必须与 selected conversation 一致，且不能处于 switch 或任一 active execution。user/system/unknown/hidden-runtime、carryover、wrong-conversation、optimistic user 与 streaming assistant 都不是 target；后端仍是最终 eligibility authority。
- send 与 regenerate 共用同一 active execution slot。send active 时 regenerate disabled；regenerate streaming/finalizing/finalization-uncertain 时 Sender、regenerate 与 conversation switching disabled。double click 不能打开第二个 execution，WS/reconnect 也不能重发 provider 请求。
- regenerate 开始时 persistent target 仍保留在 `MessageHistoryState`。纯 presentation composition 按 target ID 把该 assistant 的可见 VM 替换为临时 overlay；loading、content、thinking、simpleThink、provider partial failure、finalizing 与 uncertain 都保持相同视觉 ID/位置，不追加第二个 assistant，不改变 Domain、history count 或 conversation message count。
- regenerate 复用 S6C 的 SSE parser、event mapper、thinking/simpleThink/provider-marker accumulator 与 safe usage。共享 framing 保留命名 `event: persisted`，mapper 把 receipt 的 `simple_think` 明确投影为 `simpleThink`。`start.assistantMessageId` 和 receipt `id` 都必须等于 target message ID；mismatch 是安全 contract failure，receipt ID mismatch 还必须保持 finalization uncertain。缺失 start 不能成为成功 regenerate；malformed 已知 event 抛 contract error，unknown event 只保留安全 type marker 并继续消费。
- canonical target HTTP 错误安全映射为：404 `regenerate_target_not_found`（目标回复已不存在）、422 `regenerate_target_invalid`（当前回复不能重新生成）、409 `regenerate_target_not_latest`（该回复已不是当前最新回复）、409 `regenerate_conflict`（会话已发生变化，请刷新后重试）。`unknown_model/invalid_generation_options/unsupported_generation_option/provider_not_configured` 沿用 generation 安全映射；UI 不显示 raw body、endpoint 或 stack。
- HTTP/preflight failure 立即移除 replacement overlay，原 persistent target 继续展示。streaming/provider failure 的 partial 只存在于 overlay；EOF 只进入 finalizing 并触发 HTTP scratch reload，不是 persistence confirmation。C2A3.1 `persisted` receipt 只对 active regenerate 表示 same-ID replacement 已 COMMIT；receipt 到达只在 execution 内保存 normalized `{id, content, thinking, simpleThink}`，不修改 Domain、不移除 overlay、不结束 execution，也不跳过 EOF 后 HTTP finalization。
- controller 先安装 authoritative HTTP scratch history，再比较 receipt 与 HTTP target 的 `id/content/thinking/simpleThink`。两者完全相等才清除 overlay 并回到 idle；raw/flushed accumulator 不参与 persistence predicate，因为 raw provider stream 可能包含 `<meta>`、`[TODO:…]` 等被后端 canonical cleanup 移除的内容，前端不得复制 command parser。usage、attachments、MCP、cache、voice、createdAt 与其他 metadata 也不参与该 predicate。
- receipt 缺失、HTTP reload 失败、target 缺失或任一 comparison 字段不一致时进入 regenerate finalization-uncertain，保留临时 replacement 和“未确认保存”；HTTP history 即使无法确认本次 transaction，仍照常安装为 authoritative truth。identical old/new content 不再有内容级歧义：receipt 本身证明 commit，receipt 与 HTTP 相等即可确认。“重新加载历史”只复用 active execution 已保存的 receipt 重做 HTTP GET，不再次 regenerate、不 DELETE、不创建 target ID、不自动 retry provider；从未收到 receipt 时，后续 HTTP retry 仍不能虚构本次 commit 已确认。
- C2A3.1 后端顺序是 `COMMIT → WS msg_updated(target) → SSE persisted → post-commit side effects → EOF`。regenerate active 时先到的 `msg_updated(target)` 与其他 current-conversation event 一样只置 history dirty，不从 WS payload 覆盖 persistent target、不插入 assistant、不清除 overlay、不跳过 receipt；当前 execution 的 HTTP finalization 保持 ownership，idle 后再合并 dirty reconciliation。稳定关系是 `SSE persisted = commit acknowledgement / WS = persisted change notification / HTTP history = authoritative persisted truth`。
- regenerate 是原位 replacement，BubbleList 不把 execution ID 作为强制滚到底部 key；target 在尾部且用户仍接近底部时可随流跟随，用户向上阅读时不强拉，final HTTP same-ID replacement 尽量保持 DOM/scroll 稳定。首版不实现复杂 anchor persistence。

## 2. Message Domain（S4B）

Message Domain 只表示后端已经持久化、能够通过 HTTP history 再次读取的消息事实。它不表示当前请求中的 SSE chunk、正在生成的 assistant 内容、optimistic user message、loading/streaming 状态、WebSocket event、发送请求的 `client_msg_id`、分页 UI 状态或 conversation `message_count`。

```text
GET /api/conversations/{conv_id}/messages
  -> history wire DTO
  -> runtime validation / mapper
  -> persistent Message domain model
```

History endpoint 契约：

- Method/path 为 `GET /api/conversations/{conv_id}/messages`，conversation ID 作为单个 path segment URL encode。
- `limit` 是可省略的 integer；服务端默认 `50`，最小 `1`，最大 `500`。client 省略未提供的 limit，不复制默认值。
- `before` 是可省略的 finite Unix seconds number。显式 `before=0` 仍编码；client 不修复服务端当前 `if before` 的 truthy 行为。
- response 是裸 JSON 数组。SQL 先取最新消息，再在响应前 reverse，所以 wire 最终顺序为旧到新；client 不 reverse、不排序、不去重。
- response 没有 wrapper、`hasMore`、`has_more`、`nextCursor` 或 `next_cursor`。client 不推断下一页，也不发明 message-ID cursor。
- conversation 不存在与 conversation 存在但没有消息都会成功返回 `[]`；空数组不是 404。
- HTTP history 不包含尚未提交的 assistant 内容；send 过程中已经提交的 user message 可能被读到。

History wire item 的当前字段为：

```ts
type MessageDto = {
  id: string;
  conv_id: string;
  role: string;
  content: string;
  created_at: number;
  simple_think: string | null;
  is_carryover: 0 | 1 | null;
  attachments: JsonValue[];
  thinking: string | null;
  mcp_tool_calls: JsonValue[];
  cache_region: string | null;
  voice?: MessageVoiceDto;
};
```

`simple_think`、`thinking`、`cache_region` 和 `is_carryover` 所在数据库列没有 `NOT NULL` 约束，因此 domain 保留真实 null；carryover 只把 `0/1/null` 映射成 `false/true/null`，不对其他值做 truthy coercion。时间字段保持 Unix seconds，不转换单位。

后端 history route 对 DB 中的 attachments 与 `mcp_tool_calls` JSON string 执行 `json.loads`，并把 DB `NULL`、空串和空数组表示归一成 `[]`；当前持久化写入与 contract tests 将成功 shape 约束为数组，但 route 本身没有额外检查解析后的顶层类型。这两个字段只有数组顶层契约，没有稳定 item schema；domain 将 item 保留为递归 JSON value，不猜 attachment URL/music union，也不解释 MCP 工具语义。未知但合法的 JSON 字段必须保留，raw object 必须递归复制。坏 JSON 仍可能使当前后端 route 失败；成功响应中的错误顶层类型或非 JSON nested value 是前端 contract mismatch，不能静默变成空数组。

可选 voice 是已经持久化的 capability；无 voice 时 wire 完全省略该字段，domain 使用 `null`，不得制造空 voice。完整 projection 为 `audio_id/msg_id/provider/voice_id/url/duration/favorited/created_at/updated_at`；`duration` 可为 null，`favorited` 是 boolean，其余时间为 Unix seconds number。

后端对 message role 没有枚举约束。domain 必须保留 `rawRole`，并另提供稳定 `roleKind`：`user/assistant/system` 原样分类，`cam_trigger/cam_user/cam_log` 分类为 `hidden-runtime`，其余 role 分类为 `unknown`。未知 role 不拒绝、不改写成 assistant；最终 UI 展示策略不由本阶段决定。

raw snake_case DTO 只存在于 `src/domain/message` 内部边界，不由领域 barrel 导出，也不进入组件。mapper 只投影公开字段、递归复制 JSON capability、丢弃额外 secret/config/raw payload，并用不包含原始 payload 的 `MessageContractError` 报告 contract mismatch。HTTP 401/422/500 与 network/timeout/abort 继续保持共享 transport 的 `ApiError` 语义。

HTTP history、SSE 与 WebSocket 是三个不同时间边界：history 是可重读的持久化最终事实，SSE 是当前请求的原始增量，WebSocket 是持久化后的变化通知。SSE 拼接内容不保证等于最终持久化 Message，因此 `streamingContent/status/isStreaming` 等字段不得进入 Message Domain。WebSocket payload 与 HTTP history DTO 也不能共用未经验证的 wire mapper。

前端 Message mapper 与后端 Prompt History Projection 是两套独立边界：前者忠实读取持久化事实；后者决定下一轮如何向 AI provider 表达这些事实。本阶段不把 system role 改成 user/assistant，不处理系统通知格式，也不修改 command、MCP、Camera、Schedule 或其他 prompt 回注逻辑。

**AionsHome 权威来源**：`docs/chat-message-dto-contract.md`、`aion-chat/routes/chat.py`、`aion-chat/database.py` 及 `aion-chat/tests/contract/test_chat_message_dto_contract.py`。

## 3. Message History Application（S4C）

Message History Application 位于 Message Domain 与未来 React hook / Chat ViewModel 之间，只拥有某一 conversation 已经通过 HTTP 读取的持久化 `Message[]`。它不重新定义 wire DTO，不直接调用 transport，也不拥有 loading、error、选中 conversation、滚动位置、optimistic message、SSE chunk、streaming assistant、client message ID、发送请求或 WebSocket 连接。

```ts
type OlderPageStatus = "maybe-more" | "exhausted" | "stalled";

type MessageHistoryState = {
  readonly conversationId: string;
  readonly messages: readonly Message[];
  readonly pageSize: number;
  readonly oldestCursor: number | null;
  readonly olderPageStatus: OlderPageStatus;
};
```

- `maybe-more` 只表示当前结果不足以证明耗尽、仍可尝试更早请求，不表示服务端确认存在下一页。
- `exhausted` 只在初始页为空、请求页为空或小于 page size、或没有可用 oldest cursor 时使用。
- `stalled` 表示请求成功但没有新增服务端 message ID，或合并后的最老 timestamp 没有严格早于本次 `before`。它阻止 timestamp cursor 无限循环，不表示后端确认历史完整。
- `oldestCursor` 始终来自当前 messages 最老的 `createdAt`；空历史为 `null`，Unix timestamp `0` 是有效值。前端不使用 message ID cursor，也不对 timestamp 减一、减毫秒或添加 epsilon。
- persistent message 的唯一合并身份是服务端 `message.id`。不同 ID 即使 content、role 与 timestamp 完全相同也不合并；相同 ID 使用本次 incoming 服务端 payload 更新。
- incoming page 自身重复 ID 时，最后一次出现的 payload 生效，并按各 ID 最后出现位置维持稳定页内顺序。
- 合并结果按 `createdAt ASC` 保持旧到新；相同 timestamp 保持稳定插入顺序，不用 ID 字典序伪造服务端全局第二排序键。
- older merge 以 `older page + existing messages` 为插入基线；只有 page 达到 page size、至少加入一个新 ID 且 oldest cursor 严格前进时才继续保持 `maybe-more`。
- latest refresh 是有限最新窗口，不是全量 snapshot。它更新同 ID、加入新 ID 并保留已经加载的旧页；response omission 不代表 delete，空 latest page 也不清空现有 history。
- reload from scratch 明确重新调用 initial load，并丢弃当前已加载页；这是本层提供的权威重建入口。
- 所有纯合并与 load 操作都不修改输入 state、数组或 Domain Message；未被更新的 Message 对象可以安全复用，公开 messages 数组由 application 新建。
- conversation mismatch、非法 application state 或非法 page size 使用不包含 message content / 完整 state 的 `MessageHistoryContractError`。`ApiError`、`MessageContractError`、network、timeout 与 abort 不包装，保持原类型传播。

当前后端 `created_at < before` 在同 timestamp 边界可能漏项，且没有 cursor/has-more metadata。前端不能通过猜测 timestamp 修复这一限制，也不能声称当前分页无遗漏。

未来 SSE / WebSocket 只能触发 latest refresh、reload，或由临时 Chat ViewModel 表达流式状态；SSE/WS payload 不直接成为 Message History。明确的 message delete/update realtime reconciliation 与 `file_synced` 策略属于后续阶段。

## 4. Streaming Transport / SSE Framing（S4D1）

Streaming Transport 位于 runtime HTTP config 与未来 Chat Execution Client 之间，只负责共享请求生命周期、流式 byte body 和 SSE framing。它不属于 Message Domain，也不产生 persistent `Message`、streaming assistant state、optimistic message 或任何 Chat event。

```text
Runtime API config
        ↓
Shared API request lifecycle
        ↓
ReadableStream<Uint8Array>
        ↓
streaming UTF-8 decode
        ↓
SseDataFrame { data: string }
        ↓
Chat event validation（S4D2）
```

- `openApiStream` 与现有 JSON transport 共享 runtime base URL、path/query resolution、method/body/header 构造、`credentials: "include"`、timeout、caller `AbortSignal`、network error、HTTP error 和 `ApiError` 语义；raw `Response` 与底层 request context 保持 transport internal。
- 成功结果只公开 `contentType` 与 managed byte stream。调用方可以先判断 `text/event-stream` 或普通 JSON，再选择 mapper；本层不实现 `/send` duplicate JSON 分支。
- SSE framing 的公开事实只有 `SseDataFrame { data: string; event?: string }`。parser 只逐 frame 保留可选命名 `event` 字符串并在 frame 后重置；`persisted` 的业务语义仍由上层 Chat mapper 定义。`id`、reconnect cursor、Chat `type`、music/MCP/thinking/debug 等业务语义不由 framing 层定义。
- parser 不能假设一个 network chunk、文本行或 `reader.read()` 结果就是一个 event。它支持 LF/CRLF、frame 跨 chunk、单 chunk 多 frame、注释/未知字段、多条 `data:` line 与空 data；多条 data line 使用 `\n` 连接，`data:\n\n` 必须产出空字符串。
- byte stream 必须使用同一个 `TextDecoder` 的 `decode(chunk, { stream: true })` 增量解码，并在 EOF flush；中文或 emoji 的 UTF-8 bytes 跨 chunk 时不得损坏。
- EOF 只表示当前 transport 已关闭，不表示 assistant message 已持久化、后台 task 已完成或副作用成功。已经以空行结束的 frame 正常产出；EOF 后只余空白时正常结束；仍有未以空行结束的非空 frame 时抛不含 payload 的 `SseFramingError`，不得把截断 JSON 当作正常完成。
- caller abort、timeout、network failure、HTTP failure 与 SSE framing failure 保持可区分。abort 或 reader cancel 只停止当前客户端请求/读取；当前后端生成 task 独立运行，不存在停止 provider、后台生成、持久化或副作用的承诺。
- 完整读取、提前停止、abort、timeout 与异常路径都必须清除 timer/listener，并 cancel 或释放 reader lock。parser 按抵达顺序懒产出 frame，不缓存完整 frame history。
- `parseSseJsonData` 只做 `JSON.parse` 并以不含 raw data 的 `SseDataError` 表示 malformed JSON；它不验证 Chat event type，也不因未知业务 event 报错。
- raw SSE data 不写入 error、error cause、日志或 console；framing/data error 不得包含 prompt、message content、secret、Authorization、provider endpoint 或 debug payload。
- SSE/stream 事件顺序不得自行调整；同名 SSE 与 WebSocket event 也不得混为同一 payload。command marker 如需隐藏，只能在显示层过滤，前端不得通过解析 command 文本执行业务命令或重新实现 command grammar。

Chat send/regenerate 的 request DTO、event union 与 duplicate JSON 由 S4D2 在本层之上实现；持久化对账与 UI 状态仍属于更后阶段。

**AionsHome 权威来源**：`aion-chat/routes/chat.py`、`aion-chat/static/chat.html`、`docs/command-parser-contract.md` 和相关 command contract tests。

## 5. Chat Execution Client / Event Contract（S4D2）

Chat Execution Application 位于 Streaming Transport 与未来 Chat ViewModel / orchestration 之间。它只表示一个 send 或 regenerate HTTP 请求的请求契约、响应分支与临时执行事件，不创建或修改 persistent `Message`。

```text
openApiStream
  -> content-type discrimination
      -> text/event-stream -> parseSseStream -> parseSseJsonData -> mapChatExecutionEvent
      -> application/json  -> bounded JSON reader -> duplicate acknowledgement
```

### Request contract

send 使用 `POST /api/conversations/{encodedConversationId}/send`。只发送调用者显式提供的可选字段，不复制后端默认值：

```ts
type SendMessageRequestDto = {
  content: string;
  context_limit?: number;
  attachments?: string[];
  whisper_mode?: boolean;
  fast_mode?: boolean;
  temperature?: number | null;
  thinking_effort?: string | null;
  client_msg_id?: string | null;
};
```

后端 canonical defaults 为 `temperature=1.0`、`context_limit=30`、`thinking_effort=null`、`fast_mode=false`、`whisper_mode=false`。client 不为服务端行为复制这些默认值，只保留调用者显式提供的 `false/0/null`；attachment item 必须是 string。send 不接受 model override，模型只来自持久化Main selection；carryover/cache/provider/raw history 不在 C2A2 envelope 中。

regenerate 使用 `POST /api/conversations/{encodedConversationId}/messages/{encodedMessageId}/regenerate`，没有 request body。可选 query 为 `context_limit`、`whisper_mode`、`fast_mode`、`temperature`、`thinking_effort`；未提供字段省略，显式 `false`、`0` 和空字符串保留，显式 null 省略。client 必须接收并 URL-encode target assistant ID，但不接收 model/provider override，不删除旧 assistant，也不编排 legacy delete-then-regenerate。

### PR6.5-B 临时参数边界

- Header只编辑`contextLimit`/`temperature`。Workspace controller持有唯一已应用快照，初始空；输入字符串不直接成为请求，必须通过整数/finite/协议范围校验并显式应用。0保留，空值删除覆盖键；默认不传字段，不传null或写死默认数字。
- 上下文为1–100严格整数；温度Anthropic 0–1、OpenAI/Gemini明确协议0–2。历史Profile未提供协议时不推断温度范围。30/1.0只作后端契约默认说明，非读取的已保存配置；实际literal支持性由上游判断。
- 临时快照仅属于当前已确认conversation与Connection/Protocol/Model，切换后失效；scope对象身份阻止A→B→A旧表单回写。无配置GET/PUT、DB/Settings JSON/LS保存，不承诺刷新或离开恢复。
- production ChatView在调用时从最新Workspace捕获同一已应用快照，分别交给send与canonical regenerate的既有mapper；合并附件、保留client_msg_id/正文。regenerate仍空body/query传参；请求发起后的UI修改不会改变已捕获值。
- 同步owner guard检查执行、结果未知、模型保存、会话mutation/切换；校验失败不覆盖已应用值，取消只丢编辑。恢复默认立即清空覆盖并关闭面板。422/上游/网络错误沿原流程与SubmissionRecovery暂存保留，参数应用不自动清错误、重发或换路由。
- 全局temperature/enable_thinking/thinking_effort属于部分optionless/后台兼容路径，Main不自动继承。Thinking缺少模型级能力声明，首版不开放；HEART/DRIFT与TTS/Voice不在本轮。

源码：[参数owner](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/chat-request-parameters.ts:1)、[Workspace同步guard](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/chat-workspace-controller.ts:1)、[Header表单](/Users/remix/Desktop/Penumbra/src/components/chat/ChatRequestParametersMenu.tsx:1)。覆盖状态统一维护于[settings-inventory.md](./settings-inventory.md)。

### Response contract

- media type 大小写不敏感，并在比较前去除 `charset` 等参数和空格。send 只接受 `text/event-stream` 或 `application/json`；regenerate 只接受 `text/event-stream`。缺失或其他类型是安全的 `ChatExecutionContractError`，未读 body 会被取消。
- send 的 JSON 成功分支只接受 `{ ok: true, msg_id: non-empty string, duplicate: true }`。它投影为 `{ kind: "duplicate", userMessageId }`，额外字段丢弃。duplicate acknowledgement 不是 Message，不表示 assistant 已生成、持久化或可从 history 读取，也不自动 refresh history。
- duplicate JSON 使用同一个 managed response body、fatal UTF-8 decoder 和 64 KiB 上限；malformed JSON、非法 UTF-8、超限和 shape mismatch 均不保留 raw body，不发起第二次请求。timeout/caller abort 继续保持共享 `ApiError` 语义。
- SSE 返回 `{ kind: "stream", events }`。`events` 是单请求、无 React 依赖、按抵达顺序懒消费的 `AsyncIterable<ChatExecutionEvent>`；提前停止会沿 parser/transport 取消读取并释放 reader/timer/listener。

当前 direct send/regenerate SSE wire catalog 精确为：

| Wire type | Safe application projection |
|---|---|
| `start` | `start { assistantMessageId: id }` |
| `chunk` | `chunk { content }` |
| `mcp_loading` | `mcp-loading { messageId: msg_id, tools }` |
| `heart_whisper` | `heart-whisper { id, messageId: msg_id, content, createdAt: created_at }` |
| `toy_command` | `toy-command { messageId: msg_id, commands: string[] }` |
| `cam_check` | `camera-check { conversationId: conv_id, modelKey: model_key, messageId: msg_id }` |
| `cam_offline` | `camera-offline` |
| `poi_search` | `poi-search { conversationId: conv_id, categories: string[], messageId: msg_id }` |
| `activity_check` | `activity-check { conversationId: conv_id, count: n, messageId: msg_id }` |
| `music` | `music { messageId: msg_id, cards: JsonValue[] }` |
| `debug` | 最小 `debug-summary`，见下文 |
| named `event: persisted`（regenerate only） | `persisted { receipt: { id, content, thinking, simpleThink <- simple_think } }` |

direct SSE 没有公开 `done`。后台 task 在内部 queue 写入的 `done` 只让 response generator 结束，不会转发。`location_check` 当前只经 WebSocket 广播；thinking 编码在普通 chunk marker 中；usage 只可能位于 debug，不存在独立 thinking/usage 事件。S4D2 不加入 `mcp_tool_start`、`mcp_tool_done` 或 `mcp_tool_calls`。

所有已知事件都逐字段验证；ID 要求非空 string，其他 string 不擅自 trim，number 必须 finite，array/object 递归复制，extra fields 丢弃。已知 type 的 malformed payload 抛不含原始 event 的 `ChatExecutionContractError`，不得降级为 unknown。未知 string type 投影为 `{ type: "unknown", rawType }`，只保留 type、不保留 payload，并允许后续 frame 继续消费；缺失或非 string type 仍是 contract error。

debug 的公开 allowlist 只有 `messageId <- msg_id`、`modelKey <- model`、`hasError <- has_error`、两个固定 `failureCode`，以及 usage 中 finite 的 `prompt_tokens/completion_tokens/total_tokens`；usage 可为 null，缺失 token count 映射为 null。`error_text` 本身不公开，只检测 `provider_request_failed/provider_execution_failed`；其他 debug/provider/prompt/secret 字段全部丢弃。

生命周期语义严格限定如下：

- `start` 只表示后端为当前 assistant generation 分配了 message ID，且流式执行已开始；不表示 assistant 已持久化、history 已可读或生成必然成功。
- `chunk` 只表示 provider/后处理管道输出的一段原始增量；不表示最终 Message content、command 成功、thinking 已清洗或 assistant 已落库。
- regenerate `persisted` receipt 是 same-ID replacement 已 COMMIT 的 acknowledgement，payload 是 backend 最终 persisted projection，不是 raw provider stream。receipt 只属于 active regenerate persistence confirmation；send reducer 忽略它。
- iterator 自然结束/transport EOF 只表示当前 HTTP response body 已结束；不产生 `completed` 或伪造的持久化事件，不表示 assistant commit、WS 送达、history 更新或 provider 正常完成。
- caller abort、timeout 或 consumer 提前停止只停止本地请求和后续读取并释放资源。AionHome 的生成在独立后台 task 中继续；client 不提供 `cancelGeneration`，也不承诺停止 provider、阻止持久化、撤销 command 或取消其他 side effect。

底层 Chat Execution 仍不调用 history、不创建 optimistic Message、不连接 WebSocket、不读取 Settings，也不修改 `MessageHistoryState`。S6C/S6E1 的统一上层 controller 在 EOF 后显式触发 HTTP scratch reload；send 继续以真实新 assistant ID 对账，regenerate 只有在 saved receipt 与 same-ID HTTP target 的 normalized semantic projection 完全相等时才移除临时展示。

**AionsHome 权威来源**：`aion-chat/routes/chat.py::MsgCreate`、`send_message`、`regenerate_message` 及其 queue/SSE generator；旧 `static/chat.html` 只用于核对兼容差异。

## 6. Realtime Reconciliation Application（S4E2）

Realtime Reconciliation 位于已经映射完成的 `RealtimeEvent` 与 HTTP Message History 之间。它把单个 WS notification 投影为明确 plan，再只对当前 `MessageHistoryState` 执行有限操作并返回带 authority/scope 的结果。WS notification 不是完整 `Message`，HTTP history 仍是可重读的持久化事实来源。

- `message-created` 计划为 `refresh-latest-history / expected-authoritative`。当前 conversation 通过 `refreshLatestMessageHistory` 读取最终 Message；不得直接从 WS payload 创建 Message。结果 authority 为 `authoritative`，表示已按提交后的通知刷新当前 latest window，不表示 SSE content 与持久化 content 相同。
- `message-updated` 计划为 `refresh-latest-history / latest-window-only`。当前 WS 只有 message ID，HTTP 又没有单 Message GET；目标可能是 latest window 之外的较早消息，因此 latest refresh 只是 best effort，结果必须保留 `latest-window-only`，不得宣称目标已权威更新、自动分页全部历史、猜测 content 或伪造单条 fetch。
- `message-deleted` 计划为 `remove-message`。提交后的稳定 conversation/message ID 允许当前 History 严格按 server message ID 本地删除；不存在 ID 是幂等 no-op。删除不按 content、timestamp 或 role 匹配，不生成 tombstone，不请求 HTTP，并保留 page size 与 older-page knowledge。
- `file-synced` 计划为 `reload-history / file-synced`。文件同步可能批量重建消息且没有逐条通知，因此当前窗口必须通过 `reloadMessageHistoryFromScratch` 重载，并明确丢弃此前加载的早期页。
- caller-managed reconnect 计划为 `reload-history / reconnect`。后端没有 event ID、sequence、replay 或 reconnect cursor，socket 重新连接不能证明中间事件未丢失；S4E2 只用 HTTP 重建当前 latest window，不创建 socket、backoff 或 replay 状态。
- conversation created/updated/deleted 只产生 conversation-list invalidation；它们不修改或清空 `MessageHistoryState`，即使当前 conversation 被删除也不自动导航或改变 selection。
- unknown event 只产生带安全 `rawType` 的 ignore plan，不保留或解释 payload。
- message/file 事件属于其他 conversation 时，不请求 HTTP、不切换 state conversation，也不修改当前 state；result 保留 plan 中的目标 conversation 和 `other-conversation` scope。S6D coordinator 对这类通知只合并 conversation-list refresh。

Reconciliation result 显式包含 plan、应用动作、引用级 `historyChanged`、authority、scope 与 `conversationInvalidated`。`authoritative` 只描述本次明确动作：created 的 latest refresh、已提交 delete 的本地应用、或 file/reconnect 后重建的 latest window；它不是对所有未加载历史的全局完整性证明。

SSE `start.assistantMessageId` 与 WS `message-created.messageId` 只在 message ID 和 conversation ID 都完全相等时关联。该判断仅表示“收到了对应 SSE generation ID 的持久化创建通知”；它不生成 Message、completed event 或发送成功结论，也不自动 refresh。S6C send controller 继续通过 HTTP scratch history finalization，并集中管理 optimistic/streaming 展示；S6D 只做 correlation/defer。

S4E2 服务一次只处理一个 plan，不拥有连接或并发控制。S6D coordinator 已串行化当前 history reconciliation：一个 request in flight 时只置 dirty，随后用一次 scratch reload 覆盖合并变化；Workspace AbortController/request generation 保证较旧结果不能覆盖新 selection。没有引入 raw event queue、外部 store 或新依赖。

**Backend contract gap — Message update reconciliation**：当前 WS `msg_updated` 仅提供 message/conversation ID，HTTP 没有单 Message GET。较早消息的更新无法由有限 latest window 保证完整对账；该限制由 plan/result 与文档持续表达，前端不通过全量自动分页或猜测 payload 伪造修复。

**AionsHome 权威来源**：`docs/ws-event-contract.md`、`docs/chat-message-dto-contract.md`、`aion-chat/static/chat.html` 和 `aion-chat/routes/chat.py`。

## 7. Regenerate

- AionHome C2A3 canonical target regenerate 已取代 Penumbra 的旧契约假设。target eligibility 是 persisted、non-carryover、latest tail assistant；后端继续为最终 authority。
- 成功时 SSE `start.id`、named SSE `persisted.id`、被 UPDATE 的 persistent assistant 与 WS `msg_updated` 都使用相同 target ID；HTTP history 返回 same ID 与 authoritative canonical projection。Penumbra 只做临时视觉 replacement，不创建第二个 persisted assistant。
- 未成功 commit 时 persistent target 保持原样。HTTP/preflight failure 立即撤掉 overlay；streaming/provider failure 必须先 HTTP reload 再展示原 authoritative target，partial 永不写入 Domain。
- `SSE persisted = commit acknowledgement`，`HTTP history = authoritative persisted truth`，`receipt + HTTP projection match = frontend confirmed finalization`。EOF 与 raw provider stream 都不是 persistence confirmation；raw stream 也不等于 backend cleanup 后的 canonical Message。receipt missing、HTTP reload/target/match failure 都保留 finalization-uncertain overlay，identical output 在 receipt/HTTP 相等时正常成功。“重新加载历史”只做 HTTP GET，没有 provider、POST regenerate、DELETE、create 或 receipt regeneration side effect。
- production 禁止 legacy conversation-scoped regenerate，禁止 regenerate 的 DELETE + POST 编排。

**AionsHome 权威来源**：C2A3 Atomic Target Regenerate Contract、canonical route implementation、message persistence contract tests 与 `msg_updated` contract。

## 8. Stop/cancel

- 当前未确认真实的服务端停止生成接口。
- `AbortController` 只能证明前端停止等待或读取响应，不能证明后端停止生成、持久化或执行副作用。
- 在后端契约确认前，UI 不得显示“后端已停止生成”。
- 可以表达“已停止接收”等准确状态；具体产品文案后续决定。
- 停止读取后仍应允许 snapshot 或 WebSocket persisted event 校正本地状态。

**AionsHome 权威来源**：Chat send route、stream persistence 行为及后续新增的 stop/cancel contract；当前状态为待后端确认。

## 9. Carryover 和 prompt 顺序

现行后端允许旧浏览器以`carryover:{source_conv_id,message_ids}`在新会话首次send请求受限引用；非空raw carryover_messages仍拒绝。Penumbra没有接入该输入，PR6.5-B不添加携带或改变prompt顺序。

- 旧前端存在 carryover 筛选与 `localStorage` 行为，并在新 conversation 首次发送时提交 `carryover_messages`。
- 这涉及 prompt 输入顺序、去重、持久化和上下文所有权。
- 未确认后端当前职责前，不得原样迁移、删除或重新设计 carryover。
- 相关改动必须先阅读 AionsHome runtime model 和 master plan。
- 前端不得以“只影响本地历史”为由改变 carryover 筛选或注入时机。

**AionsHome 权威来源**：`docs/aionhome-runtime-model.md`、`docs/aionhome-refactor-master-plan.md`、`docs/chat-message-dto-contract.md`、`aion-chat/static/chat.html` 和 `aion-chat/routes/chat.py`。

## 10. WebSocket

- S4E1 只连接浏览器 endpoint `/ws`。URL 复用 `runtime-config`：HTTP base 转为 `ws://`，HTTPS base 转为 `wss://`，并保留 host、port 和 base path；不连接 `/ws/android-push`，不添加 push token、session query 或另一套 WebSocket 环境配置。
- 浏览器 WebSocket 没有 fetch 的 `credentials: "include"` 选项，也不能由应用设置任意 `Authorization` header。`/ws` 的 session cookie 只能由浏览器在 handshake 中按 origin、domain/path、SameSite、Secure 与部署条件自动携带；Penumbra 不读取、保存、打印或手工构造 cookie。
- 通用 WebSocket transport 是无 React 依赖的单次连接：只创建一个 socket，等待 open，保持消息抵达顺序，支持 open timeout、caller abort、显式 close 与 consumer 提前停止，并在结束时清理 listener、timer、等待者和未消费队列。它不暴露原始 WebSocket，不创建全局 singleton，不自动重连。
- `closed` 保留服务端 close `code/reason/wasClean` 和 `initiatedLocally`。reason 是不可信字符串，不进入日志。1008 是 policy/authentication 相关 close 信息，但 S4E1 不据此改写 session、登录或 UI 状态；1000 也只表示 socket close，不表示 history 已同步。
- AionHome manager 当前发送 JSON text。非 string 的 Blob、ArrayBuffer 或 binary view 由 Realtime 层安全拒绝；malformed JSON 抛 `RealtimeDataError`，错误不包含 raw data，且不会向 console 打印 payload。
- `RealtimeEvent` 只投影 `msg_created/msg_updated/msg_deleted`、`conv_created/conv_updated/conv_deleted` 与 `file_synced` 的稳定 message/conversation ID。extra fields 全部丢弃，不保留 raw object。
- `msg_created.data` 由不同持久化写入点临时组装，不是完整 HTTP history DTO；role、content、attachments、thinking、MCP、TTS 等字段不被当作可靠快照，也不会映射成 Message Domain 对象。WebSocket notification 只表示某项持久化事实可能已变化。
- 未知非空 string event type（包括当前未由 S4E1 消费的 capability、execution、debug、pong 和其他领域事件）安全映射为 `{ type: "unknown", rawType }`，不保留 payload，且后续事件可以继续消费。已知 event 若缺少稳定 ID 则抛 `RealtimeContractError`，不能降级成 unknown。
- 旧 web client 没有维持 `/ws` 所必需的应用层 heartbeat。后端支持 inbound `{type:"ping"}` 并回复 `pong`，主要服务 Android push；这不等于 Penumbra 必须定时发送 ping。`tts_state` 会改变服务端 runtime TTS state，属于后续独立能力，不在 S4E1 提供任意 outbound command API。
- 当前后端没有 event ID、sequence、replay 或 reconnect cursor。S4E1 transport 本身不实现 backoff、jitter、network/visibility listener、session refresh、reconnect marker 或 replay；S6D caller-managed reconnect 已与 S4E2 的 HTTP scratch reconciliation 组合，不能只恢复 socket 就宣称数据已恢复。
- HTTP history、SSE 与 WebSocket 仍是三套时间边界：HTTP history 是可重读的持久化最终事实，SSE 是当前请求临时增量，WebSocket 是提交后的变化通知或失效提示。S4E2 可按 `SSE start.assistantMessageId ↔ WS message-created.messageId` 和 conversation ID 做纯关联，但不合并两套 event union，也不据此生成 completed event。
- S4E1 transport 不调用或修改 Message History，不调用 Conversation client 或 Chat Execution，不创建 optimistic/streaming state，也不接 Chat mock/UI。S4E2 只消费映射完成的 event，不调用 `openRealtimeEvents` 或持有 connection。
- Chat、Theater 等领域不可仅因共用 `/ws` 就合并业务状态机。Theater 的入站 `tts_state` 以及 `tts_chunk`、`tts_done` 等事件继续保持独立语义。

**AionsHome 权威来源**：`docs/ws-event-contract.md`、`aion-chat/ws.py`、`aion-chat/main.py` 及 WebSocket contract/snapshot tests。

## 11. Memory Read / Create / Pin（S7A / S7B 部分接入）

S7A 已接入 AionHome 的分页读取契约 `GET /api/memories`；当前也已接入新增记忆和 Pin 目标状态写入。Penumbra 每次列表请求都显式发送 `page` 与 `page_size=30`，因此只接受 `{ items, page, page_size, total, total_all, has_more }`；不进入省略 `page` 时的 legacy 全量数组分支，也不在浏览器内模拟全库过滤。

- list item wire fields 为 `id/content/type/created_at/source_conv/keywords/importance/source_start_ts/source_end_ts/unresolved`。DTO 只停留在 `src/domain/memory`；React 只读取 camelCase Memory Domain。
- `content` 是 list 返回的完整记忆正文；当前没有单条 memory detail endpoint。`GET /api/memories/{id}/source` 是原文追溯，尚未接入。
- 支持的服务端 query 仅为 `page/page_size/q/created_from/created_to/importance/pin_first`。S7A 不发送 type、tags、pinned-only、cursor 或 offset 等不存在字段。
- `q` 由后端匹配正文、已知类型中文标签与未知 type 原值；前端只 trim、限制 200 字并 debounce，不复制匹配规则。
- `importance` 只发送 `low/mid/high/top` 枚举；具体数值区间由后端拥有。`all` 通过省略 query 表达。后端当前区间存在重叠及空档（如低/中在 `[0.45, 0.5)` 重叠，`[0.55, 0.6)` 不属于任何档位）；是否调整属于待产品确认项，前端不重划区间。
- 时间边界是 inclusive Unix 秒数。预设时间保留 Memory 已建立的本地 04:00 逻辑日边界，再把绝对 `created_from/created_to` 发送给后端。
- `keywords` 的标准数据库形态是 JSON array string；adapter 同时容忍空值、历史普通字符串与 array，安全去空/去重，非法 metadata 不让页面崩溃。
- `unresolved` 映射为 Domain `isPinned`，当前表示这条 memory 仍含未完成事件。UI 已接入小型线性 Pin 按钮，以“标记为待继续 / 取消待继续标记”提供可访问名称；不增加状态文字或 badge。Pin 最终产品语义仍待确认，当前不改为普通收藏语义。
- `pin_first=true` 只表示服务端将 unresolved 项排在前面，不是 pinned-only filter。
- controller 拥有 `idle/loading/ready/error`、retry、AbortController、request sequence 与旧请求保护；筛选或搜索变化回到第一页，旧数据可在背景刷新时稳定保留。
- 新增使用 `POST /api/memories`，提交 `content/type/importance/keywords`；内容 trim，关键词以 JSON array string 发送，无关键词时发送空字符串。表单默认 `event/0.5`，保存中防重复提交；回执不直接插入列表，成功后保留筛选并读取第一页。
- Pin 使用 `PUT /api/memories/{encodedId}/unresolved`，提交明确的 `{ unresolved: boolean }`，不调用 legacy toggle PATCH。仅当前条目 pending，成功后按当前查询和页码重新 GET。
- 已确认写入与列表同步分别处理：POST/PUT 成功后的 GET 失败进入可恢复的 error 状态，保留已有列表，并显示“记忆已保存 / 标记请求已完成”的同步错误和“重新读取列表”。无列表数据时同样可见；手动重试仅 GET，保留最新搜索、筛选与页码，不重发 POST/PUT。错误提示在重试期间保留，当前有效 GET 成功后清除；被替代或已中止的旧请求不能覆盖新状态。
- 写入请求本身的网络失败或超时仍表示结果不确定，不冒充写入成功，也不自动重发；新增保留表单和不确定提示，Pin 按既有规则尝试 GET 对账。
- 页面采用一块连续 `mist-glass-strong` 阅读面板，item 依赖留白与 separator，而非独立卡片墙；Pin 之外不常驻操作 icon。
- 编辑、删除、手动总结、锚点管理、原文追溯、重总结、导出和 Memory realtime / AI workflow 尚未接入。浏览器不直接调用 AI provider；手动新增在后端可触发 embedding 等既有行为。

S7B 当前只接入 Create 与 Pin，不代表完整管理能力已迁移；其余管理操作后续独立确认范围。

**AionsHome 权威来源**：`aion-chat/routes/memories.py`、`aion-chat/database.py` 与 `aion-chat/static/memory.html` 中的真实字段/筛选语义。旧 HTML 只用于契约核对，不是 Penumbra 的 DOM/CSS 来源。

## 12. Authentication 与部署

- 当前 web 前端请求使用 cookie/session。
- PR8A HTTP transport 使用 `credentials: "include"`。
- production 采用同源反代还是跨域部署尚待确认。
- 使用绝对 API、upload 或 WebSocket URL 时，必须确认 CORS、cookie、SameSite 和 WebSocket 鉴权。
- 在部署契约确认前，不增加由 Penumbra 自行维护的 Bearer token 方案。
- 401/403 应映射为认证状态，不能与网络不可达混为一类。

### Runtime 安全读取边界

- Penumbra 已通过 domain client 接入 `GET /api/session`、`GET /api/models` 和 `GET /api/chat/readiness`。
- `/api/session` 的 HTTP 401 表示后端可达但未认证；network/timeout 表示当前不可达，其他 HTTP 错误表示后端可达但服务异常。
- `/api/models` 仅消费 `key/provider`；后端尚无独立 label，因此 mapper 暂时使用 `label = key`。
- readiness 只表示当前后端规则下本地配置是否齐备，不代表 provider 在线、凭据有效、余额充足或 provider healthy。
- `/api/settings` 不再作为普通前端连接探针。raw wire DTO 必须先经过校验与 mapper，不能进入 React 组件。
- readiness reason 是 HTTP 200 下的业务状态，不得与 transport error、contract error 或认证状态混合。

### Settings Safe Basics Integration（S5A）

- Settings 安全概览只调用 `GET /api/session`、`GET /api/models` 和 `GET /api/chat/readiness`，三个请求经现有 Runtime Domain 与通用 HTTP transport 并行发起。
- 页面是只读安全概览，当前 Penumbra Settings 的背景、透明度、色彩、圆角、阴影、间距和响应式布局是实现基准；S5A 不进行全局视觉重构。
- 旧 `/api/settings` 不属于本层 allowlist，不得用作探针、fallback 或聚合读取；Provider secret、endpoint、cookie、Authorization 和完整 config 不得进入 application read model 或页面文本。
- `/api/models` 的后端顺序必须保留。列表第一项不是默认模型、当前模型或 bootstrap model，页面不得据此推断或写入选择。
- `ChatReadiness` 是后端对 bootstrap/current model 的事实投影；前端不重新计算 readiness。其 `modelKey` 即使不在 models 列表中也必须作为 unknown model 保留并展示。
- `idle/loading/success/error`、retry、AbortController 和旧请求竞态保护属于 React/controller 层，不进入 Runtime Domain 或 `SettingsOverview` application model，也不持久缓存或轮询。
- Settings Overview 不读取 Conversation 或 Message，不调用 Chat Execution，不消费 SSE，不连接 WebSocket，也不触发 Realtime Reconciliation。
- Provider Administration、secret management和全局Feature默认仍未接入。安全概览不拥有各业务页已接的设置；PR6.5-B只新增Chat请求级两参数，不表示全局设置或语音能力已完成。

**AionsHome 权威来源**：`aion-chat/main.py`、`aion-chat/auth.py`、部署配置和未来部署契约；Penumbra transport 事实见 `src/lib/runtime-config.ts` 与 `src/lib/api.ts`。

## 13. Provider config 与 secret

- API provider 配置仍是有效业务能力。
- legacy `custom_*` 和 Gemini fallback 尚不能由 Penumbra 删除。
- 可以从新 UI 主流程隐藏到兼容或高级区域，但隐藏不等于移除后端能力。
- secret 不得直接展示，也不得进入普通展示组件、日志或通用 view model。
- UI 应只接收 masked value、尾部掩码或 `hasSecret` 等安全形态。
- 当前Settings/Connection常规GET已有安全投影；密钥有意查看/替换/清除走专用secret_ref契约。旧raw key描述已过时。Penumbra连接管理/默认Feature绑定仍未接入，Header也不读取这些凭据。

**AionsHome 权威来源**：`aion-chat/routes/settings.py`、`aion-chat/static/settings.html`、provider 配置实现和相关 contract tests。

## 14. Upload

- 当前上传 endpoint 为 `/api/upload`。
- 必须使用 PR8A 的 upload URL resolution，不在 Chat 组件或 upload client 中手拼 base URL。
- upload client 与 Chat send client 分开；前者负责文件传输和 upload response，后者只消费已确认的服务端 attachment 引用。
- 当前请求使用 `multipart/form-data` 的 `file` 字段；成功 shape 为 `{ url, type, name }`，失败也可能通过 `{ error }` 返回，client 必须验证响应而不能只看 HTTP 成功。
- 文件类型白名单和 20 MB 上限以后端为准；前端校验只用于提前反馈，不能替代服务端校验。
- 本地 object URL 或文件预览不是上传成功的业务事实。只有服务端响应中的 URL 才能进入 send request。
- 上传失败、发送失败和消息持久化失败是三个不同状态，不得合并为一个“已发送”状态。

**AionsHome 权威来源**：`aion-chat/routes/files.py`、`aion-chat/static/chat.html` 及未来 upload contract tests；Penumbra URL 解析事实见 `src/lib/runtime-config.ts`。

## 15. 待确认事项的处理

SSE/WS/HTTP 的三源权威边界、S6D 连接/并发协调与 S6E1 canonical target regenerate 已经实施。stop/cancel、carryover 所有权、production 部署、secret response 和其他未确认项，在后端给出实现或 contract test 前都保持“待确认”。后续任务应记录确认结果及其 AionsHome 来源，不得把临时前端行为升级为默认契约。

## 16. 未决契约状态

| 契约 | 状态 | 说明 |
|---|---|---|
| Send 使用流式 HTTP response body | `Confirmed` | 当前实现已确认。 |
| Streaming Transport / SSE Framing | `Completed (S4D1)` | 共享 request lifecycle、managed byte stream、增量 UTF-8 decode 与 data + optional named-event framing 已实施。 |
| Chat Execution Client / Event Contract | `Completed (S4D2/C2A3.1)` | send/regenerate request mapping、双 media type、duplicate acknowledgement、安全 Chat event/`persisted` receipt projection 与单请求 iterator 已实施。 |
| WebSocket Transport / Event Contract | `Completed (S4E1)` | runtime `/ws` URL、单连接 lifecycle、安全 JSON decode、稳定 ID projection、unknown marker 与 close metadata 已实施；无自动重连或 History mutation。 |
| Realtime Reconciliation Application | `Completed (S4E2)` | event-to-plan、current-conversation latest refresh、ID delete、file/reconnect scratch reload、conversation invalidation、result authority/scope 与 SSE/WS ID correlation 已实施；无 connection、queue、React 或 streaming state。 |
| Settings Safe Basics Integration | `Completed (S5A)` | Session、models 与 bootstrap readiness 已通过 application read model 接入现有 Settings；含安全 error summary、loading、empty、retry、abort 与 stale-request 防护，无旧 `/api/settings` 或写操作。 |
| Chat Workspace Read Model & Controller | `Completed (S6A)` | 一次 bootstrap setup、真实 conversation list、前端 selection 与 initial persisted history 已组合；含 atomic switch、retry、abort 与 stale-request 防护；controller 本身不拥有 UI、Execution、SSE、WebSocket、Reconciliation 或 Settings。 |
| Chat Read-Only UI Integration | `Completed (S6B)` | production Chat 已通过 presentation model 读取真实 Workspace；含 loading/error/empty、atomic switch UI、system/unknown 中性展示、hidden-runtime 过滤与 disabled Sender；无 send、Execution、SSE、WebSocket、Reconciliation、load older 或 capability rendering。 |
| Read-Only Workspace / Readiness Decoupling | `Completed (S6B.1)` | readiness 404/network/timeout/unavailable/DTO error 不再阻止真实 conversation/history；安全降级状态不伪造 ready，Sender 保持 disabled。 |
| Chat Send & Streaming Composition | `Completed (S6C)` | selected-model readiness 门控、稳定 `client_msg_id`、optimistic/streaming overlay、安全 SSE accumulator、provider failure、EOF 后 HTTP ID 对账、uncertain retry 与 conversation switch 隔离已实施。 |
| Chat Realtime Coordination | `Completed (S6D)` | 单 connection lifecycle、Strict Mode generation guard、安全 reconnect、same-execution ID correlation、dirty/deferred refresh、HTTP in-flight 合并、conversation-list coordination 与 reconnect scratch reconciliation 已接入 production Chat；无 unread、push、provider call 或 server cancel。 |
| Canonical Target Regenerate | `Completed (S6E1/C2A3.1)` | latest persisted non-carryover assistant guard、canonical same-ID POST、统一 execution ownership、target replacement overlay、start/receipt ID 验证、receipt+HTTP finalization、conservative missing-receipt retry 与 `msg_updated` dirty coordination 已接入；无 DELETE、legacy regenerate、command parser 或 provider retry。 |
| Memory Read Foundation | `Completed (S7A)` | 真实分页 list、DTO adapter、搜索、时间/重要度筛选、pin-first、loading/empty/error、route/navigation 与连续阅读面板已接入。 |
| Memory Create / Pin | `Integrated (S7B partial)` | 新增 POST、Pin 目标状态 PUT、写入后 GET 同步及只读重试已接入；编辑、删除、原文、手动总结等管理能力与 realtime 尚未接入。Pin 产品语义与重要度区间规则待确认。 |
| Stop / Abort | `Pending (S6E2)` | 未实施；`AbortController` 仍不宣称 server cancel。 |
| Capability Composition | `Pending (S6E3)` | 未实施。 |
| System Message / Instruction Presentation | `Pending (S6F)` | 未实施。 |
| Message update reconciliation | `Backend contract gap` | WS 仅提供 ID 且 HTTP 无单 Message GET；latest refresh 无法保证较早消息已权威更新，结果保持 `latest-window-only`。 |
| SSE/WS/HTTP 权威关系 | `Confirmed and integrated (S6D/C2A3.1)` | HTTP history 是 persisted final truth，SSE 是当前 execution 增量且 regenerate `persisted` 是 commit acknowledgement，WebSocket 是 post-commit notification；receipt+HTTP projection match 才确认 regenerate finalization，same-execution WS event 不创建 Message。 |
| Stop/cancel | `Pending backend confirmation` | 尚无已确认的服务端停止契约。 |
| Carryover 所有权 | `Pending backend confirmation` | 前后端职责与迁移方式待确认。 |
| Production 部署方式 | `Pending backend confirmation` | 同源反代或跨域部署待确认。 |
| Message DTO mapper | `Completed (S4B/S4C)` | HTTP history wire DTO、runtime validation、persistent Message mapper、read client 与 history state/pagination application 已实施；older pagination 尚未接入 Chat controller/UI。 |
| WebSocket event type/payload/timing | `Do not change` | 迁移期间保持现有契约。 |
