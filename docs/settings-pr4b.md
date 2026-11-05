# Settings PR4-B：独立 MCP 服务页面

日期：2026-11-05（Asia/Shanghai）。前端实现完成，等待人工验收；未 commit、push 或 deploy。

## 基线与范围

Penumbra 开始时为 `main`，HEAD `5dd954a0e306003a4886f1e27c9f5335e8bc8018`，工作区干净。没有 reset、clean、stash 或改动无关工作；保留 PR1/2/3 和 UI follow-up。只改 Penumbra 前端与测试、本文档，不改 AionHome 后端、存储、reconcile、工具缓存或 Chat 行为。

已核对本仓库 `settings-phase0-review.md`、`settings-inventory.md`；用户指定的另两份文档实际位于相邻仓库：`/Users/remix/Desktop/AionsHome-main/docs/settings-pr4a.md`、`docs/mcp-integration-feature-plan.md`。只读查阅该仓库的 `aion-chat/static/mcp.html`、`routes/mcp.py`、`settings_secret_projection.py`、`mcp_url_projection.py`、`mcp_endpoint.py`、`mcp_client.py` 和 Settings/链深消费者。核对时 AionHome HEAD 为 `5fad4172805dc58808ea8f24ac1c641626eeffc6`，工作区干净。没有开展新一轮后端全量审计，也没有读取 data、真实凭据或生产配置。

## 页面结构与导航

Settings 首页和侧栏新增「MCP 服务」，与「API 与连接」独立。复用 `SettingsShell` 的分类、内部 history 路径和返回栈；Classic、Editorial 均采用已有部署 base path。MCP 分类只在 active 时加载/挂载，返回分类、切换页面或退出 Settings 后卸载临时状态。保留 `/mcp`，页面底部提供原生旧版入口；该旧路由在服务根级，不能误加 `/penumbra/` 前缀。

主玻璃面板顶部包含服务器数量、刷新、新增与全局开关；服务器用可展开轻量卡片，内部滚动适配移动端。详情显示公开 URL、凭据模式/配置状态、后端安全诊断、独立凭据操作和按需工具管理。新增/编辑、测试结果、清除/删除确认均用现有系统 Dialog，复用 Input、AppSelect、Switch、Button、Toast 和复制能力；没有 transport 选择器。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `src/components/settings/SettingsView.tsx`、`SettingsShell.tsx` | 注册独立分类、移除 MCP 的未来占位 |
| `src/domain/mcp/mcp-client.ts` | 两种 DTO、安全解析、Session/no-store 请求、错误映射、工具/凭据/测试/链深 API |
| `src/domain/mcp/mcp-form.ts` | 新增默认值、保留/替换凭据、不可变 ID 和草稿测试请求构造 |
| `src/components/settings/mcp/MCPPage.tsx` | 全局开关、列表、详情、凭据、手动读回与旧版入口 |
| `MCPServerEditor.tsx` | 新增/编辑草稿、保留草稿、保存后安全读回、失败后核对门控 |
| `MCPTestDialog.tsx`、`MCPConfirmDialog.tsx` | 单次测试结果与破坏性操作的明确确认 |
| `MCPTools.tsx` | 用户触发发现、单工具开关、JSON schema、拓扑冲突核对 |
| `MCPAdvanced.tsx` | 全局 Settings 根级链深字段，单字段保存与读回 |
| `MCPShared.tsx`、`useMCPTask.ts` | 系统 Dialog、安全错误、请求序号/Abort/卸载隔离 |
| `src/domain/mcp/mcp-client.test.ts`、`mcp/useMCPTask.test.tsx` | 契约、安全输入、字段边界与迟到响应测试 |
| `tests/browser/settings-pr4b-smoke.cjs` | 生产子路径、Fake API、合成配置和 Mock MCP 服务浏览器流程 |
| `SettingsView.test.tsx` | 独立 MCP 入口回归 |

## 真实 API 契约与适配

所有 MCP 请求走现有 `apiRequest`，显式 `credentials: include`、`cache: no-store`，Server ID 使用 `encodeURIComponent`。不发送 Push token，不自动重发写入。

| 接口 | 实际形状/处理 |
| --- | --- |
| GET `/api/mcp/config` | `{enabled, servers: map}`；单独校验形状，只消费全局 enabled，不把嵌套 map 当列表 |
| GET `/api/mcp/servers` | 数组，含 `name`（ID）、`displayName`、`credentialMode`、`lastConnected`、`credential`、`url_diagnostic` |
| POST `/api/mcp/servers` | `{name,display_name,url,credential_mode,enabled,token?}`；新增默认 disabled |
| PUT `/api/mcp/servers/{id}` | 必须带 `display_name,url,enabled`；可选 `token,credential_mode,secret_ref` |
| DELETE `/api/mcp/servers/{id}` | 确认后一次请求，成功重新读取列表 |
| POST `/{id}/test` | `{url?,token?,secret_ref?,credential_mode?}`；允许未保存 ID，不创建配置 |
| GET `/{id}/tools` | `{server,tools:[{name,description,inputSchema,enabled}]}`；不是保证无副作用的读取 |
| PUT `/{id}/tools` | 只发送 `{name,enabled}`；不通过保存 Server 模拟工具开关 |
| POST `/api/mcp/secrets/reveal` | `{secret_ref}` → `{secret}` |
| POST `/api/mcp/secrets/clear` | `{secret_ref}` → `{ok:true}` |
| GET/PUT `/api/settings` | 只提取/提交 `mcp_max_chain_depth`，不回传完整 GET |

