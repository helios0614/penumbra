# Settings PR3：模型与任务分配

实施日期：2026-11-04（Asia/Shanghai）。仅修改 Penumbra，等待人工验收；未 commit、push 或 deploy。

## 开工核验与边界

| 仓库 | 分支 / HEAD | 起始工作区 | 远端核验 |
| --- | --- | --- | --- |
| Penumbra | `main` / `e96d9358f6c8fcb1eff533964ff073ad7adc723b` | 干净 | GitHub `origin/main` 与 HEAD 一致，无需更新工作树。Gitee `main` 为 `0c4a930`，落后本地 15 个提交；已 fetch 核对祖先关系，没有用旧镜像回退。 |
| AionHome | `refactor-code-main` / `51216d95db6acd2c7cec512c34b84b5d230c717a` | 干净 | Gitee `origin/refactor-code-main` 与 HEAD 一致。 |

已阅读 Phase 0、inventory、PR2 交付文档和 AionHome Phase 5-D 契约，核对 `connection_registry.py` 的 `read_feature_bindings / feature_protocols / set_feature_binding / clear_feature_binding`、路由 DTO 和 Main resolver。遵循既有渐进重构边界：不修改后端、消息持久化、Prompt、WS、Command、运行时绑定或生成行为。不读取生产配置、真实 Key、个人壁纸或业务记录。

本轮不重新审计全部 Settings，不新增路由系统、配置存储、迁移入口或 Provider fallback。没有发现需要修改 AionHome 的 Feature API 契约缺陷。

## 文件及职责

| 文件 | 职责 |
| --- | --- |
| `src/domain/registry/feature-bindings.ts` | 九个 usage、UI 分组与名称、协议友好名称、诊断状态、生效范围、三元组比较。未知协议/诊断安全显示，不访问对象继承属性。 |
| `src/domain/registry/registry-client.ts` | 复用 PR2 request/session/no-store/安全错误边界，新增 GET、PUT、DELETE Feature API。 |
| `src/domain/registry/registry-types.ts` | 补充 Feature 错误文案；修正既有 literal 校验对首尾控制字符的遗漏，与后端先拒绝控制字符再 trim 的要求一致。PR2 原测试继续通过。 |
| `src/components/settings/features/feature-snapshot.ts` | 并行读取安全 Connection 列表与有效 Feature 状态；任一失败不发布混合新快照。不声称两个 GET 是原子快照。 |
| `src/components/settings/features/FeatureBindingsPage.tsx` | 暖白玻璃单面板、四组紧凑行、列表独立滚动、状态/诊断、刷新和管理连接导航。 |
| `src/components/settings/features/FeatureBindingDialog.tsx` | 系统 Dialog / AppSelect / Input；独立三元组草稿、主动预填建议、保存读回、清除确认和异常核对。 |
| `src/components/settings/SettingsView.tsx`、`SettingsShell.tsx` | 激活首页分类，按 active 挂载，复用已有 history 导航与浏览器返回/前进。 |
| `src/components/settings/connections/ConnectionShared.tsx` | Registry 版本提示支持“功能分配”的保存上下文，保留 PR2 默认行为。 |
| `src/domain/registry/feature-bindings.test.ts` | Fake HTTP 契约、九项边界、非法响应、诊断、literal 与精确写入体。 |
| `src/components/settings/features/FeatureBindingDialog.test.tsx` | Fake Registry 下的实际控件回调、写入/恢复、防重复和迟到隔离。 |
| `tests/browser/settings-pr3-smoke.cjs` | 生产构建、隔离浏览器、合成 Registry 的交互/布局/导航回归。 |

## 实际 API

- `GET /api/registry/feature-bindings`：仅消费 `features[].selection / diagnostic / allowed_protocols / lifecycle`。固定九项必须各出现一次，遗漏/重复/损坏响应报契约错误，不编造默认选择。额外未知 usage 不加入 UI。
- `GET /api/registry/connections`：复用 PR2 的安全投影，仅取名称、启用状态、凭据 configured 元数据和 `default_model` 建议；不消费原始 `feature_bindings` 判断可用性。
- `PUT /api/registry/feature-bindings/{usage}`：仅提交 `{connection_id, protocol, model}`，model 仅按后端要求 trim，允许 catalog 外 literal。
- `DELETE /api/registry/feature-bindings/{usage}`：显式清除；不提交空三元组。

