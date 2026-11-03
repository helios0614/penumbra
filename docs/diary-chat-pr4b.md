# Diary Chat PR4-B：正文提取、预览与归档

2026-11-03，Asia/Shanghai。已完成前端闭环和日历快捷入口，未 commit、push 或 deploy。

## 开工核对与实现选择

已检查旧页 `AionsHome-main/aion-chat/static/diary.html` 的 `extractDiaryFromMsg`、当前 `routes/diary.py` Entry GET/PUT、Penumbra 的 Diary write client、Reader 编辑/缓存以及 PR4-A 消息操作和 overlay 装配。

- 旧页无结构文本的 fallback 会把普通聊天当正文，且提取会混用 `_currentEntry` 旧字段。本轮改为纯解析器和独立内存草稿，要求非空的 `【正文】`，不保留旧 fallback。
- 原 PUT 需要显式 `status: done` 才归档；返回 `ok:true` 不证明行存在或字段保存正确。因此保存前核对 Entry 身份与来源消息，PUT 后使用原 `getArchivedDiary` GET 校验 ID、日期、done 和有效正文，再逐项比较提交字段。
- `importance: null` 无法通过现有 PUT 清空。预览留空时省略 importance，保留服务端原值，界面明确说明。其他缺失字段在独立预览中为空标题/空列表，确认后按预览提交，不从旧 Entry 混入字段。

没有修改后端、表结构、迁移、Prompt、Recall、NextGroup、投喂批次、ReadOriginalDialogue、原文侧栏、模型解析或消息编辑/删除/regenerate 语义。Main Chat 只经过共享组件的可选回调扩展，原调用方没有启用提取。

## 修改清单

| 文件 | 修改内容 |
| --- | --- |
| `src/domain/diary/diary-body-parser.ts` | 纯解析器：标记分段，保留多段正文，关键词中英文逗号/顿号拆分去重，重要度 clamp 0–1，沿用中文标签映射并接受已有代码。拒绝无正文、重复正文、引用/代码围栏中的格式示例；可选字段缺失或重要度无效不拒绝有效正文 |
| `src/application/diary-chat/diary-extraction-controller.ts` | 独立草稿、手动提交、保存前来源检查、PUT/GET 核对、失败保留、未知结果仅 GET 核对、来源失效、导航与卸载时中止晚到响应 |
| `src/components/diary/useDiaryExtraction.ts` | 当前组件持有的提取控制器生命周期 |
| `src/components/diary/DiaryExtractionPreview.tsx` | 复用 Dialog、关键词编辑器和自定义标签编辑器，允许人工修改五个字段；适配 Dialog 的手机键盘视口与滚动，固定保存/取消区域 |
| `src/components/diary/DiaryQuickExtract.tsx` | 选中日期的“尝试提取正文”；读取明确 Entry 的持久消息，按服务端数组逆序寻找最近可解析的 assistant；失败仅局部提示 |
| `src/components/diary/DiaryChatView.tsx` | 持久 assistant 消息接入提取，包括最后一条；所有 overlay 隐藏入口。刷新发现来源消失/变化时使草稿失效，归档后刷新 Chat 的 Entry 状态 |
| `src/components/chat/{MessageActions,Bubble,BubbleList}.tsx` | 共享操作栏增加可选 `onExtract` 与逐消息策略；没有传入时保持原行为 |
| `src/application/diary-reader/diary-reader-controller.ts` | 接收已核对的归档结果，取消较早读取，更新同 Entry 阅读缓存、选中日预览与日历的 done/archived/标题/正文标志；已有编辑保存复用同一更新函数 |
| `src/components/diary/DiaryView.tsx` | 装配日历入口与归档后的 Reader 同步 |
| `src/domain/diary/diary-body-parser.test.ts` | 28 项解析测试 |
| `src/application/diary-chat/diary-extraction-controller.test.ts` | 30 项提取、保存、回读、来源失效、隔离和日历测试 |
| `src/components/diary/DiaryChatActions.test.tsx` | 在既有共享组件真实渲染测试中检查提取的角色、持久消息/overlay、发送期间入口边界 |
| `tests/browser/diary-chat-pr4b-smoke.cjs` | 合成生产页面验收，可通过环境变量指定隔离 dist 与输出目录 |
| `docs/diary-chat-pr4b.md` | 本文 |

## 保存与失效行为

