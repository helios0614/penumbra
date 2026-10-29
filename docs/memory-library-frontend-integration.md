# Memory Library 管理与总结能力接入

日期：2026-10-29（Asia/Shanghai）。Penumbra 基线 `998ddc4`；后端契约基线为已提交的 AionHome `ecb9ab4`（Memory Requeue Phase 1）。本轮只修改 Penumbra，不修改后端，不 commit、push 或 deploy，完成后等待人工验收。

开工时 Penumbra 已有未跟踪的 `docs/memory-library-audit.md`，完整保留；AionHome 工作区干净。已核对用户提供的 AGENTS 指令、CLAUDE.md、UI development/guidelines、design-spec 和 ui-patterns、前次审计、后端实施报告及实际 routes/memories.py、memory.py、memory_requeue.py。实现以当前提交源码为准，没有请求真实后端或读取真实记忆。

## 1. 完成范围与关键判断

六类能力均已接通：编辑、普通删除、单条重新总结、批量总结新记忆、删除并重新总结来源、任务状态查询与列表刷新。

保留现有连续阅读面板、30 条分页、默认全部时间、服务端日期倒序、可选 Pin 优先、搜索/筛选、长文展开与 Pin 流程。新增 Header 的“总结新记忆”和“刷新记忆库”图标；每条记忆新增常驻“更多”入口。没有新增管理页面、厚卡片、颜色/token 或共享组件体系。

实施前确认的两个限制决定了本轮做法：

1. 后端任务只有 pending/completed，没有 running、任务列表或批量任务执行 ID。前端不建立定时轮询，不把 pending 显示为执行中，不伪造重新进入页面后的任务恢复。
2. 旧列表的 tags 投影最多保留 32 个，展示前 8 个。编辑不能拿展示投影覆盖原数据，因此额外保留完整 keywords wire 值；未改动的关键词、重要度不发送。

## 2. 文件清单与各层职责

