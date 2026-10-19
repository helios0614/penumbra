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
2. 移动端键盘、原生日期/时间选择器、Dialog 焦点/叠放、滚动与回顶，长正文、浅深色及壁纸下的密度和对比度。
3. Classic / Editorial 的打开与返回，创建/取消、TODO 完成恢复、记挂取消后的既有 Prompt 结算行为。
4. 通过实际 AI 命令创建记录，核对在线刷新；断网重连、跨页收到闹钟通知，以及主模型回复沿原对话链出现。这里只核对链路，不将已触发当作执行成功。
5. 本轮未迁移 Widget / TodayPanel 的数据；它们仍为已标注的日期展示/示例清单，后续单独接入。monitor 留 PR2。
