# 时间功能 PR2：定时查岗

2026-10-19。仅修改 Penumbra；未调用线上业务接口、摄像头或模型，未使用浏览器自动化，未 commit、push 或部署。

## 本地代码核对

- 开工时两个仓库工作区均干净。Penumbra 基线 `c41eb50`；AionHome 基线 `057f1f5`，包含调度安全修复 `bcec0ce`。不能据此认定线上已部署。
- 本轮属于现有 Schedule 前端迁移 PR2，不改变后端运行时、命令、Prompt、数据表或事件契约。
- `aion-chat/schedule.py:163` 的 tick 单次在途保护、`:192` 的条件抢占和提交仍由后端负责。`:746` 的 `_fire_monitor` 在抢占后广播 `schedule_changed`，再检查摄像头；未运行时写系统消息并返回。
- 摄像头运行时，`:768` 广播 `{"type":"monitor_alert","data":{"content":"…"}}`，随后等待 5 秒、取截图并进入原模型流程。此通知不能证明截图或回复成功。
- `aion-chat/camera.py:696` 的常驻 Sentinel 也发送同结构的事件。没有任务 ID、时间或来源字段，不能精确关联某条查岗，也不能靠内容可靠去重。
- Android `AionApp/app/src/main/java/com/aion/chat/AionPushService.java:653` 同样只读取 `data.content`，发送高优先级监控通知，没有额外的任务关联信息。

## 页面组织与复用

两个桌面继续使用原 `clock` 入口和同一个 `ScheduleView`，不增加路由或图标。Header 下新增两个公共 `FilterChip`：闹钟 / 定时查岗。原公共 Segmented 的等待触发 / 已触发结构保留，只有一排实心分段控制。

Header、功能与状态控制均位于固定区；唯一的正文滚动区继续使用 `flex-1 min-h-0 overflow-y-auto overscroll-contain`、`.scrollbar-none` 和底部安全区。装饰数量留在纸面右上角，依当前类型和状态更新。没有恢复冗余列表标题。

功能切换重新挂载对应 Schedule 页面，释放旧控制器、请求与 Toast 所有权，回到等待触发并重置滚动；将焦点交给新视图的选中入口。写入期间和结果未知未核对时禁用功能切换，避免中断写入或丢失核对提示。状态切换仍只筛选本地快照，回到滚动顶部，不发 mutation。

查岗直接复用闹钟的连续列表、共享时间列和 subgrid、等高首行、功能字体等宽数字、日期次级文字、轻分隔线。active 与 triggered 都按服务器本地触发分钟倒序，非法历史时间置后并显示待核对。active 可取消；triggered 只读，无恢复、重试、重复、启停或通用编辑。

沿用 PR1.1 的 `.memory-reading-panel` + `.mist-glass-strong`、`MemoryItem` 的正文色层级、`MemoryView` 的 `.memory-total-decoration font-decorative`。未修改 Memory、其他业务页或全局 UI 规则，也未重调原闹钟列表样式。

## API、时间与摄像头

| 用途 | 实际契约 | 前端处理 |
|---|---|---|
| 查岗列表 | `GET /api/schedules` | 既有 DTO，按 `type=monitor` 和 active/triggered 筛选；不混入 alarm 或 cancelled |
| 创建 | `POST /api/schedules` | `type: monitor`、正文、`trigger_at: YYYY-MM-DD HH:mm`；响应核对类型、内容、时间和状态 |
| 取消 | `DELETE /api/schedules/{id}` | 沿用软取消，随后 GET 核对同 ID/类型/状态；`ok:true` 不能独立证明成功 |
| 时区 | `GET /api/quick-notes/trigger-config` | 既有域适配层读取实际 `time_zone`，未知或重新确认期间禁止创建 |
| 摄像头快照 | `GET /api/cam/status` | 只接受布尔 `camera_open`；忽略常驻 `monitoring` 与静默时段，失败回到未知 |
| 设备设置 | 后端旧版 `/camera` | 新标签打开，不迁移设置，不主动调用开关/截图接口 |

创建继续使用公共 Dialog、既有 `ScheduleDateField`（Calendar/Popover）与 `LocationTimeField`。日期、时间必填且精确到分钟，不通过浏览器时区或 `toISOString()` 转换。正常状态只显示简短行为说明、实际服务器时区与设备快照。

摄像头状态仅在创建 Dialog 打开时读取，提供刷新；返回可见状态时重读，关闭后终止请求并忽略迟到结果。运行、未运行、未知分别展示。未运行或未知不阻止计划创建，创建也不打开摄像头；当前运行不保证执行时可用。

