# Chat PR6-A — 历史搜索、消息定位与分页游标审计

日期：2026-10-25（Asia/Shanghai）。状态：**PR6-A 只读审计完成；后续 PR6-B 已按授权实施，见 [实施与验证记录](./chat-pr6-search-implementation.md)，等待人工验收。** 下文保留当时基线、发现及只读操作记录。

本轮只新增本文。未修改业务代码、数据库或配置，未 commit、push、部署、启动应用或调用业务 HTTP/WS。未读取真实聊天数据库、上传文件、运行日志、`.env`、认证文件或生产凭据。源码检查以外，只用 Node 内置 SQLite 在 `:memory:` 中运行合成 SQL，验证分页边界；这不是线上数据核验、业务测试或 PC/手机验收。

## 0. 基线、约束与结论

| 项目 | 源码根目录 | HEAD / 开始状态 |
| --- | --- | --- |
| Penumbra（下文 P） | `D:/Desktop/zhi/penumbra` | `c00efaa24531cf907660424e5088e86b779637d2`，`fix(chat): preserve next drafts during message submission`；工作树、暂存区干净 |
| AionHome（下文 A） | `D:/Desktop/zhi/AionHome` | `e48d74c6c65d49064a9d293570777a8f05d5ba84`，`fix(media): harden uploads and support ranged audio streaming`；工作树、暂存区干净 |

下文 `P:src/...:行号`、`A:aion-chat/...:行号` 均指上述真实根目录；行号对应本次基线。Git 使用单次 `safe.directory` 参数；AionHome 的 Git 基线检查通过获准的只读命令完成，未修改全局 Git 配置。

已阅读用户提供的 Requirement Review 指令、AionHome `AGENTS.md`、`docs/aionhome-runtime-model.md`、`docs/aionhome-refactor-master-plan.md`，并对照 Penumbra PR1 契约、稳定性专项和 PR5 实施记录。本次属于 Main Chat PR6-A，**不改变运行时行为**。实施必须保持 HTTP history 的持久化权威、`public_view=true`、SSE 临时展示、WS 失效通知、canonical regenerate 原 ID/时间/回执比对，以及 PR1–PR5 的发送、附件、音频和执行状态契约。

| 必须回答的问题 | 审计结论 |
| --- | --- |
| 现有后端能否搜索完整会话？ | **不能通过现有 Main Chat API 完成。** SQLite 有完整持久化消息，但 `list_messages` 没有搜索参数；Memory/Music/Web Search 是其他业务。没有找到消息 FTS 表或消息全文检索路由。 |
| 点击历史结果能否直接精确定位？ | **现成链路不能。** `read_public_message(msg_id)` 能按真实 ID 读单条；缺少按会话校验的附近窗口、窗口双向续页及前端跳转动作。已加载消息有可复用 DOM 身份。 |
| 当前分页是否真实存在同时间戳遗漏风险？ | **存在，且已用同构 SQL 合成复现。** 表允许时间相同；文件同步会生成秒精度时间；严格 `< before` 会跨过未返回的同时间消息。前端重读保留和 stalled 判断也依赖单时间戳。 |
| 最小需要改哪些模块？ | 后端 `routes/chat.py` 的只读入口、一个薄的历史/搜索读取 helper，复用公开投影/安全反馈；前端 Message Domain、现有 Message History、Workspace、Realtime reconciliation、regenerate 资格、ChatView/BubbleList/scroll/公开文本高亮。详见第 8 节。**数据库迁移和 FTS 不是已证明的前置条件。** |
| 能否一个 PR6-B 完成？ | **可以作为一个完整的读取功能 PR，内部按契约→分页→窗口→搜索→交互分步。** 范围是关键词、现有公开内容、可靠 ID、双向窗口和阅读恢复；不含语义搜索、OCR、私有上下文、消息存储重构或 PR6.5 顶部整理。性能验收若证明必须建设 FTS/持久 sequence，应先重新确认范围。 |

### 0.1 实施前必须处理的实际冲突

这些问题不阻碍本文交付，但不能带入 PR6-B：

1. **先搜 raw `messages.content` 再脱敏会泄露命中存在性。** system 原文可能是内部包装/Camera 上下文，公开 DTO 才有允许展示的内容。必须先公开投影、提取白名单文本，再匹配、计数和生成片段；不能只脱敏返回文案。
2. **直接把旧目标窗口与最新页并集，会制造未加载历史的空洞。** 当前单向历史状态无法表达这个空洞，后续分页会被最老游标带走。建议复用现有控制器、采用单个连续活动窗口，并用 ID 锚点恢复原阅读位置，见第 6 节。
3. **旧窗口尾部不等于会话尾部。** 当前 `latestTailAssistant` 只看已加载数组；直接替换成定位窗口会给旧 assistant 显示 regenerate。必须增加“已确认到达真实最新端”的资格条件，后端 canonical 校验仍保留。
4. **搜索导航不能取消执行确认。** 当前 `historySequence/historyController` 同时承担回填。定位读取必须按目的协调序列，不能为了换窗口 abort send/regenerate 的最终 HTTP 确认，否则成功生成可能被误标结果未知。

这里记录可审阅的替代方案，不在本轮实施任何一项。上述方向均局限于读取边界；不建议改 Prompt 排序、命令执行或消息写入。

## 1. 当前前后端能力矩阵

| 能力 | Penumbra | AionHome / 旧页面 | 可复用与缺口 |
| --- | --- | --- | --- |
| Chat Header | `ChatView.tsx:312`，56px Header；返回、手机会话抽屉、标题、会话菜单、切换状态 | `static/chat.html` 现有聊天操作区 | 右侧加搜索按钮即可，不需先做 PR6.5 |
| 会话侧边栏 | `ConversationsList.tsx:22`：真实列表、创建/选择/菜单；无搜索输入 | `selectConv:3943` 读取选中会话最新页 | 本轮搜索当前会话，不改为全会话或标题搜索 |
| 完整历史关键词搜索 | 无 Domain/search 请求、结果状态或入口 | `routes/chat.py:1050::list_messages` 只有 limit/before/public_view | 必须新增服务端搜索；本地过滤已加载消息不满足目标 |
| 按持久消息 ID 读取 | `message-client.ts:12::readPublicMessage` 已有 | `routes/chat.py:1087::read_public_message`，按 PK 查询并公开投影 | 可复用投影/校验，不等于已有附近窗口 |
| 历史分页 | Message History 默认 50，向旧加载，时间游标 | limit 1–500、默认 50；DESC 查询后 reverse 返回 ASC | 无可靠双键游标元数据、向新分页或显式 has_more |
| 目标附近窗口 | 无 | 无 Main Chat around/window endpoint | 新增按 conv_id + message ID 的窗口读取 |
| DOM 定位 | `Bubble.tsx:143,173` 有 `data-message-id`、`tabIndex=-1` | 旧页按消息身份渲染，但 loadOlderMessages 仍从最早已加载时间续页 | Main 为实际 DOM 全量渲染，非虚拟列表；缺少受控定位命令 |
| 公开 system/MCP/Web | Domain capability mapper + PR4 展示组件 | `chat_public_display.py`、legacy 安全投影、Web 反馈附件读取 | 应复用；不能检索 raw payload、远程 evidence 或执行命令 |
| 图片/音乐元数据 | PR5 `mapMediaAttachments` 识别公开资源及音乐字段 | 持久化 attachments；上传仍存 URL，音乐存结构字段 | 可搜可靠歌曲名/歌手/专辑；图片名、OCR、文件内容没有现成事实 |
| 异步隔离/取消 | ApiRequestOptions.signal；Workspace 各 owner/sequence；Realtime coordinator | aiosqlite；已有只读连接及 locator 签名工具 | 缺专用于 search query / window 的生命周期及有界扫描取消 |
| 阅读锚点/自动跟随 | `chat-scroll.ts`、BubbleList、ResizeObserver、媒体/能力展开事件 | 旧页更多使用高度差/到底部 | 优先扩展 Penumbra 原实现，不引入第二个滚动/历史控制器 |

