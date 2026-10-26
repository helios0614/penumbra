# Chat PR6-C — 全局分段搜索与通用原文对话

日期：2026-10-26（Asia/Shanghai）。代码与合成验证完成，等待人工验收；**不 commit、push 或部署**。

前端：`/Users/remix/Desktop/Penumbra`，基线 `ec262c5`。后端：`/Users/remix/Desktop/AionsHome-main/aion-chat`。两个仓库分别保留可独立审阅的工作树改动。

## 1. 范围与实现选择

- 桌面会话侧边栏、手机已有会话抽屉顶部增加「搜索全部聊天」。生成期间也可打开。
- 独立搜索 Dialog 保存本次关键词、范围、cursor 与结果，不接入 ChatWorkspace 的活动历史、导航、生成、草稿或音频状态。
- 「查看原文」打开通用 `ConversationContextDialog`，替代原需求中的内联展开。
- 继续采用关键词字面匹配、时间范围、有界扫描和手动继续；没有 FTS、迁移、新索引、后台任务、语义检索或永久缓存。
- 未改变 PR6-B 后端搜索/窗口实现，未重构单会话搜索。前端仅提取已有单条搜索 DTO 校验函数，供两种搜索共同使用；算法和原接口行为不变。
- 未修改消息写入、Prompt、SSE/WS 协议、canonical regenerate、工具执行、媒体服务或记忆库入口。

## 2. 接口

### 2.1 全局搜索

`GET /api/conversations/messages/search`

静态路由放在会话消息动态路由之前。路由调用新增 `chat_global_search.py::search_global_messages`，使用 `get_db_readonly()`、短读事务和 `Cache-Control: no-store`。继承原实例认证；**没有新增多租户逐会话 ACL**。

| 参数 | 契约 |
| --- | --- |
| `q` | 原输入 1–1000 code points；沿用 PR6-B 归一化后 1–200 code points |
| `range_start/range_end` | Unix 秒数值；必须成对、有限、间隔固定 2,592,000 秒（30×24h）；以 `[start,end)` 过滤 REAL 时间列 |
| `limit` | 匹配消息数，默认 20，范围 1–50 |
| `cursor` | 当前关键词和当前区间的签名续查 token；续查必须显式带原区间 |

不带范围的 API 首请求使用服务器当前 Unix 时间。正式 UI 在关键词稳定后建立一次固定的数值上界（设备发起查询的 Unix 时间），请求始终显式传同一范围；这样首请求尚未返回便被停止/重试，也不会移动上界。设备时钟应正常；时区只影响展示，不参与 SQL。所有重试保留原范围，只有用户修改关键词或显式「重新从最近 30 天查找」才建立新上界。

```json
{
  "range_start": 1790467200,
  "range_end": 1793059200,
  "match_version": 1,
  "items": [{
    "conversation_id": "synthetic-conversation",
    "conversation_title": "当前公开标题",
    "message_id": "persisted-message-id",
    "created_at": 1791000000,
    "role": "assistant",
    "snippets": [{"segment_key":"body","text":"公开关键词","match_ranges":[[2,5]]}],
    "public_revision": "sha256-of-public-segments"
  }],
  "total": null,
  "next_cursor": null,
  "has_more": false,
  "page_status": "complete"
}
```

结果按 `(created_at DESC,rowid DESC)` 排序，持久身份为 `(conversation_id,message_id)`。同时间戳不按字符串 ID 猜顺序。返回标题来自候选消息 JOIN 的当前会话记录，并用既有脱敏函数处理。

| 状态 | 含义 / 下一步 |
| --- | --- |
| `scan_pending` | 本次预算没有命中，当前区间仍未结束；手动「继续查找当前时间段」 |
| `ready` | 本批有结果且仍可续查；继续当前 cursor |
| `complete` | 当前区间候选已耗尽；才出现「继续查找更早 30 天」 |

前一个区间严格为 `[start-2592000,start)`。保留结果并追加，不覆盖、不自动跨区间、不统计全库总数。界面分别显示当前区间和连续已查完范围，以用户本地时区呈现日期时间；「此批未命中」「已查完区间无匹配」「更早尚未搜索」有不同提示。没有声称一次空段代表全库无结果，也不额外扫描最早时间来计算结束段数。