旧版设置链接按既有 API base 解析。本地空 base 场景补充精确开发代理及必要的公共资源，避免 `/camera` 落到 SPA；不增加前端路由，不暴露开发代理目标。生产网关和登录行为仍需人工验收。

POST 没有幂等键，超时、网络错误或响应无法核对会保持内联未知结果，禁止再次提交，不自动重发。重复点击受既有 pending 保护。401、422 等明确拒绝继续显示表单错误。确认成功才进入公共 Toast。

取消核对到 cancelled 后只提示「查岗已标记取消」。确认框明确：若已经被后端抢占，即使随后标记取消，也不保证撤回进行中的截图或回复。若核对看到 triggered 或找不到 ID，则保留持续反馈，不发布取消成功 Toast。后端的无条件软取消契约未改变。

## 公共实时提醒

复用根部 `ScheduleRuntime` 的现有连接，不另建 WebSocket。既有 `monitor_alert` 映射不变，根部把它与闹钟合并到一个本地 FIFO 提醒队列；不会同时展示两套提醒 Dialog。

- `schedule_changed`、闹钟与摄像头通知均短时合并失效；当前页面重读，未打开的功能进入时重新读取。
- 连接建立、重连、页面重新可见时仍主动补读，事件缺失不妨碍列表恢复。
- 闹钟继续按 ID + 触发时间去重，保留最近 512 个键。查岗事件缺乏可靠标识，相同内容也可能是真实的第二次查看，因此保留每次收到的通知，不承诺精确去重。
- 摄像头通知采用中性的「开始查看摄像头」，明确尚未确认截图或回复结果；无法判定它来自定时查岗还是 Sentinel。没有编造时间、任务 ID 或成功状态。
- Dialog 只展示经过 React 转义的正文，没有截图、图片或敏感附件，也不创建聊天消息。Chat 的既有 realtime reconciliation 忽略这些通知，模型回复继续经原消息事件更新。
- 关闭仅移动本地提醒队列，不改任务状态、不阻止后台执行。没有离线补发或自动重试承诺。摄像头未运行时，后端可能只发 `schedule_changed` 与系统消息，前端不会合成成功提醒。

## 修改文件与验证

领域：`schedule-types.ts`、`schedule-client.ts`，新增 `domain/schedule/schedule-camera.ts`。

应用：`schedule-controller.ts`、`schedule-realtime.ts`，新增 `application/schedule/schedule-camera.ts`。

呈现：`ScheduleView.tsx`、`ScheduleRows.tsx`、`ScheduleCreateDialog.tsx`、`ScheduleCancelDialog.tsx`、`ScheduleRuntime.tsx`、`schedule-presentation.ts`，新增 `ScheduleCameraStatus.tsx`。

测试：更新原 Schedule domain/controller/realtime/view/workspace/create/entrance 测试，新增 camera 读取/生命周期与展示测试；开发代理及对应测试同步补充，开发环境说明同步更新。

验证使用 mock fetch、mock WebSocket、实际回调和静态渲染；没有浏览器、真实设备或线上写入。覆盖类型隔离、400 条历史、长正文、空列表、固定滚动/数量、创建校验、未知时区、三种设备状态、未知写入不重发、取消竞态/缺失 ID、跨页提醒、重复事件限制、重连、卸载及双桌面入口。

最终验证：`npm test -- --reporter=dot` 通过 94 个文件 / 1388 项测试；`npx tsc --noEmit`、`npm run build`、`git diff --check` 和新增文件空白检查均通过。构建产生的 `tsconfig.tsbuildinfo` 已恢复为开工时内容。测试未替代真实浏览器和设备验收。

## 人工验收

1. 对照实际服务版本确认 PR0 和时区读取接口部署情况，用测试环境核对服务器当地分钟，不以开发机时区代替。
2. Classic / Editorial 在窄屏、短视口、软键盘和字体放大下，检查功能切换的触屏/键盘焦点、固定控制区、唯一正文滚动和右上数量；400 条历史、长 URL、浅深色及不同壁纸下确认可读性。
3. 检查创建 Dialog 的 Calendar、时分选择、服务器时区失败恢复、摄像头三态及旧版设置页链接和认证。生产网关需保留旧页面及静态资源；本轮不迁移旧版登录/PWA。
4. 经人工授权在测试环境使用真实摄像头，分别验证运行、未运行、触发前关闭，以及查岗已抢占后再取消的边界。关闭常驻自动监控或处于其静默时段，不应取消一次性查岗。
5. 在其他页面收到开始查看通知，确认截图/回复只进入原后端与聊天链；断网重连只补列表，不假定重放提醒。相同正文的两次真实查看都应能被提示。

工作区修改保留等待验收；没有调整后端、历史数据、常驻监控、日志、Widget 或其他业务页。
