# Chat 单条消息删除

2026-11-16 · 前端最小迁移，等待人工验收。基线：Penumbra `c0956e1`、AionHome `7637437`。未修改 Settings、后端、数据库结构、流式输出或默认入口；无 commit、push、deploy。

## 旧端与实际 API

旧端 `static/chat.html` 的 User/Assistant 操作菜单调用 `delMsg(id)`；系统通知（含 MCP 结果）有单独的“删除此通知”按钮。两者均先 `confirm("删除此通知？")`，再调用 `DELETE /api/messages/{id}`。本轮保留先确认再请求，普通消息与系统通知分别使用准确标题。

[后端 delete_message](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1259) 按 `messages.id` 查找记录，没有 user/assistant/system 角色限制；接口沿用登录 session cookie 鉴权。已有消息会在同一 DB 操作中 discard append-reply checkpoint、删除以此消息为 target 的 interaction_events、删除 message_voices、删除 messages 并 commit，然后广播 `msg_deleted {id, conv_id}`，最后 export_conversation。不存在的消息同样返回 `{ok:true}`，可幂等重试。没有新增删除机制、API 或请求字段。

删除的是整条持久化消息。视觉拆分为多个气泡时仍只有一个入口，删除同一消息的全部段落；不会仅删除一段。删除会影响之后读取的聊天历史和 Prompt；已经完成的工具/日程/记忆等副作用不会撤销。接口不删除关联记忆、不删除会话，也不扩大到批量操作。

## 消息 ID、能力卡片与事件 ID

| 结构 | 实际存储 / 身份 | 本轮删除语义 |
| --- | --- | --- |
| User / Assistant | `messages.id` | 删除整条消息，保留其他消息。 |
| 结构化系统通知 | 同行 `messages.public_display` | 删除外层 system 消息；能力 display 没有独立实体删除 API。 |
| 历史系统文字、旧 delayed 通知、MCP 系统结果、触发/空通知 | `messages.content` / `mcp_tool_calls`，统一公开投影 | 保留原展示结构，用同一持久化消息 ID 删除，不按卡片类别筛选。 |
| Assistant 工具结果 | 同行 mcp_tool_calls；前端 `${messageId}:tools` 为展示 key | 随整条 Assistant 删除，不把展示 key 发送给消息接口。 |
| Reaction / WebSearch / URL Read 回执 | 独立事件/反馈记录，由消息 target/source/anchor 关联 | 当前无独立删除路由；本轮不新增事件 CRUD。已有消息删除的 target 事件清理和外键语义沿用后端。 |
| HEART 心语 | `heart_whispers.id`，另有关联 msg_id | **确有** `DELETE /api/heart-whispers/{hw_id}`，旧端入口为心语页。不是 system 消息删除接口；本轮不把单条消息删除扩展为心语管理。删除 Assistant 不承诺清除所有独立心语记录。 |

证据：[公开投影](/Users/remix/Desktop/AionsHome-main/aion-chat/chat_public_display.py)、[表及外键](/Users/remix/Desktop/AionsHome-main/aion-chat/database.py)、[能力 mapper](../src/domain/message/capability-mappers.ts)、[回执 mapper](../src/domain/message/web-receipt-mappers.ts)、[心语 API](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/heart_whispers.py)、[旧心语页](/Users/remix/Desktop/AionsHome-main/aion-chat/static/heart-whispers.html)。因此系统通知可用已有接口真正删除，不需要前端隐藏模拟，也不需要后端改动。

## 前端行为与修改

