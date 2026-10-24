# PR4 系统通知与 MCP 视觉精修

2026-10-24。以用户提供的六张真实聊天截图为人工验收参考。本轮未做浏览器视觉验证，未 commit、push、部署或重启服务，等待人工验收。

## 范围与契约

前端修改共享能力展示组件、Chat CSS 和展开时的阅读位置保护。旧通知语义补强位于 AionHome 现有 `chat_legacy_display.py` 与 `chat_public_display.py` 的只读公开投影中；前端不增加第二套业务解析器。

没有修改 Provider、Runtime、Prompt、MCP 执行和结果注入、模型发送与 canonical regenerate、数据库或 `public_display` 存储、SSE/WS/HTTP 消息身份与时序。没有读取真实用户数据库、补写历史、请求模型或重放工具。既有脱敏、历史展示上限与保存/AI 预算边界保留。

## 展示与阅读

- 普通系统操作、已识别旧通知、未知旧原文、MCP 批次共用透明轻量行。图标、标题、摘要、预览、状态和箭头沿用同一网格与行高；无外层胶囊、厚阴影或整卡边框。
- 按 DTO 的可靠 capability 选择 Lucide 图标，包括记忆、日程、TODO、Activity、Location、Camera、MCP、Web/URL、Music；未知记录为 FileText。不扫描正文关键词。触发提示保留独立时间线 note，自由活动仍用低权重 Sparkles。
- 单项调用由批次顶层一次展开直接进入详情，沿用原 `message/receipt:call:0` 身份。多项调用保留批次概况与各调用独立展开、状态；原调用展开缓存不变。
- 优先展示已有 Mapper 提炼的调用标题/正文、结果正文与错误。有标准 text block 时，完整保存 JSON 移入技术详情；异构结果没有可提炼正文时，安全保存结果仍直接可读。调用参数、实际执行参数、结果原长度与 AI 有界结果在技术详情按需查看，未删除字段。
- 仅当“本次 AI 有界结果”和“已保存结果”的非空安全字符串逐字相等时简写“内容与已保存结果一致”；不做忽略空白、相似度或工具名推断。简写仍复制完整 AI 字段。不同结果各自完整保留。
- AI 是否送达的说明独立显示；文本相等不改变 unknown、prepared、response_received、not_included、not_requested 等事实。调用层成功也不宣称远端业务完成。
- Paper/Mist 详情采用暖背景与淡雾蓝混合表面，单层轻边界，无内层白卡。手机内容区最大约 44dvh，桌面最大为 42rem/60dvh 中较小值，并随已有 VisualViewport 高度缩小；短内容保持自然高度。
- 只有顶层详情内容区滚动。各字段、技术详情、多项调用内部不再另设滚动区；批次标题和状态在外，各调用标题在同一滚动区内 sticky。原生滚动条隐藏，区域可聚焦以键盘滚动，长正文/JSON 自然换行，无新增数据截断。
- 详情展开前向现有 Chat 阅读跟踪器发出本地 DOM 通知，暂停自动跟随并捕获当前消息位置；不会触发业务事件、改变历史锚点或主动滚到底部。主动滚回底部后仍可恢复自动跟随。
- Composer 仍由原 ChatShell 的 flex 布局占位，详情末尾有内边距。共享 DetailField 移除独立滚动后，HeartMarker 仅同步使用一个有界外层，避免该共享使用方失去原长内容保护；按需请求与缓存契约未改。

## 旧通知为什么降级

对照了当前 `routes/chat.py`、`activity.py`、`schedule.py`、`camera.py`、`location.py`、`prompts/activity.py`、`prompts/location.py`、`prompts/camera.py` 的真实通知生成句，以及已有旧历史合成样本。

1. 原后端将完整模板匹配同时用于类型识别、字段提取与状态确认。记忆缺少合法重要度/固定后缀，Activity 缺覆盖区间及摘要包装，Location/Camera 使用旧版正文时，整个记录退回 legacy-text。
2. 普通通知遇到 `[delayed]` 会跳过完整回执解析；外层空白和 CRLF 也可能破坏原 fullmatch。
3. 已存为 legacy-text 的通用 DTO 原先被当作有效公开投影直接保留，即使其安全原文字段含可靠通知标记。
4. 前端 Mapper 保留后端提供的 capability，没有再次猜测。仍返回 raw system 文本的纯旧后端，前端仅脱敏与原文预览，不进行业务识别。

改为两层处理：完整的已知生产者回执继续提取字段并确认原有状态；不能完整提取时，现有原文 fallback 用有限通知标记表识别类型，复用同一 TODO/日程 envelope。类型降级只调整名称、图标及预览，状态保持 unknown，完整脱敏原文仍在详情中。无可靠记忆 ID、日期或重要度时不补造字段。