### 2.2 原文窗口与公开来源标题

原文仍调用 PR6-B 的：

`GET /api/conversations/{conv_id}/messages/window?anchor_id=<persisted-id>&before_limit=2&after_limit=2`

该接口实现完全保留。默认得到前 2 条、目标、后 2 条公开消息；接近边界或原接口的隐藏行/软预算边界时可能不足 5 条，不补造消息、不自动加载完整历史。

另加轻量只读元数据接口：

`GET /api/conversations/{conv_id}/public-title`

返回 `conversation_id/conversation_title`，按 ID 主键读取并脱敏，`no-store`，不存在返回同类安全 404。原文打开时并行读取标题和窗口，共用一个 AbortSignal；搜索列表观察到会话重命名时，仅重读相关结果会话的标题。这样既不改 PR6-B 窗口 DTO，也不会用侧边栏可能未脱敏的标题覆盖搜索安全标题。标题刷新失败时使用「会话名称已更新」，原文读取失败则按错误状态展示。

### 2.3 游标、错误与变更

复用 PR6-B `_encode/_decode`、签名器、版本、30 分钟期限和边界身份绑定，使用独立用途 `chat-global-search`。关键词摘要同时绑定精确数值范围。边界所在会话 ID 只用于调用共同 decoder，不能绕过签名、期限、关键词、区间和当前边界校验。游标不携带隐藏消息正文、ID 或时间；token 是签名值，非加密或永久定位书签。

- `409 cursor_stale`：篡改、过期、跨关键词/范围/用途、边界消息/会话失效；不自动跳到其他边界。
- `422 invalid_search/invalid_search_range`：非法关键词或区间；沿用 FastAPI limit 参数错误。
- 原文 `401/403/404` 对用户统一显示「已不可用，可能已被删除或当前无法读取」，不回显私有错误细节。
- 搜索失败保留有效结果和本次请求计划，支持手动重试；失效 cursor 可显式重新开始。停止不接受迟到结果。
- 每个区间首请求记录全局最大 rowid 水位，该区间续查不纳入正常追加的更高 rowid 行。rowid 并非持久序列，删除后的 rowid 重用/历史回填仍不构成强快照。固定时间上界防止新区间不断向现在移动。
- 跨请求不是数据库快照。删除和 regenerate 可能改变后续命中；已经显示的片段是搜索时快照，不后台维护全局缓存。原文每次打开重新读取，regenerate 仍用原持久 ID，删除不猜替代目标。未来区间的首请求会建立该区间的新插入水位，历史导入/回写不是整次搜索的强快照。

## 3. 源码复用与安全阅读

全局候选读取没有 raw content LIKE，也没有遍历会话并调用单会话搜索。`chat_global_search` 只负责范围、全局顺序、预算和结果来源元数据，复用：

- `chat_history_read.public_batch` → `chat_public_display.project_message` → `public_segments` 白名单。
- 同一 Markdown 可见文本提取、assistant 控制内容排除、`redact_text`、Unicode 归一化、`_hits` 片段与 `public_revision`。
- 同一 `_cancel`、cursor codec 与 `HistoryReadError` 错误边界。
- 原 PR6-B 的工具、Web/URL、音乐、Camera、thinking、args、raw command、模型上下文、凭据阴性 fixture 也通过全局函数执行。

前端模块：

| 模块 | 职责 |
| --- | --- |
| `domain/message/global-message-search.ts` | 全局 DTO、范围/状态/唯一键验证；复用 `mapMessageSearchItem` |
| `useGlobalChatSearch.ts` | 250ms 防抖、IME、固定上界、单请求、手动继续、取消、去重、错误恢复 |
| `GlobalChatSearch.tsx` | 侧边栏入口、Paper 搜索 Dialog、紧凑分隔列表、范围与操作 |
| `conversation-context.ts` | 独立锚点/原文数据契约，默认窗口读取 adapter 和公开标题读取 |
| `ConversationContextDialog.tsx` | 通用原文加载、错误、失效、关闭与请求隔离；不知搜索词、时间分段、分页或搜索结果状态 |
| `ReadonlyConversation.tsx` | 单纯只读阅读，角色/时间/目标标记和安全公开文本 |
| `useReadonlyDialogFrame.ts` | 复用 Dialog safe-area/visualViewport 变量，加同 URL Back entry；嵌套先关原文，处理 StrictMode 清理 |