- [message-delete.ts](../src/domain/message/message-delete.ts) 使用原 DELETE，校验 `{ok:true}` 后 GET `/api/messages/{id}/public`，只有 404 确认不存在。原接口空 ID 同样 ack，因此不把 ack 当唯一证据。HTTP 401/403/503、网络失败、无效 ack、确认时仍能读取消息都作为未确认失败。
- [MessageDeleteDialog](../src/components/chat/MessageDeleteDialog.tsx) 提供确认/取消、请求中禁用重复提交和关闭、原始错误文本的 React 转义展示，以及失败重试。请求前和失败时不做乐观永久移除。如果 DELETE 已提交而响应/核对失败，提示刷新核对；重试仍用原 ID，复用后端幂等语义。
- [ChatView](../src/components/chat/ChatView.tsx) 只从当前 HTTP 历史取持久化消息快照。当前会话发送/生成/finalizing/结果未知、会话切换/导航中禁止删除；其他会话执行按原 scoped 策略独立。编辑与删除共用现有本页 mutation guard，阻止保存期间新 send/regenerate，不改生成状态机。
- [MessageActions](../src/components/chat/MessageActions.tsx) 接普通消息删除；[Bubble](../src/components/chat/Bubble.tsx) 为 system 卡片提供可触达的删除按钮，移动端复用现有操作区尺寸规则。临时 overlay 和只读历史弹窗无删除入口。
- 确认删除后沿既有 `message-deleted` workspace reconciliation 更新当前历史及搜索 revision；不依赖 WS 在线。原 `msg_deleted` 消费继续有效，不新增 tombstone、历史投影或存储状态机。保留当前分页窗口和阅读锚点，不强制回最新、不自动发起生成。

## 本轮验证

| 检查 | 结果 |
| --- | --- |
| 新增 Vitest | 29 项通过：三类角色、消息 ID 编码/原 DELETE 契约、HTTP 错误、无效 ack、删除后仍存在、读回权限失败、响应丢失后的重试、取消/确认/重复提交锁、真实错误展示、隐藏/临时/只读边界、当前/其他会话执行策略。 |
| Penumbra 全量 | 224 文件、3004 项通过。 |
| TypeScript | `npx tsc -b` 与生产构建中的 `tsc -b` 通过。 |
| 生产构建 | `npm run build` 通过；保留现有入口 chunk >500 kB 提示，本轮不做性能优化。 |
| 删除浏览器验收 | 生产构建，Classic / Editorial × 320/390/1280px 共 6 组通过；覆盖 User、Assistant、历史文字、结构化、MCP、触发与空 system 卡片，混排、取消、实际 503 错误、失败保留/重试、假成功检测、待确认期间保留消息、刷新后保持删除、邻居消息与阅读锚点。未增加 send/regenerate 请求。 |
| 默认入口及子路径回归 | 现有 production-subpath-smoke 通过：preview/dev × 390/1440px，导航、两桌面切换、资源/API/WS 根路径均通过，pageErrors=0。气泡 `gap-0.5` 和原角色切换间距保持，原相关测试通过；AionHome/Android 默认路由源码未变。 |
| 两仓 diff 检查 | `git diff --check` 通过；AionHome 工作区仍干净。 |

[浏览器脚本](../tests/browser/chat-single-message-delete-smoke.cjs) 复用现有合成 HTTP/WS fixture，实际载入生产构建的 Classic/Editorial Chat。隔离 Chrome profile，320/390 采用移动与触摸参数，外部网络被阻止，没有访问真实后端、私有消息、模型或服务凭据。可复现：

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 45365 --strictPort
node tests/browser/chat-single-message-delete-smoke.cjs /path/to/playwright /path/to/chrome
```

目视检查 Editorial 320px 阅读区，操作按钮与输入区布局正常。截图为 `/private/tmp/chat-delete-{classic,editorial}-{320,390,1280}.png`。子路径日志 `/private/tmp/penumbra-delete-subpath.log`，删除浏览器日志 `/private/tmp/penumbra-delete-browser.log`。完整单测日志 `/private/tmp/penumbra-final-test.log`，构建日志 `/private/tmp/penumbra-final-build.log`。

## 验收边界

没有修改后端，因此未将后端测试列为本轮必须变更检查，也没有用真实 DB 执行 DELETE。服务端删除语义依据当前源码；刷新持久性以合成后端保存状态和生产前端重载验证。真实 AionHome 联调、跨设备并发及 Android/iOS 真机触控仍待人工验收。服务端没有跨客户端生成删除锁，不能把本页互斥宣称为所有设备的互斥；本轮沿用原 API，不扩大该契约。

并发 WS 可能先于 DELETE 响应将已真实删除的消息移除；这属于既有权威事件处理，不是失败前乐观隐藏。后端 commit 后广播/导出异常、响应丢失或 HTTP 核对失败可能出现“服务端已删、界面未确认”，提示刷新/重试用于此边界。删除不会撤销工具执行、清除独立诊断日志或恢复历史副作用。
