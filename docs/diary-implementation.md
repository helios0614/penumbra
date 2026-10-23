# Diary PR1 / PR1.1 / PR1.2：月历、正文阅读与归档日记编辑

当前范围为 Penumbra Diary 的月历、阅读、已归档日记编辑与全局投喂开关。设计参考日记双页面草图和 AionHome
日历操作方式，材质、控件、反馈和滚动沿用 Penumbra UI Foundation。

## 应用与分层

- 独立 `diary` App ID，Classic `/app/diary` 与 Editorial `/editorial/app/diary`
  共用 `DiaryView`。普通 `notes` 仍是笔记；没有改变应用壳或新增嵌套路由。
- `domain/diary`：业务日期校验、HTTP adapter、PR0 索引及旧详情的投影与校验；写入仅限 Entry 编辑与全局开关。
- `application/diary-reader`：月历选择、读取/刷新、请求合并、取消、乱序隔离、详情失效。
- `components/diary`：月历、预览、正文、状态反馈与应用内位置恢复。
- 不读取 Main Chat 或 Diary 消息，不订阅生成事件，不复用 Chat 消息控制器。

## 真实 API 映射

| 操作 | 请求 | 处理 |
| --- | --- | --- |
| 首次进入、月份切换、刷新月历 | `GET /api/diary/reader/calendar?month=YYYY-MM` | 只取对应月份，按 PR0 的 `calendar_state` 展示，不推导生成进度 |
| 选中已归档日期（含首次选中日期的索引加载成功后） | `GET /api/diary/entries/{entry_id}` | 只按需读取这一天，标题下截取真实保存正文的开头；其他日期不读详情 |
| 点击 pending / invalid / 无记录日期 | 无 HTTP 请求 | 更新本月选中日期，显示索引事实 |
| 点击已归档预览、刷新正文 | 同一 Entry GET | 进入阅读复用在途或已读取详情；显式刷新重新 GET。检查 `ok:false`、ID、业务日期、`status=done` 和有效正文 |
| 普通返回月历 | 已读详情无额外 HTTP 请求 | 保留原月份、日期、索引及滚动位置；中途取消的详情可按需重新读取预览 |
| 正文失效后返回 | 重读当前月历 | 旧索引已失效，不能继续显示已归档旧事实 |
| 编辑已归档日记 | Entry GET → PUT → GET | 写前核对，写后回读全部阅读字段；只有一致才更新阅读数据与月历标题 |
| 初次进入或刷新月历、重新核对设置 | `GET /api/diary/auto-feed-status` | 全局状态，未读取时为 unknown，不展示假的关闭 Switch |
| 切换全局投喂 | `POST /api/diary/auto-feed-toggle` → 状态 GET | `{enabled:boolean}`；写入回执和回读均确认才提示成功 |

所有请求使用公共 HTTP 客户端的会话凭据、超时及 AbortSignal。读取显式 GET 与
`cache: no-store`；编辑 PUT 和开关 POST 也复用同一客户端。不调用全量 `/entries`、旧 `/calendar`、生成或消息接口。

PR0 来源：AionHome 当前 `docs/diary-reader-calendar-contract.md`、
`aion-chat/diary_reader.py`、`routes/diary.py`。

## 数据状态

- `archived`：实心主题点；预览显示真实日期/状态/标题，详情已读时截取正文开头。
  整个预览是一个有可访问名称的 Button，右侧轻箭头提示进入阅读，没有嵌套交互。
- `pending`：空心点。`has_saved_content` 显示保存的草稿；否则显示日记会话记录。
  不声称 AI 已生成完整正文，不提供继续对话或提取按钮。
- `invalid`：三角异常标记与简短说明，不自动修复。
- 无索引：无点；只有成功读取当月索引后，才显示所选日无记录。
- `invalid_business_date` 的原始日期可能无法落入任何合法日期格子；保留在当月
  日期异常记录区，不归一化、不丢弃、不伪装成某日记录。
- 日期始终为业务字符串，月份支持 PR0 的 `0001-01..9999-12`，周一开始；
  闰年、星期和跨年用 Gregorian 算术，不通过 UTC 解析转换业务日期。
- 标题允许 null/空白；仅展示时用“无标题”，不写回。正文保留原始文本与换行，
  不解释 Markdown、不拆成段落卡片、不生成摘要/图片/归档时间。