`ConversationContextAnchor = {conversationId,messageId,conversationTitle}`。可注入 `ConversationContextReader(anchor,{signal})`，返回 `{conversationId,messageId,messages,conversationTitle?}`；默认 reader 不接触 Workspace。Dialog 验证目标和所有消息 owner，不接受隐藏目标。关闭清空原文数据并取消请求；切换锚点、重复打开同一锚点和重试均隔离旧响应。

**不直接渲染 canonical content。** 原窗口 DTO 的 canonical 正文保留原执行契约，可能含控制内容或未脱敏值。只读阅读以服务端 `searchSegments` 为唯一可见文字边界：只有原有 `insertableBody` 提取的全部可见文本与白名单正文相等（NFC/空白处理，不忽略大小写）时，才保留其 Markdown 结构；不一致回退公开正文纯文本。其他系统/工具内容仅呈现白名单摘要文字。

Markdown 只输出惰性的文字、强调、列表、引用、表格、代码等语义节点；不输出 HTML、图片、链接目的地、音视频、iframe、代码复制按钮或任务交互。没有发送、复制、regenerate、删除、播放或工具执行入口，也没有附件远程资源请求。

模态、Escape、焦点锁定、嵌套模态与关闭后焦点恢复由现有 Base UI Dialog 负责。搜索和原文阅读区域各自独立滚动，Paper 材质沿用记忆库 `mist-paper` 与现有 Mist Dialog，暖色用户、冷色知远、柔和目标强调。

## 4. SQLite 查询计划和预算

只检查必要 schema/查询，没有读取实例私人数据库。现有 `database.py` 已创建 `idx_messages_created_at(created_at)`，索引隐含 rowid 后缀；会话 ID 使用现有主键索引。无需持久索引或 migration，也无额外部署回填成本。

大组同时间戳下，直接 tuple 过滤可能重复走已扫行。最小调整为两个有界 seek：先 `created_at=? AND rowid<?`，不足才读 `created_at<边界时间`；两者都保留 `[start,end)`、插入水位及 LIMIT。没有 UNION 大排序或全局表扫描。

实际合成 EXPLAIN（Python 3.14、SQLite 3.50.4、macOS）：

```text
SEARCH m USING INDEX idx_messages_created_at (created_at=? AND rowid<?)
SEARCH c USING INDEX sqlite_autoindex_conversations_1 (id=?)
SEARCH m USING INDEX idx_messages_created_at (created_at>? AND created_at<?)
SEARCH c USING INDEX sqlite_autoindex_conversations_1 (id=?)
```

单请求最多 1000 源行、约 200ms **软**处理预算、约 4MiB 源字符串估计预算；候选批最多 50 行、预取最多 8 行。完整单条消息不截断，故单条/预投影批处理可能超过软时间或字节阈值；预算边界按最后实际消费行续查。Markdown/匹配使用现有线程处理，断连按候选/消息检查。没有宣称任意大单条消息均能硬限时。

最终探针 `tests/contract/bench_chat_global_search.py`：256 字符正文、全体同时间戳、两会话交错，唯一命中位于最旧行。以下全段时间为脚本主动循环 HTTP helper 的 CPU/SQLite 总时间，**产品不会自动循环**，不含网络和人工点击间隔。

| 候选数 | 首请求 ms | 扫完总 ms | 所需手动请求数 | 深页 50 候选 ms | 断连后退出 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 91.60 | 91.60 | 1 | 0.28 | 1.77 |
| 10,000 | 89.84 | 1,071.53 | 10 | 0.33 | 2.03 |
| 100,000 | 93.97 | 9,470.43 | 100 | 0.33 | 2.07 |

20 条每条 256Ki 字符的合成正文：首请求约 85.05ms，返回 `scan_pending`，字节预算让出。此为本机探针，不是部署机 SLA。全段稀疏匹配最坏仍与该段公开数据量成正比；可随时停止，不保证低点击数或全库总量统计。

