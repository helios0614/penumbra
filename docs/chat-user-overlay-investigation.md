# 返回首页重进后 User 重复投影：根因、版本对照与修复

2026-10-27。本轮只修 Main 消息投影及必要的执行身份读取；不修改生成请求、冻结语义、数据库或 PR7-B 系统日志，不自动重发，不限制导航。

## 版本对照结论

对照对象为超时修复前 `e7729590eaa58ddb41b9cf475e54bf740ce5aba4`，以及仅包含超时修复的 `80df71f3c50e2fdd7a50abadbdd421eeac6d5517`。该次业务代码 diff 只有 Main send/regenerate 的两个 `timeoutMs: 0` 默认项及注释，消息合成、controller、Session 和 ChatView 均未变化。

先保存旧、新 opener 源码快照以及当时尚未修复的 controller/composer，再以相同的合成 HTTP/SSE、同一条持久化 User 和未完成 Assistant 执行对照。两版 opener SHA-256 分别为 `1369873c…71522b` 和 `584703bf…38fdcf`，与上述两个 Git commit 的文件完全一致。之后又以真实 ChatView + React.StrictMode 分别执行发送、User 入库、返回首页、重进。

| 重进时机/传输状态 | 超时修复前 | 仅修超时后 | 本轮投影修复后 |
| --- | --- | --- | --- |
| 20 秒，尚无响应头 | 2 条 User，sending-user | 2 条 User，sending-user | 1 条权威 User，Assistant 等待继续 |
| 35 秒，尚无响应头 | 1 条 User；请求已超时，进入结果未知并重读历史 | 2 条 User；请求仍活跃 | 1 条权威 User；请求仍活跃 |
| 响应头已到，Assistant 未完成，35 秒 | 2 条 User，streaming | 2 条 User，streaming | 1 条权威 User，streaming |

表中每个单次发送场景，合成持久层和 HTTP 历史均只有一条 User，POST 只有一次。时间为可控 API 逻辑时间，未用真实模型性能解释差异。

**对照证明：取消 30 秒 deadline 延长了活跃执行状态，使重复投影更容易持续出现。** 旧版在“尚无响应头且超过 30 秒”的分支会被迫进入未知结果恢复；该分支的历史权威投影隐藏了临时 User，因此掩盖了缺失的 User 身份收敛。旧版 20 秒内及已收到响应头后的相同场景也能复现重复。这个结论来自前后实测，不以“旧版本来如此”为前提；也不否定此前真实使用未观察到重复的事实。

## 根因与执行时序

1. send 创建 `optimisticUser`，身份为 `clientMessageId` 和本地 overlay ID。
2. 后端提交真实 User，并以 `(conversationId, client_msg_id)` 保存可靠 receipt。普通 SSE start 只提供 assistant ID；HTTP Message DTO 本身没有 client_msg_id。
3. `chat-execution-sessions` 正确保留 A 的活跃 controller；返回首页不会清空它。
4. 重进的 Workspace 通过 HTTP window 读到了真实 User。`useChatSend` 同时投影 A 原有的 optimisticUser。
5. 原 `composeVisibleChatMessages` 在 sending/streaming/finalizing 状态无条件追加 optimistic User，无法把两条不同 ID 的展示关联起来。
6. 原 controller 主要到 finalization、缺少 assistant start 时才读取 receipt，且只消费其中的 assistant ID；没有保存 userMessageId 供生成期间去重。Assistant 完成或未知结果恢复成功重读历史后，整体 overlay 才被替换，重复随之消失。

所以，这是同一执行的历史 User 与 optimistic User 同时显示，不能凭两个气泡推断两次写库。WS/HTTP/回执到达顺序会改变暴露时间，但不提供可以按正文、时间或“最后一个 User”合并的依据。

## 修复

- `OptimisticUserMessage.persistedMessageId` 保存经过验证的真实 User 身份，属于前端执行状态，不进入生成 POST body。
- `reconcileUserPersistence()` 可以在发送或生成过程中独立读取既有 send-result GET。验证 conversation、client ID、非空 user ID，并校验已知 duplicate ACK / 已绑定 user ID 的一致性。
- 每个执行合并并发 receipt 请求。导航/卸载后的读取仍属于原 Session；执行被替换或显式解除后，其迟到结果会被丢弃。A/B 各自保留身份，不能相互覆盖。
- `useChatSend` 在选中会话、执行 ID 或 HTTP history snapshot 改变时触发 User 身份读取；收到 SSE 响应后和既有 pending reconciliation 入口也可读取。绑定成功后不再重复读取 User 身份，没有定时轮询。history effect 不调用 Assistant finalization，避免“history refresh → finalization → history refresh”循环。
- composer 只有在 **同会话 + User 角色 + 精确 persistedMessageId** 出现在当前 HTTP history 时，才省略 optimistic User。服务器正文、附件和时间均保留为权威展示；同文但不同身份的合法 User 完整保留。
- User 已确认、响应头尚未到达时，保留同执行 ID 的 Assistant 等待行，避免去掉“正在发送”User 后连生成状态也消失。
- 此次读取不会设置 confirmedSend、结束 Assistant、清除错误或解除 unknown 锁。Assistant 仍沿原 SSE/HTTP finalization 收敛；异常和结果未知仍按原身份对账。

