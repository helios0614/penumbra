# Main Chat PR4-B 实施记录

2026-10-24，等待人工验收。未 commit、push、部署。仅实施用户已确认的四类展示，不调整 Runtime、Prompt、命令执行顺序或业务副作用。

> 开工时 PR4-A 引用文档不在两个工作树内。本轮依据确认后的实施要求补记 [能力清单](./chat-pr4-capability-inventory.md)，不将本文件冒充原审计。

## 修改范围

前端保留既有 Chat workspace / send / canonical regenerate 控制器。新增 Message Domain 公开能力适配、Web receipt 适配、HEART 按需读取，以及少量纯 React 展示组件。Realtime coordinator 只增加能力失效通知的准确锚点队列，HTTP 回读后更新标记/结果，不从 WS 插入执行事实。

AionHome 修改限定为：

- `database.py`：已有 `messages` 增加 nullable `public_display`，HEART 增加 `(msg_id, conv_id)` 查询索引。没有新事件表，没有历史数据反推回填。
- `chat_public_display.py`：生产者公开字段工厂、安全 HTTP 投影、HEART 存在性读取。
- `routes/chat.py`：公开历史视图、单消息公开读取、记忆/TOY/结果批次元数据、AI 结果准备/成功响应证据。
- `activity.py`：捕获已有触发条件、写入公开投影；HEART 与实际 Assistant 共用预生成 ID。原 Prompt 内容不变。
- `location.py` / `camera.py`：为原触发行保存安全来源、位置 old/new 与明确 fallback 分支；没有改 sentinel 或 core Prompt。
- `schedule.py`：为已有操作通知、唤醒与已有监控失败通知写入公开元数据。不为仅日志中的失败增加影响模型历史的 system 行。
- `reply_result_execution.py`：记录 Activity 实际消费的条数上限，摘要与执行行为不变。
- `music_commands.py`：记录实际选曲结果的结构化状态，不解析结果文本猜成功。
- `routes/heart_whispers.py`：by-msg 读取要求存在同会话真实 Assistant，旧孤立记录不会被临近消息消费；长期心声列表与存储保留。

公开列在生产者已有事务中写入，不额外 commit/broadcast；原 message ID、role、content、created_at、cache_region 和持久化行顺序保留。Activity Assistant 改用此前供 HEART 预生成的实际 ID，这是本轮明确要求修复的错锚例外。

## 四种内容与共享 UI

| 组件 | 责任 |
| --- | --- |
| `TriggerAnnotation` | 轻量时间线前提，显示真实触发类型、条件和已捕获时间 |
| `SystemOperation` | 图标、动作、正文摘要、必要状态；有正文详情才展开 |
| `CapabilityDisclosure` / `CapabilityDetails` | Paper/Mist 展开容器、纯文本/JSON、安全全文复制、长内容内部滚动、键盘焦点 |
| `ToolResult` | 复杂结果与各调用状态，不理解或执行命令 |
| `HeartMarker` / Bubble 消息标记 | HEART 按需读取，Reaction 准确附着 |
| `CapabilityExpansionProvider` | 仅保存本次 Chat 生命周期的展开 UI 状态，按原消息/receipt/调用索引区分，不含业务结果 |

普通操作不加整块背景/阴影；多个连续操作沿时间线排列。复杂结果默认折叠。头部最多显示 96 字预览，完整安全内容仍留在详情与复制值中。正文使用纯文本，远端 HTML/脚本/图片不会执行或加载。每个长字段最多 18rem 后内部滚动，换行与长 JSON 不撑破窄屏。

Main 与 Diary 没有合并控制器；DRIFT、THINKING、Assistant 原错误正文和结果未知保护沿用原实现。旧 mock 的播放器/DOM renderer 未移植到 Main Chat。

## 执行事实与公开内容的四层边界

