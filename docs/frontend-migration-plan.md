# Penumbra 前端迁移路线图

> 最后更新：2026-07-31

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
- PR8B Penumbra architecture / migration / contracts docs：已完成

Chat
- Chat domain client、DTO、mapper：待实施
- Conversation/message 只读状态：待实施
- WebSocket 基础同步：待实施
- Message view model：待实施
- Text chat core loop：待实施
- Regenerate：延后
- Upload：延后
- Stop/cancel：等待后端契约确认
```

当前 Penumbra 已有 Chat、Calendar、Todo 和 Settings 的部分 UI 外壳，但 Chat/Conversation 仍由 mock 驱动，Calendar/Todo 尚未接入后端业务状态，Settings 只接入后端连通性检查。UI 存在不代表领域已完成迁移。

## 3. 推荐迁移顺序

1. 文档和基础设施收口。
2. Chat domain client、DTO、mapper。
3. Conversation/message 只读状态。
4. WebSocket conversation/message 同步。
5. Chat 展示模型。
6. 文本聊天闭环。
7. Regenerate 与 upload。
8. Schedule/Todo。
9. Settings。
10. Memory。
11. Activity。
12. Location/POI。
13. 其他复杂领域。

此顺序可根据真实依赖、后端契约成熟度和风险调整，但不得把所有领域塞进一个 PR。

## 4. 领域迁移矩阵

迁移方式使用以下分类：**直接复用现有 Penumbra UI**、**domain client 重写**、**adapter/mapper 转换**、**UI 重做**、**合并入口**、**延后**、**待后端确认**。

“旧前端来源”中的路径均相对于 AionsHome 仓库根目录。

| 领域 | 旧前端来源 | Penumbra 当前状态 | 迁移方式 | 优先级 |
|---|---|---|---|---|
| Chat | `aion-chat/static/chat.html`、`aion-chat/routes/chat.py` | UI 原型存在，发送与流式回复仍为 mock | 直接复用现有 Penumbra UI；domain client 重写；adapter/mapper 转换 | P0 |
| Conversation | `aion-chat/static/chat.html`、conversation API | 列表、新建、重命名、删除均为本地 mock | domain client 重写；adapter/mapper 转换 | P0 |
| Message | `aion-chat/static/chat.html`、message API/DTO contract | 气泡 UI 可复用；类型过窄且数据为 mock | 直接复用现有 Penumbra UI；adapter/mapper 转换 | P0 |
| WebSocket | `aion-chat/static/common.js`、`aion-chat/static/chat.html`、`aion-chat/ws.py` | 已有 URL resolution，尚无领域 event consumer | 共享 transport 负责连接、重连和分发；领域 adapter/mapper 转换业务事件；不复制领域底层 transport | P0 |
| Upload | `aion-chat/static/chat.html`、`aion-chat/routes/files.py` | 有附件按钮和 upload URL resolution，未上传 | domain client 重写；adapter/mapper 转换；延后 | P1 |
| Settings/provider config | `aion-chat/static/settings.html`、`aion-chat/routes/settings.py` | 有本地外观设置和后端状态检查，无 provider 配置 | 直接复用现有 Penumbra UI；adapter/mapper 转换；合并入口 | P1 |
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
