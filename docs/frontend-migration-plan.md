# Penumbra 前端迁移路线图

> 最后更新：2026-08-10

导航：[架构原则](./penumbra-architecture.md) · [迁移路线图](./frontend-migration-plan.md) · [前端契约](./frontend-contracts.md)

本文记录持续更新的迁移决策、阶段状态和领域顺序。它不替代详细审计，也不保存容易过期的代码行号。

## 1. 迁移原则

- 先基础设施，再领域 client，再状态，再展示，最后接写操作。
- 先完成 Chat 核心闭环，再迁移其他复杂领域。
- 不直接复制旧 HTML 页面和全局变量结构。
- 旧前端仅作为真实能力、交互语义和契约参考。
- “当前 Web 无调用方”不等于后端接口可以删除；还需考虑后台任务、Android、PWA/WebView 和外部调用方。
- 后端兼容字段只能由后端确认退出条件，前端不得因暂时未使用而擅自移除。
- 每次只迁移一个可验证边界，不把抽象、行为变化和多个领域 UI 替换混在一起。

## 2. 当前阶段

```text
Foundation
- PR8A Runtime config + HTTP transport：已完成
- PR8B Architecture / migration / contracts docs：已完成
- Local–Remote Backend Dev Bridge：已完成

Settings
- Settings Domain Audit：已完成
- Safe Settings Read Contract：已完成（AionHome）
- Penumbra Settings/Runtime Read Layer：已完成
- Settings Safe Basics Integration：已完成
- Configuration Ownership & Flow Audit：已完成
- C2A Model & Generation Contract：已完成（AionHome C2A1 + C2A2）
- C2B Conversation Config：待实施（不阻塞当前最小 send envelope）
- C2C Provider Admin Safe DTO：延后
- C2D MCP Configuration Domain：延后
- C2E Other Capabilities：延后
- C2F Legacy Settings Retirement：最后实施
- Settings UI Refinement：普通 backlog（不阻塞 Chat）
- Provider Administration：延后

Chat
- Runtime Read Layer：已完成
- Conversation Domain Foundation：已完成（真实后端没有单条详情 endpoint；已实现 list/create/update/delete）
- Conversation CRUD contract hardening：已完成
- Chat Setup Application Layer：已完成
- Message Domain Foundation：已完成
- Message History Application：已完成
- Streaming Transport / SSE Framing：已完成
- Chat Execution Client / Event Contract：已完成
- WebSocket Transport / Event Contract：已完成
- Realtime Reconciliation Application：已完成
- Settings Safe Basics Integration：已完成
- Chat Workspace Read Model & Controller：已完成
- Chat Read-Only UI Integration：已完成
- Read-Only Workspace / Readiness Decoupling：已完成（S6B.1）
- Deployed Chat Readiness Contract：已由 C2A readiness contract 覆盖
- Chat Send & Streaming Composition：已完成（S6C）
- Chat Realtime Coordination：已完成（S6D）
- Chat Canonical Target Regenerate：已完成（S6E1）
- Chat Stop / Abort：待实施（S6E2）
- Chat Capability Composition：待实施（S6E3）
- System Message / Instruction Presentation：待实施（S6F）
- Legacy Chat mocks cleanup：后续 cleanup
- 模型变更 command：待后续 Chat Setup UI
- Legacy Regenerate / DELETE 编排：禁止接入 Penumbra
- Upload：延后
- Stop/cancel：等待后端契约确认
```

当前增量里程碑：

```text
Local–Remote Backend Dev Bridge：已完成
Chat Workspace Read Model & Controller：已完成
Chat Read-Only UI Integration：已完成
Read-Only Workspace / Readiness Decoupling：已完成
Configuration Ownership & Flow Audit：已完成
Chat Send & Streaming Composition：已完成
Chat Realtime Coordination：已完成
S6E1 Regenerate：完成
S6E2 Stop / Abort：待实施
S6E3 Capability Composition：待实施
S6F System Message / Instruction Presentation：待实施
```

