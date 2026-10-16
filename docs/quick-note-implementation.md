# Quick Note 首版实现与验收说明

实现日期：2026-10-16。未修改 AionHome 后端，未 commit、部署或启动浏览器验收。

## 1. 文件清单

新增 Domain：

- `src/domain/quick-note/index.ts`
- `src/domain/quick-note/quick-note-types.ts`：记录、配置、分页、候选、日志与摘要类型。
- `src/domain/quick-note/quick-note-mappers.ts`：DTO 验证、摘要兼容、正文换行规范化。
- `src/domain/quick-note/quick-note-client.ts`：HTTP 与 SSE API 接线。
- `src/domain/quick-note/quick-note.test.ts`：DTO、HTTP 请求和 SSE 协议测试。

新增 Application：

- `src/application/quick-note/quick-note-date.ts`：业务时区、日界、日期范围与时间格式化。
- `src/application/quick-note/quick-note-state.ts`：列表、编辑、操作反馈状态与错误映射。
- `src/application/quick-note/quick-note-controller.ts`：配置、日期、分页、请求竞争、mutation、编辑与读取恢复。
- `src/application/quick-note/quick-note-logs.ts`：feature 内的日志连接、重连、去重和清理。
- `src/application/quick-note/quick-note-date.test.ts`
- `src/application/quick-note/quick-note-controller.test.ts`
- `src/application/quick-note/quick-note-logs.test.ts`

新增 Feature：

- `src/components/quick-note/QuickNoteView.tsx`：PageHeader、连续 Reading Surface、分页与只读配置。
- `src/components/quick-note/QuickNoteControls.tsx`：相对日期、Calendar / Popover 日期选择。
- `src/components/quick-note/QuickNoteSection.tsx`：时段章节、单条操作、摘要与完整正文。
- `src/components/quick-note/QuickNoteDialogs.tsx`：近期重试、历史补写与破坏性操作确认。
- `src/components/quick-note/QuickNoteEditor.tsx`：正文编辑、失败输入保留、冲突核对与覆盖确认。
- `src/components/quick-note/QuickNoteLogs.tsx`：默认简洁日志、展开原始日志与连接恢复入口。
- `src/components/quick-note/useQuickNotes.ts`：React 生命周期接入，离开时取消请求及订阅。
- `src/components/quick-note/QuickNotePresentation.test.tsx`：组件渲染、状态、可访问性与确认语义测试。
- `docs/quick-note-implementation.md`：本说明。

修改：

- `src/components/apps/DesktopAppView.tsx`：独立 `quick-notes` app ID、元数据和 lazy 页面。
- `src/components/apps/DesktopAppView.test.tsx`：独立入口与普通笔记保留的回归测试。
- `src/components/desktop/DesktopApps.tsx`：新增速记入口，网格列数对应增加后的入口总数。
- `src/components/desktop-v2/EditorialQuickApps.tsx`：实验桌面新增速记入口及入口数量文字。

未修改共享 UI primitives、Chat、Memory、Settings 的实现；未增加运行时依赖。

## 2. 功能接入

入口：标准桌面「速记」和 `/app/quick-notes`；实验桌面「速记」和 `/editorial/app/quick-notes`。普通笔记、NotesWidget 和其他应用入口保留。

| 能力 | API 与行为 |
| --- | --- |
| 时段配置 | GET `/api/quick-notes/trigger-config`，验证配置与日期契约，失败有恢复入口 |
| 日期分页 | GET `/api/quick-notes`，始终传 `page`、`page_size`、`period_from`、`period_to` |
| 近期重试 | GET `/api/quick-notes/incomplete`，逐候选 POST `/api/quick-notes/backfill`，显式传 `overwrite: false` 与 `end_hour` |
| 历史补写 | 选择日期、配置中的时段和截止小时，POST backfill；完整记录重建必须确认后传 `overwrite: true` |
| Step 1 | POST `/{id}/re_step1`，确认成功后清空正文的语义 |
| Step 2 | POST `/{id}/re_step2`，确认替换正文；502 明确提示未完成并重新读取 |
| 正文编辑 | PUT `/{id}`，支持保存、取消；保存前 GET 核对；失败保留输入 |
| 删除 | DELETE `/{id}`，不可撤销确认 |
| 运行日志 | SSE GET `/api/quick-notes/logs`，复用现有 HTTP streaming 与 SSE parser |