- 详情 `importance` 仅接受有限的 `0..1` 数字（包括 0），其他值不显示、不默认成
  0.5；阅读页只在标题侧用细线表达，不显示数字，并保留无障碍描述。旧日记阈值：
  `<0.6` 为中性线、`0.6..<0.8` 为 45% 主题色混合、`>=0.8` 为主题色。
- 详情 `tags` 与 `keywords` 独立处理：接受数组和旧 JSON 数组字符串，只保留
  非空字符串并去重；非法 JSON、对象、null、非字符串元素不渲染，也不阻断正文。
  标签使用 AionHome 旧日记 `TAG_OPTIONS` 的已有中文名称，未知标签保留原文；
  关键词始终显示原文，不作标签代码翻译。分类固定在标题附近，关键词固定在底部，
  不生成新标签。现有 Entry 表和详情没有独立 category/type 字段，不补造。
- 有效正文判空匹配 PR0 的 Python `str.strip()` Unicode 规则，保留正文原文。

## 请求生命周期与反馈

同月或同篇在途请求合并；切月、换篇、返回、卸载取消相关旧请求。序号和
AbortSignal 双重隔离晚到结果。切月清除另一月份索引，错误不能变为空月。
同月刷新失败保留旧索引并明确说明刷新失败；正文网络刷新失败也可保留旧正文
并标明未成功刷新。只有显式刷新成功才使用公共 Toast，持续错误留在阅读路径。

PR1.1 的详情缓存只存在于当前 Diary 控制器、当前月份内，最多为已访问的日期；
切月、手动刷新月历或卸载即清理。预览与 Reader 共用一次在途请求和同一已读详情，
从预览进入正文、已读后的普通返回及本月再次选中不立即重复 GET。详情显式刷新更新二者。
切日期/切月/卸载使用 AbortSignal 与请求序号隔离旧结果，预览额外核对 ID 与业务日期。
预览失败只降级为标题/状态和轻量提示，保留成功索引与阅读入口；只有进入 Reader 后
确认详情失效，才继续使用 PR1 既有的索引失效/返回重读机制。刷新月历后若选中日
不再归档，取消旧索引触发的在途预览，避免晚到正文恢复旧事实。不读取任何消息。

Reader 确认详情不存在、不再归档、无有效正文或身份/数据契约无法核对时，移除旧正文和
已归档显示，同时取消可能在途的旧索引；返回后重新取月历，避免旧请求恢复过期标记。
这个页面不改变后端归档或生成状态，不以 `auto_feed_status` 推断正文状态。

## 滚动与视觉

- 应用外壳与 `main` 延续受视口约束的高度链，公共 PageHeader 固定。
- 月历与选中日期预览共用一个 `PageScrollArea`，同一轻暖阅读 Surface 内依靠
  留白和分隔线建立层次。月历 table 为自然高度，只渲染真实所需的 4/5/6 周；
  日期按钮统一 48px 高，单元格上下各 2px，不按视口分配高度或在短屏压缩。
  月份工具栏之后留 8px、星期行 32px；日期数字均在相同位置，标记相对数字绝对
  定位在下方 3px（8px 圆点在 12px 容器中居中），不参与行高，无记录日无占位装饰。
  图例和预览间距收紧，空日只有日期与一句提示，不设置卡片最小高度。
- 阅读态保持月历挂载但隐藏，固定返回/日期区域，全文在自己的 `PageScrollArea`
  中独立滚动。标题可换行，正文 `white-space: pre-wrap`、`overflow-wrap: anywhere`。
  顶部标题/分类固定、正文独立滚动、底部关键词固定；同一轻暖纸面。PR1.2 移除重复的
  “阅读信息” Dialog，顶部直接显示铅笔与“编辑”。完整标题/分类在原标题位置用轻量
  Popover 查看；关键词继续使用原有“全部” Dialog。最短视口将标题查看入口收为小按钮，
  关键词保留底部紧凑入口，避免因移除旧 Dialog 丢失完整查看路径。
- 返回恢复原月历容器的位置（内容变短时限于可滚动范围），并恢复阅读全文或日期
  目标的焦点；原触发器消失时聚焦具名滚动区。切月才主动重置月历位置。
- 今日的日期环、选中背景、空心/实心/异常标记独立；选中背景上的标记使用
  `primary-foreground` 保持可辨识，颜色沿用主题 token。