| 层 | 文件 | 职责 |
| --- | --- | --- |
| Domain 既有基础 | [memory-types.ts](/Users/remix/Desktop/Penumbra/src/domain/memory/memory-types.ts)、[memory-mappers.ts](/Users/remix/Desktop/Penumbra/src/domain/memory/memory-mappers.ts)、[index.ts](/Users/remix/Desktop/Penumbra/src/domain/memory/index.ts) | 保留原阅读投影；新增可选 keywordsForEdit 存储完整关键词值，导出管理契约 |
| Domain 管理请求 | [memory-management-types.ts](/Users/remix/Desktop/Penumbra/src/domain/memory/memory-management-types.ts)、[memory-management-mappers.ts](/Users/remix/Desktop/Penumbra/src/domain/memory/memory-management-mappers.ts)、[memory-management-client.ts](/Users/remix/Desktop/Penumbra/src/domain/memory/memory-management-client.ts) | 输入类型、实际 HTTP 响应解析、业务 ok:false、目标 ID 验证、URL 编码及专用超时 |
| 既有列表协调 | [memory-list-controller.ts](/Users/remix/Desktop/Penumbra/src/application/memory-list/memory-list-controller.ts) | 新增 runWrite，共用原按 ID pending/Abort 与 GET 协调；新写操作之后按需恢复空尾页。没有替换原读取、Create、Pin、筛选与序列保护 |
| 管理 application | [controller](/Users/remix/Desktop/Penumbra/src/application/memory-management/memory-management-controller.ts)、[types](/Users/remix/Desktop/Penumbra/src/application/memory-management/memory-management-types.ts)、[service](/Users/remix/Desktop/Penumbra/src/application/memory-management/memory-management-service.ts)、[index](/Users/remix/Desktop/Penumbra/src/application/memory-management/index.ts) | 页面内操作生命周期、来源预检、任务快照、单次查询、错误分类与卸载取消；不承担后端生成状态机 |
| 页面与 hook | [useMemoryList.ts](/Users/remix/Desktop/Penumbra/src/components/memory/useMemoryList.ts)、[MemoryView.tsx](/Users/remix/Desktop/Penumbra/src/components/memory/MemoryView.tsx)、[MemoryItem.tsx](/Users/remix/Desktop/Penumbra/src/components/memory/MemoryItem.tsx) | 将新协调器与既有列表组合，连接入口、Dialog、Toast、轻量反馈；保留原正文及面板结构 |
| 单条操作 UI | [MemoryActions.tsx](/Users/remix/Desktop/Penumbra/src/components/memory/MemoryActions.tsx)、[MemoryEditDialog.tsx](/Users/remix/Desktop/Penumbra/src/components/memory/MemoryEditDialog.tsx)、[MemoryConfirmDialog.tsx](/Users/remix/Desktop/Penumbra/src/components/memory/MemoryConfirmDialog.tsx) | 四个文字菜单项、编辑表单、普通删除/单条总结/组合操作的不同确认语义 |
| 反馈与分页 | [MemoryManagementFeedback.tsx](/Users/remix/Desktop/Penumbra/src/components/memory/MemoryManagementFeedback.tsx)、[MemoryPagination.tsx](/Users/remix/Desktop/Penumbra/src/components/memory/MemoryPagination.tsx) | 实际批量结果、任务状态；分页组件从 MemoryView 原样抽出，保持 View 小于 300 行，未重写分页 |
| 测试 | [原 domain 测试](/Users/remix/Desktop/Penumbra/src/domain/memory/memory.test.ts)、[新 domain 测试](/Users/remix/Desktop/Penumbra/src/domain/memory/memory-management.test.ts)、[application 测试](/Users/remix/Desktop/Penumbra/src/application/memory-management/memory-management.test.ts)、[UI 测试](/Users/remix/Desktop/Penumbra/src/components/memory/MemoryManagement.test.tsx) | 扩展完整关键词字段预期；新增 33 条管理契约、协调、交互与清理测试 |
| 浏览器合成验收 | [smoke 脚本](/Users/remix/Desktop/Penumbra/tests/browser/memory-library-smoke.cjs)、[fixture HTML](/Users/remix/Desktop/Penumbra/tests/browser/memory-library.html)、[fixture TSX](/Users/remix/Desktop/Penumbra/tests/browser/memory-library.tsx) | StrictMode 下真实 MemoryView + 合成 HTTP；阻止外部网络，覆盖 320/390/1280 宽度 |
| 交付 | 本报告 | 契约、状态、验证与边界 |

未修改共享 UI primitives、全局 CSS、MemoryFilters、原创建表单、后端代码、Chat、WebSocket、Prompt、召回算法或其他业务模块。没有新增运行时依赖。构建生成的 tsconfig.tsbuildinfo 仅恢复本轮生成部分，保留业务差异。

## 3. 实际 API 契约

全部通过现有 apiGet/apiRequest，沿用 URL 解析和 `credentials: include` 会话认证；没有组件直写 fetch，没有摘要锚点请求。

| 功能 | 请求 | 响应处理 |
| --- | --- | --- |
| 编辑 | PUT /api/memories/{id}；content 必发，keywords/importance 仅用户改动时发送 | 校验 ok:true、id 等于目标；不从回执虚构完整实体，随后 GET 列表 |
| 普通删除 | DELETE /api/memories/{id}；无 body | 校验 ok:true；只调用此写接口，随后 GET |
| 单条重新总结 | POST /api/memories/{id}/re_summarize；无 body | HTTP 200 的 ok:false 仍是失败；成功校验原 ID 与结果字段，再 GET |
| 总结新记忆 | POST /api/memories/digest；无 body | 保留 ok/message/new_memories_count/processed_messages 及可选 pending/outcome/history 字段；ok:false 可以有部分成功，仍 GET |
| 来源预检 | GET /api/memories/{id}/requeue-source | supported:true 必须有正 source_count；false 显示实际 reason 对应的可理解文案；未知原因保守禁用 |
| 删除并重新总结来源 | POST /api/memories/{id}/delete-and-requeue；无 body | 校验任务 ID、deleted_memory_id 匹配目标、pending/completed、source_count、结果 ID、last_error、deduplicated；不拆成两个写请求 |
| 任务查询 | GET /api/memories/requeue/tasks/{task_id} | 校验任务 ID 和已知来源目标，拒绝伪造 running 或终态倒退；completed 后不再自动查询 |

