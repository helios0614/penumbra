# Settings PR4-B UI Follow-up

日期：2026-11-05（Asia/Shanghai）。范围为 MCP 页面的视觉与交互调整，不修改 MCP API、凭据安全、Runtime Reconcile、工具发现/缓存、工具启停或 Chat。

## 基线与检查

- Penumbra 分支 `main`，HEAD `c8db280122fd5cfb5b0c63e0955abbf7ffac342e`，开始时工作区干净。保留已提交的 PR4-B 和其他工作；未 reset、clean、stash、commit、push 或 deploy。
- 已阅读 [settings-pr4b.md](./settings-pr4b.md)，检查 `MCPPage`、`MCPTools`、`MCPServerEditor` 的实际 JSX/DOM 层级和系统 Dialog CSS，并核对 `ConnectionDetail`、Input、AppSelect、Select、Switch 的真实实现。
- 控件不一致的根因是调用参数：两页原本都使用系统组件，但 MCP 使用默认 `solid/default`，连接页显式使用 `surface="translucent" controlSize="comfortable"`。本轮对齐参数，不新增控件，也不通过额外 CSS 模拟输入框。

## 修改内容

| 文件 | 调整 |
| --- | --- |
| `src/components/settings/mcp/MCPPage.tsx` | Server 改为主玻璃面板内的分隔行，移除独立大圆角背景/边框/阴影；展开仅轻微背景区分；凭据改为普通信息行；新增明确「全局启用」标签；删除与清除使用柔和危险色；工具 Dialog 入口与数量状态由页面持有 |
| `src/components/settings/mcp/MCPTools.tsx` | 现有加载/刷新/启停/409处理迁入独立系统 Dialog；固定标题、Server 名称、数量和刷新；正文独立滚动；工具改为细分割列表；长说明默认三行、可展开/收起；Schema 默认折叠并保留 JSON 缩进及内部双向滚动 |
| `src/components/settings/mcp/MCPServerEditor.tsx` | 系统 Input/AppSelect 对齐连接页 props；表单使用一致网格间距；名称和模式在桌面并列，地址/私密输入占整行；编辑 ID 为只读辅助文本，新增仍保留 ID Input；中文模式名称、对应说明、placeholder |
| `src/domain/mcp/mcp-client.ts` | 仅调整展示辅助函数：「上次验证成功/失败」、中文凭据模式标签；请求、DTO、错误处理不变 |
| `src/domain/mcp/mcp-client.test.ts` | 保留状态判断断言，更新历史状态文案期望 |
| `tests/browser/settings-pr4b-smoke.cjs` | 保留原 PR4-B 功能断言，工具定位改为 Dialog，ID断言改为只读文本；增加系统控件、扁平 DOM、长说明/Schema、滚动隔离和关闭检查 |

## 交互与状态边界

主页面仍使用统一玻璃面板。Server 启停开关、全局开关各自保持原请求，未验证项仅显示「尚未验证」，不附「无验证时间」。历史验证状态使用绿色成功、灰色中性和柔和失败色；时间仍按 Unix 秒转换。凭据模式显示「查询参数」「路径段」，不展示内部枚举给普通用户。

工具 Dialog 使用现有 `Dialog` / `DialogContent` / `DialogHeader` / `DialogBody`，移动端在安全视口边距内接近全屏，桌面限制宽度。标题区及 44px 关闭按钮不参与正文滚动，列表与 Schema 各有独立滚动区域。Schema 使用等宽字体和 `white-space: pre`，不强制挤压换行；代码区没有玻璃材质。长说明依据实际溢出判断是否显示展开按钮，默认限制三行。

打开工具 Dialog 保留主列表展开项；临时 Reveal 状态随 Dialog 打开清理。关闭只卸载前端临时视图，不写配置、不清理后端缓存。请求任务继续使用原 `useMCPTask` 的 Abort/当前请求身份隔离，按 Server ID 挂载；成功开关仍只本地更新并读取管理元数据，不额外发现工具；409仍重读、等待确认，不重发写入。数量以 Map 按 Server ID 隔离，避免 `constructor` 等 ID 与对象原型属性冲突。管理元数据读回发现 Server 消失时退出对应 Dialog，避免空模态状态阻塞主页面。

编辑页没有改写草稿构造、secret_ref、空凭据保留、专用清除或测试行为。查询参数模式继续公开 URL + 新 Token；路径段模式继续接收完整 Endpoint 交后端拆分，不在前端重建私有地址、不回填已有私密 Endpoint。系统控件沿用原 focus、disabled、边框、圆角及 Select 下拉实现。