- 公共回顶、Reduced Motion、隐藏滚动条与 Toast 避让继续使用现有基础能力。

## 验证与人工验收

自动验证覆盖三态/无索引、异常日期、Unicode 正文、只读 HTTP、月历范围/闰年/
跨年、pending 事实区别、详情校验、长文本纯文本转义、请求乱序/取消/重复合并、
刷新保留与失效清除、阅读返回位置/焦点、两种桌面入口。使用 mock fetch、控制器、
实际回调和静态渲染，没有浏览器自动化或真实业务接口调用。

PR1 基线 `c4dc16602e8d573621cc81006a7f913af28c32c3` 已包含指定提交
`feat(diary): add calendar and archived entry reader`，本轮开始时工作区干净，没有
重复创建提交。PR1.1 仅保留工作区修改。

PR1 在 2026-10-23 验证：Diary 与应用入口定向测试通过；`npm test` 全量 99 个测试文件、
1490 项通过，包含 Memory、Quick Note、Chat 回归；`npx tsc --noEmit`、
`npm run build` 与 `git diff --check` 通过。没有进行真实页面视觉验收。

PR1.1 在 2026-10-23 验证：相关 Diary、入口与位置恢复测试均通过；`npm test`
全量 99 个测试文件、1543 项通过。覆盖五/六周结构、标记独立性、整卡阅读入口、
真实正文截取、详情请求共享/缓存/取消/乱序/失败隔离、重要度边界、元数据异常与分组。
`npx tsc --noEmit`、`npm run build` 与 `git diff --check` 通过。未使用浏览器自动化，
未调用真实业务 API；下面的视觉、触屏与键盘检查仍需人工验收。

人工视觉验收：

1. Classic / Editorial 分别检查宽屏、390px、320px 与短高度视口，确认 Header
   稳定、月历目标不重叠、内容自然纵向滚动、底部内容和返回入口可达。
2. 浅/深色、不同壁纸与主题下，核对今日/选中态与三种标记、图例和正文对比度。
3. 用真实索引确认 pending 两种事实、异常记录、空日、切月和刷新失败提示。
4. 阅读多段中文、长英文/URL 和长标题；确认换行完整、纯文本未变成 Markdown，
   全文可滚到底，返回后恢复月份、选择、滚动及键盘焦点。
5. 阅读期间从外部修改/删除条目后刷新，核对失效提示和返回重读行为。
6. PR1.1：10 月五周 / 11 月六周在高窗口保持自然比例；标记与空日数字对齐，
   今日/选中态的实心、空心、异常标记均清楚；空日下方不撑高。
7. PR1.1：触屏点击预览任意区域、键盘 Tab / Enter / Space 进入 Reader，快速
   切换日期只显示最后选中日的正文开头；预览失败仍可进入阅读重试。
8. PR1.1：核对真实重要度（含 0）及标签/关键词的语义，长词自然换行；完整正文
   与末尾附属信息可滚到底，返回月份、日期、合理滚动位置与焦点恢复。

## PR1.2 编辑与全局开关

2026-10-23 审计基线：Penumbra `1f9cf7b`、AionHome `fc9c4f3`，两边开始时均干净。
后端依据 `aion-chat/routes/diary.py` 的 Entry GET/PUT、`AutoFeedToggle`、
`get_auto_feed_status` / `toggle_auto_feed`，以及 `memory.py:get_embedding` 与旧 `static/diary.html`。

- 编辑字段：标题、完整正文、分类 `tags`、关键词 `keywords`、重要度。正文必须满足已归档
  条目的有效正文规则；标题允许空字符串。重要度参考旧版滑块 `/100` 的 `0..1` 数值，
  不增加业务分级。原重要度不可用时不补默认值，用户不填就不发送该字段。
- 独立编辑工作区共用受限纸面与 visualViewport 适配，取消/保存固定在上方，字段区滚动。
  草稿独立于 Reader；关键词逐项编辑，保留其顺序及值内部的换行，不按分隔符猜测拆分。
  列表外侧空白在提交时按既有详情投影去除，空项和重复项明确报错；正文和标题不 trim。
- PUT 白名单仅含用户修改的字段及 `status:"done"`。标题或正文变化时同时发送完整
  `title`、`content`、`status:"done"`，满足原 embedding 触发条件。仅修改分类/关键词/
  重要度时不重写未修改的正文。日期、ID、模型、自动投喂内部配置均不发送。