所有 ID 使用 encodeURIComponent。编辑等待上限 60 秒；单条/批量总结为 600 秒，避免直接继承原 30 秒超时。批量材料很多时仍可能超过上限；超时表示结果不明，不表示后端停止，也不自动重发 POST。

编辑正文保留原始空白/换行，但提交前要求非空；重要度 UI 沿用现有 domain 的 0–1 范围，不在前端重算评分。后端 MemoryUpdate 没有同样严格的范围校验，这不是前端声称的后端保证。旧记录的重要度为空/异常时不自动补成 0.5，未修改就省略。类型、来源、时间、Pin、Embedding 等字段不随编辑回写。

keywordsForEdit 保留完整原始字符串或数组的序列化形式。编辑回填尽量展示完整字符串数组；未知旧格式原样显示。关键词不改则不发送，避免截断、去重或分隔符转换带来隐式改写；明确修改后才按现有逗号规则序列化为 JSON 数组字符串。

## 4. 操作状态与数据一致性

| 操作 | 状态流转与反馈 |
| --- | --- |
| 编辑 | 打开时固定目标和草稿 → 校验 → pending → 成功 GET 并关闭；失败保留表单和输入；取消不写请求。背景 GET 不覆盖草稿 |
| 普通删除 | 独立 AlertDialog，说明只删记忆记录、不删原消息、不自动总结且无内置恢复 → pending → GET；失败保持现有数据与确认框，不假定已删除 |
| 单条总结 | 单独确认说明保留 ID、来源不足时后端可能回退正文，以及覆盖正文/关键词/重要度/待继续状态 → pending → GET；ok:false 或异常保留显示与错误，不转为删除新建 |
| 批量总结 | Header 显式点击 → 禁重复提交，显示可能同时处理增量和历史队列 → 展示后端实际 message 和计数 → GET。零生成显示 0；部分失败保留失败提示及真实已生成数量 |
| 组合删除 | 可用来源预检 → 确认 → 后端原子组合请求 → GET → 展示任务真实状态。pending 只提示来源已入队，completed 才提示已完成 |
| 任务查询 | 单次读取 → pending/失败待处理/completed；查询失败保留上次已知状态并提示无法读取。没有根据正文变化猜测任务完成 |

新写操作复用列表 controller.runWrite 的按 ID 锁和 AbortController。与既有 Pin 操作互斥，同一条记忆不能重复提交；批量总结期间页面写入口和 Pin 禁用，搜索/阅读仍可用。没有乐观删除、乐观改正文或把 API receipt 当成永久列表实体。

每次写操作结束都会重读当前查询，失败或不确定结果也先通过 GET 核对。现有 requestSequence/Abort 继续负责读取所有权。写成功但 GET 失败时，单独显示“请求已完成/列表未同步”，保留旧数据并允许仅重试 GET，不自动重放写请求。

新写操作后的 GET 若在空尾页，会用服务端 total/pageSize 找到更小的有效页，再经相同读取流程加载；全部删除则回第一页空态。这个恢复标记限定于新写操作后的读取，不改变普通翻页、筛选或原 Pin 的行为。原默认 30 条、全部时间、排序与筛选参数没有改动。

来源查询按目标取消旧请求；批量总结结束后的任务查询会替换尚未完成的旧查询，防止旧 pending 覆盖新 completed。页面卸载时清理管理订阅、全部来源/任务在途 GET，并通过列表 controller 取消在途写请求；晚到结果不会继续发布状态或成功 Toast。取消 HTTP 不等同于撤销服务器操作。