## 验证结果

- 最终全量前端测试：**219 个文件、2966 项通过**。本轮保留已有断言，只更新必要的中文文案、只读 ID 和工具 Dialog 定位。
- TypeScript / 生产构建：`npm run build`（含 `tsc -b`）通过；`git diff --check` 通过。
- MCP 浏览器 **7 组全部通过**：Classic / Editorial 各 320、390、1440px，另 Classic390 深色合成壁纸。每组72次合成 API请求、23次明确写入，零外部请求、零页面脚本错误。
- 既有 PR1 外观/概览、PR3 模型分配及 UI follow-up、production-subpath 浏览器套件通过。PR2 已知限制见下方，不将它列为本轮通过项。
- 已目视检查320px扁平列表、320px工具/Schema、390px深色编辑 Dialog、Editorial1440工具/Schema。没有修改共享控件、全局 CSS 或原连接页。
- 验证期间一轮与构建并行的全量运行出现既有 `Sender.interactions.test.tsx:213` 请求次数断言失败；未改 Chat，随后单独执行最终全量测试全部通过。不将该中间轮次描述为通过。

测试日志：`/private/tmp/penumbra-pr4b-ui-{tests,build,browser,pr1,pr3,subpath}.log`。截图和最终JSON在 `/private/tmp/penumbra-pr4b-ui-browser/`，既有回归截图在对应的临时目录。未增加项目依赖，复用临时 Playwright 和系统 Chrome。

复现：

```sh
npm test
npm run build
SETTINGS_PR4B_OUTPUT=/private/tmp/penumbra-pr4b-ui-browser node tests/browser/settings-pr4b-smoke.cjs /private/tmp/webview-test-qa/node_modules/playwright '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
```

浏览器继续使用隔离上下文、Fake API、合成配置和 Mock MCP discovery/test；未连接真实 MCP、未读取真实凭据、未写生产配置。新增浏览器断言包括：

- 折叠/展开、全局与 Server 开关、凭据 Reveal/Copy/Hide/Clear、普通编辑保留与替换、stale ref、歧义拒清，原 CRUD/测试/高级设置断言均保留。
- 工具 Dialog 打开/关闭、按需加载、刷新、启停、400/503、409确认、跨 Server 同名工具、旧 Dialog 迟到响应隔离；关闭不产生写入、不清缓存。
- 无独立 Server 阴影/大圆角；明确全局标签、中文模式、无多余未验证时间；编辑 ID 不存在可编辑 Input。
- Input / Select 的实际 DOM 均为 `translucent/comfortable`，动画结束后控件高度至少44px；验证 focus、保存期间 disabled、两种模式字段和系统 Select 的两个选项。
- 长说明三行限制及展开/收起；Schema 默认折叠、等宽缩进、不强制断行，长字段/内容分别触发横向与纵向内部滚动。
- 工具正文滚动时标题不移动；说明/Schema 展开及滚动不改变主 Settings 的 scrollHeight/scrollTop；移动/桌面 Dialog 与页面无横向溢出。

## 人工验收限制

仅验证 Chromium 模拟的移动/桌面视口和合成 API。真机 Safari、软键盘、系统返回手势、部署环境玻璃/壁纸效果以及真实后端联调仍需人工验收；本轮不涉及后端专项审计或生产服务验证。PR4-B 已登记的契约限制继续适用。既有 PR2 浏览器套件在复制 Toast 可见性断言超时，前轮原 HEAD 对照同样复现；本轮未改连接页、Toast 或该套件。

完成后停止，等待人工验收。

## UI Follow-up 2：MCP 主面板层级收敛

本节记录 2026-11-05 的第二轮 UI 调整。基线仍为 `main` / `c8db280122fd5cfb5b0c63e0955abbf7ffac342e`；开始时上一轮的文档、MCP 页面/编辑/工具组件、展示辅助函数与测试修改已暂存。本轮保留该暂存内容，只叠加工作区修改，没有 reset、clean、stash、重新暂存、commit、push 或 deploy。三张人工参考图只用于判断结构，没有复制其中的服务或凭据数据，也未重复审计后端。

### 修改文件与职责