所有路径参数均 `encodeURIComponent`，沿用 `credentials: include` 与 `cache: no-store`。不调用 migrate、prefill、test、fetch-models、credential reveal/clear 或任何生成 API。预填直接取当前安全列表的 `default_model`，无需多一次请求。

## 九项及生命周期

下表记录当前后端契约。实际选项以每次 GET 的 `allowed_protocols` 为准，UI 不用此表作为额外协议白名单。

| usage | 当前协议 | lifecycle / 生效范围 |
| --- | --- | --- |
| `main_chat` | OpenAI / Anthropic | `new_session_default`：之后创建的 Main Conversation，不修改已有会话。 |
| `memory_sentinel` | OpenAI | `feature`：之后解析绑定的 Sentinel 请求。 |
| `memory_digest` | OpenAI / Anthropic | `feature`：之后的提取、总结、重总结任务。 |
| `web_compression` | OpenAI | `feature`：之后的 Web 压缩请求。 |
| `quick_note_compression` | OpenAI / Anthropic | `feature`：之后的 Quick Note Step1。 |
| `camera_sentinel` | OpenAI / Anthropic / MiniMax v2 | `feature`：之后的 Camera Sentinel 请求。 |
| `location_sentinel` | OpenAI / Anthropic / MiniMax v2 | `feature`：之后的 Location Sentinel 请求。 |
| `book_annotation` | OpenAI / Anthropic | `request_default`：之后使用默认绑定的单次/批量批注；任务可显式覆盖。 |
| `game_decision` | OpenAI / Anthropic | `new_session_default`：之后创建的 Session，不修改已有 Session。 |

未知 lifecycle 显示后端原值并提示需核对，不套用“立即全部生效”。Camera/Location Core、Alarm、Monitor、Activity Greeting、Quick Note Step2 等没有新绑定。没有写入 Main Conversation、Diary Entry、Theater Persona 或既有 Game Session 的接口。

## 保存、清除与恢复

打开编辑不自动选择连接或协议。切换 Connection 不改变 Protocol；已有非空 literal 保留，建议模型以独立按钮供主动采用。只有原输入为空且用户切连接时才预填。切协议、刷新、读回不覆盖草稿。已不存在的 Connection 和不再允许的历史 Protocol 保留原值，后者作为不可重新选择的历史选项展示，用户可主动修复。

保存前显示最终三元组。React 状态及同步 ref 锁阻止重复提交；PUT 返回后重新 GET Feature 与 Connection，只有写入确认成功且读回三元组一致才报告保存成功。若其他写者改变了结果，显示核对提示，保留后端现状和本地草稿。

网络错误、保存失败、结果未知都先读回；即使未知写入后读回与草稿一致，也要求用户核对，不自动认定本次成功。读回失败时禁用再次写入，允许纯 GET 核对；成功读取后仍需点击“已核对，继续编辑”。不会盲目重放 PUT/DELETE。

清除有独立确认，明确提示可能无法执行、不自动切连接、不恢复历史兼容绑定、并非停用整个功能。DELETE 成功后重新 GET，保留 `feature_binding_required` / Main 缺失等原诊断语义。投影版本明确提示：保存或清除可能同时由后端持久化 v2；GET 不做迁移。

## 诊断与 Connection 联动

可用状态来自后端 diagnostic，不从三字符串、Connection 默认值或 catalog 推导。页面区分正常、缺失、停用、缺凭据、连接不存在、协议不兼容及其他诊断。保留可识别的失效三元组，异常行展示 usage 与安全格式 diagnostic code；完全损坏的响应显示读取错误，不伪造值。

“管理连接”导航到 PR2 唯一页面。离开 Feature 页会卸载编辑器；返回时重新读取 Connection 与 Feature，不复用旧页面快照。保留 Settings 页内返回、浏览器返回/前进、刷新恢复和两种 Desktop 的关闭语义。未保存草稿只存在于当前弹窗，离开后丢弃。

读写复用 PR2 的 `useRegistryTask`，每个编辑器按 usage 挂载。卸载会 abort 并使请求身份失效，即使 Fake API 忽略取消，迟到写入/读回也不能发布到另一功能。关闭写入中的弹窗不能撤销已到后端的操作；关闭后重新读列表，必要时再手动刷新核对。

## 验证

