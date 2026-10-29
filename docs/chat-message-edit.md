# Chat 消息编辑最小迁移

2026-10-28。PR7-A 后续的小范围前端接入；未修改 AionHome，未 commit、push 或 deploy。

## 核对与接入

- 旧版入口：`AionsHome-main/aion-chat/static/chat.html::editMsg/saveEdit`（约 4368/4398 行），整条消息进入气泡内 textarea，再调用 `PUT /api/messages/{id}`。旧实现会 trim，且依赖 WS 刷新；本轮不复用这些会丢原文或失败草稿的交互细节。
- 复用接口：`routes/chat.py::MsgUpdate/update_message`（627/1287 行），请求只有 `{content: string}`，SQL 只更新 `messages.content`。不更新 ID、角色、conv_id、Thinking、DRIFT、附件、工具数据、HEART 独立数据。已有副作用为删除该消息的 `message_voices` 语音缓存、广播 `msg_updated`、导出会话。
- 权限：沿用 `main.py::auth_middleware` 的登录 session cookie；该 PUT 不在匿名/推送 token 放行范围，没有独立的按角色或消息 owner 授权。Penumbra 只为当前会话 HTTP 历史中存在的 User/Assistant 接线，系统、工具、未知角色和临时 overlay 不开放编辑。前端限制不替代服务端鉴权。
- 历史和单条公开读取都保留 User/Assistant 的完整 `content`，消息 mapper 不 trim。编辑直接使用持久化 Message 快照，不使用 Markdown DOM 或视觉气泡拼接。
- 新增共享 Dialog + Textarea，保持打开时的正文快照；只提供保存、取消，无发送快捷键或隐式表单提交。使用既有 Dialog 的视觉视口变量适配键盘缩小后的空间，正文可滚动，页脚保留保存按钮。
- PUT 即使未找到消息也返回 `{ok: true}`。适配器因此先 GET `/api/messages/{id}/public` 核对正文和身份，再 PUT，最后 GET 确认正文、ID、角色及会话。确认后走现有 `message-updated` HTTP 历史失效流程，保留分页窗口并更新搜索 revision；不依赖 WS 必须在线。真实 `msg_updated` 继续沿用相同的历史机制。
- 网络、权限、契约、读回不一致和历史刷新失败均保留编辑文本，不显示保存成功。若之前请求已落盘但响应丢失，重试会先读到目标正文，避免重复 PUT 及重复语音缓存失效。

## 执行边界

当前会话处于发送、生成、finalizing、结果未知时禁用编辑；另一个会话独立执行不阻塞本会话编辑。打开和保存都检查当前执行与会话归属，保存过程中阻止本页新的 send/regenerate。尚未确认持久化的 overlay 不提供编辑。

完成 receipt/HTTP 对账后即可编辑刚发送的 User 消息。编辑保存不发送、不生成、不撤回旧回复；原来的 Regenerate 仍按原 ID、最新目标规则执行。没有修改发送 payload、client_msg_id、receipt、去重或生成状态机。

Assistant 的独立 Thinking、DRIFT、HEART 和附件保持原样。**旧消息若把控制内容内嵌在 `content` 中，当前整字段 PUT 无法安全地只替换普通正文。** 当现有 presenter 过滤后正文与原 content 不一致时，编辑按钮禁用并说明原因；不静默丢弃这些内容，也不新增重建或版本系统。

## 修改文件

- `src/domain/message/message-edit.ts`：正文 mutation、身份与读回验证。
- `src/components/chat-workspace/chat-message-edit-policy.ts`：持久化角色、执行状态、旧内嵌控制内容限制。
- `src/components/chat/MessageEditDialog.tsx`：完整原文编辑、保存/取消、失败保留、视口适配。
- `src/components/chat/{ChatView,BubbleList,Bubble,MessageActions}.tsx`：真实持久化 ID 接线、状态检查、编辑入口与历史更新。
- 对应新增 `message-edit.test.ts`、`chat-message-edit-policy.test.ts`、`MessageEditDialog.test.tsx` 和 `tests/browser/chat-message-edit-smoke.cjs`。

## 验证

- `npm test`：183 文件、2491 项通过；之后新增的编辑 Dialog/临时身份组件测试 10 项单独通过，合计执行 2501 项。
- `npx tsc -b` 通过；`npm run build` 通过，保留原有大 chunk 提示。
- 新增浏览器验收：320/390/1280px 通过。覆盖 User/Assistant 保存、取消、失败保留与重试、读回不一致、响应丢失、原文首尾空白与多气泡、Markdown、独立字段、刷新、A/B 归属、WS 更新不覆盖编辑草稿、检测过期正文、Enter/Shift+Enter/IME 事件、340px 短视口可见保存按钮、原 ID Regenerate。
- 同一浏览器验收覆盖：optimistic 无编辑入口、生成时保存消息不可编辑、A 生成时 B 可独立编辑、receipt/HTTP 后单 User ID 与去重、刚发送即编辑且不修改已生成旧回复、不增加 send/regenerate 次数。
- 既有 `chat-pr7-interaction-smoke.cjs`：390/1280px 通过，含跨会话执行、重挂载、失败 Regenerate、499 receipt 恢复。
- 既有 `chat-thinking-smoke.cjs`：320/390/1280px 通过。
- 浏览器使用隔离 Chrome profile 和合成 HTTP/SSE/WS。短视口截图位于 `/private/tmp/penumbra-chat-message-edit/editor-short-{width}.png`，已目视检查 320px 布局。未读取真实消息、连接模型或写入真实后端。

## 未覆盖与既有接口限制

- 未做真实 AionHome/多 worker/多设备写入联调；iOS/Android 真机输入法、系统键盘、浏览器返回手势仍需人工验收。合成 Chromium IME 和短视口不等同真机。
- 既有 PUT 无原子条件更新/版本号。预读能发现编辑期间已发生的外部改动，但不能消除预读与 PUT 之间的跨客户端竞争；本轮没有为此增加版本系统。其他设备发起的生成也没有可供前端统一查询的编辑锁。
- 保存失败可能意味着 PUT 未执行，也可能已落盘但确认/刷新失败；UI 保留草稿并提示未确认。重试或刷新可核对。
- 语音缓存失效为原 API 行为；独立附件不替换、不删除。