当前 Penumbra 已有 Chat、Calendar、Todo 和 Settings 的部分 UI 外壳；Chat 页面已接入真实 Workspace、selected-model readiness、conversation selection、persistent history、S6C send/SSE/HTTP finalization、S6D WebSocket notification coordination，以及 S6E1 canonical target regenerate。optimistic user、streaming assistant 与 regenerate replacement 只存在于 execution overlay；send/regenerate 共用单一 execution ownership，WS 不生成 bubble，外部变化、`msg_updated(target)` 与 reconnect 最终通过 HTTP 收敛。Calendar/Todo 尚未接入后端业务状态。Settings 已接入安全只读的 Session、models 与 Chat readiness，Provider/TTS/Memory 等完整设置仍未迁移。UI 存在不代表领域已完成迁移。

> Runtime read client、Conversation/Message Domain Foundation、Message History、SSE/Chat Execution、Workspace read UI、readiness degradation、S6C send/streaming composition、S6D realtime coordination 与 S6E1 canonical target regenerate 已完成。SSE 保持当前 execution ownership；WebSocket 只触发 correlation/dirty/reconciliation，HTTP history 保持最终持久化事实。Stop/Abort、完整 Capability 管理、upload 与 server cancel 仍延后。

Readiness policy：Workspace 对 initial selection 和 conversation switch 都使用 `Conversation.model` 查询 readiness，并与目标 history 原子组合。只有 available + `ready=true` 且 readiness model 与 selected conversation 完全一致时 Sender 才启用；404/network/timeout/contract degradation、unknown model、provider not configured、generation unsupported 和 configuration invalid 都保持只读。

Backend blocker：**Message update reconciliation**。当前 WS 只提供 message/conversation ID，HTTP 没有单 Message GET；较早消息更新无法由有限 latest window 保证完整对账。S4E2 将该结果保持为 `latest-window-only`，不以 WS payload、伪造单条 fetch 或自动分页全部历史规避此契约缺口。

S6D 稳定决策：浏览器/WebView 活跃进程内最多一条 `/ws` connection；SSE 只拥有当前 execution overlay，WebSocket 只通知变化，HTTP history 是 persisted final truth。same assistant/user ID 的 creation notification 不生成第二条消息；active execution 的 unrelated change 与 reconnect 只合并 dirty，idle 后 scratch reload。后端无 event replay/sequence，因此每次 reconnect 都必须 HTTP 收敛。WS 降级不阻断 HTTP read 或 S6C send。Android true-background、FCM、通知栏 push、foreground service、后台唤醒、unread/badge 均留待后续独立能力。

S6E1 稳定决策：Regenerate 只调用 `POST /api/conversations/{conversationId}/messages/{messageId}/regenerate`，target 仅为 current selected conversation 中 latest persisted non-carryover tail assistant。Penumbra 不调用 legacy conversation-scoped regenerate，不 DELETE target。persistent target + same-ID temporary replacement overlay 构成可见回复；SSE `start.id` 必须等于 target ID，EOF 后必须 HTTP reload，`msg_updated(target)` 只置 dirty。same ID 在执行前已经存在，不能单独确认 UPDATE；前端以 HTTP 与 flushed accumulator 的 normalized `{id, content, thinking, simpleThink}` 投影相等且不同于 pre-state 作为当前最强确认。target/match/reload failure 进入 finalization uncertain；因后端没有 terminal receipt/version，identical output 同样保守 uncertain，retry 只重新加载历史。

## Settings Domain Audit

状态：**已完成**

详细审计见：[Settings Domain Audit — 2026-07-31](./audits/settings-domain-audit-2026-07-31.md)。

稳定决策：

- 旧 Settings 是跨领域配置管理页，不是单一领域，不整体迁移。
- Penumbra 不建立覆盖旧 `/api/settings` 所有字段的巨型 `Settings` DTO。
- Settings 能力拆分为：

  - device-local appearance；
  - backend/session status；
  - Chat setup/readiness；
  - provider administration；
  - Chat runtime advanced；
  - Persona/Identity；
  - 独立 integration 设置入口。

- 全局 active API config 不等于 conversation model。
- Chat 的模型事实来源是 conversation 的 `model`。
- Provider routing 和 fallback 继续由后端负责，Penumbra 不复制这些规则。
- Chat 首批只依赖：

  - session/authentication state；
  - backend reachability；
  - available models；
  - conversation model；
  - provider readiness；
  - setup-required state。