## 5. 验证结果

| 验证 | 结果 |
| --- | --- |
| Penumbra 全量 Vitest | 156 文件、2072 项通过；含新增 12 项及原 PR6-B 回归 |
| TypeScript / Vite | 生产构建通过；保留既有大 chunk 提示 |
| 后端合成回归 | 9 文件、161 项通过；其中原历史接口 13 项、全局 14 项 |
| 轻量 Chromium | 320 / 390 / 1280px 全部通过；每种宽度一条主交互流程 |
| 查询计划与性能 | 实际 Python SQLite 合成验证；无新索引/迁移 |

后端 9 文件为 `test_chat_global_search`、`test_chat_history_read`、`test_chat_public_display`、`test_chat_legacy_semantics`、`test_canonical_regenerate_route`、`test_atomic_regenerate_persistence`、`test_chat_stability`、`test_chat_media_io`、`test_mcp_history_provider_roles`。

后端在 `/private/tmp/penumbra-pr6c-backend/aion-chat` 的源码副本和独立 venv 测试，仅使用合成数据库；未启动真实 main.py、读取私人历史/媒体/日志/认证文件或调用远程服务。Camera 模块使用只会失败的本地 cv2 capture stub，不能当作摄像头硬件验收。没有运行后端全部业务测试。依赖沿用 PR6-B，不改 requirements。

验证覆盖：交错会话、同时间戳稳定续查、严格边界、零命中后更早命中、行/字节预算、全局脱敏阴性、跨词/区间/用途/期限/篡改、删除边界/会话、regenerate 身份、只读路由、默认服务器范围、断连、IME、错误/停止恢复、迟到响应、pair-key 去重、原文安全 Markdown、缺失/禁止来源、嵌套 Back 和 StrictMode。

浏览器 fixture 复用真实 ChatWorkspace/Send UI，只替换合成 transport。验证从桌面侧栏/手机抽屉进入、pending 不自动续查、当前段继续/更早段追加、前后 2+1+2、目标标记、标题读取、原文 Back 后焦点回原按钮、弹框不越界/横向溢出、无远程媒体请求、生成完成且原草稿/选中会话保留。遵照要求没有开展复杂截图矩阵。真实手机软键盘、IME、Android/iOS 系统返回和实际壁纸对比度仍建议人工验收，不能用桌面 headless 模拟结果替代。

复跑入口：前端 `npm test`、`npm run build`；Vite 下运行 `tests/browser/chat-pr6-global-search-smoke.cjs`（配置本机 Playwright/Chromium 路径）。后端在隔离源码环境执行上述 9 个 pytest 文件；性能执行 `python tests/contract/bench_chat_global_search.py`。

## 6. 记忆库未来复用

现有 `Memory` / `MemoryListItemDto` 只有 `sourceConversationId/source_conv`、`sourceStartedAt/source_start_ts`、`sourceEndedAt/source_end_ts`，没有可靠 `message_id`。原来源 API 也不能被当作精确消息定位协议。

后续有可靠 `(conv_id,message_id)` 的新来源可直接提供 anchor；其他可靠来源可通过注入 reader 接入同一阅读视图。旧记忆的时间范围或摘要只能作为另一种来源范围，不能映射成某条具体消息。后续需要来源协议适配/可靠持久锚点，或明确展示「无法精确定位」；本轮不改记忆存储、来源 API，也不新增记忆原文入口。

## 7. 人工验收

1. 保持一个会话阅读位置和 Composer 草稿；可启动生成/音乐。从侧栏或手机会话抽屉打开「搜索全部聊天」。确认会话和主阅读位置未切换，生成/播放继续。
2. 输入近期关键词，核对最近 30 天和当地时间提示。密集区间逐次点击「继续查找当前时间段」；只有完成后出现更早 30 天，已有结果仍保留。
3. 搜索近期不存在但更早存在的词；完成空段后查更早，核对相邻区间结束值等于前段起始值。修改词清空旧结果，中文组词阶段不发请求。
4. 点击跨会话结果「查看原文」；核对来源标题、角色、时间、真实目标标记和前后消息。关闭、Escape、Back 逐层返回，搜索焦点和滚动保留；Chat 不加载目标到主窗口。
5. 删除/重生成测试消息、重命名测试会话后重新搜索/打开原文；确认安全失效提示或当前原文，不替代 ID。断网续查后已有结果保留，可重试/重新开始。
6. 手机实际键盘、长文本滚动、safe-area、关闭入口和返回操作；关闭并重新打开搜索后不自动继续旧扫描。