- 写前回读阅读字段与编辑基线对照；已变化则保留草稿、不写入。这个检查不能消除随后
  GET→PUT 的竞争窗口，后端没有 CAS / 版本锁，不声称具备完整并发保护。
- `{ok:true}` 不足以确认保存：原 PUT 不检查受影响记录数，因此写后 GET 校验 ID、业务日期、
  done、有效正文及所有编辑字段。吻合后更新 Reader/详情缓存和当前索引标题，取消旧索引
  请求，公共 Toast 提示“日记已保存”。回读失败或不一致保留草稿、不报成功。
- 网络/超时/5xx/异常回执属于结果未知，阻止再次 PUT，只提供 GET“核对结果”；保存失败
  仍可编辑。核对旧提交成功但已有新草稿修改时，更新保存基线并保留新增修改。
  明确拒绝（如 401/403/422）允许用户修改后手动重试，不自动重发任何写入。
- 取消、应用关闭和浏览器 Back 经 feature-local 编辑历史层及公共 AlertDialog 保护；
  保存中阻止离开，刷新/关闭窗口使用浏览器标准 beforeunload 提醒。普通月份/阅读导航不改。
- 全局投喂状态与月份、日期分离。开关只使用公共 Switch；未知状态不渲染 off，busy 保留
  已确认状态。POST 后再 GET 核对；失败保留已确认状态，未知结果锁定切换，仅允许 GET
  核对。重新进入 Diary 或刷新月历都会重新读取设置。

尚未修复的后端限制：

1. embedding 失败返回 None 时正文仍可保存，旧 embedding 可能保留；PUT/GET 不返回向量处理
   结果，所以前端只能确认日记内容，不能判断实际向量成败。保存 Toast 附带说明，不声称
   索引更新成功。最小后端改进应是返回目标更新事实及独立向量处理结果。
2. PUT 缺少版本校验；最小并发保护应由后端提供版本字段与条件更新，本轮不自行改造。
3. `schedule.py` 内部调用 `start_auto_feed(target_date)`，默认 `Query(False)` 对象在 Python
   调用中可被当作真值，仍可能进入替换未完成条目的分支。帮助 Popover 提示风险，本轮只
   写全局开关，不调用执行接口、不修改替换/续写/调度策略。

本轮实现文件：

- `src/domain/diary/diary-write-client.ts`
- `src/application/diary-reader/diary-actions-state.ts`、`diary-actions-controller.ts`、
  `diary-reader-controller.ts`、`diary-reader-state.ts`
- `src/components/diary/DiaryAutoFeed.tsx`、`DiaryEditor.tsx`、`DiaryCalendar.tsx`、`DiaryReader.tsx`、
  `DiaryReaderDetails.tsx`、`DiaryView.tsx`、`useDiary.ts`、`useDiaryEditorNavigation.ts`、
  `diary-edit-navigation.ts`、`diary-editor.css`、`diary.css`
- 测试：`src/domain/diary/diary-write.test.ts`、
  `src/application/diary-reader/diary-actions-controller.test.ts`、
  `src/components/diary/DiaryEditing.test.tsx`、`DiaryPresentation.test.tsx`、`DiaryReaderDetails.test.tsx`、`diary-edit-navigation.test.ts`
- 本文 `docs/diary-implementation.md`

PR1.2 验证（2026-10-23）：相关测试通过；全量 `npm test` 104 个文件、1613 项通过，
`npx tsc --noEmit`、`npm run build`、`git diff --check` 均通过。测试使用 mock fetch、
真实控制器回调、静态渲染和模拟 History/viewport，不使用浏览器自动化或真实业务写入。
范围核对确认月历只新增设置行，日期网格/状态点、纸面配方、正文滚动区、关键词高度、
重要度颜色和原有返回恢复未改动。AionHome 工作区保持干净。

待人工验收：Classic / Editorial 的 320px、390px、短屏与软键盘；标题/分类完整查看与
固定关键词；长正文编辑的输入、取消/保存可达性；放弃后焦点；真实 GET/PUT/GET 回读及
设置开关失败/未知结果的恢复。测试不能证明实际 embedding 成功或消除后端并发窗口。

不包含写作 Chat、生成、材料/消息读取、提取归档、新建、补写、模型设置、自动投喂执行链路、
摘要和封面。未改 AionHome；未 commit、push、部署或使用浏览器自动化。
