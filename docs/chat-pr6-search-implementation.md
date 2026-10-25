# Chat PR6-B — 全历史搜索、精确定位与双键分页

日期：2026-10-25（Asia/Shanghai）。状态：**代码与合成验证完成，等待人工验收；未 commit、push 或部署。**

依据 [PR6-A 审计](./chat-pr6-search-audit.md) 第 4–9 节实施。审计原始证据保留。实施基线：Penumbra `5c9982213fea56e1306c676042e3219e6d571282`（包含审计提交），AionHome `e48d74c6c65d49064a9d293570777a8f05d5ba84`。与审计所检查的业务代码一致，没有引入 FTS、migration、持久消息 sequence 或第二套历史缓存/控制器。

下文 P 为 `D:/Desktop/zhi/penumbra`，A 为 `D:/Desktop/zhi/AionHome/aion-chat`。后端只改历史读取 helper、路由、依赖、旧页面分页参数及合成测试；没有修改消息写入、Prompt、工具执行、SSE/WS payload、canonical regenerate 或媒体服务。自动验证只用合成数据库、fixture 和 mock transport；没有启动真实后端或读取私人历史、媒体、日志、认证文件与凭据。

## 1. 最终接口与身份

新增两个 GET，继承 `A:main.py::auth_middleware` 的现有会话认证边界；这仍是实例已有的访问模型，没有新增多租户 ACL。所有目标读取均检查 `conv_id + message_id`，只允许 `user/assistant/system`。未知会话、跨会话目标、已删除目标与 hidden role 的目标返回同类安全 404。

### 1.1 搜索

`GET /api/conversations/{conv_id}/messages/search?q=...&limit=20&cursor=...`

实现：`A:routes/chat.py::search_conversation_messages` → `A:chat_history_read.py::search_messages`。

| 字段 | 契约 |
| --- | --- |
| `q` | 必填；归一化后 1–200 Unicode code points。HTTP 原输入上限 1000，防止过长输入；前端输入上限 200 |
| `limit` | 每页匹配消息数，默认 20，范围 1–50；不是扫描历史总量上限 |
| `cursor` | 可选的服务端签名续查游标；绑定会话、关键词、用途和版本 |

```json
{
  "conversation_id": "synthetic-conversation",
  "match_version": 1,
  "items": [{
    "message_id": "persisted-message-id",
    "created_at": 100.125,
    "role": "assistant",
    "public_revision": "sha256-of-public-segments",
    "snippets": [{
      "segment_key": "body",
      "text": "一段公开关键词正文",
      "match_ranges": [[4, 7]]
    }]
  }],
  "total": null,
  "next_cursor": "signed-continuation-or-null",
  "has_more": true,
  "page_status": "ready"
}
```

`match_ranges` 为片段中的 Unicode code point 半开区间，不能直接作为 JS UTF-16 索引。前端校验区间边界；高亮使用相同归一化重新映射到当前文本。每条持久消息只返回一个结果，最多 3 段、每段最多 320 code points，最多 20 个标记区间。普通片段保留原文大小写，压缩空白；极端超长组合字符簇会使用有界归一化片段。示例为合成 DTO，不是实际历史。

结果按 `(created_at DESC, rowid DESC)` 返回。`public_revision` 仅对允许搜索的公开 segments 求摘要，不包含隐藏字段。`total` 固定 `null`，不额外 COUNT/扫描以计算总数。

| `page_status` | 含义及 UI |
| --- | --- |
| `ready` | 当前页有结果，还有可续查范围；显示「已找到 N 条，可继续查找」 |
| `scan_pending` | 当前扫描预算耗尽，尚未命中；显示「仍在搜索历史」，继续当前游标 |
| `complete` | 此次搜索范围真正耗尽；只有此时且没有任何结果才显示「没有匹配消息」 |

单次最多消费 1000 个候选行、约 200ms 软预算；候选查询每批最多 50 行，内部以 8 行有界预取减少 SQLite 线程切换。每批已消费源字符串估计约 4MiB 后让出，不截断单条消息正文。下一次从最后已消费行续查；预取但未消费的行会重新读取。前端空扫描页延迟 120ms 自动续查，有结果后由用户继续。扫描可停止、取消、重试，不限制完整历史为最近 500/5000 条。

### 1.2 连续历史窗口

`GET /api/conversations/{conv_id}/messages/window`

实现：`A:routes/chat.py::read_conversation_window` → `A:chat_history_read.py::read_window`。