| 文件 | 第二轮调整 |
| --- | --- |
| `src/components/settings/mcp/MCPPage.tsx` | 顶部全局启用和说明合为一组；Server 整行与详情背景透明，只在展开标题行轻微区分；验证信息改为普通状态文字；配置项与安全 Mask 使用紧凑标签/值行；凭据操作与 Server 操作用细线分组；删除为低调红色文字操作；高级设置直接融入主滚动面板底部 |
| `src/components/settings/mcp/MCPAdvanced.tsx` | 去除 `mist-glass`、大圆角、独立背景与外部包裹；原生 details/summary 作为最后一个折叠分区，左侧箭头、右侧已确认追加深度；展开后直接显示说明、整数输入、范围和原保存反馈 |
| `tests/browser/settings-pr4b-smoke.cjs` | 保留全部已有功能断言，补充连续 Server 展开/折叠、详情透明/无卡片样式、窄屏操作换行、顶部开关归属、高级设置摘要与草稿区分、折叠保留草稿、保存读回后摘要更新 |
| 本文 | 追加第二轮变更、验证结果与人工验收边界 |

### Server 展开区域

Server 仍使用既有单项展开行为和主面板分割线。移除了整条展开行的背景，只有标题行可轻微变化；验证状态与时间、公开 URL/中文凭据模式/安全 Mask、凭据操作和 Server 操作均直接占用列表项内部宽度。详情没有独立圆角、阴影或卡片背景。公开 URL 可安全换行，不截断内容。

验证状态不再使用 Badge；成功保持绿色、普通状态保持灰色，未验证不附无意义时间。凭据操作改为普通文字按钮，查看/隐藏/复制/清除的事件和生命周期原样保留。底部操作允许换行，删除是透明底色的柔和红色操作。异常地址仍保留原安全诊断与确认限制。

### 高级设置

高级设置现在是 Server 列表后的直接折叠分区，以细分割线衔接主面板。折叠标题右侧显示「追加深度 · 已确认值」，使用现有 snapshot，0 正常显示；读取中或读取失败不会把草稿默认值当作已读取的配置。未保存输入不改变摘要，折叠/展开保留当前草稿，保存并重新读取核对成功后才更新摘要。

本轮没有改动该组件的加载、校验、保存或读回函数；字段仍为全局 Settings 根级 `mcp_max_chain_depth`，默认5、整数0–20，0不关闭MCP。沿用原数字 Input 与保存反馈，没有新增高级配置。

### 顶部全局开关

第一行保留标题、Server 数量、刷新和新增。第二行组左侧为「全局启用」及简短关闭说明，右侧为原 Switch；说明在窄屏自然换行，不再独占开关上方的一整段。没有新开关卡片或状态 Badge。全局 enabled 和 Server enabled 的处理函数、提交字段完全不变。

工具管理 Dialog、编辑 Server Dialog、API Client/DTO、凭据安全流程、工具发现/缓存/启停、连接测试及旧版 `/mcp` 均未在本轮修改。

### 第二轮验证结果

- 相关 Vitest：**4 个文件、39 项通过**，包含 MCP 契约/请求隔离、Settings 入口和返回导航。
- TypeScript：`npx tsc --noEmit --pretty false` 通过；生产构建 `npm run build`（含 `tsc -b`）通过；`git diff --check` 通过。
- 浏览器 **7 组全部通过**：Classic / Editorial 各320、390、1440px，加 Classic390深色合成壁纸。每组72次合成API请求、23次明确写操作，零外部请求、零页面脚本错误。原有凭据、CRUD、工具Dialog、测试和高级设置功能断言全部保留。
- 新增检查通过：多个Server连续展开/折叠维持单项展开；详情与行背景透明、无圆角阴影；公开URL/模式/Mask完整；320px操作按钮正常换行；高级分区直接位于主滚动区；默认5、未保存草稿、0/20保存核对后摘要和折叠状态正确。
- 已目视检查320px展开详情及高级设置折叠/展开、390px深色详情、Editorial1440高级设置；无横向溢出、按钮挤压或额外滚动区域。

日志为 `/private/tmp/penumbra-pr4b-ui2-{tests,build,browser}.log`；截图和最终结果JSON在 `/private/tmp/penumbra-pr4b-ui2-browser/`。既有暂存内容未改写，本轮没有调整工具Dialog、编辑Dialog、API或共享主题样式。

复现浏览器：

```sh
SETTINGS_PR4B_OUTPUT=/private/tmp/penumbra-pr4b-ui2-browser node tests/browser/settings-pr4b-smoke.cjs /private/tmp/webview-test-qa/node_modules/playwright '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
```

继续只使用隔离浏览器上下文、Fake API 和合成配置。验收需关注真机 Safari/软键盘、生产主题/壁纸下的实际观感和触控；既有 PR4-B 契约限制与前轮已记录的 PR2 Toast 测试限制不变。本轮不据合成回归宣称生产服务联调通过。完成后停止，等待人工验收。