正常确认响应后重新读取当前日期、当前页；后端删除使页码越界时，只用 GET 回到有效页。日期和页码切换使用取消信号与请求序号隔离旧响应。读取失败的恢复按钮只发 GET，不重新发起写入。

正文始终展开，使用安全文本渲染，保留 `[DRIFT:...]`、`[HEART:...]` 等内容；兼容 CRLF 和已有 `<br>` 表达。摘要默认收起，完整展示 Step 1 保存的字段，兼容关键对话旧字段、未知字段、旧格式和非法 JSON。不引入独立 HEART / thinking 区域。

编辑草稿与列表、日志状态分开。刷新或日期切换不会替换草稿；保存前发现服务端记录变化时展示冲突，必须明确确认覆盖最新正文。结果不明确的保存会通过 GET 核对；核对失败时禁止直接重复保存，提供再次读取入口。

## 3. 日期与日志

日期使用配置返回的 `time_zone`、`day_boundary_hour`，`labels` 按小时映射解析。分别解析 D 和 D+1 的业务日界为 Unix 秒，查询半开区间 `[D 日界, D+1 日界)`。日历的浏览器本地 Date 仅用作日期选择的 UI 值，不参与接口范围计算。相对日期在页面存续期间定期更新，也在恢复可见时刷新；不会自动改动用户已选择的日期。

覆盖 DST 23/25 小时日和半小时偏移。遇到不存在的当地日界明确报错；重复日界选择首次出现。记录标题使用自身的历史 `period_label`。列表保留后端创建时间倒序并在界面标注，不对单页做假装覆盖完整日期的时段排序。

日志连接不表达生成状态。保留时间戳、level、原始 msg 和 Step 文本；收起时仅提供简洁预览，展开后可读完整收到的日志。每次连接从 `last_seq=0` 重新读取服务端保留缓冲，避免服务重启后序号归零导致漏读；重连以新缓冲替换旧连接内容。按 seq、时间戳、level、msg 去重，单次订阅最多保留 500 条于内存，离开即清理，不做持久化。

断连按 1、2、4、8、16、30 秒上限退避；401/403 停止自动重试并提供手动恢复。没有静默超时的任务推断，也没有任务 ID、完成检测或新生成状态机。日志事件不会触发记录刷新、日期变化、翻页或编辑内容更新。

## 4. 与参考图的有意差异

- 复用实际 PageHeader 的尺寸、字级与材质，不复刻参考图的放大比例。
- 长正文采用现有 `mist-solid`，优先稳定可读性；单条记录不再嵌套 Card。
- 不显示图片中的「运行中」，只显示日志连接状态。
- 记录按真实创建时间分页，不固定一天三条，也不按当前配置重命名历史时段。
- 摘要默认收起，最终正文完整展开；跨天起止时间显示日期和明确标记。
- 时段配置默认折叠、本版只读。

## 5. 已知限制与人工验收

- 配置编辑未在本版开放。截止小时同时决定日界，保留 GET 恢复和只读信息，避免增加未确认的配置产品行为。
- 后端正文 PUT 没有版本条件更新，保存前的读取核对无法提供原子并发保证：极短的“核对之后、PUT 之前”窗口仍可能发生服务端变化。前端不会因刷新静默替换用户草稿。
- 后台补写没有可查询的任务状态。界面只承诺请求已接受，需通过日志与手动刷新记录核对结果，不自动宣称生成完成。
- SSE 后端不发送日志缓冲清空事件；持续连接显示本次收到的日志。手动重新读取或自动重连后与当前服务端保留缓冲重新同步。服务端已淘汰的日志无法恢复。
- 草稿和日志不跨页面卸载持久化。
- 使用单元测试、控制器测试、静态组件渲染和模拟 HTTP/SSE 验证；未向生产接口发写入请求，未启动浏览器、截图、Playwright 或视觉回归。布局、字体、颜色、间距和移动端实际效果留待人工验收。

## 6. 验证

