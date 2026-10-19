# 时间功能 PR1：记挂 / 待办 / 闹钟

实现日期：2026-10-19。仅修改 Penumbra；未调用线上业务接口、未使用浏览器自动化，未 commit、push 或部署。

## 本地后端基线

先核对了 `/Users/remix/Desktop/AionsHome-main` 的代码与工作区。核对期间最新提交更新为 `057f1f5`（命令流水线收敛），包含 PR0 `bcec0ce`（调度原子抢占与 tick 在途保护）；最终检查工作区干净。已按最新 `routes/schedule.py`、`schedule.py`、`quick_note_config.py` 和速记配置路由核对 DTO、通知与时区来源。未改动后端，未据此假定服务端已部署这些提交。

PR1 属于前端真实数据接入：只读列表与现有写入口，不复制调度状态机，不改命令、Prompt 发布状态、模型选择或后端副作用。

## 页面与文件

| 原入口 | 用户名称 | Classic / Editorial 路径 | 页面能力 |
| --- | --- | --- | --- |
| calendar | 记挂 | `/app/calendar` / `/editorial/app/calendar` | 默认所有 active（包括过去日期）；创建、查看、取消；已取消记录折叠查看 |
| todo | 待办 | `/app/todo` / `/editorial/app/todo` | 未完成 / 已完成；快速创建、完成、恢复、取消 |
| clock | 闹钟 | `/app/clock` / `/editorial/app/clock` | 等待触发、折叠的已触发记录；创建一次性闹钟、取消等待中的记录 |

沿用原有平级路径和桌面壳。没有增加嵌套路由、跨应用页签或新的日程架构。monitor 没有用户界面，也没有摄像头操作。旧 Calendar 源码与日期组件保留，已不承担这三个业务页面的数据模型。

主要文件职责：

- `src/domain/schedule/`：六字段 DTO 适配、未知值容错、API、无时区转换的日期/分钟文本校验及契约测试。
- `src/application/schedule/`：读取合并、写后核对、结果未知保护、请求生命周期，以及应用级调度事件订阅与测试。
- `src/components/schedule/`：三个页面的轻量组合、连续列表纸面、独立创建表单、软取消确认、持续反馈、公共层闹钟提醒及组件/入口测试。
- `App.tsx`：挂载 `ScheduleRuntime`，使提醒接收独立于当前打开的应用。
- `DesktopAppView.tsx`、桌面入口元数据：复用 calendar / todo / clock 的 lazy 页面和共用返回行为。
- realtime 的类型、映射和 chat reconciliation：识别调度事件；聊天同步显式忽略这些业务事件，不改变聊天消息链。
- `CalendarWidget`、`TodoWidget`、`TodayPanel` 及 widget 描述：仅标清演示/未同步边界，移除固定的「今日日程 3 项」。

使用现有 PageHeader、Mist Surface、Button、Input、Textarea、SegmentedControl、Dialog、AlertDialog、Toast 与 PageScrollArea / 公共回顶。简单记录用连续分隔列表；创建表单和结果未知反馈为 feature-local 组合，没有新增全局主题或 UI primitives。

以上为初次接入的布局记录；当前三个页面已采用文末「移动端 UI 收口」中的固定工作区，不再使用 PageScrollArea / 普通页面回顶。

## API 与时间

| 操作 | 请求 | 核对方式 |
| --- | --- | --- |
| 记挂 / 闹钟读取 | GET `/api/schedules` | 按明确 type 和 status 筛选 |
| 待办读取 | GET `/api/schedules/todo` | active / done 两视图 |
| 创建 | POST `/api/schedules` | `{type, content, trigger_at?}`；校验返回记录的类型、内容、状态与显式传入的时间 |
| 完成 / 恢复 | PATCH `/api/schedules/{id}/done` 或 `/restore` | `ok:true` 后再 GET 全列表，核对精确 ID、类型与预期状态 |
| 取消 | DELETE `/api/schedules/{id}` | 相同核对，确认 `cancelled`；不是永久删除 |
| 服务器时区 | GET `/api/quick-notes/trigger-config` | 复用现有已验证的 `time_zone` / 日期契约适配器，只读 |