检索检查覆盖 AionHome 路由、初始化 schema 与 Python 查询代码。`routes/memories.py:56,83,95::_escape_like/_memory_list_filters` 有字面量 LIKE 转义和 Memory 查询，可借鉴输入处理，不能直接作为 Chat 搜索。`routes/memories.py:280::get_memory_source` 按时间范围读取 user/assistant，**无 conv_id 过滤、无消息 ID、无公开投影、无续页契约**，不适合复用为目标窗口。`routes/music.py`、`web_search.py` 的 search 也不是聊天历史查询。Main 消息表没有 FTS；`web_context_events.sequence` 是某个工具 anchor 的事件序号，并非消息总序列（`database.py:195,202`）。

不要接入 `P:src/components/chat/useChat.ts:13`：它仍是 mock hook，`rg` 仅找到其定义；真实 Main 页面使用 `useChatWorkspace/useChatSend/useChatRealtime`。

## 2. 现有分页与消息身份契约

### 2.1 HTTP 与数据流

```text
ChatView / useChatWorkspace
 → application/chat-workspace 加载会话、setup、history
 → application/message-history/message-history-service.ts
 → domain/message/message-client.ts::listConversationMessages
 → GET /api/conversations/{conv_id}/messages?limit=50&[before=Unix秒]&public_view=true
 → A:aion-chat/routes/chat.py::list_messages
 → drift canonicalization / attachments、mcp JSON / voice / reaction / Web 反馈 / heart
 → project_message
 → mapMessageHistory → MessageHistoryState → presenter → BubbleList
```

`A:aion-chat/routes/chat.py:1054` 使用 `if before:`，所以 before=0 被当成未传；前端明确允许 0（`message-client.ts:49` 和现有测试）。这是独立的小契约偏差，实施应改为 `before is not None`。

当前响应是 **Message[]**，不是 `{messages,cursor,total}`。SQL 在公开投影之前按原始行 limit：隐藏角色也可能占页数。Penumbra 先保存 HTTP Message，再由 presenter 隐去 hidden-runtime。不能因“可见条数 < pageSize”推断穷尽，更不能因当前没有可见行断言会话没有旧消息。

### 2.2 真实身份与临时身份

| 字段/身份 | 源码事实 | 搜索定位要求 |
| --- | --- | --- |
| `messages.id` | `database.py:56` 的 TEXT PRIMARY KEY；HTTP `id` → Domain `Message.id` | 结果必须返回原持久 ID，同时携带 `conv_id`；不能从时间/正文推导 |
| `created_at` | REAL NOT NULL；HTTP 秒（可含小数）→ `createdAt` | 只用于显示时间和排序主键，不是唯一身份；不得转毫秒后回传当精确边界 |
| `rowid` | 普通 SQLite 表的物理键；canonical regenerate 已显式读取 | 适合作当前库内次级排序键，不能当业务消息 ID，也不能承诺跨导入/重建永久稳定 |
| `client_msg_id` | 前端 UUID；服务端短时去重 | 不是历史 API 的持久 user ID；不能用来拼搜索结果身份 |
| optimistic/SSE overlay | `chat-send-controller.ts:339` 的 `execution:<uuid>:user`；accumulator 的 `:assistant` | 不能进入服务端搜索结果或结果总数 |
| canonical regenerate | `regenerate_contract.py:163::commit_replacement` UPDATE 原行，不更新 id/created_at | 旧命中可能失效，但跳转身份不变；需按最新公开内容重验高亮 |
| 文件同步 | `routes/files.py:265` 删除原会话行后插入新 ID，广播 `file_synced:288` | 原 ID 失效，不能按时间/正文猜回“同一条”；重置该会话搜索/窗口身份 |

`P:src/application/message-history/message-history-types.ts:12` 只有 `{conversationId,messages,pageSize,oldestCursor:number|null,olderPageStatus}`。`createMessageHistoryState` 按 ID 去重；`orderOldestToNewest:232` 只按时间，再保留传入顺序。`mergeOlderMessagePage:48` 要求 oldest 时间严格前进，否则 stalled；`mergeLatestMessagePage:108` 用 ID 替换/追加，但不表示中间历史完整。当前测试还明确保留同时间输入顺序、不按 ID 排序（`message-history.test.ts:118,187,241`）。

Workspace 的 `loadOlderHistory:684` 使用独立 older owner/sequence，保留请求中收到的删除 tombstone，合并时复核旧游标；`updateSelectedHistory:330` 使用 history owner/sequence，重读后执行 `retainEarlierHistory:830`。这些保护应扩展为复合游标和窗口 generation，不能绕开它们直接在 ChatView setMessages。

## 3. 同时间戳风险：证据、复现与兼容修正

### 3.1 不是“浮点时间大概不会碰撞”

1. `A:aion-chat/database.py:56` 没有 `(conv_id,created_at)` 唯一约束；只有 id 主键。`idx_messages_conv_id:102` 也非唯一。
2. `A:aion-chat/routes/files.py:178,187,195::parse_chat_file` 解析到 `%Y-%m-%d %H:%M:%S`；`save_chat_file:267` 用数组序号构造 `msg_<毫秒>_<i>`，允许相同秒内多行且 ID 不同。因此同时间戳有确定的生产写入入口。
3. `A:aion-chat/routes/chat.py:1056,1061::list_messages` 只有 `ORDER BY created_at DESC`，没有 SQL 明示的次级键。当前索引扫描常呈现 rowid 顺序，但这不是接口声明的稳定契约。
4. 第一页若在时间 T 的一组消息中截断，第二页 `created_at < T` 永远不返回该组剩余行。客户端 ID 去重只能去重复，无法找回服务端跳过的行。
5. `P:src/components/chat-workspace/chat-workspace-controller.ts:833` 仅保留 `item.createdAt < incoming.oldestCursor` 的旧消息；同 T、未在最新页返回的已加载消息也可能被丢弃。若更早的 `<T` 消息仍在，oldestCursor 不变，后续不会自动补回这个缺口。

### 3.2 已执行的合成验证

使用 Node `v24.19.0` 内置 SQLite `3.53.3`，只在 `:memory:` 创建与本问题相关的表列及 `messages(conv_id,created_at)` 索引。插入 61 条 `created_at=100`、不同 ID 的消息，再插入 1 条时间 99 的消息；limit=50。

| 查询方式 | 页大小 | 不重复返回量 | 漏失 |
| --- | --- | --- | --- |
| 当前 DESC 查询、reverse、下一页 `<100` | 50 + 1 | 51 / 62 | **11 条 T=100 消息** |
| 显式 `(created_at DESC,rowid DESC)`，下一页双键 `<` | 50 + 12 | 62 / 62 | 0 |