## 5. 来源预检、组合事务与任务查询

打开“更多”菜单时，按该 ID 查询来源能力。检查期间/失败/不支持时，“删除并重新总结来源”不可执行，菜单显示原因；来源可用后才可选择。

进入组合确认后再预检一次；最终 POST 仍由后端重新验证。以下情况不会被前端擅自降级：source_untracked、source_missing、source_changed、source_not_historical、source_already_represented、source_requeue_pending。未知 409 也阻止继续确认，必须重新检查。即使旧条目带 source_start_ts/source_end_ts，也不能替代精确来源预检。

组合请求只发后端原子接口。来源冲突时不调用普通 DELETE、不构造消息范围；存储失败、网络错误或响应不明时不假定删除或入队已完成。用户可显式重试同一组合接口以取得后端按 origin_memory_id 保留的幂等回执；前端不自动重试。若重放返回 completed，按真实终态展示，不先显示“刚入队”。

任务是页面生命周期内的轻量快照：

- 组合请求返回任务后单次查询一次。
- 本页批量总结结束后，无论成功或失败，单次查询已知 pending 任务。
- pending 条目提供“查询状态”；completed 后移除此入口。
- pending + last_error 显示“来源总结失败，任务仍待处理”及原因；没有 failed 终态，也不会因此清除任务。
- 完成首次被确认时再 GET 列表，获取服务端新 ID/内容；不把原记忆 ID 当作重建结果。
- **不设置 interval 或任务定时器**。当前契约没有定义异步 running 状态，pending 包括尚未提交结果的任务，不能据此启动执行进度轮询。

后端没有任务列表或重新进入页面的恢复查询接口，本轮不将任务写入 localStorage、不建立跨页任务中心。重新进入会重新读记忆列表，但不自动恢复已丢失的 task_id；服务端任务本身仍然存在并由后续 digest 处理。其他设备/日界处理后的结果，需要在本页手动查询已知任务或刷新列表确认。

## 6. UI 复用

使用现有 PageHeaderAction、Popover、Dialog/AlertDialog、Input、Textarea、Button、Toast；沿用 Mist 强玻璃、现有主题/语义 token、边框、圆角、阴影与功能字体。英文 Memories Header 的现有装饰字体和总数数字风格不改；没有 Emoji 图标，新增图标均为 Lucide。

仓库没有现成独立 DropdownMenu，本轮沿用现有 Popover 菜单组合，补齐 role=menu/menuitem 和方向键/Home/End。菜单触发按钮常驻且有 title/aria-label，不依赖 hover/长按。Pin 与更多各保留 44px 触控区域，只增加元数据区的右侧留白，不改正文阅读样式。

编辑/确认复用共享自然高度和内部滚动布局，保存期间禁用重复提交及关闭；确认框遮罩不触发危险操作。关闭后通过 finalFocus 返回仍存在的记忆阅读区域。反馈采用面板内分隔行和短文案，不给每条记忆再套管理卡片，也不增加新的全局样式。

## 7. 验证结果

### 自动化与构建

- Memory 专项合计 **118 条通过**：既有 85 条及新增 33 条。新增覆盖输入回填/取消/失败保留、完整关键词、七个请求契约、业务 ok:false、空/部分失败结果、来源可用/不可用/变化/未知冲突、普通删除不入队、空尾页回退、Pin 共用锁、重复点击、过期 GET、来源/任务所有权和卸载取消。
- 全项目 `npm test`：**189 个文件、2540 条通过**，无失败。
- `tsc -b` 通过；`npm run build`（包含 TypeScript）通过。Vite 仍有既有大 chunk 提示，本轮未改动 Chat 或构建拆包策略。
- 合成浏览器验收：**320px、390px、1280px 全部通过**；每种宽度执行 54 次合成 API 请求，页面 JS 错误为 0。覆盖真实 MemoryView 的编辑失败/重试、单条总结、来源冲突与恢复、入队/完成、批量空结果/失败、普通删除尾页、搜索/日期/Pin-first、长文展开/收起、菜单键盘、短视口、pending 请求卸载，以及深色页面。
- 几何检查验证主要页面、菜单、编辑/确认 Dialog 不横向溢出，短编辑视口高 360px 时保存按钮可达；已查看合成截图。没有将 Chromium 触屏模拟称为 iOS/Android 真机验收。