读取 DTO：`id, type, status, content, trigger_at, created_at`。不推断作者/来源，不把 TODO 的 `trigger_at` 转为截止时间。缺少时间或历史异常时间以安全文本展示；未知类型/状态、非法记录和重复 ID 不提供危险操作，也不使整页崩溃。

记挂可不填时间或只填日期。待办创建只提交正文（包括原样的 `[?]`），记录时间由后端保留。闹钟必须完整到分钟；原样组合 `YYYY-MM-DD HH:MM` 提交，不调用 `toISOString()`，不依据浏览器时区生成默认时间。

每次打开创建闹钟表单，重新读取服务器时区并明确显示 IANA 名称。缺少有效时区、读取失败或仍在确认时禁止提交。沿用速记配置适配器意味着配置日期契约异常也会保护性阻止创建，不能用浏览器时区兜底。现有后端不表达 DST 重复/不存在分钟的选择，前端不另造转换或时间状态机。

401 提示重新登录；503、422、网络错误和超时各有持续、可恢复的反馈。失败输入保留。只对已确认的保存/操作显示成功 Toast，错误与结果未知留在页面/对话框。

POST 没有幂等键：超时、网络断开、响应不匹配等未知结果不自动重发，普通刷新也不能凭内容相似判定创建成功。用户需读取列表人工核对，再显式解除新建保护。mutation 的 `ok:true` 不代表目标存在；核对不到记录/预期状态时继续保留提示，恢复按钮只发 GET。离开页面取消请求、订阅及通知所有权，迟到结果不能再显示 Toast。

## 实时同步与提醒边界

应用根部独立使用现有 `openRealtimeEvents`，没有重构 WebSocket 总线或通知系统：

- `schedule_changed` 是失效通知；短时合并后让当前页面重新读取，支持用户操作和 AI 命令产生的变更。
- `schedule_alarm` 读取 `data.id/content/trigger_at`，刷新数据并进入公共在线提醒队列。主页、聊天或其他应用打开时也可接收。
- 每次连接建立（包括重连）以及恢复页面可见时重新读取；断连退避至 30 秒，认证策略关闭暂停自动连接，可手动恢复。
- 同一运行期间按 ID + 触发时间去重，最近 512 个键保留在内存。关闭本地提醒不改后端状态，页面切换不清空根部队列。
- `monitor_alert` 只保留类型映射兼容，不展示查岗页面或触发摄像头。

`triggered` 一律表示「已触发」，不证明模型、设备、TTS 或命令执行成功。提示中的模型回复到对话查看。没有离线通知补发、Web Push、自动重建或自动重试；应用关闭、重载或事件丢失后不能保证在线提醒重放。

取消操作仍受后端现有契约限制：前端只给本次快照中 active 的闹钟提供取消，但读取后可能已被调度器抢占。DELETE 没有条件状态/版本契约，随后读到 cancelled 也不能证明外部副作用被撤回。确认文案明确说明这个边界；PR1 未改后端调度器。

## 回归与人工验收

测试采用临时 mock fetch、mock WebSocket、控制器和真实组件回调/静态渲染，不触发真实模型、摄像头或 TTS。覆盖三类读取/筛选/创建/软取消，TODO 完成恢复，服务器时区和非法分钟，POST 超时不重发，`ok` 但目标不存在，加载/空列表/故障恢复，AI 失效通知、重连补读、跨页提醒与去重，卸载/迟到反馈，双桌面入口及 triggered 文案。

验证结果：`npm test -- --reporter=dot` 通过 90 个文件 / 1310 项测试；`npx tsc --noEmit`、`npm run build`、`git diff --check` 均通过。新增未跟踪文件另作同等空白检查并通过。构建产生的已跟踪 `tsconfig.tsbuildinfo` 已恢复到开工时版本，不纳入功能改动。