1. 点击消息提取只解析原消息，零写入；预览副本与 Entry、消息对象完全分离。取消直接丢弃本次草稿。
2. 点击“确认保存并归档”后，GET Entry 核对 ID/日期，再 GET 持久消息核对来源 `(entryId,messageId,role,content)`；来源被删除、替换或改变时拒绝 PUT。
3. 使用原 `updateArchivedDiary` 提交标题、正文、关键词、标签、可选重要度及 `status: done`。没有新增归档接口。
4. GET 原 Entry，通过原 mapper 检查身份、done 和有效正文，并核对全部提交字段，成功后才关闭预览和发布到日历/阅读状态。
5. 明确拒绝时保留草稿，允许人工重试。响应或读回不确定时保留草稿并禁用再次保存，通过“核对结果”只做一次 GET；不自动重发 PUT、不循环读取。
6. 消息删除/重新生成不回滚已保存日记。后续聊天也不会同步覆盖归档正文。

日历入口不使用 pending、finished、auto_feed_status、SSE EOF 推断任务完成，不调用模型，不保存、不归档、不建立任务注册表或轮询。末尾只有普通聊天时，会继续向前寻找最近可解析的持久 assistant；没有候选时给出轻量提示。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| 最终全量 `npm test` | **211 个文件、2804 项通过**，本轮新增 58 项 |
| TypeScript / 生产构建 | 根目录构建及无 `.env` 隔离副本 `npm run build -- --base=/` 通过；构建缓存不作为源码修改交付 |
| PR4-B 新浏览器脚本 | **8 组通过**：Classic/Editorial × 320/390/1280px 浅色，加两种布局的 390px 深色；高度 640px |
| PR4-A 原浏览器脚本 | **8 组通过**，覆盖既有编辑、删除、regenerate、SSE/WS 时序、失败和 Entry 切换隔离 |
| PR3 原浏览器脚本 | **6 组通过**。原脚本假定当前为十月，首跑在十一月停于月份断言；临时副本仅固定测试时钟为 2026-10-30 后通过，仓库原脚本未修改 |
| Main Chat 原编辑脚本 | **320/390/1280px 三组通过**，包括 User/Assistant 编辑、失败保留、回读、regenerate、IME、导航与短屏 |
| 差异检查 | `git diff --check` 通过；未暂存、commit、push 或 deploy |

新浏览器脚本每组验证：普通聊天提取失败不改 Entry、最后一条 AI 与部分字段预览、取消零写入、五字段人工修改、422 保存失败保留及手动重试、归档 GET 读回、WS 历史刷新后来源删除失效、regenerate 临时消息无入口/旧草稿失效/新消息可提取、读回失败后只核对不重复 PUT、归档后续聊不覆盖正文、日历快捷提取/保存/阅读同步、无候选与读取失败两类轻量提示。

浏览器只访问本地合成 HTTP/SSE/WS，PR4-B 脚本阻止非本地域名请求；没有真实数据或模型调用。已查看 320px 预览和 Editorial 深色日历截图，操作栏和弹窗均通过横向边界检查。

测试日志：`/private/tmp/penumbra-pr4b-tests-final.log`、`penumbra-pr4b-isolated-build-final.log`、`penumbra-pr4b-browser.log`、`penumbra-pr4b-pr4a-regression.log`、`penumbra-pr4b-pr3-regression.log`、`penumbra-pr4b-main-regression.log`。隔离源码/构建位于 `/private/tmp/penumbra-pr4b-6on0tai7`；PR4-B 截图位于 `/private/tmp/penumbra-diary-pr4b-browser`。

## 初版已知限制（解析规则已由下节后续优化更新）

- 目前只接受明确的 `【正文】` 结构（支持同一行紧凑标记、Markdown 加粗/标题和 CRLF），不猜测普通散文或 `正文：` 形式。多个正文块需要先在聊天中整理成单一候选。
- 草稿仅在当前页面内存中保存；取消、离开/卸载或刷新页面会丢弃草稿。不会写入数据库或浏览器持久存储。
- 现有后端没有版本号/CAS，来源核对与 PUT 之间仍有并发窗口；前端不能保证跨客户端原子更新。删除没有 WS，其他客户端的删除可能要到历史刷新或保存前核对才被发现。日历预览也在保存前重新核对来源。
- PUT 不支持清空重要度，留空会保留服务端原值。embedding 的成功与否也不能由原 `ok:true` 或 GET 正文确认，本轮不改变该契约。
- 未连真实服务/provider 做生产端到端验收；移动端为 Chromium 触摸与视口模拟，未做 Safari 或真机键盘验收。