| 层 | 本轮处理 |
| --- | --- |
| 原始执行结果 | 仍归原后端 executor；不把未经审查的 runtime 对象发送给 UI |
| 后端已保存结果 | MCP 沿用现有脱敏、每条/批次保存上限与 `original_length`、`storage_truncated`；其他结果在原消息上增加公开事实 |
| 实际准备给 AI 的结果 | 保留原 `ai_result` 与 Token Budget，不从更大的保存结果补回上下文；原 synthetic user Prompt 不变 |
| 用户阅读/复制内容 | HTTP allowlist + 递归敏感字段过滤 + 凭据脱敏；完整可公开的保存结果与 AI 有界结果分别可读、可复制 |

既有 MCP 限额仍为每批 AI 结果 32,000 字符、每条保存上限 256,000 字符、每批保存上限 1,000,000 字符。原始执行结果可能更大；达到保存上限的部分不能通过 UI 恢复，实际可给 AI 的内容继续受原预算分配约束。

Main 历史读取使用 `public_view=true`；旧 HTTP 默认视图继续供 legacy 使用，AI 直接从原持久化内容恢复。新公开 endpoint `GET /api/messages/{id}/public` 只读取已有 ID，用于精确更新已加载的旧锚点，沿用应用会话鉴权。

新版投影不透传私有列、原截图、Evidence 或未筛选的 args。旧 system 原文按后续“旧历史兼容优先修正”脱敏后折叠阅读；包含旧版已可读的 Prompt 说明不再是关闭理由。旧记忆写入失败保留脱敏错误详情，新版生产者仍使用明确公开字段。AI 原文、预算和持久化保持原契约。

AI 交付说明独立于工具成功：

- `response_received`：现有 `stream_reply` 已验证并释放本次成功续写响应；不声称 AI 阅读了超出预算的全部保存内容。
- `prepared`：已准备本次续写输入，无法证明交付；错误时工具结果仍保留。
- `not_included`：已有 `ai_included=false`，因预算未注入并停止续写。
- `not_requested`：本批跳过/没有可续写输入，没有发起续写。
- `unknown`：旧记录或没有充分交付证据；不能倒推已交付。

## MCP 两级阅读

复用 `mcp-result-ui.js` 的信息规则：JSON 格式化、纯文本安全显示、独立展开/收起/复制、每条结果、部分失败、参数变化、保存截断、AI 截断/未注入、历史展开身份。没有移植全局 DOM 操作、旧生成状态机或 regenerate 行为。

能确认的字段优先提炼：实际执行参数中的 `title/content/body/text` 分别作为调用标题/正文；标准 `content[]` 中的 text block 提炼为结果正文。标签只表述调用内容，不根据工具名宣称“发帖成功”或“文件写入成功”。

未知 schema 仍完整展示安全调用参数、与原参数不同的实际执行参数、已保存结果、错误、AI 有界结果及所有预算说明。即使提炼失败，也不会只剩成功摘要。MCP 保持 server/tool 标识，调用状态与业务回执区分。POI/Route 沿用原 adapter 的实际候选和路线正文，不制造地图链接或导航状态。

只显示已保存内容；历史上已经截断的部分不会恢复，也不会自动重试工具。已保存的安全正文不会为了卡片摘要被再次截断。

## 实时与历史恢复

- WS 的 `msg_created/updated/deleted` 继续按现有策略失效；新增消费现有 `reaction/heart_whisper/web_search_result` 为能力失效通知，事件类型/payload/timing 没有改。
- Reaction 使用真实 target/source；HEART WS 即使没有 conv_id，也只按 msg_id 回读已加载的准确消息，不猜最后一条。
- SSE 期间或 HTTP 读取中到达的能力通知按锚点去重排队，结束后回读，覆盖已加载但不在最近 50 条窗口内的消息。失败保留锚点供后续重读，不自动执行命令。
- 能力回读只更新对应消息的 capabilities，保留正文、顺序、分页游标与 canonical regenerate 身份。WS 重放不会新增消息。
- Search receipt 保持原 Assistant source_message_id；URL Reader 保持原用户 event ID/sequence；二者不互换锚点，不把 Evidence 当结果正文。
- 刷新后从 HTTP/持久化恢复事实；展开 UI 默认恢复为折叠。相同身份在本次组件生命周期中的回读/分页重渲染不丢展开状态。
- 有准确 msg_id 的 SSE MCP loading 仅表示临时“调用中/结果待确认”；只有 loading 时没有成功结果。缺少可证明关联的 WS loading 不被挂到当前屏幕消息。
- HEART 默认只读取存在性与由真实 whisper ID 集合构成的 revision；点击才请求全文，关闭/切换时中止晚到响应。canonical regenerate 保持 Assistant ID 但替换 HEART 时，旧全文入口关闭，避免显示缓存的旧心声。Activity 新 HEART ID 正确；旧孤立数据不按时间补挂。