全部使用合成配置、Fake API / Provider 和新建隔离浏览器上下文。API route 拦截拒绝外部访问，业务接口只允许只读 GET；PR3 断言所有写入只落在九项 Feature API，不触发真实 Provider、迁移、连接测试、发现或独立 selection 写入。

| 检查 | 结果 |
| --- | --- |
| Settings / Registry 相关 | 10 文件、127 条通过。 |
| 最终全量前端 | **217 文件、2937 条通过**，含 PR1 / PR2、Chat / Diary / Game 等原有测试。 |
| TypeScript | `npx tsc --noEmit --pretty false` 通过。 |
| 生产构建 | `npm run build` 通过，沿用 `/penumbra/`。 |
| PR3 浏览器 | 两种 Desktop × 320 浅色 / 390 深色 / 1440 浅色 / 1440 深色，8 组通过；另 390 自定义合成壁纸、绿色主题、520px 高短视口通过。页面异常与外部请求均为 0。 |
| PR1 浏览器 | 原脚本两种 Desktop × 320/390/1440 共 6 组通过。 |
| PR2 临时连接测试 | 原脚本 `CONNECTION_TEST_ONLY=1`，8 组通过，Fake Provider，无页面异常/外部请求。 |
| PR2 综合浏览器 | 原脚本停在已有复制 Toast 缺失；临时副本跳过该显示断言、修正等待时机后，其余流程 8 组通过。保留凭据、引用保护、发现/分页、保存失败恢复、Transport、创建/删除与导航断言；不报告原脚本全通过。 |
| Git | `git diff --check` 通过；生成的 `tsconfig.tsbuildinfo` 恢复为开工 HEAD 内容；AionHome 无修改。 |

PR3 覆盖九项精确展示、features 权威、六类异常、单/多协议限制、历史协议及缺连接修复、切连接保留协议和 literal、主动建议、catalog 外保存/重开、清除确认/取消、失败/未知/读回失败/恢复、并发读回不符、迟到响应、连接管理返回刷新、浏览器返回与重新进入/刷新。Main/Game 生命周期文案及“无业务写接口”断言覆盖配置边界；没有启动后端或模拟创建真实会话验证运行时。

产物在 `artifacts/settings-pr3/`：`frontend-all-final.log`、`typescript.log`、`build.log`、`browser.log`、`results.json`、`results-wallpaper.json`、`wallpaper-browser.log`，以及两种布局的 panel/editor 和壁纸短视口截图。PR1、PR2 独立测试的截图/结果位于 `pr1/`、`connection-tests/`；PR2 临时综合回归为 `pr2-rest/results-ui.json`。`artifacts/` 沿用仓库已有忽略规则，不纳入源码改动。

复现：先 `npm test`、`npx tsc --noEmit --pretty false`、`npm run build`，再运行 `node tests/browser/settings-pr3-smoke.cjs <playwright模块路径> <Chromium可执行文件>`。`SETTINGS_PR3_OUTPUT` 可指定产物目录，`SETTINGS_PR3_VARIANT=wallpaper` 可只跑壁纸补充组。

## 已知限制与人工验收

- 当前后端没有 Feature Binding revision/CAS。请求锁、双 GET 和读回比较不等于全局事务，也不能阻止其他客户端在检查后再修改。不要并行维护同一配置；以最后读取的后端状态为准。
- **既有 PR2 Toast 接线缺口**：两个 Desktop 直接挂载 SettingsView，而 ToastProvider 在 DesktopAppView 内。复制本身可成功，Settings 的 `useToast` 没有宿主，旧综合脚本等待“Key 已复制”超时；PR2 文档此前也记录此处阻塞。本轮不扩大到宿主通知修复。为核验后续流程，另用 `/private/tmp/penumbra-pr2-regression.cjs` 临时副本保留剪贴板断言、跳过该显示断言，并修正重命名读回及刷新恢复的等待；原 PR2 脚本和业务源码不变，执行记录留在 `pr2-rest-browser.log`。
- 浏览器使用桌面 Chromium 模拟宽度。Safari、真机软键盘、浏览器物理返回键以及部署环境玻璃效果需人工验收；已目视检查 320px 编辑和列表、深色桌面与自定义壁纸短视口。
- 人工验收应核对九项名称与实际诊断、单协议功能的选项、手填模型/预填建议、清除警告、连接修复返回、两种桌面的返回/前进，以及 Main/Game 已有记录不随默认变化。真实生产配置/Key/Provider 与生产数据写入未验证，也未执行。

