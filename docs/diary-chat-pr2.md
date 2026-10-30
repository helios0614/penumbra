# Diary Chat PR2：只读页面与日历导航

交付日期：2026-10-30（Asia/Shanghai）。本次属于重构 Phase 3 / Diary Chat PR2，只新增 Penumbra 的读取、展示和导航边界；不改变 AionHome 的消息持久化、Prompt 输入、命令语法/副作用顺序或 WS 服务端 type/payload/timing。

开工时 AionHome `refactor-code-main` / `7105f948d2965ead1f8023a691100112e0b4f5c3` 工作区干净；Penumbra `main` / `96b4455ef3b4b7eee3e46d21c8b21993794f2896` 只有未跟踪的 `docs/diary-chat-pr1.md`，原样保留。已阅读根 AGENTS、runtime model、master plan、PR0/PR1、现有 Diary 与 Chat 展示约定，并核对当前后端父 Assistant commit/broadcast 先于派生操作的源码。没有采用 PR0 的旧延迟续写方案。

## 修改文件及职责

以下路径均相对 Penumbra；AionHome 无修改。

| 文件 | 职责 |
| --- | --- |
| `src/domain/diary/diary-chat-types.ts` | 独立 Diary wire DTO、Entry/消息读取投影、缺失 Entry 错误 |
| `src/domain/diary/diary-chat-mappers.ts` | 校验身份/字段，投影 Entry，保持消息数组原顺序 |
| `src/domain/diary/diary-chat-client.ts` | 两个只读 GET，转义真实 Entry ID，透传取消/超时 |
| `src/domain/diary/diary-chat.test.ts` | 9 项 DTO/API 契约测试 |
| `src/application/diary-chat/diary-chat-controller.ts` | 当前 Entry 的读取、刷新、状态、请求隔离、事件失效 |
| `src/application/diary-chat/diary-chat-controller.test.ts` | 8 项状态与竞态测试 |
| `src/application/diary-chat/diary-chat-realtime.ts` | 页面持有的 WS 订阅、重连、连接恢复后的单次失效 |
| `src/application/diary-chat/diary-chat-realtime.test.ts` | 4 项事件身份、重连和清理测试 |
| `src/application/realtime/realtime-types.ts` | Diary 消息/Entry 的独立事件投影 |
| `src/application/realtime/realtime-dto.ts` | 三种 Diary wire event 的身份字段 |
| `src/application/realtime/realtime-events.ts` | 真实事件名到 Diary 身份的映射 |
| `src/components/diary/DiaryChatView.tsx` | 只读 ChatShell 页面装配与错误/重试入口 |
| `src/components/diary/useDiaryChat.ts` | React 挂载、订阅、读取和卸载生命周期 |
| `src/components/diary/diary-chat-presenter.ts` | DiaryMessage 直接到共享展示 VM，无 Main DTO |
| `src/components/diary/diary-chat-navigation.ts` | Diary 专属查询参数读写，保留原路径/其他参数/hash |
| `src/components/diary/useDiaryChatNavigation.ts` | 进入/返回、浏览器前进后退、日历滚动和焦点恢复 |
| `src/components/diary/DiaryChat.test.tsx` | 7 项只读装配、真实 user 消息、URL/导航测试 |
| `src/components/diary/DiaryCalendar.tsx` | pending 预览的“查看对话”入口，使用真实 entryId |
| `src/components/diary/DiaryView.tsx` | 保留挂载的日历与独立 Chat 页面切换 |
| `src/components/diary/DiaryPresentation.test.tsx` | 既有页面回调测试补上新增导航 hook 替身 |
| `src/components/chat/Bubble.tsx` | 可关闭消息操作（默认仍开启），未知角色保留锚点 |
| `src/components/chat/BubbleList.tsx` | 透传操作开关；相同日期非连续出现时使用不同分组 key，保持原消息顺序 |
| `tests/browser/diary-chat-pr2-smoke.cjs` | 真实 App 的 Classic/Editorial 六组合成浏览器流程 |
| `docs/diary-chat-pr2.md` | 本交付记录 |

## 页面与导航