## 验证记录

所有 HTTP/WS/模型/设备测试使用合成输入和可丢弃 SQLite，没有在真实设备、远端 MCP 或外部网站重放命令，也没有修改用户数据库。

| 检查 | 结果 |
| --- | --- |
| `npm test -- --reporter=dot` | 125 文件，1814 项通过 |
| `npx tsc -b --pretty false` | 通过 |
| `npm run build` | 通过；Vite 提示 Chat chunk 约 520 kB，未在本轮扩展拆包范围 |
| 新增后端公开投影/生产者回归 | 11 项通过：真实摘要与私有包装分离、MCP 脱敏/交付、工具成功但模型失败、记忆真实 ID、原 Prompt 精确相等、Activity HEART、日程消费事实、Wi-Fi 历史年龄 |
| 后端组合专项 | 366 项，364 通过、2 项 HEAD 基线失败；随后 WS 元数据隔离/公开生产者/结果批次/canonical regenerate 的 49 项专项通过 |
| PR4 真实 Chromium | 桌面 1440×1000、手机 390×844，通过；已查看折叠与展开截图 |
| PR3 真实 Chromium 回归 | 桌面/手机通过：会话、草稿、插入、分页、并发 WS、重生成/结果未知和主页导航 |
| Chat stability 真实 Chromium | 桌面/手机通过；同步 system 真实锚点与安全 DTO 断言，工具结果和续写错误分别保留 |
| 两仓库 `git diff --check` | 通过；完成时再次核对工作区，无 commit/push/deploy |

后端组合命令使用 `aion-chat/.venv/Scripts/python.exe -m pytest -q`，选择以下 contract 模块：`chat_public_display`、`chat_public_producers`、`command_runtime_production`、`reply_result_batch`、`schedule_safety/context/publication_state`、`reaction_contract`、`web_search_feedback_ui`、`url_reader_first_entry`、`canonical_regenerate_route`、`camera_core_frozen_llm_binding`、`location_mcp_secret_projection`、`activity_proactive_greeting_prompt`、`activity_initial_frozen_llm_binding`、`location_core_frozen_llm_binding`。使用独立 `--basetemp`，避免本机默认 pytest-current 链接权限错误。

已知基线失败均在 AionHome HEAD `0678ad1` 的独立副本中复现：

1. `test_real_main_mcp_chain_d_plus_one[5]` 的短轮询等待未覆盖最终后台持久化完成。
2. `test_schedule_context_builder_schedule_and_diary_import_without_side_effects` 的旧 database stub 缺少 `get_db_readonly`。

另外独立运行 Activity/Location 两组旧 fixture 时，5 个早期失败路径断言与当前 append runtime 行为不一致；同样在 HEAD 副本复现，在上述组合运行中通过。保留此测试隔离局限，不通过改运行时来迁就旧断言。

验证日志与截图保存在本地 `C:/Users/Admin/.codex/visualizations/2026/10/24/01a16de5-d201-7772-bc24-dcbf56728b89/pr4-verification/`。这些是合成 UI 验证证据，不代表真实外部业务回执。

## PC / 手机人工验收清单

本轮已在真实 Chromium 操作并查看布局：