收到可信 receipt 前无法安全判定两条 User 是否同一提交；缺失/失败/错 owner/错 client 的回执不能触发猜测性合并。只在身份已确认且对应权威 User 已加载后隐藏重复展示；不会通过隐藏气泡假装生成成功。

## 回归证据

自动化：`npm test` **167 文件、2192 项通过**；`npm run build`（含 TypeScript）通过；`git diff --check` 通过。本轮新增/扩展 17 项回归，覆盖：

- headers 前确认 User、生成期间确认 User、Assistant 完成后的真实收敛；生成未结束时仍禁止同会话重复提交。
- history 先到 / receipt 先到；已确认 receipt 但当前窗口没有该 User 时继续保留单条临时展示。
- 同文不同 ID 的合法重复；错 owner、错 client、空 ID、错误角色均不合并。
- 并发读取合并、User receipt 不冒充 Assistant 完成；结果未知、网络错误和后续精确 assistant 恢复。
- A/B 回执隔离，以及旧执行在显式核对解除后迟到时不能污染下一次执行。
- 真实 ChatWorkspaceView 的 sending/streaming/finalizing 展示：一条服务器 User、无多余“正在发送”User、Assistant 生成状态继续。

真实浏览器使用 `tests/browser/chat-user-overlay.html` 和 `chat-user-overlay-server.mjs`：

- 历史两个版本以 Git source transform 加载，真实 ChatView/StrictMode、Workspace、Session、fetch/SSE reader 和消息合成运行；业务 HTTP/WS 全部合成。
- 旧版 20 秒重进：历史一条、页面两条、POST 一次、无 receipt GET。
- 旧版 35 秒无响应头：send signal 已 abort、进入结果未知、页面一条；仅超时修复版在相同逻辑时间保持活跃但显示两条。
- 本轮修复版 20/35 秒重进、Assistant 未完成时：一条服务器 User、生成指示仍活跃、send signal 未 abort、POST 一次；完成后指示和临时 Assistant 正常清除。
- B 的 HTTP 历史先于延迟 receipt：receipt 到达后只显示 B 一条 User，不误判完成。
- A 历史窗口挂起期间切回 B，再释放旧 A HTTP、发送重复/乱序 WS：B 仍只有自己的 User；A 的迟到结果不覆盖 B。
- A 插入另一条同文不同 ID 的真实 User：显示两条真实 User，无 optimistic 第三条。
- A 在 B 选中时后台完成，B 继续独立生成；两者完成后正确收敛，总 POST 数仍为两个显式提交。

浏览器原始断言保存在 `/private/tmp/penumbra-user-overlay-browser-results.json`。前后截图：`/private/tmp/penumbra-user-overlay-before.jpg`、`/private/tmp/penumbra-user-overlay-fixed.jpg`。源码快照、精确 diff、8 组自动化历史对照及可重放材料保存在 `/private/tmp/penumbra-user-overlay-baseline/`。全量日志为 `/private/tmp/penumbra-user-overlay-tests.log` 和 `penumbra-user-overlay-build.log`。证据只含合成消息和执行身份。

复跑浏览器：在仓库分别执行 `node tests/browser/chat-user-overlay-server.mjs before`、`after-timeout`、`fixed`，打开输出的 45417/45418/45419 端口页面。选择等待/立即响应头，发送 `synthetic`，点 `持久化 User A`、前进 20/35 秒、返回桌面、重新进入 Chat、检查断言；再完成 Assistant。额外按钮控制延迟 receipt、延迟 A history 和重复乱序 WS。仅 API deadline 使用可控逻辑时间，其余 React/布局/WS 调度使用真实浏览器。

## 数据库与范围

没有读取真实私人数据库，也不对原现场数据库条数作无证据断言。前端以一条 HTTP User、一次 POST 稳定复现两条气泡，足以定位投影错误；生成完成不需要第二次 POST。后端现有 `_persist_send_messages` 在事务中按 `(conv_id, client_msg_id)` 查询 receipt 并去重，本轮不修改它。

另在既有隔离后端副本、临时 SQLite、假 Provider 上运行 send-receipt 的断流/持久化/幂等契约测试，检查数据库单条 User 与主 Assistant 身份。该结果仅证明隔离契约，不能代替真实现场 SQL 证据。

未恢复 30 秒超时，未限制返回首页或切会话，未修改 frozen binding、生成参数和 Provider；没有自动重发，也未改 PR7-B 文档/系统日志。未 commit、push 或部署。