| 模式 | 参数 | 行为 |
| --- | --- | --- |
| latest | 不带以下三个定位参数；`limit=50` | 最新连续窗口 |
| around | `anchor_id=<真实消息 ID>`；`before_limit=25&after_limit=25` | 直接读取目标及两侧；不从最新逐页走到目标 |
| older | `before_cursor=<older_cursor>`；`limit=50` | 当前窗口更旧的相邻页 |
| newer | `after_cursor=<newer_cursor>`；`limit=50` | 当前窗口更新的相邻页 |

`anchor_id/before_cursor/after_cursor` 互斥。`limit` 1–500，around 两侧各 0–50。每次短事务内读取目标、两侧和边界存在性；窗口扫描最多 2000 个源行/每侧，并使用软时间与批次体积预算。hidden 行被消费但不返回，不能把隐藏行占满一页误报为已到头。

```json
{
  "conversation_id": "synthetic-conversation",
  "anchor_id": "persisted-message-id",
  "messages": ["Public Message DTOs, oldest to newest"],
  "older_cursor": "signed-or-null",
  "newer_cursor": "signed-or-null",
  "has_older": true,
  "has_newer": true,
  "reaches_latest": false,
  "page_status": "ready"
}
```

`messages` 沿用现有 `project_message` 公开 DTO、voice/reaction/HEART/Web/URL 装配，另附 `search_segments: [{segment_key,text}]`。它是活动消息的展示辅助字段，没有另建 Message 缓存。canonical `content`、时间和真实 ID 仍按原 HTTP 契约用于执行确认；不能把搜索提取后的纯文本替代原 canonical content 或生成回执。

两端游标以实际消费的数据库边界推进，可跨越不返回的 hidden 行；即使 `messages=[]`，只要游标和 `has_older/has_newer` 表示仍可续页，UI 仍允许加载。`reaches_latest = !has_newer`，不是检查当前数组最后一条。

### 1.3 错误、游标与兼容

- 404 `detail.code=history_not_found`：目标/会话不可读取；不回显隐藏 ID、正文或时间。
- 409 `cursor_stale`：签名、会话、关键词、用途、版本、期限、边界身份/时间不匹配，或边界已删除。
- 422 `invalid_search/invalid_limit/invalid_window/invalid_history_boundary`，以及 FastAPI 参数校验错误。
- 成功响应 `Cache-Control: no-store`。读取使用 `database.get_db_readonly()`、短 `BEGIN`，连接退出释放事务；不会创建缺失数据库或调用命令/模型/上传/媒体读取。

游标有效期 30 分钟，复用 `auth.sign_opaque_locator_readonly`；签名同时绑定服务端当前 ID、会话、时间与 rowid。token 携带内部行号、期限、会话、关键词摘要、版本及可选插入水位，不携带隐藏消息 ID/时间/正文。**签名不是加密**，客户端将整个 token 当不透明短期值，不能当永久书签。数据库重建、边界删除、认证签名材料变化后必须重新取窗。

搜索首请求记录本会话最大 rowid 水位；后续不纳入新插入消息，避免不断写入导致永远搜不到尽头。每请求一致，跨请求不是数据库快照：删除和 regenerate 可改变后续结果，已扫过的位置不会自动回溯。前端在相关 HTTP 确认、WS 更新/删除/反馈失效、file_synced/reconnect 后刷新关键词结果，按原 ID 保留选择。重新搜索建立新水位。

旧 `GET /messages` 继续返回数组，保留 `public_view`、`limit`、`before`。修正 `before is not None`，因此 `before=0` 有效；所有查询都采用稳定双键排序。可选 `before_id` 必须与 `before` 成对且等于该 ID 的真实时间，之后使用严格双键 `<`。只传 `before` 的外部旧调用方仍是单时间边界，不能凭空消除其同时间戳跳行限制；Penumbra 正式读取使用新窗口接口。`A:static/chat.html::loadOlderMessages` 仅增加 `before_id`，没有重写旧页面。

## 2. 搜索公开内容边界

提取顺序是 `public_batch` 解码 → 附加已有安全 Web/URL 反馈 → `chat_public_display.project_message(..., secrets=...)` → `public_segments` 白名单提取及二次 `redact_text` → 归一化/匹配/片段。SQL 不对 raw content 做关键词过滤，所以私有命中不会先影响结果或数量。