表中缩写 `/{id}` 位于 `/api/mcp/servers` 下。CRUD 的 `{ok:true}` 只表示保存完成，UI 不推断运行时初始化成功；写后重新安全读取 config/list，并保留手动刷新，没有轮询。全局写只发送 enabled，不修改 Server enabled、凭据、disabled_tools 或缓存。最近验证由服务端 `status` 和 Unix 秒 `lastConnected` 展示，不伪装心跳；offline/0 展示「尚未验证」。测试结果不修改这两项。

发现的契约差异（没有扩展后端）：

1. **过期 ref 实际为 HTTP 422 + 固定字符串** `Secret reference is invalid or stale`，不是仅有 409 `stale_secret_ref`。客户端同时适配该现状和结构化代码；自动重读元数据，但不重试 Reveal/Clear/保存。
2. **工具 GET 拒绝 disabled Server（400）**，即使缓存可能存在。页面保留服务器/工具配置，显示真实错误，不为加载工具偷偷启用 Server；全局关闭而 Server enabled 时仍按 API 管理有效缓存，缺失返回 503。
3. **工具 PUT 当前没有结构化 topology_changed 返回**，无缓存会 409。前端对 409 重读 Server/工具，要求用户核对后再次操作；不会自动重发开关。
4. **Reveal 没有类型字段**。UI 按完整 HTTP(S) 地址格式标注完整私有 Endpoint，否则标注独立 Token；这是展示推断，并非新增后端权威。若未来存在本身为完整 URL 的独立 Token，需要后端提供类型元数据才能消除此歧义。
5. **测试只返回 success/error/tools**，当前错误是「连接失败」或「连接超时」，没有结构化远端 HTTP 状态/异常类型。仅呈现这两个安全错误和请求本身 HTTP 状态，不输出原响应或原异常。
6. **修改公开地址后引用历史内嵌凭据的测试存在限制**：test 路由先 reveal 成 token，仅当提交地址等于安全投影时恢复原配置（`routes/mcp.py` test 分支）。新地址配旧完整私有 Endpoint 不保证正确。此类草稿测试要求主动提供新 Token/完整 Endpoint；普通保存依然后端保留凭据，不猜测 URL 认证含义。

## 凭据安全交互

- 初始化、展开详情、编辑均不 Reveal。只展示 configured、masked；secret_ref 仅用于请求，不进入可见文案或输入框。
- 新 Token 为空时完全省略 token，不作为清除。mode 未变时省略 credential_mode，保留已有模式。PUT 替换与普通编辑均附当前可用引用；配置了凭据但没有可用引用时阻止编辑写入并提示刷新。
- path_segment 不在前端拼接私有 URL。公开地址独立展示/编辑，新完整 Endpoint 用临时密码输入框交给后端拆分；编辑不回填私有 Endpoint，切换模式不沿用旧私密输入。
- url_diagnostic 逐条按纯文本展示。空公开 URL 显示「地址已安全隐藏」而非原配置为空；元数据编辑可以回传该投影交由后端保留，修正地址必须由用户明确输入。歧义 URL 的清除确认按钮禁用，并给出先修正地址的指引；仍适配后端歧义拒绝错误。
- Reveal 内容仅存当前详情临时状态，用户可 Hide；用户明确复制后调用现有复制函数和 Toast。关闭详情、开启另一个 Dialog、离开分类、引用变化或卸载都移除明文并使在途 Reveal 失效。不写日志、错误对象、localStorage、sessionStorage 或持久草稿。
- 清除是独立确认 Dialog，绑定本次确认的引用，只发专用 clear 请求；失败不在同一次确认中自动换引用重发。成功读回，不删除 Server，不由前端清缓存或回收连接。
- 网络、权限或保存错误保留编辑草稿。保存结果不确定/读回失败时锁住重复提交，先读回核对再继续；清除、删除失败后须关闭并重新确认。

## Server、工具和测试流程

Server ID 创建时显式填写，编辑禁用。名称、URL、mode 和 enabled 使用当前 DTO；未知 mode 不静默转为 query_token，必须显式选择支持模式。全局 enabled 与各 Server 独立。

工具仅在点击「管理工具」后读取；手动刷新工具明确提示可能触发连接/发现。工具状态按 Server ID 分组件，请求通过 Abort + 当前 controller 身份隔离；折叠/换 Server/卸载后的迟到响应不会发布。加载失败显示实际错误并移除旧展示，避免用旧列表伪装有效缓存。每个工具用纯文本名称/说明、独立 Switch 和可折叠格式化 JSON schema；没有 HTML 注入。成功 PUT 只更新本地 enabled，再读管理元数据获得新 ref；不调用工具 GET，不触发前端 reconcile/cache 清理。同名工具以 Server 隔离，disabled_tools 由后端保留；409 后重读并等待确认。