完成后停止，等待人工验收。不 commit、push、deploy。

## 触屏下拉列表右移修正（2026-11-04）

用户截图中的问题已通过合成数据复现：390px 触屏视口打开长 Connection 列表后，页面布局宽度由 390px 被撑到 703px；Dialog 宽度从 358px 变成 512px，左边缘由 16px 变为 95.5px，导致右侧超出屏幕。仅模拟窄屏再用鼠标点击不会覆盖此触摸路径，前一轮验证漏掉了这一场景。

根因是下拉浮层在触摸路径采用绝对定位，初始定位造成横向溢出，移动端布局视口被扩大，Dialog 再按扩大的视口居中。不是 Feature API 或绑定数据错误。

- `SelectContent` 和 `AppSelect` 透传可选 `positionMethod`；AppSelect 另透传 `alignItemWithTrigger`，不改变其他页面的默认行为。
- 仅 Feature 编辑弹窗的 Connection / Protocol 使用 `positionMethod="fixed"`，并关闭选中项覆盖触发器的对齐模式；位置继续由系统组件计算可用空间和翻转。
- Connection 浮层最大高度为 `min(20rem, var(--available-height))`，超出部分内部滚动，保留长名称换行、主动选择和键盘交互。没有更改 Dialog 居中规则或用页面裁切掩盖溢出。
- `settings-pr3-smoke.cjs` 新增 `SETTINGS_PR3_VARIANT=select`：30 个合成连接、末项超长名称、真实 `.tap()` 打开、鼠标/键盘打开、切换首末选项、短视口及自定义壁纸。按固定测试视口而非可能已经撑大的 `innerWidth` 判断溢出，并采样打开过程的每帧宽度，检查弹窗横坐标和宽度不变化。只改编辑草稿，不写入绑定。

本轮保留此前已暂存的 PR3 改动，不重新暂存、不提交、推送或部署。相关 18 条测试、TypeScript、全量 217 文件 / 2937 条测试和生产构建通过。浏览器验证记录及截图位于 `artifacts/settings-pr3-select-fix/`。

新增 Select 布局回归 **9 组通过**：经典 / Editorial 各 320 浅色触屏、390 深色触屏、1440 浅色 / 深色鼠标与键盘，另 390 深色触屏 + 自定义合成壁纸；移动端均包含 520px 短视口。每组均无写入、外部请求或页面异常。已目视检查 320px 浅色展开及壁纸深色短视口截图，弹窗保持在屏幕内、列表正常内部滚动。结果为 `results-select.json`，脚本使用 `SETTINGS_PR3_VARIANT=select SETTINGS_PR3_OUTPUT=artifacts/settings-pr3-select-fix` 执行。

原 PR3 功能浏览器回归另 **9 组通过**，保存、清除、读回、异常恢复、返回导航和壁纸布局保持正常，结果在 `feature-regression/results.json`。由于此次采用普通锚定弹出动画，脚本的选项断言限定于 `[data-open]` 浮层，避免关闭动画中的旧列表被计入下一份协议选项；没有减少协议数量或禁用历史值的断言。

## UI Follow-up：列表与编辑弹窗（2026-11-04）

本轮仅调整展示层，按本次文字需求实施；消息未附带所述两张最新截图，因此没有进行截图逐像素对照。保留统一玻璃面板、Settings 导航、九项功能、四个分组和系统 Dialog / AppSelect / Input / Button。

- 列表：分组标题提升至 `text-sm / semibold`，增加细主题色竖线；统一组间距和行内留白。顶部依次为数量及操作、用途及生效范围说明、Registry 版本及持久化状态，异常和迁移提示继续保留。
- 功能行：名称及状态、Connection / Protocol、Model 三层展示。模型字号从原 `text-xs` 提升至 `text-sm`，编辑按钮不收缩。模型仅在 `/`、`-`、`_` 分隔边界换行；只有单个超宽 token 使用省略号，完整文本保留在 DOM 和 `title`，编辑输入仍可查看完整 literal。没有使用 `break-all` 拆模型 token。
- 状态：`FeatureBindingSummary.tsx` 统一列表及弹窗展示。当前可用为淡绿色点及文字；三个未配置 diagnostic 为中性灰；其余诊断及缺少后端选择的异常为柔和橙色。判断继续使用 Feature API 的 diagnostic / selection，不读取 Connection 启用或凭据字段推断可用性，原 diagnostic 原文仍可见。
- 弹窗：轻量「当前分配」区域显示后端保存值；正常时不突出 usage ID，存在 diagnostic 时显示 usage 与 code。「管理连接 ↗」移到 Connection 标题右侧，沿用原 Settings 导航。「保存以下分配」以浅主题暖色背景区分草稿，继续展示三元组。底部按钮改为「取消」；保存主按钮、清除危险操作及二次确认保持原组件和流程。
- 边界：没有修改领域/API 文件、后端 AionHome、allowed_protocols、literal 校验、Connection 切换与建议行为、保存/读回/异常核对、清除语义、lifecycle 或 Registry 迁移逻辑。没有改动其他 Settings 分类。