复现命令（在 Penumbra 根目录）：

```sh
npm test -- src/domain/memory src/application/memory-list src/application/memory-management src/components/memory
npm test
npm run build
```

浏览器脚本需本地 Vite、Playwright 与可用 Chromium，所有 API 都被 fixture 拦截；启动测试服务时清空 API 和代理配置，避免接入实际服务：

```sh
VITE_API_BASE_URL= VITE_API_BASE= PENUMBRA_DEV_PROXY_TARGET= npm run dev -- --host 127.0.0.1 --port 45414 --strictPort
node tests/browser/memory-library-smoke.cjs <playwright模块路径> <Chromium可执行文件路径>
```

本轮使用已有 Chrome 二进制和临时浏览器配置，未读取个人浏览器资料；首次在受限沙箱内启动失败，随后经受控授权运行纯合成测试。测试选择 data-open 的当前菜单，避免把关闭动画中的旧 Popover 当作活动菜单；没有为验收去修改共享动画或样式。

临时证据：[测试日志](/private/tmp/memory-library-frontend-tests.log)、[构建日志](/private/tmp/memory-library-frontend-build.log)、[390px 入队反馈](/private/tmp/penumbra-memory-library-smoke/queued-390.png)、[320px 短编辑框](/private/tmp/penumbra-memory-library-smoke/editor-short-320.png)、[1280px 深色页面](/private/tmp/penumbra-memory-library-smoke/dark-1280.png)。临时文件清理后不保留，验证结论与限制已记录在本文。

### 未覆盖与现存风险

- 未连接已部署 AionHome，未写真实记忆，未实际请求模型、digest 或迁移数据库；后端工作区保持干净。
- 未做手机真机键盘、VoiceOver、浏览器返回手势、真实多设备并发、十分钟长请求和网络恢复联调。
- 后端普通 PUT、单条 re_summarize 仍有前次审计中的限制：缺少完整版本冲突/目标消失回执；Embedding 失败可能仍保存。前端按现有契约发请求并 GET，但不能据此提供后端没有保证的并发安全、撤销或索引修复。
- 单条重新总结仍是后端原语义，可能按时间范围取材或用当前正文回退；严格精确来源约束只用于新组合操作。确认框已说明回退和元数据覆盖，不把两种操作混为一谈。
- 后端没有批量执行查询/进度、任务 running、取消任务、全局任务列表、跨设备 Memory 失效事件或历史恢复接口。超时/卸载后无法自动证明服务端停止；页面也不会以内容变化猜测完成。

## 8. 最终回答

1. **六类能力是否全部接通？** 是，已按后端已提交契约接通；写后列表读取仍由原 controller 负责。
2. **后端尚不支持哪些交互？** 无准确批量执行进度/取消、任务 running、全局任务列表恢复、记忆撤销/版本冲突保证；本轮没有伪造这些交互。
3. **任务状态能否自动更新？** 本页入队后和批量总结结束后会单次查询；pending 不定时轮询。其他设备完成任务不会即时推送到本页，需手动查询；重新进入不恢复未知 task_id。
4. **旧记忆来源不完整如何处理？** 依据服务端 source_untracked 等原因禁用组合操作并说明；不以时间范围、类型或会话字段猜测来源，也不会先删除再报告失败。
5. **是否出现现有 Memory 功能回归？** 本轮自动化及三种宽度验收未发现；30 条分页、默认全部时间、筛选、排序、Pin、展开/收起、读取恢复继续有效。真机与真实后端联调仍待人工验收。