- `npm test -- --reporter=dot`：48 个测试文件，798 项测试通过。
- `npx tsc --noEmit`：通过。
- `npm run build`：通过（包含 `tsc -b` 与 Vite production build）。
- `git diff --check`：通过；新增文件另作空白错误检查。

测试覆盖业务日界、配置错误、日期切换/分页/请求竞争、记录空正文、摘要兼容、安全文本渲染、编辑保存/取消/失败/冲突、普通重试/补写/覆盖参数、Step 1/2 结果与 502、写入不明确后的读取恢复、SSE 重连/去重/静默/重启/清理，以及离开后的迟到响应隔离。

## 7. V2：日期概览与单篇阅读（2026-10-16）

本节更新当前展示行为；前文保留为首版接入记录。V2 未修改 AionHome、HTTP/SSE 接口、业务日期区间、数据控制器或全局页面架构。

### 文件与职责

- `QuickNoteView.tsx`：保留 PageHeader、首版对话框和控制器，组合概览与阅读页，承接离开编辑时的草稿确认。
- `QuickNoteOverview.tsx`：一块连续阅读 Surface，仅渲染当前后端分页返回的记录；历史时段名、紧凑时间范围、三行保存正文预览及分页。
- `QuickNoteReader.tsx`：完整正文、返回入口与轻量操作菜单。直接使用当前列表中该 ID 的最新保存值；记录离开当前页时显示返回提示，避免继续把旧快照当作最新正文。
- `QuickNoteSection.tsx`：安全文本正文与 Step 1 摘要。摘要使用默认折叠的原生 `details`，以章节、列表、字段层级和间距展示；旧格式和异常 JSON 继续采用原有文本兼容方式。不增加正文或摘要内部滚动。
- `QuickNoteFeedback.tsx`：两层视图共用的读取恢复、操作反馈和错误信息。
- `quick-note-navigation.ts`、`useQuickNoteNavigation.ts`：feature 内单层阅读历史、草稿保护、概览滚动与焦点恢复，卸载时清理监听。
- `QuickNoteControls.tsx`：日期导航固定四列单行，四个按钮均保留至少 44px 命中尺寸；主导航日期按钮通过既有 Calendar / Popover 选择，自定义日期有选中态，实际日期显示在概览标题。补写对话框继续显示其所选日期。
- `QuickNoteLogs.tsx`：默认一行摘要；详细原始日志仅在展开后出现，最大高度 16rem。连接异常在折叠状态也保留重新连接入口。SSE 订阅逻辑保持原样。
- `quick-note.css`：仅包含 Quick Note 概览与单篇共用的局部阅读背景规则。
- 测试：更新 `QuickNotePresentation.test.tsx`、`quick-note-date.test.ts`；新增 `quick-note-navigation.test.ts`。

### 阅读与返回

概览不调用 AI，也不生成或改写标题、摘要。预览直接对保存的 `output` 使用首版换行兼容处理，并以 CSS 限制为三行；完整阅读保留全部正文。空时段不补齐，空日期显示简洁空态，空正文记录仍可进入阅读和原有操作。分页与服务端创建时间倒序保持原样，不在客户端重排。

控制器和概览在进入阅读时保持挂载。返回不触发 GET，不重新选择今天或重置页码；恢复进入前的概览滚动位置与条目焦点。正文和摘要随页面自然滚动，日志是唯一允许限高滚动的阅读辅助区。

进入阅读在现有 app 路径上增加一个 feature 历史条目，不改变父层 app 路由。页面返回与浏览器返回消费同一层；关闭 app 先消费阅读层，再交给原有桌面返回处理。取消草稿放弃确认时保持阅读与草稿；确认后才清除草稿并返回。保存或核对进行中不离开编辑器。对未确认保存也执行保护，刷新/关闭浏览器使用 `beforeunload` 原生提示。

同一页面存续期间，浏览器前进可以重入原阅读记录；概览已切换日期或页码时跳过过期的前进条目，避免展示旧内容。浏览器刷新或整个 app 卸载后仍不持久化草稿、阅读位置和日志，沿用首版边界。

### Memory 材质依据