验收前端和后端须配套使用新增只读 API；本轮未部署。

## 8. PR6-C Follow-up — 原文阅读密度（2026-10-26）

本次基线为 Penumbra `05f95bd`。仅优化前端展示，未修改 AionHome、搜索算法、窗口 API、预算、游标、持久消息身份、发送或生成生命周期；未 commit、push 或部署。按用户后续指示不生成截图，等待真实数据人工验收。

### 展示调整

- 普通 user/assistant 保留原暖/冷配色和目标强调，仅将卡片间距 12px 收紧至 8px、内边距适度缩小，正文仍为 14px、约 1.65 行高；左右仅错开 8px，不限制长中文消息宽度。没有接入完整 Chat Bubble 的媒体、操作或执行状态。
- `ReadonlyEvent.tsx` 与纯展示 helper `readonly-event-presentation.ts` 将公开系统/工具文字组织成事件标题、操作时间、正文预览、弱化元数据及原生「查看详情」。只复用轻量 `CapabilityIcon`，不引入原 Chat 的命令执行展示系统。
- 文本只来自 `searchSegments`，按 `display.label:N/field:N` 配对；不从 capability fields、canonical system content、raw command 或 args 补正文。Capability 仅提供既有安全类型、状态枚举和截断布尔信息。缺少字段名、未知旧结构保持通用回退，系统消息顺序与数量不变。
- 记忆正文优先显示，非目标长正文为最多 3 行/180 code points 的预览；重要度和可准确计数的 JSON 关键词数组作为弱化元数据。普通关键词字符串不猜分隔符或数量。完整正文、关键词、ID 和其他允许公开字段保留在详情。
- 闹铃的操作名称、公开时间在标题行展示，提醒正文紧跟其后；不再将内容/时间拆为纵向表单。
- 失败、未知、仅已发出、部分完成、公开错误/通知和截断标记不放入折叠区。工具调用层完成不宣称业务完成，也不从标题或正文推断成功。
- 目标系统事件不截短正文，次级详情默认打开；字段名在需要时保留为行内文字，确保命中的是「内容」「时间」等标签时也仍可见。组件不依赖关键词、搜索范围或分页状态。音乐名称等被动元信息保留原纯文本展示，不引入执行状态或媒体控件。
- 原文 Dialog 收紧 Header/Body 留白，独立滚动、来源标题、目标标记与只读边界保持不变。

### 搜索高度与模态层级

空搜索改为自然高度；有结果才扩展至最多 `min(46rem, available viewport)`，结果列表内部滚动。850px 高度的合成检查中，空搜索约 276–287px，有结果为 736px。

复用现有 `useReadonlyDialogFrame` 的 VisualViewport 测量，低于 500px 的可视高度启用紧凑头部：重复说明仅对辅助技术保留、局部垂直间距缩小，输入、范围原文和继续按钮保留。未改已接受的搜索文案。继续按钮由 `secondary` 实心样式改为现有 `outline` Paper/Mist 描边。

使用 Base UI 的 `data-nested-dialog-open` 隐藏被覆盖的纸面：手机打开搜索后收起抽屉的可见表面，打开原文后隐藏底层搜索表面。保留原 Dialog/Sheet 实例、搜索结果/范围/滚动及焦点/Back/Escape 管理；关闭上层后恢复下层。不通过卸载抽屉清空搜索，不另建模态系统。局部 opacity 优先级用于覆盖进入动画的 persistent fill，未调整全局动画。

### 验证与人工验收