### 验证

全部使用现有 Fake API、合成连接和合成壁纸；没有读取真实凭据或业务配置。

| 检查 | 结果 |
| --- | --- |
| 全量前端测试 | 217 文件、2937 条通过，含 PR3 编辑/写入/清除/恢复及原有 PR1 / PR2 回归。 |
| TypeScript / 生产构建 | `npx tsc --noEmit --pretty false`、`npm run build` 通过。 |
| PR3 功能浏览器回归 | 9 组通过：两种 Desktop 各 320 浅色、390 深色、1440 浅色/深色，另 390 深色自定义合成壁纸及 520px 短视口。 |
| PR3 触屏下拉回归 | `SETTINGS_PR3_VARIANT=select` 9 组通过：30 连接、超长名称、触屏/鼠标/键盘、短视口，0 写入。 |
| 新增 UI 断言 | 九功能/四分组、诊断状态及三种颜色区分；`gpt-5.6-sol` 完整显示；带分隔符超长模型的边界换行、256 字符无分隔符 token 的必要省略、完整 title 及编辑按钮空间；当前值与草稿独立、正常隐藏 usage / 异常保留 code、取消不写入、弹窗内管理连接及返回。 |
| 交互与边界 | 原保存、建议、清除确认、失败/未知写入、重新读取、迟到响应和导航回归保留。所有浏览器组页面异常及外部请求均为 0。 |
| 视觉检查 | 已目视检查 320 浅色列表/长模型编辑、390 深色壁纸编辑及 Editorial 桌面列表；真机 Safari 和实际壁纸效果留待人工验收。 |

日志、JSON 及截图：`artifacts/settings-pr3-ui-followup/`，触屏回归在其 `select/` 子目录。复现沿用原脚本，设置 `SETTINGS_PR3_OUTPUT=artifacts/settings-pr3-ui-followup`；触屏组另设置 `SETTINGS_PR3_VARIANT=select` 和独立输出子目录。浏览器工具临时安装于 `/private/tmp/penumbra-ui-followup-tools`，未增加项目依赖。TypeScript 生成的 `tsconfig.tsbuildinfo` 已恢复开工内容，`git diff --check` 通过。

本轮完成后停止，等待人工验收；未 commit、push 或 deploy。

### 截图跟进：功能标题行对齐（2026-11-04）

收到补充截图后，将功能名称、状态、编辑按钮整理为同一标题行，三者垂直居中；名称在左，状态靠右，编辑按钮位于最右侧。Connection / Protocol 与模型仍在下面独立展示。标题列允许长名称自然换行，状态与编辑按钮保留操作空间，不改字号和业务行为。

浏览器脚本增加九项功能标题/状态/按钮中心线及左右顺序断言，模型改为校验位于标题行下方。全量 217 文件 / 2937 条测试及含 TypeScript 的生产构建通过。标题行调整后的 9 组浏览器回归通过（两种 Desktop、320/390/1440px、浅深色及合成壁纸），页面异常和外部请求均为 0。浏览器日志和截图位于 `artifacts/settings-pr3-ui-followup/alignment/` 与 `alignment-browser.log`；已目视检查 320px 浅色列表。未 commit、push 或 deploy。

## UI Follow-up：简化编辑与切换连接自动预填（2026-11-04）

本节替代前文「保留非空模型、点击采用建议」及正常状态显示两份摘要的交互规则。依据本次补充截图与明确需求，仅调整 UI、草稿交互及显示文案；保留前次列表标题/状态/编辑按钮同排居中布局、玻璃面板、四组九项功能和状态来源。

### 修改文件与职责