- [x] 连续 12 条记忆操作默认没有卡片堆叠、阴影；操作行本体小于 45px，窄屏状态/箭头可见。
- [x] 自由活动显示真实阈值/间隔，位置变化显示原状态变化；旧未知 system 按后续兼容修正折叠阅读，不据文字推断新的触发事实。
- [x] 记忆展开可复制实际正文；结果展开、收起和 HTTP 重渲染保持准确身份。
- [x] 14 万字符级合成结果可完整复制；长文本/JSON 独立滚动、可聚焦，无横向溢出。
- [x] MCP 实际调用正文、安全通用参数、失败/跳过、AI 截断/未交付说明可读。
- [x] Search/URL 使用各自 receipt；续写错误与工具结果同时保留。
- [x] HEART 默认未请求正文，点击才读取；不显示其他 msg_id 的内容。
- [x] Reaction WS 重放、历史分页后旧锚点更新、刷新后恢复，消息不重复；网络记录只有 GET。
- [x] PC/手机 Chat 输入区固定，原 PR3 导航/草稿/结果未知保护通过回归。

交付后仍需人使用已授权的真实环境验收：

- [ ] 在后端正常初始化新增列后，等待一次真实 keepalive、Activity/Location Sentinel 和 Camera Sentinel；核对触发条件与真实观察，确认原模型 Prompt 未变。
- [ ] 对真实记忆、日程、Activity、Location、CAM_CHECK、已授权 MCP 分别展开并核对执行内容/返回回执。
- [ ] 用真实断线、重连和 canonical regenerate 确认外部工具事实仍在；不为了验收重复执行有副作用的旧命令。
- [ ] 验证已连接设备/账号的权限、字体与用户当前主题；本轮合成测试没有访问设备或账号。

## 持久化与身份限制

旧 system 已知封闭通知格式只读兼容，其余旧版已可读文本采用脱敏原文折叠。无法分类不妨碍阅读，但不从中猜旧记忆 ID、缺失触发条件或 ACK。未保存 URL 尝试、仅 WS 的设备操作/loading，以及旧孤立 Activity HEART 无法追溯补齐。

新投影需要 AionHome 正常初始化新增列；本轮没有在用户数据库执行 migration 或启动生产服务。没有新增持久化事实的旧后端会得到保守兼容展示。by-msg HEART 读取屏蔽孤立记录，长期心声列表仍保留原记录，不修复、不删除。

未知 MCP 自由文本仍按既有安全结果来源和通用脱敏规则公开；本轮不声称理解全部远端业务 schema。Camera 只公开执行与触发事实，未获批准的画面细节不进入 Chat。没有硬件 ACK、实际网络记录或业务回执时保持未知。

本轮未实现全局事件数据库、命令重构、MCP 重试机制、完整播放器/设备控制、附件/全文检索、PR7 日志/Markdown 精修、部署整合或旧前端移除。

## PR4-B Follow-up：旧系统通知与 Reaction 收口（首次记录）

本节保留首次收口的问题定位和验证过程。其中关闭未知 system/旧 Prompt 的策略，已由末尾“旧历史兼容优先修正”替代。

### 实查原因，分别处理

| 检查 | 证据与结论 | 本次处理 |
| --- | --- | --- |
| 当前运行版本 | Penumbra 本机代理指向 `127.0.0.1:18080`；`/api/messages/{id}/public` 返回 404。历史 `public_view=true` 仍有原始 system content，抽样最近 100 条的 11 条 system 均无 `public_display`，其中 1 条有结构化 MCP carrier | 未重启服务。公开 DTO 增加 `public_view_version: 1`；旧版前端降级提示明确需要配套后端 |
| 已更新代码读取旧数据 | 原投影在 `public_display` 为空时仅恢复 tools，其余统一未知，漏掉旧生产者明确的记忆/日程回执 | 后端新增 `chat_legacy_display.py`，完整匹配经核对的固定通知格式，再统一脱敏；只读，不回填 |
| 前端缺少新字段 | Mapper 原先只在新 capability 字段存在时适配；Presenter 清空 system 正文，导致独立旧 carrier 也未展示 | system 与有 MCP carrier 的 Assistant 均进入适配；新增独立 `legacy-tool-projection.ts`，不解析 system.content |
| 新生产者写入 | 既有 PR4-B 记忆、日程、Activity、Location、Camera 生产者已接入；专项验证新消息含公开投影。MCP 有意继续使用原 carrier，公开列为空并非丢失结果 | 未发现需改变执行路径的普遍漏写；列未正常初始化时 `save_display` 保持原兼容 no-op，新触发条件仍要求正常初始化后保存 |