已找到并阅读 `docs/ui-patterns.md` 中 Memory 的真实排障报告。它记录了“白膜、壁纸人物仍可辨”的已验证根因：祖先 opacity 入场动画的 persistent fill。正式修复为移除 `DesktopAppView` 动画的 `both`，保留动画本身。当前仓库已经包含此修复，Quick Note 与 Memory 共用该 app 容器；本轮保留它，不改全局动画或共享 token。

Memory 最终阅读面为 `mist-glass-strong` 加上 `--glass-surface-strong` 69% / `--glass-surface` 31% 混合。V2 的概览局部复用相同比例和已有 Mist 模糊、边框、高光及阴影，不嵌套独立记录 Card。

首版大面积 `mist-solid` 是 90% 白色，且该 primitive 本身没有 backdrop blur。V2 单篇阅读沿用 `mist-glass-strong` 的 22px blur、边缘和阴影。人工验收反馈单篇仍偏白后，按用户要求将单篇与日期概览统一为上述 69% / 31% 背景混合，移除额外的 `mist-solid` 背景混合。两处共用一条局部规则，复用随深色模式变化的现有变量，无新增玻璃系统、无修改 Memory、桌面或共享样式。

Memory 报告的根因与修复已有 runtime A/B 证据；V2 的局部材质仅作代码层面调整，未对 Quick Note 进行浏览器复现或宣称已通过视觉验收。

### 回归结果与人工验收

- `npm test -- --reporter=dot`：49 个测试文件，814 项通过。
- `npx tsc --noEmit`：通过。
- `npm run build`：通过，包含 `tsc -b` 与 Vite production build。
- `git diff --check`：通过。
- Vitest 与 Vite 在沙箱内受 Windows `realpath` 的 EPERM 限制；经执行权限审批后，在沙箱外完成本地测试和构建。未调用生产接口或部署。

保留首版日期/DST、分页竞争、编辑冲突与不明确保存、删除与 Step 1/2 确认、近期重试、历史补写/覆盖、GET-only 恢复、SSE 重连/去重/清理等测试。新增覆盖两层切换、同日同页返回、滚动恢复参数、浏览器历史消费、草稿确认/取消/保存中保护、完整正文与预览界限、历史记录顺序、空日期/空正文、摘要层级与折叠、日志折叠/异常入口和四列日期导航的代码约束。

未使用浏览器自动化、Playwright、截图或自动视觉对比；未 commit、部署。请人工验收浅色/深色及高对比壁纸下的透明度和文字稳定性、移动端日期按钮与日历、长文排版、日志展开、实际滚动/焦点恢复，以及浏览器/应用返回和编辑确认体验。

## 8. V2.1：人工验收体验修复（2026-10-16）

本节更新 V2 的分页展示和阅读滚动行为。PageHeader、单行日期导航、概览/单篇共用的 Mist 材质和 Overview / Reader 分工继续保留。

### 五项调整

1. **局部字号**：日期标题改为 16px，概览预览为 13px / 24px 行高；单篇保留窄屏已有的 15px，将行高从 32px 收至 28px，并去掉宽屏升至 16px 的规则；Step 1 内容为 13px / 24px，详细日志为 11px / 20px。时段标签、元信息和 PageHeader 保留层级，不改共享字体 token。
2. **日期内完整读取**：移除可见分页、总条数和页码。Controller 从第一页顺序读取所选业务日期的全部页，沿用原接口分页参数与配置计算出的同一组日界秒区间。全部成功后才发布应用层的日期记录集合，后端分页 DTO 保持原样。按 ID 去重并保留返回顺序；持续无新记录的分页链会报错停止。同日重复读取合并，同日期重复选择不重复发请求；切换日期/配置或卸载时取消请求，并在每页返回后检查请求序号。失败时保留同日先前完整数据，新日期读取失败不展示前一日数据；恢复只发 GET。写入后的核对强制重新读取，避免复用写入前已开始的 GET。
3. **固定阅读头部与回顶**：Reader 的返回、操作菜单和时段元信息放在 `shrink-0` 头部。正文与 Step 1 摘要共用剩余空间里的一个滚动区，外层仅做 `flex` / `min-h-0` / `overflow-hidden` 约束，并继承 app 的动态视口高度边界。正文滚动超过 360px 时显示右下角 44px Mist 回顶按钮；回到顶部后隐藏，减少动态效果偏好下使用即时滚动。原概览滚动/焦点恢复、浏览器返回、草稿确认和编辑冲突保护保留。
4. **日志时钟**：日志行仅显示业务时区的 `HH:mm:ss`，完整日期保留在 `time` 的 tooltip，原 Unix 秒时间戳与 ISO `dateTime` 不变。配置尚不可用时显示占位，不代用浏览器本地时区。
5. **日志级别颜色**：优先识别服务端 error / warning / success 等 level，并以明确的失败、成功文本作补充；失败优先于成功，“等待完成”等过程文字保持中性。复用现有 success / destructive / warning foreground token，随浅色与深色模式切换。只标记对应日志行，不推断生成状态或把 Step 1 成功升级为整次生成完成；SSE 连接、重连、去重和资源清理实现不变。