同构检查还证明：把上述 50 条 T=100 消息交给 `retainEarlierHistory` 使用的严格 `<100` 条件，会保留 0 条边界消息。这是条件验证，没有运行生产控制器或声称真实会话已经丢数据；SQLite 中的原行没有被分页删除。

重复问题应分开说：静态数据的严格时间 `<` 主要导致**遗漏**，不会因为 `<` 自身重复同 T 行；刷新、重叠页和 WS 合并可能再次看到同 ID，现有 ID 去重有价值。无稳定次级键的重复请求也不能保证同时间消息的成员/顺序契约；用 `<=T` 代替 `<T` 则会重复边界页，若同 T 超过 limit 还可能永不前进。

### 3.3 建议选键，不迁移消息排序模型

推荐保持 created_at 为主序，增加 **rowid 次序**，与 `A:aion-chat/regenerate_contract.py:114,143,144,201` 已有的最新目标/目标前上下文一致：

```sql
-- 向旧：查询结果倒序读取，再逆转成前端所需正序。
WHERE conv_id = ? AND (created_at, rowid) < (?, ?)
ORDER BY created_at DESC, rowid DESC LIMIT ?;

-- 向新：最近的后续消息，直接正序返回。
WHERE conv_id = ? AND (created_at, rowid) > (?, ?)
ORDER BY created_at ASC, rowid ASC LIMIT ?;
```

旧运行环境若不适合 row-value comparison，可用等价 OR，但加 `created_at <= ?` / `>= ?` 的外层范围条件，并实测计划。本轮合成 EXPLAIN 中，无额外范围的 OR 仅显示按 conv_id 扫描；tuple 和 bounded OR 均显示使用 `idx_messages_conv_id (conv_id=? AND created_at<?)`，没有临时排序。**这是当前 Node SQLite 的证据，不是 AionHome 部署版本的性能保证。**

| 次级键 | 评估 |
| --- | --- |
| id 字符串 | 可靠身份、跨 UPDATE 稳定，但现有 ID 含时间、数组序号、后缀、UUID；词典序不能代表插入顺序，`_10`/`_2` 也不同。直接改为 id 排序会与 regenerate 的 rowid 语义分叉，不推荐本轮采用。 |
| rowid | 当前普通表存在；原行 UPDATE 不改变它；现有 regenerate 已使用。推荐用于短期读取排序/游标，保留 id 作为身份。 |
| 已有 sequence | messages 无此字段；Web 事件 sequence 不能借用。新增持久 sequence 涉及 schema/回填/写入契约，本轮没有必要性证据。 |

rowid 不是 `INTEGER PRIMARY KEY` 的别名保证：导入删除重插、表重建或维护可能改变它。游标应短期、带版本和会话绑定；不能保存为永久链接。定位和恢复永久使用 `conv_id + id`，服务端按当前行解析排序位置。对于失效边界/重建，返回明确 cursor_stale，按原 ID 重读或提示已失效；不静默退回时间游标。

### 3.4 兼容旧调用方

- 保留原 `/messages` 的数组 shape、limit 和时间语义；所有列表读取明确次序。新增可选 `before_id`，必须与 before 成对，按同会话 ID 查询当前 rowid 并核对时间，再使用双键；before=0 必须有效。无效/跨会话/已删除 anchor 返回安全错误，不猜身份。
- 只传 before 的旧调用仍可工作，但**无法保证同时间边界完整**；时间一个值不足以表达组内位置，不能宣称仅服务端换 SQL 就修好了旧调用。若本 PR 一并修复旧 HTML，`static/chat.html:3980::loadOlderMessages` 最小补 `before_id=oldest.id`，不替换旧页面控制器。
- Penumbra 改用下节带 envelope 的读取接口。不要把原数组原地换为 envelope；现有 mapper/旧 HTML 都依赖数组。
- `oldestCursor:number`、stalled 判定、相等边界保留、删除后 cursor 重建需一起更新。前端不能仅看到时间不变就判 stalled；应判断**服务端复合游标有进展**。也不能只改成前端按 id 排序来“修复”。

## 4. 搜索范围与匹配语义

### 4.1 权限与投影的实际边界

`A:aion-chat/main.py:255::auth_middleware` 使用应用 session 认证；当前 messages/conversations 没有用户 owner 列，现有路由不是多租户会话 ACL。新接口沿用已有认证，并显式检查请求会话存在、anchor 属于该会话；不能称现有系统已有逐会话 ACL，也不能利用全局单条 API 绕过新接口的会话绑定。

`A:aion-chat/chat_public_display.py:146::project_message` 对 system 清空 content、attachments、thinking、drift，返回 producer display / 安全工具 / legacy fallback；对 user/assistant 保留 content，assistant 工具另放 `public_tool_result`；其他 role 清空正文和附件。**它没有把 user/assistant Markdown 变成可检索纯文本，也不是通用的全字段安全搜索器。** Penumbra 的 `presentAssistantContent` 还会过滤旧控制标记/错误原文，媒体 mapper 还会拒绝 Camera 路径。搜索需在公开 DTO 上再做展示字段白名单及正文清理，不能 JSON.stringify 整个投影对象。

`safe_value:35` 递归过滤 prompt/context/evidence/screenshot 等敏感结构键，`mcp_results.py:34::redact_text` 脱敏配置 secret、Authorization、Bearer 等。继续复用这些规则；原始 MCP `raw_command` 本来就不在 `project_tool_call:129` 的公开键中。

### 4.2 推荐第一版支持的内容

| 内容 | PR6-B 建议 | 精确来源/限制 |
| --- | --- | --- |
| 用户正文 | 支持完整持久历史 | `public.content`；安全文本/Markdown 展示文字，保留用户字面输入的语义，不对 user 执行命令解析 |
| AI 正文及旧 AI 正文 | 支持 | 排除 HEART、DRIFT/Thinking 标记段、MCP/内部命令、meta、原始 provider 错误等非正文；与 `presentAssistantContent:67` 的显示结果对齐 |
| carryover/旧消息 | 支持其当前公开正文 | `is_carryover` 是事实字段，不把它当隐私标志；不同持久 ID 是不同记录，不按内容去重 |
| 新系统通知/操作 | 支持 | `public_display` 的 title、summary、preview、公开 fields 的 label/text、必要公开 notices；重复 preview/summary 只产同一消息结果 |
| 旧 system | 支持现有安全 fallback | `chat_legacy_display.py:21,42,145`；只搜经过安全处理且未被既有展示上限截断的公开文字，不回读 raw system 补全 |
| MCP/POI/Route 工具结果 | 支持安全、已保存结果 | 投影后的 server/tool、公开结果正文和安全错误；通过允许的 content[] text 形状提取，不遍历未知字段。第一版不搜 raw_command、args/executed_args、ai_result 等技术/模型上下文字段，即使部分可在技术详情显式查看 |
| Web Search 反馈 | 支持 | `web_search_feedback.py:50,108` 的安全 query、source title/domain 等；身份锚在 `source_message_id` 所属真实 Message，不把反馈 ID 当消息 ID |
| URL Read 反馈 | 支持公开 domain/状态说明 | `url_read_feedback.py:29,56` 的 domain/status；不搜完整 URL、URL 凭据、evidence、网页缓存或本次模型输入 |
| 音乐 | 支持可靠 name/artist/album | PR5 `mapMediaAttachments:6` 接受的 typed music / 确切 legacy shape；限定 assistant 公开附件。歌曲 id 用作媒体身份，不代替 Message.id；不搜 audio_url/封面URL/远端 detail 补查结果 |
| 图片/视频/普通附件 | 不承诺内容、原名搜索 | 持久字段主要是 URL/string[]，没有可靠原名/size；草稿 upload.name 不是历史元数据。最多显示“图片/视频”类型，不把类型标签作为有用关键词结果；不搜服务器文件名、路径、二进制、OCR/EXIF |
| hidden role / Camera / 私有上下文 | 排除 | cam_trigger/cam_user/cam_log、未知 role、system 私图、att_json、device snapshots、Prompt 构建材料、配置/凭据/原命令、HEART 私语及模型 replay/evidence 都不进匹配或计数 |
| Thinking / DRIFT / Reaction | 第一版不搜索 | 已公开的辅助折叠内容/表情不自动扩大为搜索范围；保留既有展示和生命周期 |