| 文件 | 本次职责 |
| --- | --- |
| `src/components/settings/features/FeatureBindingDialog.tsx` | 删除正常状态的「当前分配」「保存以下分配」和独立建议区域；中文字段；切换连接自动预填及无默认模型提示；保留异常诊断、写入核对和原清除确认。 |
| `src/domain/registry/feature-bindings.ts` | 只修改三个协议的 UI 显示映射，不修改枚举、API 或权限。列表同步采用相同中文协议名称。 |
| `src/components/settings/features/FeatureBindingDialog.test.tsx` | Fake Registry 覆盖首次打开、主动切换、同值重选、无默认模型、手动修改及异步读回后的草稿保护；回归保存/清除/异常恢复。 |
| `src/domain/registry/feature-bindings.test.ts` | 补充中文映射与未知历史值原样展示的断言，保留 HTTP 契约测试。 |
| `tests/browser/settings-pr3-smoke.cjs` | 更新中文控件定位及预填断言；保留原有列表布局、触屏下拉、写入、读回、清除、诊断及导航回归。 |

### 弹窗结构与草稿规则

正常弹窗按「标题及生效范围 → 连接（右侧管理连接）→ 协议 → 模型名称及 literal 说明 → 清除当前分配 → 取消/保存分配」组织。正常状态没有诊断卡片、配置摘要或「采用建议模型」按钮。

仅当后端返回 diagnostic 时显示轻量警告，保留 usage ID、原始 code 和修复提示；缺失连接仍展示原连接 ID。正常表单只展示草稿，不能作为已保存值的依据，因此写入失败、结果未知或读回不一致时，仍在原「写入结果核对」流程内显示读回的已保存三元组（或无分配），避免移除摘要后无法核对并发变化。该信息不出现在正常编辑状态；保存、重新读取、确认继续和防自动重发逻辑未改变。

- 初次打开：草稿来自后端 selection，不按连接默认模型替换已保存 literal。
- 用户主动选择另一连接：从当前安全 Registry 快照取其 `default_model`；有非空值即替换模型草稿，允许随后手动改写。
- 无默认模型：保留模型草稿并显示「此连接未设置默认模型，已保留当前模型名称，请确认是否适用」，不额外阻止填写或保存；原有凭据、协议、literal 校验继续生效。
- 重复选择当前连接：直接返回，不预填，不覆盖手动输入。
- 普通重渲染和异步读回：不触发预填。只有下一次主动选择另一连接才采用该连接的默认值。选择有默认值的连接后，前一条无默认模型提示消失。
- 协议始终独立；不修改连接自身默认值、不推断协议、不调用模型目录、连接测试或真实 Provider、不自动保存。

| 协议原值（不变） | 中文显示 |
| --- | --- |
| `openai_chat_completions` | OpenAI 对话补全 |
| `anthropic_messages` | Anthropic 消息接口 |
| `minimax_chatcompletion_v2` | MiniMax 对话接口 v2 |

未知/历史协议继续显示原始值；允许的未知枚举仍可选择，不再允许的历史值保留为待修复选项。`allowed_protocols` 来源仍为 Feature API。

### 验证与限制

相关 2 文件 / 31 条测试通过；全量前端 **217 文件 / 2942 条测试通过**。`npx tsc --noEmit --pretty false` 和 `npm run build` 通过。所有数据为 Fake API 与合成配置。功能浏览器回归 9 组通过（经典/Editorial 各 320 浅色、390 深色、1440 浅色/深色，另 390 深色合成壁纸及短视口），覆盖自动预填、同值重选、无默认模型提示、协议保持、摘要删除、保存/读回/清除/异常恢复及管理连接导航；页面异常和外部请求均为 0。触屏下拉回归 9 组通过（30 个连接，触屏/鼠标/键盘、短视口和壁纸），0 写入、0 页面异常、0 外部请求。

日志与截图位于 `artifacts/settings-pr3-dialog-simplify/`，触屏组位于 `select/`。已目视检查 320px 浅色与 390px 深色三字段弹窗。默认模型取自当前已读取的安全连接快照，不保证选择瞬间与其他客户端改动同步；不会为预填新增 API。真机 Safari、实际软键盘及用户壁纸效果仍需人工验收。本轮不修改 AionHome、Feature GET/PUT/DELETE、九个 usage、三元组、协议权限、lifecycle、Main/Game 新会话默认语义或 Registry 迁移行为。

未 commit、push 或 deploy；完成后停止，等待人工验收。