人工验收保留：

1. 对照实际部署版本，确认 PR0 及服务器时区读取接口已经可用；用测试环境核对同一服务器当地分钟的创建与触发。
2. 移动端键盘、Calendar 日期与小时/分钟选择器、Dialog 焦点/叠放、滚动与回顶，长正文、浅深色及壁纸下的密度和对比度。
3. Classic / Editorial 的打开与返回，创建/取消、TODO 完成恢复、记挂取消后的既有 Prompt 结算行为。
4. 通过实际 AI 命令创建记录，核对在线刷新；断网重连、跨页收到闹钟通知，以及主模型回复沿原对话链出现。这里只核对链路，不将已触发当作执行成功。
5. 本轮未迁移 Widget / TodayPanel 的数据；它们仍为已标注的日期展示/示例清单，后续单独接入。monitor 留 PR2。

## 移动端 UI 收口（2026-10-19）

本轮仅修改 Schedule 的呈现组件、对应测试与本说明。Domain / API、控制器、WebSocket、跨页提醒、后端及 UI Foundation 全局规则均未修改。

### 复用的 Memory 方案

直接复用既有 `.memory-reading-panel` + `.mist-glass-strong`：沿用 Memory 已验收的两种玻璃 token 混合、blur、边界与柔和层次，没有复制透明度配方或改动全局 CSS。三页主要列表与历史共用连续纸面，内部使用轻分隔线。

页面 Header 固定；TODO Segmented 单独放在 `shrink-0` 区域。正文视口使用 `flex-1 min-h-0 overflow-y-auto overscroll-contain` 和公共 `.scrollbar-none`，保留 region 名称与键盘焦点。视口填满余高，里面的纸面按内容自然增高，空状态不撑成整屏白卡。列表与历史共用一个纵向滚动节点；底部留出安全区，移除普通页面回顶。切换 TODO 视图在布局提交时回到列表顶部，普通读取、实时刷新和反馈更新不主动重置滚动。

### 条目与表单

- 正文沿用 `text-sm`（默认约 14px），行高 1.6（约 22.4px），保留换行与完整内容，连续英文/URL 可任意断行。元信息为 12px；记挂移除占用正文宽度的装饰图标。
- 取消入口放在正文下方的元信息区，使用现有 Popover + Button，图标轻量、触摸目标 44px。展开后才能选择「取消记挂 / 待办 / 闹钟」，继续进入原软取消确认。确认框使用既有 `finalFocus` 返回仍存在的入口；入口被移除或禁用时回到列表。
- 公共组件库没有 Checkbox，TODO 保留成熟 Button 的 `aria-pressed`、disabled、loading 和原业务回调。图标改为 16px 的轻方形 / 主题色方形勾选；完成项使用可读的 muted-strong 正文与删除线。逐条 busy、写后核对和失败反馈保持原机制。
- 闹钟创建表单移除说明卡。字段附近只保留「服务器时间 · 实际 IANA 时区」；确认失败/未知时才显示必要错误和重新确认操作。每次打开仍读取时区，未知/确认中仍禁止创建，提交分钟文本与校验不变。页面 Header 下方也不再常驻时间解释。

### 改动文件与验证

业务呈现：`ScheduleView.tsx`、`ScheduleRows.tsx`、`ScheduleCreateDialog.tsx`、`ScheduleCancelDialog.tsx`。更新 `ScheduleView.test.tsx`、`ScheduleCreateDialog.test.tsx`，新增 `ScheduleWorkspace.test.tsx`；这些文件均位于 `src/components/schedule/`。另更新本说明。