`DiaryView → DiaryChatView → ChatShell → BubbleList → Bubble`。页头含返回日历、Diary Chat、Entry 真实业务日期/状态和刷新按钮；主体复用气泡、Markdown/代码块、Thinking、DRIFT 和现有滚动锚点。`composer=null`，消息操作关闭。代码块复制和 Thinking 展开仍使用原展示组件。真实 user 材料、原文提示与 assistant 续写均照常显示；不按正文识别“系统通知”。未知 role 保留原角色/正文的中性展示，不套用 Main system capability grammar。

Classic `/app/diary` 与 Editorial `/editorial/app/diary` 本来就共用 DiaryView；本次仍通过同一个日历 DTO 的 `entryId` 进入同一能力。只有 pending 且 ID 非空才提供入口，archived 原阅读/编辑入口保持原样。不创建 Entry、不启动投喂、不改状态或选中日期。

例如 `/app/diary?preserved=hello&diaryEntry=真实ID#calendar`。只增加 `diaryEntry` 参数，不改 Main Chat 路由，保留原 Diary 路径、其他查询参数、hash 和 history state。进入时 pushState，返回优先回到该日历 history 项；直接链接没有该导航标记时，仅移除本参数。popstate 支持前进/后退。

日历在同一 DiaryView 中继续挂载，Chat 展示期间隐藏；保存原滚动位置和入口焦点，返回时恢复，月份和选中日期不变。刷新页面后直接从 URL 中的 Entry ID 读详情与历史，不依赖日历先返回该日期或 React 内存。

## API 与 DTO 契约

| 读取 | 路径 | 投影/错误 |
| --- | --- | --- |
| Entry | `GET /api/diary/entries/{encodeURIComponent(entryId)}` | `id,date,status,title`；不保留 content、auto_feed_config 或 auto_feed_status。旧 HTTP 200 `{ok:false}` 和详情 404 映射为 Entry 缺失 |
| 全量消息 | `GET /api/diary/entries/{encodeURIComponent(entryId)}/messages` | 每行校验 `entry_id`，投影 `id,entryId,role,content,createdAt,updatedAt,drift,thinking`。该接口失败单独报告消息历史错误 |

`created_at/updated_at` 是秒时间戳，`updated_at=0` 原样保留，缺失/可空字段映射为 null。GET 的 canonical `drift` 优先；兼容旧 `simple_think` 字段，保持 thinking 与正文独立。展示边界才将 drift 转成共享 VM 的 `simpleThink`。不构造 Main 的 conv_id/cache_region 等业务字段；展示 VM 的空附件槽仅满足共享气泡展示接口，不是伪造消息 DTO。

消息只执行顺序保持的逐行 map：不排序、不按角色分组、不按正文去重、不推测 ID 含义，也不合并不同 ID。BubbleList 的日期段仅标注原序列中的连续日期段，重复日期可以再次出现。空数组表示存在 Entry 的空历史，不代表 Entry 缺失。

## WS 刷新和请求隔离

映射 `diary_msg_created → diary-message-created(entryId,messageId)`、`diary_entry_created → diary-entry-created(entryId)`、`diary_entry_deleted → diary-entry-deleted(entryId)`。payload 仅保留身份；WS 消息不会直接插入或重排 timeline。

Controller 只接收当前 Entry 的事件。前两种事件进入 150ms 固定窗口合并读取；读取中到达的失效只置 dirty，收尾后最多排一次后续读取。一次读取开始即消耗 dirty，失败不会自行无限重试。WS 初连和每次成功重连各发一次失效，用完整 HTTP 快照弥合订阅间隙。连接失败采用有界间隔的指数退避重连；1008 授权关闭停止自动重连。没有历史轮询或全局任务表。

`msg_created` 仍归 Main；`heart_whisper` 仍是 capability 失效，`auto_feed_status_changed` 不是 Diary Entry 消息，这些都不会刷新本 Chat。Entry 删除立即使当前读取失效、取消请求、清除消息并展示明确错误；迟到消息事件不能恢复已删除的页面。

每次读取持有 Entry owner、递增 sequence 和 AbortController。切 Entry、手动刷新、删除及 dispose 都使旧序号失效；每个 await 后重新检查 owner/sequence/disposed。即使底层忽略 abort，旧响应也不能覆盖当前页面。卸载取消定时器、请求和 WS，移除订阅。刷新失败保留最后成功历史并显示错误/重试；首次失败保留可识别的错误来源。