## 后续优化：日历预览操作区与自由正文

2026-11-03。本节记录本次后续优化，替代上文初版关于多个正文块、换行和日历按钮排布的描述。

### 修改清单

- `DiaryFeedAction.tsx`：利用现有操作行接收原有提取组件；“开始投喂”使用现有 `outline` 玻璃描边样式。
- `DiaryQuickExtract.tsx`、`DiaryView.tsx`：移除提取按钮外层留白，将“提取日记”放入同一操作行，使用现有 `soft-primary` 浅主题色。两按钮同为 `comfortable`（至少 44px）、相同圆角和字号，间距 12px。反馈另起行，原可见条件、disabled 条件、投喂确认和提取点击行为不变。未新增组件或文件。
- `diary-body-parser.ts`：多个行首 `【正文】` 块按出现顺序合并；正文无需固定 Markdown 模板。保留自然段、标题、加粗、列表、缩进、硬换行、原 LF/CRLF 和段内空行。只移除字段标识、标识后的单个分隔空格以及正文结束处的字段分隔换行，不重新组织正文。正文首行直接加粗不会再被误删起始 `**`，正文行内的其他字段标记按原文保留。
- `diary-body-parser.test.ts`：从 28 项扩展到 49 项，新增多正文、自由 Markdown、空白/CRLF、同一行正文、无效元数据、围栏长度、缩进代码、行内代码和引用边界等覆盖。
- `diary-extraction-controller.test.ts`：新增合并正文经原有预览/PUT/GET 完整保存的测试，确认来源消息未改写、缺失重要度仍保留服务端原值，共 31 项。
- `diary-chat-pr4b-smoke.cjs`：更新按钮文案；增加两种归档状态的操作行几何检查及截图，并验证自由 Markdown/多个正文块进入预览且取消零写入。
- 本文追加本次结果与限制。未修改提取控制器、预览表单、归档保存/回读、来源失效、Reader 同步、API、后端或 Main Chat 代码。

### 验证结果

| 检查 | 结果 |
| --- | --- |
| 全量 `npm test` | **211 个文件、2826 项通过**，较初版增加 22 项 |
| 生产构建 | 无 `.env` 隔离源码副本 `npm run build -- --base=/` 通过，包含 TypeScript 检查；隔离副本与工作区 `src` 逐文件一致 |
| PR4-B 页面验收 | **8 组通过**，Classic/Editorial 各含 320/390/1280px 浅色和 390px 深色；每组检查 pending/archived 两种状态，按钮同排、同高、同圆角、间距 10–12px、44px 触控目标及页面无横向溢出 |
| PR4-A 原脚本 | **8 组通过**，消息操作、失败与来源/Entry 隔离保持原有语义 |
| PR3 回归 | **6 组通过**，沿用初版临时固定测试时钟的脚本副本，仓库原脚本未改 |
| Main Chat 原脚本 | **320/390/1280px 三组通过** |
| 工作区检查 | `git diff --check` 通过；暂存区二进制 diff 与开工快照一致，本轮改动全部未暂存；未 commit、push 或 deploy |

验证使用本地合成 HTTP/SSE/WS，没有真实服务、模型或日记数据。截图前关闭合成操作提示并移开指针，避免 Toast/Tooltip 遮挡待检查的按钮。

隔离源码/构建：`/private/tmp/penumbra-pr4b-followup-0y8hjci8`。截图：`/private/tmp/penumbra-pr4b-followup-browser`，每组包含 `pending-actions`、`archived-actions`、`preview` 和 `calendar`。日志：`/private/tmp/penumbra-pr4b-followup-{tests,build,browser,pr4a,pr3,main}.log`。

### 当前限制

- `【正文】` 仍须作为明确的行首字段标识（可有 Markdown 标题/加粗包装，也可在标识后同行写正文）；无标识或所有正文块为空均拒绝提取。代码围栏、四空格/tab 缩进代码、引用和行内代码里的示例不能开启正文块。
- 元数据继续使用原来的已知字段标识。正文中的未知标记、行内标记、被引用或代码包裹的标记会保留；行首裸写的 `【标题】`、`【关键词】`、`【重要性】`、`【标签】` 仍按元数据边界处理。需要将它们作为正文展示时可使用引用或代码包装。
- 重要度留空保留原值、草稿只在内存中保留、跨客户端并发窗口及真实服务/真机未验收等初版限制仍适用。默认浅珊瑚强调使用现有主题 token，自定义主题时随主题色变化。