- Schedule 组件测试：4 个文件 / 41 项通过。
- 全量：91 个测试文件 / 1320 项通过（包括 Memory、Quick Note、Activity、Location 和双桌面入口回归）。
- `npx tsc --noEmit`、`npm run build`、`git diff --check` 通过；新文件也单独检查空白错误。构建缓存恢复到本轮构建前内容。
- 新增覆盖固定筛选/单滚动所有权、自然高度空态、60 条记挂/长 TODO/400 条已触发记录的完整渲染、筛选复位与刷新保位、Popover 到确认框的操作/焦点、TODO 在途及失败状态、简短时区信息与失败恢复后保留草稿。

未使用 Playwright、浏览器自动化或线上接口，未 commit、push、部署。测试只验证结构和交互契约，不能替代实际布局测量。待人工检查：Classic / Editorial 下 320–390px 窄屏与短视口、浅深色/复杂壁纸的可读性、原生日期时间输入和软键盘、触屏/键盘 Popover 与确认框焦点、长列表触摸滚动及最后一项安全区。

## PR1.1：右上角固定数量与闹钟双视图（2026-10-19）

本节为当前布局：按最新视觉确认移除三个 Surface 内的列表标题和标题栏分隔线，仅保留右上角固定数量。页面 Header 与视图切换保留。仅修改 `ScheduleView.tsx`、`ScheduleRows.tsx`、`schedule-presentation.ts`、`ScheduleView.test.tsx`、`ScheduleWorkspace.test.tsx` 和本说明。未修改 Memory、其他业务页面、全局组件、DTO/API、控制器、Dialog、Toast 或 realtime。

### 实际复用来源

- `MemoryView.tsx` 的 `MemoryReadingPanel`：`flex min-h-0 flex-1 flex-col overflow-hidden` 固定阅读工作区，正文唯一承担 `overflow-y-auto`，固定区域为 `shrink-0`。
- `index.css` 的 `.memory-reading-panel` 与 `.mist-glass-strong`：继续直接复用已验收的半透明材质。
- `MemoryView.tsx` 的数量与 `index.css` 的 `.memory-total-decoration`：`font-decorative`、`text-xl`（20px），主题色 36% 与透明色混合，正常字重和原生数字形态；直接复用 `absolute right-3 top-2.5 z-10 sm:right-5` 固定在 Surface 右上角，不加额外字距。数字位于滚动节点之外，另有非装饰的屏幕阅读器文本。
- `MemoryItem.tsx` 正文：移动端 13px、`sm:text-sm`、正常字重、foreground 70% 与 muted-strong 混合。记挂和待办沿用 `leading-7`（28px）；闹钟按最新视觉确认局部收紧为 `leading-5`（20px），与下方日期行高一致。保留完整换行及长 URL 断行，不复制 Memory 的折叠、重要度、标签或分页。时间等元信息继续使用 `text-xs text-muted-foreground`。

### 三页最终结构

| 页面 | 滚动区之外的固定区域 | 唯一正文滚动区 |
| --- | --- | --- |
| 记挂 | PageHeader；Surface 右上角装饰数量 | 关注事项、已有的已取消记挂折叠区、必要反馈 |
| 待办 | PageHeader；独立等宽未完成/已完成 Segmented；Surface 右上角当前数量 | 当前视图任务与必要反馈 |
| 闹钟 | 与待办相同：PageHeader；独立整行等宽等待触发/已触发 Segmented；Surface 右上角当前数量 | 仅当前视图记录与必要反馈 |

Surface 按 Memory 模式占剩余高度，内部只有一个 `scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-contain` 区域，保留键盘焦点与底部安全区。正文与 Memory 一样从 `pt-5` 开始，空提示自身自然高度；不再保留列表标题行或空白标题栏。切换 TODO 或闹钟视图在布局阶段将该滚动区复位，普通读取/反馈更新不主动复位；保持原有 Classic / Editorial 共用入口与高度链。