“旧 system 带 Prompt 字样”不自动等于私有字段。当前 `test_chat_public_producers.py:18::test_http_legacy_projection_preserves_original_rows_and_safe_carriers` 明确验证旧 `[delayed]` 文本经安全 fallback 仍可公开；`safe_legacy_text` 也刻意保留旧 prose。应按**当前投影是否公开、具体字段是否在白名单**判断，既不新增 raw Prompt 读取，也不以关键词 Prompt 为由把所有旧系统正文删掉。

已截断历史结果不能恢复缺失部分。`chat_legacy_display.py:7` 公开 legacy text 上限为 256,000 字符；`mcp_results.py:6` 已有存储/批次预算。UI 应说明搜索覆盖“完整会话的可公开、已保存展示内容”，不是恢复从未保存或已在公共边界截断的原文。

### 4.3 关键词规则与正文提取缺口

建议一个明确的 `match_version=1`：输入首尾 trim，Unicode NFC，大小写折叠，连续 Unicode 空白归一为空格，然后作**连续字面子串**匹配。不做分词、词干、拼音、繁简、语义/模糊搜索，不默认 NFKC 扩展全半角等价；内部多个词按整段输入匹配，不暗中改为 AND/OR。

- 中文直接子串；英文不区分大小写，不能把 SQLite 原生 NOCASE 当成完整 Unicode casefold。
- 空输入/全空白不请求；建议 1–200 Unicode 字符，超限返回可理解的输入错误。
- `% _ \\ [ ] ( ) + ? *` 都按字面处理；不用用户输入构造正则/FTS 表达式。若未来用 LIKE 候选筛选，需转义 `%/_/\\` 并参数化，最终仍必须在公开文本上匹配。
- 不跨正文、另一条消息、不同工具字段拼接命中；每个公开 segment 独立匹配，同一 Message 最多一个结果，结果内可有多个片段。
- 片段使用原始公开文字，并保存归一化位置到原文的映射；大小写展开、组合字符、emoji、空白折叠后不能直接沿用错误下标。

现有可借鉴的正文语义是 `P:src/components/chat/insertable-body.ts:10::insertableBody`：基于 remark/GFM，排除 HTML、图片/链接目标、definitions、工具栏，保留可见文本和代码。后端 requirements 当前**没有等价 Markdown 解析器**。因此 PR6-B 必须明确实现受测的服务端公开文本提取，必要时添加一个纯读取解析依赖；不能把前端 helper 当作后端已经可用，也不能用简单正则冒充完整 GFM。

`A:aion-chat/command_parser.py:168::parse_assistant_commands` 是已有纯解析器，可复用其中清理能力，但其完整输出包含 commands，且 malformed/incomplete marker 的处理不完全等于前端流式过滤。只消费验证过的 cleaned text，不运行 executor、不回传 commands；用 PR1 的嵌套数组/引号/未闭合标记和旧消息 fixtures 对齐。展示专用过滤仍有必要，不能把未闭合私有命令残片搜出来。

正文匹配/高亮必须共享合成样例：`**Hello**`、链接显示文字、代码、Markdown 代码预览、GFM 表格、被拒绝的 Camera 图片地址、未知/未闭合控制块。不匹配 Markdown 的隐藏定义、图像 URL、被拒绝媒体路径或代码工具栏按钮。

## 5. 后端最小新增契约（提案，尚不存在）

建议只新增 **两个读取路径**，共享一个小的 history read helper；保留原列表和单条接口，不搬动 send/regenerate。新接口固定 public view，不提供 `public_view=false` 开关。使用 `get_db_readonly:485`、现有安全投影和批量反馈装配；缺库应失败，不初始化数据库。

### 5.1 搜索列表

`GET /api/conversations/{conv_id}/messages/search?q=...&limit=20&cursor=...`

```json
{
  "conversation_id": "conv-synthetic",
  "match_version": 1,
  "items": [{
    "message_id": "msg-synthetic",
    "created_at": 100.0,
    "role": "assistant",
    "snippets": [{
      "segment_key": "body",
      "text": "一段包含关键词的公开文字",
      "match_ranges": [[4, 7]]
    }],
    "public_revision": "opaque-public-content-revision"
  }],
  "next_cursor": "opaque-or-null",
  "has_more": true,
  "page_status": "ready",
  "total": null
}
```

上例命中“关键词”，数据均为合成示例。约定 range 为片段中 **Unicode code point 的 [start,end)**，前端不能直接当 UTF-16 下标；也可返回分段文本，但必须先固化一种方式。`segment_key` 是服务端受限枚举/结构路径，如 body、display.field:2、tool:0.result、web:<公开反馈ID>.query、music:0.name，不接受客户端传任意 JSON path。

建议 limit 默认 20、上限 50；按消息 `(created_at DESC,rowid DESC)` 最新优先。多字段命中聚合为一个消息结果，不使用相关性排序，便于上一条/下一条与稳定游标。片段每段建议 160–240 字符、最多 3 段；不返回全文/HTML、不生成可执行链接；revision 只覆盖允许搜索的公开内容，不能 hash 私有上下文来暴露变化。

不要求全量 COUNT。`total=null` 表示未知；界面显示已发现数量/仍在查找，不能把当前页数当总数。为避免无命中扫描占满服务，预算耗尽允许 `items=[]`、`has_more=true`、`page_status="scan_pending"`，next_cursor 指向**最后消费的候选行**。因此 has_more 表示仍可继续遍历，不保证后面一定有匹配；只有 `page_status="complete"` 且 next_cursor=null 才能显示最终无结果。若用 limit+1 查得下一命中，续页边界必须保留该未消费命中，不能跳过它。

搜索在服务端分批遍历当前会话，不经浏览器逐页下载全部历史。SQL 不先用 raw content LIKE 决定结果，也不以“仅最新 N 条”硬截断冒充全历史。返回页可受预算控制，但 continuation 必须最终覆盖整个会话允许范围；前端顺序续查、支持停止与继续，不能无限并发预取。

### 5.2 最新页、ID 定位窗口、双向续页共用一个 endpoint

`GET /api/conversations/{conv_id}/messages/window`

| 模式 | 参数 | 行为 |
| --- | --- | --- |
| latest | `limit=50` | 最新可公开窗口，正序返回，明确最新端 |
| around | `anchor_id=<真实ID>&before_limit=25&after_limit=25` | 先 `WHERE conv_id=? AND id=?` 找目标；在一个短读事务内取目标及最近两侧，最多 51 条 |
| older | `before_cursor=<opaque>&limit=50` | 排除边界，返回紧邻的更早窗口，正序 |
| newer | `after_cursor=<opaque>&limit=50` | 排除边界，返回紧邻的更晚窗口，正序 |