| 内容 | 第一版行为 |
| --- | --- |
| user/assistant 新旧正文、carryover | 提取合法可见文字；AI 额外复用当前控制标记的展示过滤规则 |
| Markdown / GFM | `markdown-it-py==4.0.0` + `mdit-py-plugins==0.5.0` 的 tasklists；搜索正文、链接标签、可见代码、表格、列表；排除链接目标、图片地址/alt、HTML 标签、definitions 和 Markdown 控制语法 |
| fenced md/markdown 预览 | 按现有 MarkdownRenderer 的一层预览提取；普通代码块按代码文字搜索 |
| system 新公开投影及 legacy | 搜安全 title/summary/preview、允许的 fields/label/notices；依赖原 legacy 安全投影，不搜索原 system 包装 |
| MCP/工具 | 公开 server/tool/error、纯结果字符串或明确 `content[]: type=text`；任意远程字典不自动成为可搜索字段空间 |
| Web/URL | 已持久的公开检索词、来源标题/域名、URL 读取域名；不读取远程网页或 evidence，不搜索 URL 凭据/query |
| 音乐 | assistant 附件中可靠 typed music 或严格旧形状的 name/artist/album；不请求远程 detail/stream，不搜索音频地址 |
| 图片及其他附件 | 不做 OCR、文件名猜测、二进制或资源 URL 搜索 |
| Thinking/DRIFT/Reaction/HEART 私有正文、Camera/hidden role | 不入搜索；hidden 目标也不能 around 定位 |
| raw_command、args、executed_args、ai_result/evidence、模型上下文、调用参数 | 不入搜索；公开结果中配置 secret 仍按既有规则脱敏 |

合法 segment keys 限定为 `body`、`display.title/summary/preview/field:N/label:N/notice:N`、`tool:N.server/tool/error/result`、`web:N.query/source:N.title/domain`、`url:N.domain`、`music:N.name/artist/album`；前端拒绝其他字段命名。

匹配是字面子串：NFC、Unicode upper/lower folding、空白合并、忽略首尾空白；支持中文、英文、组合字、`Straße/STRASSE`、emoji 和字面 `%_\\[].*`，不把用户输入当 SQL LIKE/正则。没有分词、语义、拼音、OCR 或跨会话搜索。繁简、重音差异不自动等价。

assistant 的嵌套/引号控制扫描会移除 THINKING、DRIFT、MCP/命令、meta 等控制块，以及未闭合标记余段和 provider 失败诊断。用户气泡继续使用原有纯文本呈现，AI 保留原 Markdown 展示/复制规则；搜索没有改变任一原始消息。公开投影会随现有展示协议演进，新增可搜字段需同时更新提取白名单与阴性测试。

## 3. 双键分页与前端连续窗口

服务端严格使用 `(created_at,rowid)`，反向取页后返回时间正序；同时间按服务端 rowid 次序，客户端不按字符串 ID 排序。rowid 只做内部次序，可靠定位始终是持久消息 ID。

`P:src/domain/message/message-window.ts` 校验 owner、anchor、唯一身份、非递减时间、两端游标与 has 状态。Message History 原模块扩展 `window.{olderCursor,newerCursor,hasNewer,reachesLatest}`；`message-history-window.ts` 负责相邻合并/刷新，不新增历史 controller。

| 场景 | 策略 |
| --- | --- |
| 首载/回到最新 | 读取 latest，成为单个活动窗口 |
| 搜索目标已加载 | 按实际 DOM `data-message-id` 定位，不发 around |
| 目标未加载 | 一次 around 成功后替换活动窗口；失败保留原历史 |
| 向旧/向新 | 服务端对应游标读取真正相邻页，按 ID 去重，保留服务端同 T 次序 |
| 最新 HTTP 与已加载窗口有重叠 | 保留重叠前的连续前缀，更新 canonical 消息；同 T 前缀不因时间筛选丢失 |
| latest 与旧窗口不连续 | 仅更新交集 ID，保留阅读窗口并提示有更新；不把不连续片段伪装成连续数组 |
| 游标失效 | 保留窗口，明确错误；用户显式重试时按当前真实边缘 ID 重新取窗，或回到最新；不无限重试旧 token |
| 目标/书签删除 | 错误提示，保留可读历史；不按时间/数组索引猜替代目标 |
| file_synced/reconnect | 同步重建读取身份；reconnect 在旧视图按真实锚点重读，迟到响应不能覆盖更新的用户导航 |

`chat-workspace-controller.ts::navigateHistory/loadWindowPage/updateSelectedHistory` 区分导航 generation、分页单在途和原执行确认 sequence/controller。会话切换/离开使原导航失效；连续跳转只接受最后一次结果。分页/导航期间的 delete tombstone 防止迟到响应复活消息。

