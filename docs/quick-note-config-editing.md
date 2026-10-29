# Quick Note 配置编辑交付与验收

日期：2026-10-29。状态：等待人工验收；未 commit、push、deploy，未开始 Diary Chat。

## 契约核对及范围

已核对 Penumbra Domain client、AionsHome 的 `aion-chat/quick_note_config.py`、`aion-chat/routes/quick_notes.py`、认证中间件、调度读取点以及现有 Dialog / 表单 / 测试约定。

- GET `/api/quick-notes/trigger-config` 返回 `hours`、按小时映射的 `labels`、`day_boundary_hour`、`time_zone`、`date_contract_error`。
- PUT 同路径，请求仅含 `hours: number[]`、`labels: Record<string, string>`；响应仅含小时和名称，不含日期元数据。前端等待 PUT 成功后另发 GET，以 GET 结果更新最终状态。
- 后端至少需要两个时段；小时为 0–23 的不重复整数；名称映射键必须与小时一一对应。重复名称和空字符串均为现有后端允许的值，前端保留原文。
- 后端会升序保存小时，调度和业务日界采用最小小时。经用户明确确认，本轮保持编辑行顺序，要求小时递增；交叉顺序时报错，不自动排序，也不改变调度规则。GET 解析移除原有静默排序，历史无序配置保持返回顺序，保存前须调整为递增。
- 静态配置 PUT 已在动态记录 PUT 之前注册，本轮无需修后端路由。有效登录会话可访问；未登录返回 401；既有迁移冻结模式会阻止相关接口。未放宽任何认证或冻结规则。
- 后端沿用 SETTINGS / save_settings 持久化，没有配置版本号、条件写入或并发冲突协议。未新增存储、版本系统或全局状态。
- 仅编辑现有时段，不提供增删或拖动排序；未修改 Step1/Step2、历史记录、日志、重跑和补写实现。

## 行为

在原有折叠「时段配置」内增加「编辑配置」，使用现有 Input、AppSelect 和 Button 内联编辑。保留玻璃表面、紧凑间距和移动端布局。

1. 打开编辑器重新 GET，不使用默认配置兜底。加载失败显示错误及「重试加载」。
2. 每行草稿保存小时与名称，修改小时不移动行；提交时从同一组行生成小时数组和名称映射，移除旧小时键。
3. 取消只销毁本地草稿，不写入。重新打开再读服务端。名称输入可键盘操作，加载后聚焦首字段，退出回到编辑入口。
4. 保存期间锁定字段和按钮，显示「保存中…」；PUT 后显示「正在读回…」，直至 GET 完成。控制器同时防止重复提交。
5. 成功采用 GET 返回的小时、名称、时区和日界；页面以新日界重新读取所选日期，并丢弃旧请求及旧补写候选。读取到相同配置时不重新加载记录。
6. 保存拒绝时保留草稿。网络异常、5xx 或 PUT 成功后读回失败时保留草稿，提供「核对保存结果」，该入口只发 GET。核对结果不同则保留草稿供用户决定再次保存，不自动重发 PUT。
7. 配置 GET 使用 `cache: no-store`。卸载时取消请求，忽略迟到响应；没有跨页面的草稿持久化。

## 修改文件

| 文件 | 用途 |
| --- | --- |
| `src/components/quick-note/QuickNoteConfig.tsx` | 折叠配置展示、内联编辑器和表单 |
| `src/components/quick-note/QuickNoteView.tsx` | 接入配置编辑组件及读回回调 |
| `src/application/quick-note/quick-note-config-controller.ts` | 草稿、加载、保存、读回与失败恢复 |
| `src/application/quick-note/quick-note-controller.ts` | 将读回配置应用于现有页面日期查询 |
| `src/domain/quick-note/quick-note-config.ts` | 草稿行转换、整数 / 重复 / 顺序 / 映射校验 |
| `src/domain/quick-note/quick-note-client.ts` | 现有配置 PUT 接入、配置 GET 禁止缓存 |
| `src/domain/quick-note/quick-note-types.ts`、`index.ts` | PUT 输入类型及导出 |
| `src/domain/quick-note/quick-note-mappers.ts` | 保留服务端顺序、对齐名称与最低时段数约束 |
| `src/domain/quick-note/quick-note.test.ts` | HTTP 请求、非法小时、重复、映射及顺序回归 |
| `src/application/quick-note/quick-note-config-controller.test.ts` | 草稿生命周期、错误、重复提交、读回、卸载 |
| `src/application/quick-note/quick-note-controller.test.ts` | 新配置日界查询、旧请求隔离及相同配置跳过重载 |
| `src/components/quick-note/QuickNoteConfig.test.tsx` | 表单语义、共享控件、加载 / 保存 / 恢复状态 |
| `tests/browser/quick-note-config-smoke.cjs` | 实际页面的三种宽度及操作回归 |
| `tests/diagnostics/quick-note-config-contract.py` | 隔离加载真实后端路由的 HTTP 契约检查 |
| `docs/quick-note-config-editing.md` | 本交付说明 |

没有后端文件、共享 UI 原语、全局状态、依赖或其他配置迁移的改动。

## 验证

- 速记相关 Vitest：12 个文件、225 项通过。
- 全量 Vitest：193 个文件、2625 项通过。
- `npx tsc --noEmit`：通过。
- `npm run build`：通过；保留现有 Chat bundle 超过 500 kB 的 Vite 提示。
- `git diff --check`：通过。
- 隔离真实后端路由检查：通过 GET / PUT 路由、小时名称映射、重复及空名称、保存后读回、临时文件重载、4 类非法配置不写入，并确认配置 PUT 不进入正文 CRUD。测试使用临时 SETTINGS / persistence stub，不接触真实配置和数据库。
- 实际 `/app/quick-notes` 浏览器检查：320 / 390 / 1280px 均通过，表单无横向溢出，字段控件高度均为 44px。覆盖打开加载、名称和小时编辑、取消不写入、重复 / 交叉小时拒绝、加载失败重试、保存失败保留草稿、保存期间重复提交、PUT 后 GET、读回失败后仅 GET 恢复、刷新后一致性，以及正文阅读 / 编辑、Step1 / Step2 重跑、原始日志观测。全部 API 为合成 fixture，外部请求被拦截。

浏览器结果：`/private/tmp/penumbra-quick-note-config/results.json`；截图：同目录 `editor-320.png`、`editor-390.png`、`editor-1280.png`。

已有后端测试也已尝试：`test_quick_note_date_contract.py` 与 `test_quick_note_write_contract.py` 共 24 通过、4 失败、36 fixture 错误。既有 `test_5am_day_boundary_recovery._load_schedule_runtime` 的 config stub 缺少当前 `command_parser` 导入的 `extract_hidden_reasoning_blocks`，在进入路由测试前失败。本轮未扩张到调度测试修复；上述独立真实路由检查用于验证本功能契约。

## 遗留限制与人工验收

- 后端没有原子并发保护，多客户端同时保存仍采用后写覆盖。未为本功能新建版本控制机制。
- 既有后端先更新进程内 SETTINGS 再调用 save_settings。持久化异常时 GET 可能读到进程内的新值；当前接口不能提供磁盘持久化的额外证明。本轮未调整该契约。
- 不支持时段增删、任意顺序或调度重构。草稿离开页面即丢弃。
- 自动验收不连接实际业务服务，也未验证部署环境权限及真实服务重启后的配置。人工验收需用有效会话检查一次实际保存 / 刷新，并确认目标环境没有启用迁移冻结。
- 等待人工验收，再开始 Diary Chat。