模式互斥，不能同时 anchor/before/after。建议普通页 limit 上限 100、around 每侧上限 50；与原 limit≤500 分开定义。响应：

```json
{
  "conversation_id": "conv-synthetic",
  "anchor_id": "msg-synthetic",
  "messages": [{
    "id": "msg-synthetic",
    "conv_id": "conv-synthetic",
    "role": "assistant",
    "content": "一段包含关键词的公开文字",
    "created_at": 100.0,
    "drift": null,
    "thinking": null,
    "is_carryover": 0,
    "attachments": [],
    "mcp_tool_calls": [],
    "cache_region": null,
    "public_view_version": 1
  }],
  "older_cursor": "opaque-or-null",
  "newer_cursor": "opaque-or-null",
  "has_older": true,
  "has_newer": true,
  "reaches_latest": false,
  "page_status": "ready"
}
```

messages 使用现有公开 Message DTO；上例表示 around 尚有两侧续页，非完整 Message 列表。latest/续页响应的 anchor_id 为 null，已穷尽的方向 cursor 为 null。around 必须包含经验证可展示的目标，否则安全 404。hidden/未知 role 不作为可跳转目标，不把它们的原文或身份加入结果。窗口扫描可能跨越不展示行；cursor 以服务端扫描进度为准，不能只由前端 `messages[0].createdAt` 重建。预算耗尽可返回较少/空可见行但仍有续页；不得因此标记 exhausted。若 around 侧边尚未填满，应保持最近邻的已扫描范围，明确可续取；不能把“取到很远但中间未扫完”的两侧拼在一起。

直接 ID 定位不依赖 q 或结果页 cursor；用户点击很旧的结果只需该窗口请求，不需要从最新页翻到目标。搜索结果中的 public_revision 与窗口最新公开内容不一致时，仍按 ID 到达原消息，重新计算匹配；没有命中则提示“消息已更新”，不跳向另一条相似文字。

### 5.3 游标、安全错误、并发与取消

- 搜索 cursor 与历史 cursor 分开版本/用途，绑定 conv_id、排序方向、边界、到期时间、投影/匹配版本；搜索另绑定归一化 q 与首轮插入水位。跨会话/换词复用必须拒绝。
- rowid 是内部排序事实；结果暴露可靠 message_id，客户端把 cursor 当不可解析 token。可复用 `A:aion-chat/auth.py:50::sign_opaque_locator_readonly` 的现有签名材料及域隔离，不新建 secret 存储；校验使用只读签名路径及恒时比较，避免调用会 repair 写入的普通 auth loader。
- **签名不是加密。** token 不放正文、原始命令、凭据、私有 JSON、隐藏消息 ID、模型输入；内部边界可用排序数值及服务端绑定指纹，不能把 Base64 包 raw payload 称作隐私保护。
- 边界用真实 ID 解析当前行并校验内部排序绑定；扫描 continuation 若边界行已删除/被重建，返回 `409 cursor_stale`，保留当前阅读并允许重启搜索或按可见 anchor 重新定位。无 anchor 的边界也要校验当前绑定，不能信任客户端传来的 rowid。
- 首轮可冻结插入水位，避免后续新消息不断挤动结果；但不持有跨 HTTP 的 SQLite 事务。regenerate/编辑会改正文，故这是有水位的实时读取，**不是多请求强一致快照**。删除、file_synced、重新导入等使结果失效时按原 ID/版本重读；不要承诺游标跨数据库维护永久可用。
- 401/403 沿用认证；会话/目标不存在、跨会话、不可展示目标统一安全 404；参数非法 422，cursor 失效 409，超时/资源不足给安全服务错误。错误不回显 SQL、原始 JSON、配置或 traceback。新读取建议 `Cache-Control: no-store`。
- 客户端 AbortSignal 已可传；服务端要在候选批次间检查 disconnect/cancellation、释放 cursor/短读事务，必要时执行查询预算中断。abort 不等于已经运行的 SQLite 工作立刻停止，更不等于取消后台生成。

## 6. 与现有历史、Realtime、regenerate 的协调

### 6.1 保留一个历史所有者、一个连续活动窗口

推荐扩展 `application/message-history` 的现有 state/service 和 Workspace，增加服务端 older/newer cursor、hasOlder/hasNewer/reachesLatest、windowGeneration 与双向加载状态。messages 仍只存 HTTP 权威 Message；搜索 hook 仅持有 q、结果摘要、页游标、当前 result ID 和请求序号，**不保存第二套完整消息或独立历史控制器**。

最小导航流程：

1. 打开搜索只记录 UI 返回书签 `{conversationId, anchorMessageId, offset, following}`，并暂停自动跟随；不替换历史或主动滚动。
2. 点击结果，若真实持久 ID 已在当前连续窗口中，直接定位；否则通过 Workspace 请求 around。成功后原子切换活动窗口、更新两端 cursor；失败保留旧窗口/位置。
3. 新窗口顶部“加载更早”、底部“加载更新/回到最新”；普通分页和搜索定位使用同一服务，不从最老消息继续“猜”目标。windowGeneration 变化使旧分页回包失效；同 generation 的双向回包只能接到对应邻边。
4. 返回书签只存身份/偏移/跟随意图，不复制原 Message[]。关闭时没有跳转则原位关闭；已经跳转则按第 7 节规则恢复书签，必要时用同一 around 接口重读。正常历史从恢复后的双键边界继续。
5. 对连续前后页按服务端顺序 prepend/append、按 ID 替换去重；同时间不能再依赖 JS insertionIndex 或词典序替服务端排序。不相交的 latest 与旧窗口不合并成“完整”数组。

这是读取模式扩展，不引入全量会话缓存。取舍是返回时恢复真实阅读锚点和可续页边界，必要时重读，**不承诺保留搜索前所有已加载页的内存副本**。若还要求原已加载页全部保留或同时浏览多个离散窗口，必须在同一 history state 显式表示 ranges/gaps；这是更大的可选增强，不能在 PR6-B 静默用数组并集冒充。

### 6.2 请求 owner、迟到结果与执行确认

| 操作 | 应有的隔离 |
| --- | --- |
| 输入搜索 | 约 250ms debounce；IME composition 期间不发；每次 query generation + owner + match version；新词 abort 旧请求。慢旧词结果即使未被真正取消也不得覆盖 |
| 点击结果/上一条下一条 | 独立 navigation sequence；只有最后目标可提交窗口和焦点；取消旧导航不撤销已持久化执行 |
| 普通双向分页 | 沿用 older owner/sequence/删除 tombstone，加窗口 generation、请求边界及 direction 校验；双击锁定单方向；跨窗口响应丢弃 |
| 切换/删除会话、离页 | abort 搜索/窗口/高亮 timer，清 owner/结果/返回书签/焦点引用；切换发起时即隔离，失败后按旧会话身份重新开放，不让 A 结果落到 B |
| send/regenerate finalization | `ChatHistoryReconciliationResult` 的 persistedMessageIds / regenerateTarget 继续来自最新权威 HTTP。可独立于显示窗口读取和校验，不以正在查看的旧窗口证明保存成功 |
| history 确认与定位并发 | 在同一个 Workspace 内按目的隔离请求序号；保留执行确认回调的原返回值/语义。窗口换代不能中断 finalization，最终确认也不能覆盖用户刚选的旧窗口 |
| file_synced/reconnect | 前者清理旧身份并提示更新，后者按活动 anchor 重读其窗口并另核对最新端。只重读 latest 不足以更新旧命中；不能复活已删除条目 |