| 覆盖范围 | 不完整时的处理 |
| --- | --- |
| `[记忆写入]`、`[记忆写入失败]` | 即使缺后缀、重要度或错误正文，也保留“记忆写入”，不宣称成功 |
| `[ACTIVITY_CHECK 成功/失败]`、`[Location 成功/失败]`、`[CAM_CHECK 成功/失败]` | 不要求当前版本的完整正文包装才能保留类型；无法确认完整回执时状态未知 |
| `[MUSIC 成功/失败]` | 缺完整选曲回执时保留选曲记录，状态未知，不声称开始播放 |
| TODO、TODO_DONE 的固定生产者 envelope | 兼容空格/tab、换行正文及冒号变体；缺正文或 delayed 包装时仍可保留类型 |
| 设置/取消闹铃、日程、查岗/定时监控 | 非法日期、缺正文或旧类型文案只影响字段/结果确认，不使类型丢失 |
| 固定日程闹铃触发、定时监控失败前缀 | 无法识别完整原因/计划时保留提醒或监控类型与原文，不制造回执 |
| 包装 | 兼容外层空白/BOM、CRLF、delayed、有限装饰标记及标记内空白；装饰标记不作为状态依据 |
| 嵌套引号和长文本 | 继续由完整模板提取最外层字段；提取失败也保留类型和安全原文 |

新版明确类型的 producer DTO 始终优先。只有明确为 legacy-text 且状态未知的旧通用 DTO，才从其安全“旧版系统原文”字段补类型。损坏或缺失原文字段不抛异常、不猜类型。

旧/新对照矩阵仍为 23/23 可读、0 条可读内容降为占位；其中 Activity、Location 两条历史样本由通用标题恢复为对应操作，状态继续未知。这是合成样本统计，不是全部真实历史的覆盖率。

剩余通用 fallback 的具体原因：矩阵中的自由活动说明和位置主动问候缺少可验证的通知 envelope；自定义通知、HTML/Markdown 文字、凭据错误说明及 JSON Prompt 只有正文，不能从自然语言或内嵌示例推断操作类型。错误/未知标记、说明前缀、非封闭监控短句也继续保留原文，不凭关键词归类。空内容使用原占位；隐藏 Camera 角色继续隐藏。

没有通过浏览器或线上接口核验当前运行进程版本，也未重启服务。新类型补强需要人工验收环境运行配套 AionHome 代码；纯旧后端仍保留脱敏原文预览，前端不会复制语义解析器。历史内容已被旧接口清空且未保留安全原文时，展示层无法恢复。

## 验证与人工入口

自动验证覆盖独立展开/缓存、长内容完整复制、相同及不同安全结果、AI 交付独立状态、未知工具安全兜底、批次元信息、原文转义、可靠图标与展开时阅读位置。后端补充 28 项类型变体与失败降级用例，保留旧/新矩阵、公开生产者、结果批次、canonical regenerate、Web/URL、Reaction 与日程回归。

| 检查 | 结果 |
| --- | --- |
| 前端全量 `npm test -- --reporter=dot` | 129 文件、1,889 项通过 |
| TypeScript `npx tsc -b --pretty false` | 通过 |
| 生产构建 `npm run build` | 通过，保留既有 chunk 体积提示 |
| 合成验收入口独立 Vite 构建 | 通过；未启动浏览器 |
| 后端组合专项 | 378 通过；1 项已知基线失败单独记录，排除该项复跑为 378 通过、1 deselected |
| 基线复核 | AionHome HEAD `92351ce` 的完整独立源码副本运行相同组合：350 通过，同一项失败 |
| diff 检查 | 两仓库工作区、暂存区及新增文件空白检查通过 |

基线失败为 `test_schedule_context_builder_schedule_and_diary_import_without_side_effects`：测试的旧 database stub 缺少 `get_db_readonly`，导入未修改的 `routes/diary.py` 失败。本轮未扩展修改日程/日记运行时或此测试。生产 Chat chunk 约 529 kB，构建继续提示超过 500 kB，未扩展拆包范围。

日志与独立基线副本保存在 `C:/Users/Admin/.codex/visualizations/2026/10/24/01a16e7d-d357-7bc3-bcdf-99b2d91a3019/pr4-visual-polish/`。

人工入口：现有 Vite 开发服务中的 `/tests/browser/chat-pr4-followup.html?mode=polish`。使用真实 Mapper、Presenter、BubbleList、ChatShell、Sender 和样式，包含记忆/TODO/MCP 混排、长论坛正文、长参数/结果、相同和不同 AI 结果、三项混合状态、旧版类型降级；Composer 禁用，不发送聊天或工具请求。旧/新矩阵可用 `?mode=matrix` / `?mode=old` 对照。

待人工在 320px、390px 和桌面视口确认：折叠态纵向节奏和图标颜色、单项一次展开、多项独立收起、详情末段与 Composer 间距、长正文/JSON 选择复制、连续操作无明显跳动或意外到底。自动测试和静态构建不替代这些实际布局验收。