已保存 Server 测试发送空 body，由后端使用保存配置；新增草稿用独立临时 ID，编辑草稿发送公开 URL、明确模式和新 token 或 ref 二选一。完整新 Endpoint 不附旧 ref。测试不先保存，不自动启用，不重试其他服务。独立结果 Dialog 同时依赖 HTTP 成功与 `success === true`，显示返回工具数量；关闭立即丢弃结果/在途响应，编辑草稿仍可继续修改。

## 高级设置

只有 `mcp_max_chain_depth`。从全局 Settings 根级读取，缺省显示 5，数字输入限制整数 0–20；0 合法，不改变 MCP 全局开关。文案依现有 Chat 消费者描述为工具结果后的链式追加深度限制，没有宣称它关闭首次 MCP 调用。

PUT 仅含 `{mcp_max_chain_depth: number}`，检查保存确认后 GET 并比较目标字段。失败保留输入，其余 Settings 字段既不存入页面状态，也不提交；没有 MCP 配置副本或其他高级参数迁移。

## 验证

使用临时浏览器上下文、Fake API、合成 Server 配置和内存 Mock MCP discovery/test 服务；Mock 返回工具/schema/测试结果，不连接真实 SSE 服务，不启动真实 AionHome，不读取真实浏览器 Profile/数据或调用生产 API。该 Mock 验证前端契约，并不替代后端 SDK/transport 合同测试。

- TypeScript 与生产构建通过：`npm run build`（包含 `tsc -b`）。
- 全量前端：219 个测试文件、2966 项通过；其中本轮新增 24 项契约/请求生命周期测试。
- 新浏览器流程 7 组全部通过：Classic / Editorial 各 320、390、1440px，另 Classic 390px 深色自定义合成壁纸。每组 74 次合成 API 请求、23 次明确写操作；零外部请求、零页面脚本错误。自动检查页面和 Dialog 边界，并目视检查窄屏面板、深色编辑 Dialog、Editorial 桌面面板。
- 覆盖全局独立开关、列表/展开、CRUD、ID 禁改、写后读回、异步初始化文案和手动刷新；未配置/已配置凭据、两种 Reveal、Copy/Hide、替换/普通编辑保留、清除取消/确认、stale ref、歧义 URL 拒清、关闭详情/打开 Dialog/离页清理。
- 覆盖工具显式加载、有效缓存/缺失503、disabled Server400、全局关闭、新工具默认启用、disabled_tools 保留、跨 Server 同名、工具开关不额外 GET、409核对、迟到列表隔离、恶意外部文本/JSON。
- 覆盖已保存/新增/编辑草稿测试、HTTP200+success:false、草稿不保存、测试结果关闭；链深默认、0/20、非法负数/小数/越界、Settings 单字段提交；子路径和浏览器返回/刷新后的分类恢复、旧版入口。
- 既有 PR1（外观/运行概览）、PR3（任务分配与 UI follow-up）、production-subpath 浏览器套件通过。PR2 套件在复制后的「Key 已复制」Toast 可见性断言超时，单独重跑仍复现；原 HEAD `5dd954a` 的 `/private/tmp/penumbra-pr4b-baseline` 隔离构建使用同一脚本、Fake API 和 Chrome，在同一行 `settings-pr2-smoke.cjs:209` 出现相同失败。本轮没有把该套件记为通过，也没有为此改动原连接页/Toast。对照日志 `/private/tmp/penumbra-pr4b-baseline-pr2.log`。

复现：

```sh
npm test
npm run build
node tests/browser/settings-pr4b-smoke.cjs /private/tmp/webview-test-qa/node_modules/playwright '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
```

可通过 `SETTINGS_PR4B_OUTPUT` 指定截图/JSON目录；`SETTINGS_PR4B_QUICK=1` 只跑 Classic320。未增加 npm 依赖；复用临时 Playwright 和系统 Chrome。测试产物默认在忽略目录 `artifacts/settings-pr4b/`。日志为 `/private/tmp/penumbra-pr4b-{tests,build,browser,pr1,pr2,pr3,subpath}.log`。

## 人工验收边界与未完成事项

本轮功能范围已经实现。真实后端部署版本/Session、真实 MCP SSE 服务、生产凭据和运行时 eviction/cache 副作用没有实测；依赖 PR4-A 及既有后端契约，不能据 Fake API 宣称生产联调通过。既有 PR2 浏览器套件的复制 Toast 超时仍待单独排查（原 HEAD 同样复现）。真机 Safari/软键盘、系统返回手势和生产壁纸/玻璃效果仍需人工验收。Editorial 使用其既有外观消费能力，本轮没有扩展它的壁纸系统。没有增加实时健康状态机、transport、headers、预设或其他高级设置。

当前仅有格式推断的 Reveal 类型、disabled Server 工具 GET 限制、历史内嵌凭据配新地址草稿测试限制，详见契约差异；本轮没有为此扩展后端。