`P:src/components/chat-workspace/chat-workspace-controller.ts:408::reloadSelectedConversationHistory` 当前重读最新页并返回确认投影；`src/application/chat-send/chat-send-controller.ts:149::finalize` 用该结果确认 expected assistant ID，regenerate 另验证 start/receipt/HTTP 文本（`:570::isRegeneratePersistenceConfirmed`）。只需调整 Workspace 的**显示提交策略**，不改这个执行契约：旧窗口阅读期间，最新确认得到的投影供 send 使用；只更新活动窗口中相同 ID 的已加载行、记“有新消息”，不能无条件把 latest 页拼到旧窗口。

### 6.3 WS、乐观身份与 regenerate

- `src/application/realtime-reconciliation/realtime-reconciliation-plan.ts:50` 的 message-created/updated 现在走最新页，file-synced/reconnect 走 scratch；同目录 `realtime-reconciliation-service.ts:84` 的 capability-invalidated 已用 `readPublicMessage` 更新**已加载 anchor 的 decorations**。新方案复用 coordinator 的串行/dirty 合并；旧窗口内的正文更新也需按 ID 权威重读，不能只刷新 decorations 或最新 50 条。
- 不从 WS payload 插入搜索结果或持久 Message。新结果在明确刷新/续查后出现；受影响的既有结果按 ID 标记待刷新。search hit count 也不随 SSE chunk 增长。
- `chat-execution-composer.ts:26,40,65` 区分 HTTP 命中、regenerate 原身份 overlay 和 optimistic overlay。保留这些规则；旧窗口模式只展示窗口内内容，当前生成进度由原状态区/“有新消息”入口承接，不能把远端最新 overlay 接到旧目标末尾形成假相邻消息。
- 搜索期间仍可让已开始的生成完成；不会重发、取消生成或释放未知锁。若在旧窗口主动提交新消息，应先明确回到最新阅读模式，再走原发送流程；若最新读取失败，保留草稿，不用发消息探测。
- `chat-regenerate-policy.ts:56::latestTailAssistant` 必须加真实尾部资格；旧窗口 `reaches_latest=false` 时不授予 regenerate。canonical 后端 `load_target:88` 仍是最终资格权威，保留 conflict/target_not_latest。
- regenerate 不改 ID/created_at/rowid，分页位置保持；旧片段不代表当前内容。完成后刷新命中 revision、重新算高亮，原关键词消失就说明已更新；不执行第二次 regenerate 来验证，不用 timestamp 改换身份。

## 7. Header 搜索交互、定位、高亮与阅读位置

### 7.1 最小界面改动

`ChatView.tsx:358` 的 HeaderCopy 为 `min-w-0 flex-1`；搜索按钮可放在标题/现会话菜单之后的右侧操作区，复用 Button/Tooltip/图标。切换状态保留位置；只在选中会话且 history 可读取时启用。配置、附件、模型菜单仍在 PR5 位置，不顺带整理 PR6.5。

推荐轻量搜索面板放在 Header 下、现有消息滚动区上方，通过 ChatShell 的组合插槽接入；PC 结果列表有高度上限，手机结果点击后收起列表并保留搜索词和前后导航。避免新建整个聊天页面或另一个消息列表。

- 输入提示“搜索当前会话”；有清空、关闭、加载/续查状态、错误重试、最终无结果。错误不清空当前消息/草稿。
- 每条结果显示公开片段、角色、日期和本地时间；内部状态以 conv_id + message_id 为准。时间相同也能分辨为不同结果，必要时辅助显示短 ID，短 ID 不参与请求身份。
- 上一条/下一条以**匹配消息**为单位，顺序与结果列表一致；同消息多处命中一起高亮。列表最新优先时，下一条去更旧、上一条去更新。末页继续拿搜索 cursor，不从聊天最新历史倒翻。
- 只保留摘要分页和 cursor 书签以支持返回上一结果页；结果很多时可限 UI 摘要缓存并回读旧结果页，不能因此截断服务端搜索。无精确 total 不显示虚假的“第 i / N 条”。

### 7.2 定位与高亮复用点

`BubbleList.tsx:164` 遍历全部 dateGroups/messages，未使用虚拟化。找到窗口目标 DOM 后，在**自己的** `[data-slot="scroll-area-viewport"]` 内计算相对距离，使目标居中或靠上；不对整个页面调用无约束 `scrollIntoView`。`data-message-id` 使用精确相等或 CSS.escape，不能把任意 ID 拼进未转义 selector。

显式 jump 应先设置 `shouldFollowRef=false`、建立目标/offset 锚点，再提交窗口，待布局后定位、`focus({preventScroll:true})` 和短暂行高亮（建议约 2 秒，Reduced Motion 降级）。同会话定位不能换 timelineKey 冒充会话切换，因为 `BubbleList.tsx:137` 会强制到底；windowGeneration 需作为**独立导航信号**。

匹配内容高亮不通过 `content.replace` 插 `<mark>` 或 innerHTML：这会破坏 Markdown、转义、代码复制、媒体和 XSS 边界。建议在现有 Markdown AST/公开文本组件中增加只读文本高亮，跨格式节点匹配需用统一可见文本索引映射；范围仅包含当前结果的允许 segment。正文使用 `data-message-body`，系统/工具字段及音乐名增加受控 segment 标识，不搜索按钮、时间、复制标签、Thinking/DRIFT 或私有技术字段。

折叠字段命中应打开对应**公开** disclosure，不能只闪一条空 system 行；复用 `CapabilityExpansionProvider/useCapabilityExpansion`，搜索临时展开与用户主动展开分开记录。命中 public tool result 只展开相应结果，不自动展示 args、ai_result 或执行动作。JSON 结果按安全字段文字高亮，不改变 JsonViewer 的解析/复制载荷。

当前没有“一键展开指定 segment”的外部受控接口，也没有搜索高亮插件；这些是 PR6-B 工作，不是已有能力。

### 7.3 高度变化、自动跟随及关闭规则

`chat-scroll.ts:6,12` 已按 message ID + offset 捕获/恢复锚点；`:21::trackChatScroll` 使用 96px 近底部阈值和 ResizeObserver，处理 `chat-capability-toggle` / `chat-media-preview`，区分布局校正和用户滚动意图。继续用这套逻辑，不能另建 scroll listener 抢写 scrollTop。

| 场景 | 建议行为 |
| --- | --- |
| 只打开/输入/关闭，无结果跳转 | 保持原 anchor/阅读位置；原先 following 且期间无阅读/导航意图，可恢复 following，否则保持阅读 |
| 结果跳转后立即关闭 | 恢复打开前的 ID + offset；若不在活动窗口，用 around 读取后恢复。原来 following 则取 latest 后恢复跟随；期间明确滚动离开目标则按下一行处理 |
| 跳转后用户主动滚动阅读/继续分页 | 关闭保留当前阅读位置，避免突然回跳；保留显式“返回搜索前位置”和“回到最新”操作。恢复完成前不丢书签 |
| 返回书签目标已删/file_synced | 保持当前可读窗口，说明旧位置不可用，提供回到最新；不按时间/数组索引猜原位置 |
| 图片异步 load/error、系统展开、键盘收起 | ResizeObserver 围绕当前锚点校正；目标短暂稳定校正有 generation/期限，用户主动滚动后停止，不持续吸回目标 |
| 新消息到达/原生成结束 | 旧窗口保持阅读，只显示有新消息；点击回到最新才恢复跟随，不因 lastMessageId 或 SSE tailRevision 自动拉走 |
| 搜索请求失败/用户停止搜索 | 保留已读位置和有效结果，错误在面板内；不能释放发送未知锁或触发自动重发 |