### 修改文件

- `src/application/quick-note/quick-note-controller.ts`、`quick-note-state.ts`：仅调整日期内分页读取、请求合并与应用层日期集合。
- `src/components/quick-note/QuickNoteOverview.tsx`、`QuickNoteSection.tsx`：移除分页栏及局部文字密度调整。
- `QuickNoteReader.tsx`、`QuickNoteView.tsx`、`useQuickNoteNavigation.ts`：固定头部、单个阅读滚动区和既有导航接线。
- `quick-note-reader-scroll.ts`：回顶阈值与减少动态效果兼容。
- `QuickNoteLogs.tsx`、`quick-note-log-presentation.ts`：日志时间和语义级别呈现。
- 更新 `quick-note-controller.test.ts`、`QuickNotePresentation.test.tsx`；新增 `quick-note-reading.test.tsx`。
- 本说明。

### 验证与人工验收

- `npm test -- --reporter=dot`：50 个文件，846 项全部通过。
- `npx tsc --noEmit`：通过。
- `npm run build`：通过。
- `git diff --check`：通过，新增文件另作相同空白检查。

新增回归覆盖三页记录完整性、后续页失败后的 GET 恢复、后续页取消/迟到响应隔离、页重叠去重、不推进的分页链、重复读取合并、写入前后的读取隔离、固定头部与唯一阅读滚动区、回顶阈值/滚动目标/reduced-motion、业务时区时分秒格式、失败优先和浅深色语义颜色接线。原有编辑、确认、读取恢复、日期/DST、返回及 SSE 测试继续通过。

未修改 AionHome、Quick Note Domain、共享 token、Memory、Chat 或 Settings；未使用浏览器自动化、Playwright、截图或自动视觉验证，未 commit、部署。待人工检查移动端实际字号与行距、动态视口下的固定头部和单滚动条、回顶位置/触达、概览返回位置，以及浅色/深色壁纸下日志颜色的可读性。

## 9. V2.2：正文语义排版与独立辅助摘要（2026-10-16）

本轮仅调整阅读内容呈现。PageHeader、Overview / Reader、已验收的阅读 Surface、日期内完整读取、日志、固定阅读头部、单个阅读滚动区、回顶和返回/草稿保护实现不变。

### 实际修改

- `QuickNoteSection.tsx` 保留原有正文/摘要出口与操作定义，正文委托 `QuickNoteProse.tsx` 呈现。
- 新增 `QuickNoteProse.tsx`：行首标题/说话者前缀与 HEART / DRIFT 片段的安全文本排版。
- 新增 `quick-note-content-presentation.ts`：feature 内的小型纯展示辅助函数，负责片段定位、前缀分类、摘要分区及明确字段分类，不参与编辑或保存。
- 新增 `QuickNoteSummary.tsx`：事件归纳、关键对话两个平级原生折叠区，未知/旧数据兼容展示，关键对话底部收起入口。
- `quick-note.css` 仅增加 AI 前缀的局部文字色：以现有 `--color-ai` 与 `--color-foreground` 混合，随用户 AI 配色和浅深色模式变化；原阅读背景规则不变。
- 更新 `QuickNotePresentation.test.tsx`，新增 `quick-note-content.test.tsx`，并更新本说明。