活动窗口会随用户持续翻页增大，沿用既有实际 DOM 渲染；本轮没有新增虚拟化或无限历史预缓存。大范围连续阅读的 DOM 成本仍是现有边界。

## 4. 正在生成、Realtime 与 regenerate

历史导航不会 abort `historyController` 的 send/regenerate 最终 HTTP 确认。`reloadSelectedConversationHistory` 总是返回真实 latest HTTP 的持久 ID 和 regenerate canonical projection；如果用户中途跳转，确认仍完成，只向当前显示窗口更新交集，不追加远处新消息。搜索打开时只呈现已持久消息，SSE/乐观展示仍在原执行 controller 中运行；关闭/回到最新恢复既有展示，Composer 和执行提示保留。

`chat-regenerate-policy.ts::latestTailAssistant` 增加 `reachesLatest` 门槛。旧窗口末尾 assistant 不能获得 regenerate；后端 canonical 校验、目标原 ID/时间、receipt/start/HTTP 文本比对均未放宽。搜索不会触发 send/regenerate、上传或播放器操作。

`realtime-reconciliation-service.ts` 对已加载的 message-updated 按 ID around 刷新整条 canonical 消息，404 移除旧目标；capability-invalidated 更新公开装饰和搜索 segments，保留正文执行权威。结果片段刷新仍绑定原 ID。新消息仅提示可向新加载/回到最新，不能抢走旧窗口阅读位置。旧窗口发送前先确认回到 latest；读取失败保留输入及附件草稿。

## 5. Header、匹配高亮与阅读恢复

入口在当前 `ChatView` Header 右侧，面板组合于原 `ChatShell.notices`。保留模型选择、会话菜单、附件和 PR5 Composer 结构；不提前实施 PR6.5。

- `useChatSearch.ts`：250ms 防抖，IME composition 期间不请求；AbortController + owner/query/revision/generation 隔离；迟到旧词、旧会话或旧 cursor 不覆盖当前结果。只持有结果摘要，不持有第二份历史。
- `ChatSearchPanel.tsx`：时间/角色/片段、上一条/下一条、跨结果页继续、清空、停止/重试、空结果/扫描中分开。上下导航为 44px 按钮；输入 16px 避免手机输入缩放。
- `search-highlight.tsx`：NFC 原文范围映射，React 文本 mark + Markdown rehype AST；跨样式节点、段落和现有 assistant 分泡高亮，不拼接 HTML、不改原文/复制。链接地址、图片 URL 等不会因为匹配被高亮。
- `CapabilityDisclosure/CapabilityDetails`：仅命中公开读取部分时展开对应系统操作/工具子项；技术参数 disclosure 不自动打开，非搜索字段在目标搜索上下文不自动展示。活跃消息片段取当前窗口 `searchSegments`，不会把 regenerate 前的旧片段冒充当前正文。
- `BubbleList/chat-scroll`：局部调整原 Chat viewport 的 scrollTop，真实 ID 找节点，focus 使用 preventScroll；柔和目标框约 2 秒。短时间目标 pin 抵抗上方异步图片/展开增高，用户 wheel/touch/key/主动展开立即交还阅读权，此后继续原可见锚点机制。

打开前记录 `{owner, message_id, offset, following}`；没有跳转时关闭尽可能保留原位；跳转后立即关闭恢复书签；主动滚动/阅读后关闭留在当前位置。显式「返回搜索前位置」「回到最新」始终可用。following 书签回 latest；普通书签按同一 ID+offset 恢复，失效明确提示。

Escape、Header 返回/关闭、浏览器/Android Back 优先关闭搜索，焦点回入口。搜索使用同 URL 临时 history entry，不改变路由；已有可见图片/会话弹层优先消费 Back/Escape，关闭状态的 Popover 不阻挡。点结果后 blur 输入并将焦点移至消息，避免反复唤起输入法。

搜索打开/修改词/高亮不改变 `ChatAudio` 的会话 scope 或音乐身份，不发播放/detail 请求。只有实际活动窗口不再含当前媒体身份、切会话或离页时，沿用原 Audio Controller 生命周期。图片查看器、附件草稿、生成期间提前输入下一条消息的原回归仍通过。

## 6. 验证结果与性能

### 6.1 自动验证