- C2A2 已固定 temperature/thinking 等 generation 字段的请求语义与后端 canonical defaults；当前没有真实管理 UI 的字段由 S6C 省略。cache 管理、TTS、ASR、Memory、Location 等可后置。
- 当前多个 Settings endpoint 会向浏览器返回完整 secret，不能直接成为 Penumbra 的安全读取契约。
- 前端 mapper 丢弃 secret 不能解决数据已经进入浏览器的问题。
- 当前没有旧配置具备直接删除条件。
- Legacy `custom_*`、Gemini fallback 等只能隐藏或延后，退出条件由后端确认。
- C1 的逐字段审计见：[Configuration Ownership & Flow Audit](./configuration-ownership-audit.md)。
- C2A2 后 generation request 只接受 canonical allowlist，send/regenerate 的显式值由当前 execution 使用，缺失值由后端 defaults 决定；Penumbra 不从旧 Settings 或 localStorage 补齐请求。
- Conversation 只持久化 title/model，没有 generation config；不得把旧 UI localStorage 或 Settings mock 当成会话默认值。
- MCP server definition、secret、enablement、runtime status 和 tool cache 必须拆域后再接入 Penumbra 管理 UI。
- Settings 页面只组合各领域安全 DTO，不成为配置事实来源。

### 路线调整

1. 已完成安全的 session/models/readiness read contract、Penumbra read layer 与 C1 所有权审计。
2. C2A 已用 contract tests 固定 model registry、unknown model、send allowlist 与 generation 参数语义。
3. C2B 保持 conversation model 为发送模型事实来源，并决定 conversation-scoped generation config 是明确存在还是明确不存在。
4. S6C 已只组合 C2A2 允许的最小发送字段；没有明确 UI state 的高级字段保持省略。
5. C2C Provider Admin、C2D MCP、C2E 其他 capabilities 分别使用 secret-safe DTO 小步迁移。
6. C2F 在所有调用方有替代后逐字段退役 legacy Settings，不一次性删除。

> 完整 Settings 页面不是 Chat 的前置条件。Chat 可以在安全 read layer 和最小 setup 能力完成后继续实施。

### 明确不做

- 不复制旧 Settings 长表单。
- 不让普通 UI 获取完整 provider secret。
- 不在前端复制 provider routing 或 fallback。
- 不合并 conversation model、active API config 和 provider readiness。
- 不在首个 Chat 阶段迁移全部高级配置和 integrations。

## 3. 推荐迁移顺序

1. 文档和基础设施收口。
2. Safe Settings Read Contract。
3. Penumbra Settings/Runtime Read Layer。
4. Chat setup。
5. Message History Application。
6. Conversation/message 只读状态与分页组合。
7. WebSocket conversation/message 同步。
8. Chat 展示模型。
9. C1 Configuration Ownership & Flow Audit。
10. C2A Model & Generation Contract。
11. C2B Conversation Config。
12. S6C 文本聊天闭环。
13. S6E1 Canonical Target Regenerate（已完成）。
14. S6E2 Stop / Abort 与 S6E3 Capability Composition。
15. Upload。
16. Schedule/Todo。
17. C2C Provider Admin Safe DTO。
18. C2D MCP Configuration Domain。
19. C2E Memory、Activity、Location/POI 与其他 capabilities。
20. C2F Legacy Settings Retirement。

此顺序可根据真实依赖、后端契约成熟度和风险调整，但不得把所有领域塞进一个 PR。

## 4. 领域迁移矩阵

迁移方式使用以下分类：**直接复用现有 Penumbra UI**、**domain client 重写**、**adapter/mapper 转换**、**UI 重做**、**合并入口**、**延后**、**待后端确认**。

“旧前端来源”中的路径均相对于 AionsHome 仓库根目录。