PR5 的 ChatAudio 生命周期要明确：搜索切窗口仍是同 conversation，不改 scope 冒充切会话。`P:src/components/media/ChatAudio.tsx:10` 当前会在播放 identity 不再包含于展示 identities 时 stop；单窗口方案跳离播放卡片时会沿用这一规则停止播放，返回后不自动重播。只打开面板、输入、高亮或关闭而未移走卡片不应停播、重取 stream 或重置 controller。原附件草稿、提交快照、recovery 的 owner/revision 不参与搜索重置。

### 7.4 手机与键盘

`ChatShell.tsx:14` / `chat-viewport.ts:5` 已跟踪 VisualViewport height/offsetTop；搜索面板应在同一壳内受此几何约束，保留 safe-area，不能再用另一套固定 100vh 覆盖键盘。结果列表使用自身有界滚动，Chat 的 overscroll/滚动锁保持。

点击结果先 blur 搜索输入、等待可视区尺寸更新，再应用目标锚点；不无条件 focus 正文导致重新弹键盘。IME Enter 不触发下一条/提交。Escape、显式返回键先关闭顶层图片查看器等 modal，再关闭搜索；Header 的“返回桌面”在搜索活动时应先关闭搜索。手机系统/浏览器返回与焦点恢复须实机验证，当前源码没有搜索 Back 栈契约，不能声明已支持。

## 8. 必要修改、测试、索引与性能边界

### 8.1 推荐最小文件边界

| 范围 | 现有文件/建议新增位置 | 修改目的 |
| --- | --- | --- |
| 后端读取入口 | `A:aion-chat/routes/chat.py` 的 list_messages 附近 | 旧 before=0 / before_id 兼容；注册 search/window，只读参数/安全错误，保留旧数组接口 |
| 读取 helper | 建议 `A:aion-chat/chat_history_read.py`（新文件名提案） | 收敛双键分页、anchor/window、公开文本 segments、匹配/片段/游标与预算；不移动 send 主流程 |
| 公开投影复用 | `chat_public_display.py`、`chat_legacy_display.py`、`mcp_results.py`、`web_search_feedback.py`、`url_read_feedback.py` | 优先直接复用；如装配需要抽小的等价 reader，先加 fixtures；不要扩展私有字段公开范围 |
| 签名/连接复用 | `auth.py::sign_opaque_locator_readonly`、`database.py::get_db_readonly` | 原语已有；不是要求改 auth schema/新建 key |
| 后端 schema/依赖 | `database.py`、`requirements.txt` | 索引按部署计划证明必要再加；Markdown 提取若需依赖明确列入 review，不做消息迁移/FTS 初始化 |
| Message Domain | `P:src/domain/message/message-{types,dto,mappers,client}.ts`、index | 新 envelope/search DTO 校验、固定 public 接口、cursor/window/read identity；保留原 Message 与 drift 兼容 |
| 历史核心 | `src/application/message-history/message-history-{types,state,service}.ts` | 单连续窗口、两端服务端 cursor、双向进展/合并、真实 latest 标记；不保留单时间戳 stalled 假设 |
| Workspace | `src/components/chat-workspace/chat-workspace-controller.ts`、`useChatWorkspace.ts` | 定位 owner/generation、读写目的序列、返回锚点、回填与显示提交策略；修 retainEarlierHistory 的等时边界 |
| Realtime / 资格 | `src/application/realtime-reconciliation/*`、`chat-regenerate-policy.ts` | 已加载旧目标更新、reconnect/file-synced、latest 资格；复用 ChatRealtime coordinator，无协议变化 |
| 搜索 UI | `src/components/chat/ChatView.tsx`；建议小 `ChatSearchPanel.tsx` / `useChatSearch.ts` | Header 入口、输入/结果摘要、取消、上一下一、关闭/返回；hook 不保存完整 Message[] |
| 阅读/高亮 | `BubbleList.tsx`、`chat-scroll.ts`、`Bubble.tsx`、`MarkdownRenderer.tsx`、公开 capability/音乐文本组件、`chat.css` | jump 信号/高亮 segment/定向展开；复用原 shell/viewport/媒体组件，必要时 ChatShell 增组合插槽 |
| 旧 HTML（若同步修旧分页） | `A:aion-chat/static/chat.html::loadOlderMessages` | 仅补成对 before_id；不添加另一套新前端搜索 |

`chat-send-controller`、SSE/WS parser、附件 store、上传/音频 endpoint、Provider、Prompt、命令 executor 和 canonical regenerate persistence **无需为搜索改契约**。现有 send reconciliation 的调用与返回投影保持；本轮也不改这些模块。

### 8.2 PR6-B 必须新增的测试

使用合成 fixture/临时库/fake provider，禁止测试初始化真实后端或访问真实模型、媒体服务。

| 层 | 必要场景 |
| --- | --- |
| SQL/历史 contract | 同 T 超过 50/100/500，边界混合 T/T-1，双向反复遍历唯一且全覆盖；before=0；非整数浮点；空页/隐藏行占页；旧数组/新增 envelope 并存；原调用不带 before_id 的限制明确 |
| 排序/身份 | 不同 suffix/UUID/导入 `_2/_10` 不按词典序重排；原 ID 确切定位；cross-conv/已删/hidden ID 404；无 timestamp/index fallback；regenerate UPDATE 后位置与 ID/时间不变 |
| 搜索公开边界 | 新/旧 user/assistant、carryover、legacy system、安全 MCP/公开 Web/music 命中；hidden-only/Camera-only/raw_command-only/配置 secret/args-only/evidence-only/query credential 不命中、片段/计数/total 均不泄露；不能通过空结果/游标错误回显私有内容 |
| 文本/高亮 | 中文/英文大小写、空白/换行、NFC/组合字、casefold 长度变化、emoji、字面 `%_\\[].*`；Markdown/GFM/代码/链接/definitions/未闭合控制块；跨节点与截断边界，snippet code point offsets 与 UI 一致 |
| Cursor/资源 | 签名篡改、过期、换词/跨会话/换方向；scan_pending 空结果继续进展；limit+1 无丢失；预算、取消/断连释放；当前边界删除/file-synced 安全 stale；不持有跨请求事务、不执行 COUNT/网络/command |
| 历史合并 | 同 T 进展不 stalled；最新重读不丢同 T 已加载行；around 与 latest 不构成假连续数组；两个方向/旧导航响应竞态；delete tombstone 不复活；新窗口失败保留原视图 |
| 执行稳定性 | streaming 中搜索/跳转，最终确认仍拿最新 HTTP；搜索取消不 abort send/regenerate；未知恢复仍只读；旧窗口不授予 regenerate；receipt + 原目标 start + HTTP 文本条件不放宽；overlay 不进搜索、不重复 user |
| UI 生命周期 | debounce/IME/慢旧词/连点两目标/A→B→A/删会话/离页/timer；关闭与返回锚点；搜索前 following、跳转后滚动、新消息、图片 load/系统展开/键盘等高度变化 |
| PR1–PR5 回归 | 原 generation/recovery、navigation/drafts、HTTP drift、Reaction/HEART/MCP、附件提交/回收、图片 viewer、音乐互斥/不自动播放及 regenerate 保留身份 |