## 测试与浏览器验收

先新增读取/竞态测试后实现：原 Diary domain/UI 基线 113 项通过；新增 suite 因尚无 PR2 模块而失败。实现后最终结果：

| 检查 | 结果与覆盖 |
| --- | --- |
| `npm test` | **197 个文件，2657 项通过**；其中 PR2 新增 28 项。包括全部已有 Main Chat、Diary、realtime 与共享组件测试 |
| `npm run build` | TypeScript 和 Vite 生产构建通过 |
| Domain | Entry 投影/缺失、消息字段、canonical/legacy DRIFT、完整原顺序、同文不同 ID、空白消息、空历史、跨 Entry 拒收、GET 路径和取消信号 |
| Application | 首次加载、空/正常、详情缺失/历史失败区分、失败保留快照、手动刷新、跨 Entry 及同 Entry 迟到响应、事件身份筛选/合并、读取中失效、删除、卸载、无永久轮询 |
| Realtime | 真实三个 Diary wire、Main/HEART/全局开关区分、初连/重连单次失效、退避、1008、连接晚到和卸载清理 |
| UI | 无 Composer/消息操作、共享 Markdown/代码/Thinking/DRIFT、真实 user 原文和未知角色正文、同文不同 ID、两种 URL、滚动/焦点和前进后退 |
| Diary 浏览器 | **Classic/Editorial × 320/390/1280px 共六组通过**，640px 短屏。每组 64 条初始历史，含很长消息、乱序时间/非连续相同日期段、同文不同 ID，均验证原 ID 顺序 |
| Main Chat 浏览器回归 | 既有 `chat-message-edit-smoke.cjs` 的 **320/390/1280px 三组通过**，覆盖完整正文、取消/保存/失败重试、Markdown/独立 Thinking/DRIFT、刷新、A/B 请求归属、冲突、快捷键/IME、短屏、重生成、发送后去重与编辑 |

六组均验证：pending 入口与同一真实 Entry、横向边界/有效滚动高度、Thinking 展开、读取失败/重试保留历史、空历史、无轮询、Main/其他 Entry 事件不刷新、Diary 突发事件只读一次、WS 重连补读、删除与迟到事件、整页刷新恢复、原 archived 正文与编辑入口、零 API 写请求、无页面异常/重复 React key。返回日历恢复的非零滚动值依次为 Classic 129/129/221px、Editorial 278/254/324px，并验证入口焦点、原选中日期与月份。

使用本地临时白名单源码副本及既有依赖；未复制 `.env`、生产数据或个人配置。所有浏览器 API/WS 均拦截为合成数据，其他域请求拒绝。截图和测试日志仅保存于临时目录，未加入业务仓库；没有访问真实模型、日记、原文数据库或线上服务。

Main 浏览器 fixture 首次在共享预览缓存下遇到 `504 Outdated Optimize Dep`，没有进入产品断言。换用临时独立 Vite cacheDir/预览端口后，原样既有测试三组通过；该预览配置仅在临时目录，没有修改仓库构建配置。同步前的源文件 diff 空白检查和浏览器脚本 `node --check` 通过。

## 限制与后续范围

- WS 不覆盖全部批次 user 消息，也不提供后台 chunk 或整次任务终态；只提供失效线索。用户可以手动刷新。页面只显示真实 Entry status，不推断 feeding/finished/pending 对应的任务进度。
- 目前历史接口没有分页，本次按完整数组读取；合成验收覆盖 64 条长短混合历史，没有声称万条历史的性能指标。
- 同次挂载内返回保留日历状态；整页刷新恢复当前 Entry，但不额外持久化刷新前日历的月份、滚动和焦点。此时日历沿用原默认选择。删除后日历数据仍沿用现有手动刷新机制。
- 未做真实服务、真实设备/Safari、真实模型或生产数据验收。发送/SSE、自动投喂启动、编辑/删除/重生成消息、提取归档、模型设置和后端历史修复均未接入。
- 没有 commit、push、deploy 或暂存改动，等待人工验收。