闹钟整张列表共享自然宽度时间列加 `minmax(0,1fr)` 正文列，每条通过 subgrid 使用相同列轨道，避免不同时间字形宽度造成正文起点不同。功能时间使用 `tabular-nums`，不影响右上角装饰数量的原生数字形态；时间与正文均用 20px 行高，按首行行盒顶部对齐，避免大字号时间在基线对齐时顶部高出正文。正文利用剩余宽度，无固定内容列宽。日期在次级行仅展示一次，行内不重复分钟与当前视图状态。已触发记录没有取消按钮；等待记录仍经原 Popover 和确认框软取消。非法历史时间保留原文并显示待核对信息。

根据本轮补充要求，等待与已触发两个视图都按 `trigger_at` 的服务器本地分钟文本倒序：最新提醒日期/时间在最上方。兼容 `T` / 空格分隔，不经浏览器时区转换；无效时间放在有效时间之后，相同时间按创建时间及 ID 稳定排序。只改变前端排序，未改后端状态。

### 验证与待验收

全量 91 个测试文件 / 1326 项通过；`npx tsc --noEmit`、`npm run build`、`git diff --check` 通过。新增回归核对无列表标题栏、纸面右上角固定数量、闹钟复用独立 Segmented 结构、Memory 实际样式来源、日期/分钟不重复、两视图倒序、400 条已触发记录切换与单滚动区、空历史、视图切换只改变展示。原有 TODO 完成/恢复、取消确认、时区与实时提醒测试继续通过。

未使用浏览器自动化或线上业务接口，未 commit、push、部署。人工继续检查双桌面的窄屏/短高度视口、固定区占高、长正文与大数量的阅读效果、滚动到底及安全区、浅深色壁纸下装饰数字与正文的视觉层级。

## 创建日期与时间选择器收口（2026-10-19）

移除闹钟表单中重复的「提醒日期 / 提醒时间」可见小标题行；保留字段组标题、选择按钮的无障碍名称、服务器时区与异常恢复入口。

- 日期：新增 feature-local `ScheduleDateField.tsx`，组合已有公共 Calendar、Popover 与 Button，沿用现有日期选择模式。支持月切换、明确选日、清除、关闭不提交；日历尺寸受窄屏与可用高度约束，滚动条隐藏。
- 时间：直接复用未经修改的 `LocationTimeField` 和其两列滚动样式（`location.css`），保留已验收的 24 小时、60 分钟、键盘单选及取消/确认流程。没有新建全局时间控件，也没有改变定位页面。
- 记挂与闹钟创建弹框均移除原生 `type=date/time` 输入。待办没有日期/时间字段或日期筛选，本轮保持原有业务，不新增计划时间。
- 日历 Date 只承担日期 UI 值；保存时仍输出明确的 `YYYY-MM-DD`。打开选择器不自动选日、不自动写入午夜。闹钟空日期的日历初始月份和今日标记按已确认的服务器时区显示，时区未知/确认中禁止打开闹钟日历及创建；记挂只借当前可见月份方便浏览，不由此填入日期。
- 保留日期清除与时间清除，可让记挂恢复为仅日期或无日期。新建数据仍经原 `composeScheduleTime` 与控制器校验，服务器本地分钟文本、POST 不自动重试和未知结果反馈不变。

本次修改 `ScheduleCreateDialog.tsx` 与其测试，新增 `ScheduleDateField.tsx` 和测试，更新本说明；DTO、API、时区读取、列表、提醒和其他页面无改动。

全量 92 个文件 / 1335 项测试通过；TypeScript、生产构建、diff 检查通过。回归涵盖服务器月份边界、不经 ISO 转换、未选择不提交、日期清除、月份浏览/取消、禁用与异常时区、去掉原生输入及重复标签、现有小时/分钟组件确认取消、记挂仅日期、待办无日期字段和原有业务测试。

待人工检查窄屏日历、日历键盘导航、嵌套时间 Dialog 的关闭与焦点返回、短视口两列时间滚动以及服务器时区异常恢复。未使用浏览器自动化、未调用线上接口，未 commit、push 或部署。
