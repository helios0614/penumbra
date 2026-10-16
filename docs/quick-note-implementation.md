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