可扩展现有：`P:src/application/message-history/message-history.test.ts`、Workspace controller tests、`realtime-reconciliation.test.ts` / capability tests、`chat-regenerate-policy.test.ts`、`chat-scroll.test.tsx`、`chat-generation-flow.test.tsx` 与 PR5 媒体合成入口；后端 `test_chat_public_producers.py`、`test_chat_legacy_display.py`、`test_atomic_regenerate_persistence.py`、`test_canonical_regenerate_route.py`。新增 search/window 专项 contract，不用旧功能测试“顺带通过”代替这些边界。

### 8.3 索引与性能边界

- 现有 id 主键索引和 `idx_messages_conv_id(conv_id,created_at)` 是优先复用项；普通 rowid 表的该二级索引可服务次级 rowid 次序。本轮合成计划没有证明必须新建索引；不写无效的 `CREATE INDEX ... ON messages(rowid)`，也不重复现有索引。
- **关键词子串 + 投影后过滤最坏仍为 O(当前会话公开数据量)**；时间索引只能帮助会话/有序分页，不能令 `%keyword%` 自动变成索引搜索。不能承诺百万消息常数时间或准确总数免费。
- 建议起点：候选每批 100–200 行、单请求约 100–200ms CPU/墙钟软预算，配合扫描文本字节预算（如 4MiB）、响应摘要预算（如 64KiB）和客户端单在途请求；这些是待基准调优值，**不是已测 SLA**。长 Message 可单独处理/让出执行权，不能为满足批次预算静默截断可搜索正文；如需子消息 continuation，应明确 segment/offset 并保证同消息结果不重复。
- 投影批次批量加载 Web/Reaction 等必要展示事实，避免逐消息 N+1；搜索无需读取 voice 音频、图片文件、心语正文、远程音乐 detail/stream、MCP 或网页。配置 secret 列表按请求读取/复用，不能每条消息重载配置。
- 每次请求短只读事务保证当次 anchor/两侧一致；后台写入/生成不受长读事务或同步 CPU 扫描长期阻塞。取消在批次/大字段处理边界合作生效，记录指标不记录 q 或原文。
- PR6-B 在 AionHome 实际部署的 Python/SQLite 上用合成 1k/10k/100k 消息，包含同 T 大组、每条 256k 级工具/legacy 文本、无命中/稀疏命中/常见一字命中，测首批、深页、取消、内存和写入并发；记录 EXPLAIN，验证无全局表扫描/大临时排序及无事件循环饥饿。不得用本轮 Node SQLite 计划代替部署证据。
- 扫描预算耗尽不等于最终无结果，也不允许硬设“只搜最近 500/5000 条”。若大历史延迟不达标，再提**安全公开投影索引**：必须考虑中文分词/子串、工具/反馈更新、旧消息回填、regenerate 同 ID 更新、配置脱敏变化、删除/file_synced 的索引一致性。原始表 FTS 或无效索引命中后才脱敏会扩大泄露面，不能在本轮无验证引入。

## 9. PR6-B 实施步骤与验收清单

### 9.1 推荐实施次序

1. **固化读取契约与 fixtures**：先定 match_version、公开 segments、双键次序、旧数组兼容、search/window envelope、scan_pending/错误语义。补同时间戳丢行与隐私阴性测试。
2. **后端双键分页/ID 窗口**：复用现索引/公开装配；实现短读事务、around/latest/前后续页、旧 before_id。先验证静态全覆盖、删除与 regenerate 后边界。
3. **后端搜索**：服务端公开文本提取、归一化、片段及版本、签名 cursor、有界扫描/取消；用全部公开内容类别测试，不把 metadata 搜索伪装成读取远程资源。
4. **现有前端 History / Workspace 扩展**：一个连续窗口、两端 cursor、owner/window generation、finalization 与显示分离、Realtime 旧目标更新、真实 tail regenerate gate。先验证空洞/竞态，再接 UI。
5. **Header 轻量搜索与跳转**：输入生命周期、摘要分页、上一下一、精确 ID、局部滚动/短暂高亮、公开折叠字段展开、关闭/返回阅读书签；模型/附件菜单不改布局职责。
6. **合成回归、部署版性能及人工 PC/手机验收**：通过后更新记录。若实际性能要求迫使引入 FTS/消息 sequence/多窗口缓存，先提交证据与替代方案，等待该设计方向确认，不夹带迁移。

### 9.2 PC 验收（本轮未执行）

- [ ] 右上角入口、长标题/切换状态/会话菜单不挤压；宽/窄/短窗口、浅深主题、键盘焦点和 Reduced Motion 可用。
- [ ] 当前仅加载 50 条时，命中数千条之前的 user/assistant/旧消息；结果含片段、日期时间，点击只需目标窗口读取，不发生从最新连续翻页。
- [ ] 同 T 大组的多个结果、不同 ID/相同正文、双向分页、上一下一跨结果页均准确；最终无结果与仍在扫描有区别。
- [ ] 搜索覆盖已确认公开 system/MCP/Web/music；命中字段可见并高亮；不出现私有字段、原命令、失效媒体 URL 或未授权 Camera 素材。
- [ ] 流式生成中打开搜索、跳旧目标并等待结束，不抢回底部、不重复消息、不误报未知；原未知恢复/发送锁依然有效；旧窗口无错误 regenerate 入口。
- [ ] 图片加载/失败、展开系统/工具/代码、打开关闭图片 viewer 后目标与阅读锚点稳定；不会触发音乐重播或重取地址。
- [ ] 无跳转关闭、跳转后立即关闭、主动滚动后关闭、返回搜索前位置、回到最新的行为符合第 7 节；搜索失败/anchor 删除保留可读历史和草稿。
- [ ] 断网/401/403/慢请求/连点两目标/切会话/删除/file_synced/reconnect 不串会话、不复活条目；Network 中没有搜索引起的 send/regenerate/upload/音乐播放请求。

### 9.3 手机验收（本轮未执行）

- [ ] 真机 iOS Safari、Android Chrome，必要时既有 WebView：窄屏、横竖屏、安全区、键盘开合后输入/结果/前后导航可见，Composer 不被意外覆盖。
- [ ] 中文 IME composition/Enter、清空、取消、快速连续输入；键盘不令 viewport 双重缩高或跳到底。
- [ ] 点结果后键盘收起、目标定位准确；触摸滚动立即获得阅读权，图片延迟加载/系统展开不持续吸附目标。
- [ ] 面板与消息滚动互不穿透；返回先处理顶层 viewer/搜索，再执行原桌面/页面返回；关闭后焦点合理且不反复弹键盘。
- [ ] 生成中、音乐播放中、附件草稿存在时打开/关闭搜索，原执行/播放/草稿契约保留；断网、后台返回、会话切换及重连有安全恢复。

自动测试/API 正确不替代真机的几何、键盘、焦点与浏览器返回验收。本轮没有执行以上验收，也不声称 PR6 功能已实现。

本文完成后暂停，等待确认 PR6-B 实施范围。**不 commit、push 或部署。**

交付复核：两仓库 HEAD 未变，AionHome 工作树干净，Penumbra 仅新增本文；已检查 Markdown 围栏、JSON 示例及片段字符范围、编码、行尾空白和差异。未运行业务测试/构建或真实 UI 验收。