没有把上述情况归为单一原因，也没有通过重新执行旧命令来补显示。

### 只读兼容范围与公开边界

当前优先级为可信 version 1 `public_display`、已有结构化工具结果/确定模板、脱敏旧原文、无内容占位。HTTP 历史与单条公开读取共用同一投影，保留原 ID、时间、顺序和其他消息锚点。

| 旧格式 | 可恢复事实 | 无法恢复/不公开 |
| --- | --- | --- |
| `[记忆写入] 已将「…」写入记忆库（重要度 …）` | 原通知正文、合法重要度、明确写入完成 | memory ID、未记录关键词；不再补日期或从正文猜 ID |
| `[记忆写入失败] …` | 明确失败类别与脱敏后的原错误详情 | 凭据值仍隐藏，不修改私有原文 |
| 固定“添加了/完成了待办”回执 | 正文、已添加/已完成 | schedule ID、截止日等未记录字段 |
| 固定“设置了日期时间的闹铃/日程/查岗”“取消了日期时间的闹铃/日程/定时监控”回执 | 原时间、正文、明确动作完成；日期须合法 | 跳转对象、实时状态、未消费日期 |
| 封闭 MUSIC 成功/失败行块 | 关键词、歌名/歌手、已取得地址或明确失败原因，混合结果为部分失败 | 不恢复播放器、不公开播放地址、不声称开始播放 |
| system / Assistant `mcp_tool_calls` | 安全参数、实际执行参数、已保存结果、错误、显式调用状态、保存/AI 截断信息 | 不展示 raw_command；缺少交付证据保持 unknown，不按工具名宣称业务成功 |
| Web / Reaction / HEART | 原独立安全字段、原身份与存在性契约 | 不用 system 原文推断锚点，不补孤立 HEART |

完整格式匹配与模糊关键词识别分开：emoji 包装、说明前缀、非法时间等不推断业务类型，转入脱敏原文阅读。`[delayed]` 只去掉展示前缀；旧 Activity/Location/Camera system 提示可阅读。隐藏角色及 raw 附件不恢复。数据库旧消息、原模型 Prompt 和 AI 结果预算均未修改。

旧后端仍返回 raw DTO 时，独立工具字段使用安全详情，system 文本使用浏览器脱敏原文兜底，浏览器不解析命令业务。保留调用层成功与业务回执的区别，旧记录不推断已向 AI 交付。配置秘密完整过滤依赖服务端，浏览器没有该列表；已清空原文的旧公开后端仍需要配套更新。

### Reaction 布局

提取纯 `BubbleSegment`，将真实 Reaction 附着于对应用户消息最后一个文字气泡的右下角，右侧内收 12px（人工验收要求预留 10–14px）、向下覆盖 10px。复用 `AI_BUBBLE_SURFACE` 雾蓝样式，轻边界、无新增阴影；为正文和下方内容留出空间。emoji、target/source、SSE/WS/HTTP 恢复与状态控制器不变，不新增独立消息行。

### Follow-up 验证与待验收

| 检查 | 结果 |
| --- | --- |
| 前端全量 | 126 文件、1818 项通过；覆盖旧/新 DTO、system 和 Assistant 旧工具 carrier、安全脱敏与真实 Reaction 绑定 |
| TypeScript | `npx tsc -b --pretty false` 通过 |
| 生产构建 | `npm run build` 通过；原 Chat chunk 大小提示仍在，约 522 kB |
| 后端相关专项 | 244 项通过：legacy/public display、真实生产者、reply result batch、canonical regenerate、Web/URL、Reaction、schedule safety |
| 两仓库 diff | 工作区与暂存区 `git diff --check` 通过；无 commit/push/deploy |
| 真实 Chrome 合成验收 | 1440×1000、390×844、320×740；无横向溢出。短/长/多段用户气泡贴纸均为 absolute，正文与贴纸无覆盖，错误 target 无贴纸，刷新后三个准确 target/source 与 emoji 保持 |
| 安全结果交互 | 旧/配套 DTO 的工具结果均可展开；4936 字符安全结果完整复制，手机结果区域内部滚动。内部 Prompt/测试凭据不可见，保存与 AI 截断、交付未知分别展示 |