### 解析与降级规则

**正文片段**：仅识别大小写精确的 `[HEART:内容]` / `[DRIFT:内容]`。逐个扫描完整的外层方括号组，支持多次出现、正文中间和跨行片段；保留原始片段，测试可重建仅经过既有换行规范化的完整正文。嵌套、未闭合、空片段、包含反斜杠/转义或紧邻多余右括号等不确定情况直接保留原文，不提取内层标记。沿用首版 `normalizeOutput` 的 CRLF / `<br>` 换行兼容，未增加新的正文内容转换。

HEART 使用现有玫瑰系前景色，DRIFT 使用薰衣草系前景色；两者只增加细左边线、小图标和简洁标签，片段正文仍采用正常正文颜色与行高，不增加背景 Card。

**标题与说话者**：仅识别行首（可带原有缩进或简单列表前缀）的明确冒号格式，保留全角/半角冒号、后续正文、空行和缩进。独占一行、较短的冒号结尾文本可作为标题；同一行带正文时仅识别短中文标签或简单英文标签。数字时间、URL/路径、句内冒号、带句子标点或较长的不确定前缀保持普通文字。该规则是保守的格式识别，不是人名识别；没有人名列表。

默认标题和说话者使用 `primary-ink`；只有独立「我」使用局部 AI 主题文字色。后续正文不跟随前缀染色。结构化说话者字段同样遵循此规则，不给某个姓名绑定固定角色色。

**Step 1**：明确的顶层 `事件归纳` / `关键对话` 分别默认收起，无需先展开 Step 1 外层。缺失或明显为空的已知部分不补区块。未知顶层字段以原字段名提供兼容折叠展示，保持字段顺序和值，包括 null、false、0 和空容器；旧数组、纯文本、非法 JSON 使用兼容展示。深层结构达到渲染深度边界时显示完整 JSON 文本，序列化不适用时回退原始摘要，不截断内容。

**关键对话**：优先使用明确的 `time` / `time_range` / 时间范围等字段作低权重时间提示，不转换其内容；`content` / 原文 / 对话等字段展示原文，`reason` / 说明 / 归纳等明确字段使用较淡文字或细左边线。仅在明确说话者字段与紧接的原文字段都为字符串时组合成一行；非相邻字段和未知字段不重排。数组保持原顺序，有明确时间字段的组之间使用轻分隔线，逐句原文保留间距与换行。自由叙述或无法区分原文/说明的内容直接显示，不猜测分类，不调用模型整理。

关键对话展开内容底部提供「收起关键对话」，关闭时将焦点返回该折叠标题，并以即时滚动让标题可见。两个折叠区独立，仍共用 V2.1 的阅读滚动区，无新增内部滚动条。

**内容安全与保存**：所有内容均通过 React 文本节点安全渲染，不使用 `dangerouslySetInnerHTML` 或第三方富文本解析器。编辑器、Domain、Controller、API、数据库和模型提示词不变；编辑与保存继续使用原始正文，HEART / DRIFT 的分隔符和未完整标记均保留在保存文本中。

### 验证与待人工验收

- `npm test -- --reporter=dot`：51 个测试文件，897 项全部通过。
- `npx tsc --noEmit`：通过。
- `npm run build`：通过。
- `git diff --check`：通过，新增文件另作相同空白检查。

新增覆盖完整/多次/中间/跨行片段、不完整/嵌套/转义降级、片段源文本重建、前缀颜色分类、时间/普通冒号不误判、独立默认折叠、结构化与自由文本对话顺序、未知字段/旧格式/非法 JSON/深层数据的保真兜底、安全文本渲染、编辑保存原始标记、长语义正文和对话仍只占用现有单个阅读滚动区。原有回顶、返回、日期、写入恢复与 SSE 回归继续通过。

未修改 AionHome、共享 token 或其他页面；未使用浏览器自动化、Playwright、截图或视觉回归，未 commit、部署。待人工检查 HEART / DRIFT 的轻量强调、主题切换后前缀颜色与可读性、真实模型摘要的间距/字段降级，以及长对话底部收起后的焦点和滚动位置。