| 领域 | 旧前端来源 | Penumbra 当前状态 | 迁移方式 | 优先级 |
|---|---|---|---|---|
| Chat | `aion-chat/static/chat.html`、`aion-chat/routes/chat.py` | 真实 Workspace、selected-model readiness、send execution、SSE overlay、HTTP final reconciliation、WebSocket coordination 与 S6E1 canonical target regenerate 已接入；stop/capability 待实施 | 直接复用现有 Penumbra UI；domain client 重写；adapter/mapper 转换 | P0 |
| Conversation | `aion-chat/static/chat.html`、conversation API | 真实 list 与 atomic selection 已进入 production Chat；create/rename/delete 未在本阶段接入 | domain client 重写；adapter/mapper 转换 | P0 |
| Message | `aion-chat/static/chat.html`、message API/DTO contract | Message Domain、initial History、presentation mapping 与只读 BubbleList 接入已完成；load older 与 capability rendering 延后 | 直接复用现有 Penumbra UI；adapter/mapper 转换 | P0 |
| WebSocket | `aion-chat/static/common.js`、`aion-chat/static/chat.html`、`aion-chat/ws.py` | S4E1 transport/event projection、S4E2 Realtime Reconciliation 与 S6D Chat coordinator 已完成 | transport 负责单次连接和分发；reconciliation application 负责 HTTP authority；coordinator 负责 lifecycle、SSE correlation、dirty 合并与 reconnect | P0 |
| Upload | `aion-chat/static/chat.html`、`aion-chat/routes/files.py` | 有附件按钮和 upload URL resolution，未上传 | domain client 重写；adapter/mapper 转换；延后 | P1 |
| Settings/provider config | `aion-chat/static/settings.html`、`aion-chat/routes/settings.py` | 本地外观与 Session/models/readiness 安全概览已接入；C2A 已完成，C2B 与 provider 管理待后续 | Settings 只组合各领域安全 DTO；S6C 不读取旧 generation Settings；C2C+ 高级管理延后 | P1 |
| Schedule/Todo | `aion-chat/static/schedule.html`、schedule routes/runtime | Calendar UI 可复用；Todo 为静态数据，均未接后端 | 直接复用现有 Penumbra UI；domain client 重写；adapter/mapper 转换 | P1 |
| Memory | `aion-chat/static/memory.html`、memory routes/runtime | 未接真实数据 | domain client 重写；adapter/mapper 转换；UI 重做 | P2 |
| Activity | `aion-chat/static/activity-logs.html`、activity routes/runtime | 未接入 | domain client 重写；adapter/mapper 转换；UI 重做 | P2 |
| Location/POI | `aion-chat/static/location.html`、location runtime | 未接入 | domain client 重写；adapter/mapper 转换；UI 重做 | P2 |
| Heart | `aion-chat/static/heart-whispers.html`、Chat event | Chat 原型只有 mock 关联提示 | adapter/mapper 转换；合并入口 | P2 |
| MCP | `aion-chat/static/mcp.html`、Chat MCP events | Chat 原型有结果卡片，管理能力未接入 | adapter/mapper 转换；UI 重做；延后 | P3 |
| Theater | `aion-chat/static/theater.html`、theater routes/events | 未接入 | domain client 重写；adapter/mapper 转换；UI 重做；延后 | P3 |
| Diary | `aion-chat/static/diary.html`、diary routes/events | 未接入 | domain client 重写；adapter/mapper 转换；UI 重做；延后 | P3 |
| Reading | `aion-chat/static/reading.html`、book routes/stream | 未接入 | domain client 重写；adapter/mapper 转换；UI 重做；延后 | P3 |
| Camera | `aion-chat/static/camera.html`、camera routes/runtime | 未接入 | domain client 重写；UI 重做；延后；待后端确认 | P3 |
| Voice/TTS | `aion-chat/static/chat.html`、voice/TTS routes/events | 未接入真实语音链路 | domain client 重写；adapter/mapper 转换；UI 重做；延后 | P3 |
| Quick Notes | `aion-chat/static/quick-notes.html`、quick-notes routes/runtime | Notes 小组件不是后端 Quick Notes | domain client 重写；adapter/mapper 转换；UI 重做；延后 | P3 |
| Cache Monitor | `aion-chat/public/cache-monitor.html`、cache runtime | 未接入 | domain client 重写；UI 重做；延后 | P3 |

优先级只表示当前迁移顺序，不表示低优先级后端能力可以删除。

## 5. 暂不迁移

以下领域当前不进入 Chat 核心阶段：

- Theater。
- Diary。
- Reading。
- Camera 控制。
- Voice/TTS。
- Bluetooth toy。
- MCP 管理后台。
- Quick Notes 复杂生成流程。
- Cache Monitor。

这些能力继续以后端和旧前端为准；Chat 核心阶段只保留必要的契约兼容点，不复制其业务状态机。

## 6. 完成定义

一个领域只有同时满足以下条件，才算完成迁移：

- 使用真实后端。
- 不再依赖 mock 作为事实来源。
- DTO 差异由 mapper 处理。
- 页面不直接访问 transport。
- 刷新后状态与后端一致。
- 错误、空状态和加载状态完整。
- 单元测试或契约测试覆盖关键转换。
- 不改变后端既有契约。