| 范围 | 结果 |
| --- | --- |
| Penumbra 全量 Vitest | **147 个文件、2043 项通过，0 失败/跳过** |
| TypeScript / Vite production build | 通过；仍有 ChatView 大于 500kB 的分包提示，未为消除提示扩大本轮范围 |
| AionHome 相关合成回归 | **8 个文件、152 项通过**，含新增搜索/双键窗口 13 项及原 regenerate/公开投影/legacy/稳定性/媒体/provider-role 回归 |
| Chromium 合成浏览器 | **1280 / 390 / 320px 通过**，无页面 JS 错误；远古 ID 直接跳转、局部滚动、系统公开部分展开、迟到查询隔离、生成 HTTP 确认与旧窗隔离、立即关闭恢复/主动阅读关闭留位、浏览器返回、延迟高度变化与横向溢出均检查 |

新增后端测试 `A:tests/contract/test_chat_history_read.py`：同 T 61/101/501/1101 条，50 向旧/100 向新全量遍历；浮点/零/混合时间、非词典 ID；旧数组/before_id 成对校验；隐藏空扫描页继续；Unicode/Markdown/字面符号/secret 阴性；旧 system/MCP/Web/URL/music 的真实公开投影；篡改/过期/换词/换方向/跨会话/删除 cursor；regenerate 原 ID/时间；取消；新路由实际函数 AST + ASGI 只读合成 HTTP。

前端专项为 `message-history-window.test.ts`、`search-highlight.test.tsx`、`useChatSearch.test.ts`、`search-history.test.ts`，其余原 PR1–PR5 全量回归。额外覆盖不连续窗口、同 T 刷新、执行确认不被导航取消、迟到导航/reconnect 隔离、删除 tombstone、失效 cursor 显式恢复、反馈搜索文本刷新、IME/防抖/停止、可见文本与安全折叠字段。

后端测试在只复制源码的隔离目录运行，依赖装在忽略的 `P:node_modules/.pr6-python`。未安装摄像头运行库；非 Camera 回归用会在任何真实捕获调用时立即失败的 cv2 stub，不能将该结果当作 Camera 硬件验收。没有运行完整 AionHome 所有业务测试或启动原 main.py。生产环境需先安装更新后的 `A:requirements.txt` 两个纯文本解析依赖。

### 6.2 合成性能边界

探针：`A:tests/contract/bench_chat_history_read.py`，本机 Windows、Python 3.12.14、SQLite 合成库；不是部署机 SLA。首组同时间戳消息全部入库，唯一命中在最旧 `message-0`，跨所有续页验证确实找到；查询计划使用既有 `idx_messages_conv_id(conv_id,created_at)` 的双键范围，没有新建索引或临时排序。

| 合成消息量 | 搜索首请求 | 全扫描到最旧命中 | 请求数 | 最旧 ID around |
| --- | --- | --- | --- | --- |
| 1,000 | 139.04ms | 139.04ms | 1 | 3.10ms |
| 10,000 | 136.13ms | 1,408.26ms | 10 | 3.04ms |
| 100,000 | 147.58ms | 14,194.63ms | 100 | 2.85ms |

WAL 10,008 行含八条大工具结果：15 请求共 2,965.58ms，最长单请求 256.16ms；扫描同时完成 2,003 次合成写入，最长写事务 40.74ms，5ms heartbeat 的最大观测间隔 38.23ms。无并发压力的独立插入约 0.14–0.16ms。

tracemalloc 压力探针 1,008 行（同样含八条约 240k 字符工具结果），常见词 `body` 首请求 214.68ms，经过 4 次扫描请求于 769.45ms 得到 20 条结果且仍可续页；Python traced 峰值 4.76MiB，返回摘要 JSON 5,074 bytes。该值仅计本次探针的 Python 分配，不含 SQLite 原生内存、进程 RSS 或库初始化成本；不应当作硬内存保证。

WAL 独立只读连接每请求短事务，另一个连接并发插入；八条约 240k 字符的公开工具结果用于大字段压力。另测 tracemalloc 的有界内存及常见词结果响应。`约 200ms` 是合作式软预算：完整消息投影/Markdown/线程调度可能超时，不能硬中断已在工作线程中的一次 CPU 调用；取消在候选批次/消息间生效。4MiB 是已消费源字符串估计，不是进程 RSS 硬上限，预取、解析结构及单条超长消息可额外占用内存；单消息不静默截断。