- 全量 Vitest：157 文件、2084 项通过，新增 12 项事件展示用例；覆盖记忆、闹铃、MCP/Web 失败、截断、sent/unknown、旧记录/异常字段、目标标签及纯元信息。
- `npm run build` 通过，保留既有大 chunk 提示。
- `chat-pr6-reading-smoke.cjs`：320/390/1280px 各检查纯对话与混合事件；验证自然/扩展高度、原生详情完整内容、安全阴性、层级遮蔽、Escape/Back、搜索滚动/焦点、主 Chat 滚动/会话及草稿恢复。手机尺寸额外检查 420px、350px 可视高度，继续按钮可达、结果区域可滚动。
- 原 `chat-pr6-global-search-smoke.cjs` 三种宽度仍通过，生成、草稿、手动续查及只读边界保持。
- 全部使用本地合成 transport，无真实后端或远程媒体请求，无截图。可视高度缩小验证不能替代真实手机系统键盘/IME 验收。

人工重点：纯对话连读；长记忆与闹铃交替时的密度；失败/未知/截断是否始终可见；目标系统事件全文和字段标签；详情完整性；手机键盘、逐层返回、关闭原文后搜索结果/滚动以及主 Chat 状态保持。

## 9. 最终展示细节收口（2026-10-26）

- 「查看原文」移至每条结果元信息行右侧，保留原 callback、消息锚点和恢复行为；新增小型阅读图标，按钮触控高度仍为 44px。左侧角色/完整时间可在窄屏换行，正文下方不再保留入口。
- 修正记忆主要字段的选择顺序：有文本的公开正文（含已知 legacy 标签、公开 body 和无/不同标签字段）优先于重要度 summary；空正文不阻挡公开 preview/summary 回退。源码能复现的旧问题是未识别字段排在 summary 后，未读取真实私人历史来猜测具体 DTO，也不扩大安全投影或读取 canonical/raw 内容。
- 完整显示于默认层的短元信息及其精确重复 summary 不再机械放进详情；关键词、可靠 ID、其他补充字段和被截短的全文仍保留。详情 DOM、目标默认展开、折叠交互与动画机制保持。
- 闹铃的目标时间标为「提醒时间」，历史消息时间标为「记录于」。直接使用公开时间原文和持久 created_at，不推算明早/相对日期；明确的「执行时间」字段保留原语义。
- 只在有结果时略收紧顶部范围提示的行距、段间距和输入框间距；文案、时间边界与状态语义不变，空状态自然高度及原文气泡/高亮不变。

验证：前端全量回归和构建通过；事件展示测试补充正文优先、无标签字段、空值回退、完整/截短元信息去重及两种时间语义。原轻量浏览器流程检查 320/390/1280px 下右侧入口位置、44px 触控高度、时间不重叠、字段详情、焦点/滚动/主 Chat 状态恢复及小可视高度；没有开展截图矩阵。本轮仍不改后端，不 commit、push 或部署。

## 10. UI 暂冻结前的三项收口（2026-10-26）

- `GlobalSearchSummary` 为纯展示组件：左侧只显示当前请求 `range` 的本地月/日，跨年保留两端年份；右侧使用已有去重列表长度显示「已找到 N 条」。不再把已完成的多个区间合成顶部日期；零结果时分别显示查找中、尚未查完、本段未找到、已停止或查找未完成，原空状态中更早记录未查询的说明和手动继续行为保留。精确 Unix 边界、时区换算、30 天区间与 `[start,end)` 查询完全不变。
- 记忆卡片只省略目标正文前由 UI 额外拼接的字段名称；公开正文自身若包含「记忆正文：」则原样保留。原正文优先级、详情字段与去重规则保持。
- 系统卡片的「当前关注」与记录时间组成可收缩、可换行的阅读定位组，使用轻量定位图标和原珊瑚色文字；业务完成/失败状态仍为独立信息，不改整体目标背景或普通对话气泡。

验证限于受影响的 6 个前端测试文件（46 项通过）、TypeScript 与生产构建；覆盖当前/更早区间、跨年、累计数量、零结果状态、原文前缀保留、详情去重及定位标记语义。按用户后续指示不提供截图、不进行复杂浏览器视觉验证。未修改后端、搜索/窗口/生成生命周期，未 commit、push 或部署；本轮结束后暂冻结 PR6-C UI，不继续主动美化或重构。