合成入口为 `tests/browser/chat-pr4-followup.html?mode=paired` / `?mode=old`，使用真实 Mapper、Presenter、BubbleList、Bubble 与样式；fixture 来自后端公开投影的合成数据，不连接模型或外部工具。日志及桌面/手机截图保存在 `C:/Users/Admin/.codex/visualizations/2026/10/24/01a16de5-d201-7772-bc24-dcbf56728b89/pr4-followup-verification/`。

- [x] 已知旧记忆、待办、闹铃恢复为紧凑完成行，展开保留真实安全详情。
- [x] 旧 MCP 没有新列时结果不丢失；新 public_display 优先。
- [x] 旧 Activity/Location 与无法确认业务类型的 system 脱敏折叠阅读，不猜执行状态。
- [x] 旧版后端原文可兜底阅读；已清空原文时明确需要配套更新，前端不自行解析旧命令业务。
- [x] PC/手机短长气泡、末段附着、跨消息绑定、刷新恢复通过实际布局检查。
- [ ] 人工在配套运行版本中重新打开真实旧历史，核对内容与日程通知、Reaction 位置；本轮按要求未重启/部署后端。

## 旧历史兼容优先修正与专门矩阵

本次按用户明确指示调整旧数据的默认策略，不将 Prompt 知识产权保护作为阅读限制。新版生产者的结构化安全投影仍优先，已有工具 carrier 保持完整安全详情，旧模板确定性映射；无法识别类型的旧 system 提示说明改为“旧版系统内容”轻量折叠行，展开后可阅读、复制纯文本。旧记忆失败也保留脱敏后的原错误。

丢失位置已修正：`chat_public_display.project_message` 原先在找不到投影时生成占位并清空 content；现在先调用 `legacy_text_display` 将脱敏正文装入 `public_display.fields`，再清空 raw content。HTTP 历史和单条回读均使用此逻辑，不依赖前端猜测丢失的文本。原数据库/AI 上下文不变，不回填、不执行命令、不改变 SSE/WS 身份。

新增纯适配 `legacy-system-projection.ts` 用于仍返回 raw system 文本的旧后端，只有凭据脱敏和折叠原文，不复制后端命令状态机。共享展示增加 `LegacySystemContent`，复用 `CapabilityDisclosure/CapabilityDetails`；旧文本不显示“已完成”或“结果未知”标签，不伪装执行结果。Reaction 的真实 target/source 与气泡右下角贴纸、AI 雾蓝表面保持原实现。

安全边界仍在：

- 凭据字段、配置秘密、Bearer/API Key、完整 Authorization/Cookie 行、带空格的引号密码均脱敏；JSON 的 Prompt/context 正文可读，credential 子结构隐藏。
- React 文本节点与 `<pre>` 安全转义 HTML，Markdown 作为文字，不执行 `<script>`、图片事件或 `javascript:` 链接；不使用 `dangerouslySetInnerHTML`。
- 旧模板字段与未知原文最多展示 256,000 字符，明确标出展示截断；展开才挂载，正文 max-height 288px 并可键盘滚动，原库/AI 原文不截断。
- 三个 Camera 隐藏角色和 raw 私有列/附件继续不公开；嵌入的 image data URI 替换为隐藏标记。没有文本/执行结果或 JSON 结构过深无法安全处理时保留说明，不因单条异常拖垮整页历史。
- 两个读取接口仍经过 `main.py::auth_middleware` 原会话鉴权，未改 endpoint、鉴权豁免或 push-token allowlist。

### 同组旧/新阅读对照