关键词全扫描最坏 O(会话公开历史字节数)。测量不含真实网络、浏览器 120ms 续查间隔或生产负载。单一稀疏词的 100k 规模可能需要十余秒乃至更久才能完成，UI 在此期间持续显示扫描状态并允许停止；不存在「最近 N 条」隐藏截断。没有准确总数、跨请求强快照、永久 rowid 书签或后台索引。若部署验收要求更低的全扫描尾延迟，应单独设计安全公开投影索引并评审其回填/删除/regenerate/脱敏一致性。

## 7. 人工验收入口与方法

### 7.1 无私人数据的本地入口

在 P 运行 `npm run dev -- --host 127.0.0.1 --port 45361 --strictPort`，打开 `http://127.0.0.1:45361/tests/browser/chat-pr6-search.html`。fixture 使用真实 Workspace/Send/ChatWorkspaceView，mock fetch/SSE，1300 条合成消息，其中 600 条同时间戳；不会调用业务 WS、真实模型、上传或媒体网络。

搜索 `古老关键词` 定位 `message-2`；搜索 `公开系统关键词` 定位 `message-3` 的公开通知；`PRIVATE_DESTINATION` 应无结果。输入 `slow` 后立即改词模拟迟到请求。控制台 `window.pr6.generate()` 触发合成生成，随即跳旧消息，等生成完成后原窗口应仍在，点「回到最新」看到 `generated-assistant`。该函数只存在于测试入口。

自动 smoke：`node tests/browser/chat-pr6-search-smoke.cjs`，需要可用 Playwright；可用 `CHAT_PR6_PLAYWRIGHT` 指定模块目录、`CHAT_PR6_CHROMIUM` 指定 Chrome、`CHAT_PR6_ORIGIN` 指定本地 fixture origin。脚本无头运行，截图/报告写入忽略的 `node_modules/.pr6-artifacts`。本轮 fixture 服务为本地验证用途，非部署。

### 7.2 PC 检查

- [ ] 打开真实 Main Chat（后端先安装依赖），右上角搜索；长会话标题、菜单、浅深主题、窄/短窗口及 Reduced Motion 下布局/焦点正常。
- [ ] 仅首载最新 50 条，搜已知远古公开消息；Network 应直接 `window?anchor_id=...`，不从最新循环向旧请求。结果时间/角色/片段与原消息一致。
- [ ] 同时间戳大组双向翻页、多个同文不同 ID、上下结果跨页均无遗漏/重复；无命中时先显示扫描，直到完成才显示最终空结果。
- [ ] Markdown 样式/代码/跨段落高亮与复制一致；公开 system/MCP/Web/music 可搜；技术参数、私有字段、Camera、Thinking 等不可因关键词暴露。
- [ ] 生成和 regenerate 中打开搜索、跳远古并等待确认；不取消执行、不拼接旧窗/抢底部，不给旧尾消息错误 regenerate；回最新后仍满足原回执规则。
- [ ] 无跳转关闭、立即关闭、主动滚动后关闭、显式返回、书签删除、目标删除、断网/慢请求/401、file_synced/reconnect、快速两次跳转/切会话，均保留正确身份和草稿。
- [ ] 播放一首已加载音乐，再打开搜索/改词/高亮同一消息，不暂停或重取媒体；实际跳到不含该身份的窗口/换会话，按原生命周期处理。
- [ ] 图片延迟成功/失败、展开工具/代码、图片查看器与上下层 Back/Escape 后锚点稳定，页面祖先不随消息定位滚动。

### 7.3 手机真机检查（待人工执行）

- [ ] iOS Safari / Android Chrome 的 320、390px 及横屏：软键盘开合、安全区、搜索列表与 Composer 的可用空间；现有 visualViewport 布局没有双重缩高。
- [ ] 中文 IME 输入/选词/Enter 不提前查；快速改词/清空/关闭/返回后没有迟到结果或重复弹键盘。
- [ ] 点结果收键盘，消息可见；上一条/下一条触摸准确；触摸滚动后不持续吸回目标。
- [ ] 立即关闭回原位，主动阅读后关闭留位；Android Back 先处理图片/弹层再关闭搜索，再离开 Chat；iOS 返回和焦点恢复符合当前容器行为。
- [ ] 搜索期间保留附件草稿和下一条输入，现有图片 viewer/音乐播放/执行状态不被打断。

桌面 Chromium 的窄视口不等同真机软键盘、Safari、WebView 或音频输出验收；部署 Python/SQLite 性能与这些真机项保留人工确认。本轮代码保持未提交、未推送、未部署，等待验收。