合成矩阵源为 AionHome `tests/fixtures/chat_legacy_matrix.json`。运行前端 `node tests/browser/generate-chat-legacy-matrix.cjs <AionHome/aion-chat>`，在隔离 VM 中执行真实 `static/chat.html::renderMessages` 和 `mcp-result-ui.js`，生成旧 HTML、后端真实公开 DTO 与旧渲染函数 SHA-256。不会启动后端、读用户 DB 或调用工具。前端和后端各有矩阵回归；旧 HTML 对照页 iframe 禁止脚本。

| 分组 | 旧前端可读记录 | Penumbra 保留有意义内容 | 仅剩占位 |
| --- | ---: | ---: | ---: |
| 新版结构化 | 1 | 1 | 0 |
| 旧记忆与写入失败 | 2 | 2 | 0 |
| 闹铃/日程/查岗/TODO/完成/取消 | 7 | 7 | 0 |
| MCP / POI / Route | 3 | 3 | 0 |
| Activity / Location / Camera | 3 | 3 | 0 |
| 自由活动与位置主动问候 | 2 | 2 | 0 |
| MUSIC | 1 | 1 | 0 |
| 自定义文本 / HTML / 凭据 / JSON Prompt | 4 | 4 | 0 |
| 合计 | **23** | **23** | **0** |

矩阵另含一条空记录（无可读内容，保留占位）和一条 `cam_trigger`（两边均隐藏），不计入旧前端可读分母。凭据值按要求隐藏不属于通知丢失。上述 **0/23** 是合成矩阵统计，没有扫描全部用户历史；损坏/空正文、原库已丢失结果、未持久化事件和已清空原文的旧后端仍不能由 UI 恢复。

### 本次验证

- 前端全量 127 文件、1847 项通过；TypeScript 与生产构建通过，保留原 chunk 体积提示。
- 后端相关专项 279 项通过，包含旧矩阵、公开投影、生产者、结果批次、canonical regenerate、Web/URL、Reaction 与 schedule safety。使用 `python -X utf8 -m pytest`；首轮默认 GBK 导致两项既有测试日志写入 emoji 失败，UTF-8 模式复跑全部通过，无运行时修改。
- 1440×1000 / 390×844 实际浏览器检查折叠原文、Activity/Location 提示、复制成功提示、HTML 安全、连续操作行和长正文内部滚动，均无横向溢出；旧 HTML 对照页可读。复制只核对成功提示与页面正文，不输出用户剪贴板。
- Reaction 实现本次未改，原右下角/雾蓝背景人工截图保留，真实 emoji、末段附着和 target/source 的自动回归通过。收尾浏览器控制中断，未将未完成的第二次 Reaction 布局复查记作通过。证据保存在 `C:/Users/Admin/.codex/visualizations/2026/10/24/01a16de5-d201-7772-bc24-dcbf56728b89/pr4-legacy-verification/`。
- 两仓库工作区/暂存区 diff 检查通过；保留用户原暂存内容，本次增量未暂存。未 commit、push、部署、回填或重新执行命令，等待人工验收。

## 旧系统通知语义提取与折叠预览

本轮在已恢复原文的兼容策略上补语义，不改变旧记录可读性。只调整 HTTP 公开展示数据和共享折叠行：AI 历史上下文投影、原 messages.content、Prompt builder、执行顺序、持久化和实时身份均不变。

### 确定性模板与未覆盖变体

模板直接核对 `routes/chat.py::perform_memory_write/_prepare_reply_result_batch`、`activity.py::perform_memory_write_activity`、`schedule.py::execute_schedule_commands`、`music_commands.py::execute_music_commands`、`prompts/activity.py::build_activity_follow_up_prompt`、`prompts/location.py::build_location_follow_up_prompt`、`prompts/camera.py::build_camera_follow_up_prompt`，以及 Camera / Location / schedule 的旧 system 生产句。

- MEMORY_WRITE 完整匹配外层「正文」及重要度后缀，允许正文包含嵌套引号、换行和类似后缀的文字。仅取最外层真实后缀，不从正文提取 memory ID。成功行显示“已写入记忆 · 重要度 X”和正文；失败保留脱敏原异常详情。
- 日程 / TODO 沿用完整固定模板和合法日期校验，预览正文，日程摘要显示原时间。固定日程闹铃触发句提取提醒正文；定时监控失败仅支持生产者的两个封闭原因，提取原计划正文（允许括号与换行）。
- Activity 成功要求完整的“设备活动动态、摘要覆盖区间、【设备活动动态】”包装；Location 成功要求完整“实时位置信息”包装；CAM_CHECK 成功要求完整“实时监控画面已附上”回执。提取实际摘要/位置/文字回执，展开同时保留旧通知全文，附上原结果不代表当前实时状态的说明。
- 三种操作的固定失败包装支持真实失败原因；只有显式“已跳过：”才显示 skipped。旧监控短句只能归为查看记录，不能据此证明画面或设备 ACK，状态仍未知；Location Sentinel 警报旧句也不补 old/new 或具体触发条件。
- MUSIC 完整块继续按真实成功/失败/部分结果展示，折叠优先预览实际歌曲与歌手；关键词和原结果块保留在详情中，不增加播放器。

未确定性解析的内容包括：缺少完整 Activity/Location/CAM_CHECK 包装的标题加正文、动态自由活动/夜间/位置问候 Prompt 的各类变体、带说明前缀/emoji 包装的近似通知、非法日期/重要度、额外尾句、未支持的监控失败原因、多行或非封闭 MUSIC 行块。这些均回退完整安全文本及预览，不推断业务成功、不退化为无信息占位。

### DTO 与共享 UI

读取公开投影可附加 `summary`、`preview`、`preview_lines: 2`，不新增数据库列、不回填旧记录。已保存的可信 public_display 仍优先；新字段不改变原结构化记录内容。旧模板的详情和预览先统一凭据脱敏，再分别限长：详情沿用 256,000 字符展示上限，预览最多 240 字符加省略号；完整详情不从预览反推或截短。

`CapabilityRecord` 在纯 UI 模型中映射为 `summary/preview/previewLines`。`CapabilityDisclosure` 增加原操作行的两行预览布局；`SystemOperation/ToolResult/LegacySystemContent` 复用它。未知文本即使没有新增 preview 字段，也从已有安全详情取预览，避免旧公开后端再次只剩标题。原展开/收起、复制、滚动和身份缓存不变；React 文本节点继续安全转义 HTML，未增加历史卡片视觉。Reaction 右侧内收 12px 的贴纸实现未改。

有限业务解析在后端，需运行包含本次公开投影的 AionHome 才能获得新增语义字段；旧后端仍可显示脱敏原文预览，前端不自行补推业务。原文已被旧公开接口清空的响应仍无法凭空恢复。本轮不重启或部署后端。

### 本轮回归

覆盖真实 Prompt builder 产生的旧包装、嵌套引号/换行/相似后缀、固定失败与 skipped、时间与重要度、模糊格式安全回退、预览凭据过滤、完整正文独立保留、MUSIC 真实选曲预览、新旧 preview DTO 和 HTML 安全转义。旧/新同组合成矩阵仍为 23/23 可读，退化占位 0 条。

| 检查 | 结果 |
| --- | --- |
| 前端针对性回归 | 3 文件、50 项通过 |
| 前端全量 | 128 文件、1854 项通过 |
| TypeScript | `npx tsc -b --pretty false` 通过 |
| 生产构建 | `npm run build` 通过，保留原 chunk 体积提示 |
| 后端专项 | 305 项通过，含新语义 parser、旧阅读矩阵、公开投影/生产者、结果批次、canonical regenerate、Web/URL、Reaction、schedule safety |
| 两仓库 diff | 工作区、暂存区与新文件空白检查通过；未执行暂存、commit、push 或部署 |

日志保存在 `C:/Users/Admin/.codex/visualizations/2026/10/24/01a16de5-d201-7772-bc24-dcbf56728b89/pr4-semantic-verification/`。按用户要求，本轮**不做浏览器视觉验证**，PC/手机视觉效果交由人工查收。
