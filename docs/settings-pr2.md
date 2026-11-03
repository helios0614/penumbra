# Settings PR2：Registry Connection 管理

实施日期：2026-11-03（Asia/Shanghai）。依据 Phase 0、Settings inventory、历史领域审计、AionHome Phase 5-D Unified Settings Contract，并核对当前 HTTP 路由、Connection service、引用扫描与模型探测源码。

## 起始状态与范围

- Penumbra 分支 `main`，HEAD `e3dbdd8efcccc88abf76f2afd3804466e616c1b1`（PR1），起始工作区干净。
- 保留 PR1 的 Settings shell、外观存储及两个 Desktop 的挂载方式。不 reset、clean、stash、commit、push 或 deploy。
- 仅静态读取 AionHome 的文档和相关源码，未 import、启动、修改后端，未读取实际 Settings、SQLite、真实 Key 或用户浏览器配置。
- 激活“API 与连接”，完成 Connection 管理及主动测试/发现；不编辑任何 Feature、Main、Diary、Theater 或 Game 选择，不调用迁移接口。

## 修改文件与职责

| 文件 | 职责 |
| --- | --- |
| `src/domain/registry/registry-types.ts`（新增） | Connection / 版本 / 引用 / 测试 / 发现类型、三个 Transport、单次探测协议、输入校验、安全错误文案和删除条件。 |
| `src/domain/registry/registry-client.ts`（新增） | 复用既有 API client 和网页 Session；no-store、ID 编码、字段白名单、响应身份校验、错误脱敏。 |
| `src/domain/registry/registry-client.test.ts`（新增） | 凭据保留/替换/reveal/clear、编码、版本、安全投影、引用保护、测试三元组及分页身份验证。 |
| `src/components/settings/connections/ConnectionsList.tsx` | 统一玻璃面板、紧凑行、单开手风琴、版本状态与行内操作；复制 Key 仅使用局部临时变量。 |
| `src/components/settings/connections/ConnectionDetail.tsx` | 新增/编辑共用 Dialog；部分更新、启停、临时 Key、影响确认、保存读回和结果不明恢复。 |
| `src/components/settings/connections/ConnectionProbe.tsx`、`ConnectionTestDialog.tsx` | 仅保留本次协议、literal 和基础测试，单独的系统 Dialog；打开时读取已保存连接。 |
| `src/components/settings/connections/ModelDiscovery.tsx` | 从 Probe 拆出的模型发现，置于编辑弹窗预填字段旁；沿用 client、分页和请求隔离。 |
| `src/components/settings/connections/ConnectionReferences.tsx`、`ConnectionDeleteDialog.tsx` | 展开后的只读引用、删除前复查与二次确认。 |
| `src/components/settings/connections/ConnectionShared.tsx`（新增） | 脱敏错误和紧凑 Registry 版本状态。 |
| `src/components/settings/connections/useRegistryTask.ts`、`.test.tsx`（新增） | 独立任务、AbortSignal、请求身份、重置与卸载隔离测试。 |
| `src/components/settings/SettingsView.tsx` | API 与连接按分类懒加载；列表内管理弹窗，不再注册 Connection 嵌套详情页。本轮未修改 Shell。 |
| `src/application/settings-overview/settings-overview-types.ts`、`settings-overview-service.ts`、`src/components/settings/settings-overview-controller.ts`、`SettingsSafeBasics.tsx` | 删除专用模型目录状态、请求和卡片，仅保留 Session/readiness。 |
| 对应 overview、SettingsSafeBasics、SettingsView 测试 | 清理旧模型目录断言，保留双接口错误/取消隔离及页面回归。 |
| `tests/browser/settings-pr2-smoke.cjs`（新增） | 生产 UI、Fake API / 模拟 Provider 结果，覆盖六组桌面/窄屏管理流程。 |
| `tests/browser/settings-pr1-smoke.cjs` | 适配已激活的分类及双接口概览，新增不请求 `/api/models` 断言，保留外观/返回回归。 |
| `docs/settings-pr2.md`（本文） | 实际契约、边界、验证及人工验收事项。 |

未改动其他 `/api/models` 业务消费者或 runtime client；未删除后端路由；未修改外观资源、Chat Composer、Diary、Feature Binding、MCP 或业务持久化实现。

## 页面与导航

当前采用一个玻璃管理面板：顶部是连接管理标题、数量、Registry 状态、刷新及新增；连接行使用细分隔线，默认全部折叠，同一时间只展开一个。正常版本信息为紧凑文字行，存在迁移需求、诊断或读取错误才提高提示权重。

折叠行显示名称、启用/Key 状态、Base URL 与可选预填模型。`direct` 不显示接入标签，也不显示“直连”；Cloudflare 两种模式分别显示 Cloudflare REST / Cloudflare Anthropic。右侧四个系统图标按钮为编辑、删除、复制 Key、测试，均有名称和 Tooltip。桌面操作与条目并排，窄屏操作可另起一行，名称和地址正常换行。

展开区域只读显示适用的 Gateway ID、各业务引用、无法解析记录和 ID，不放编辑或测试表单。新增/编辑共用 `ConnectionDetail` 的系统 Dialog，测试使用独立 `ConnectionTestDialog`，删除使用 AlertDialog。弹窗关闭回到原连接行操作或面板标题；分类返回和 Desktop 关闭仍由原 shell/host 负责。

保存成功必须 GET 读回后才关闭编辑弹窗并刷新列表；清 Key 成功读回后仍可留在编辑弹窗。编辑弹窗取消/关闭也会刷新列表，避免“写入生效、响应丢失、已读取核对”后的旧列表快照。新增一旦取得后端 ID，即使读回失败也记住 ID 并进入核对，禁止盲目重复创建。

列表和弹窗仅在分类激活时挂载。弹窗关闭、离开分类、关闭 Settings 均清理临时凭据与异步任务。没有新增 URL 或路由，继续支持 `/penumbra/`；刷新后沿用 Desktop 入口，不恢复弹窗或草稿。外观页与其他分类保持原有实现。

## 实际 API 契约

统一路径前缀 `/api/registry/connections`；ID 使用 `encodeURIComponent`。所有调用复用既有 Session `credentials: include`，请求 `cache: no-store`，不引入 token 或第二套认证。

| 方法 | 实际请求与读取 |
| --- | --- |
| GET 列表 | 读取 `schema_version:2`、`authority_state:projected_v2/persisted_v2`、`migration_required`、`connections`；迁移诊断与延后绑定只读数量，不展示任意 payload。 |
| GET `/{id}` | 返回单条 Connection，不是包在 `connection` 下；校验返回 ID。 |
| POST 列表路径 | `name,base_url,enabled,default_model,transport,gateway_id`，可选 `credential`；后端分配 ID。 |
| PATCH `/{id}` | 仅提交实际改变字段；`default_model:null` 清空预填建议；未改 Key 时省略 credential/ref。 |
| DELETE `/{id}` | 不提交级联参数；要求 `{ok:true}`。 |
| GET `/{id}/references` | 返回 `{references:[{scope,id}],unresolved:[{scope,id,code}]}`。 |
| POST `/{id}/credential/reveal` | `{secret_ref}` → `{secret}`；仅主动点击。 |
| POST `/{id}/credential/clear` | `{secret_ref}` → 最新脱敏 Connection；之后 GET 核对。 |
| POST `/{id}/test` | `{connection_id,protocol,model}`；路径/body ID 一致，校验返回 ID、协议、模型、`test_type:basic_nonstream`、`validates_full_chat:false`、`ok:true`。 |
| POST `/{id}/fetch-models` | query `protocol`、可选 `after_id`；无 Key/body 配置。校验 `connection_id,protocol,operation:model_list,models:string[],truncated,next_page`。 |

Connection 只保存真实字段，**没有 protocol、Provider 推断或 reusable_protocols**。三个 Transport 仅为 `direct / cloudflare_rest / cloudflare_anthropic`，Cloudflare 时显示可选 Gateway ID，保持后端既有语义。`default_model` 是预填建议，不是 Feature 默认或已有会话模型，不要求存在于内置目录。

输入层要求 HTTP(S) 基础地址，拒绝调用端点后缀、URL userinfo、查询参数和 fragment，避免凭据放进公开 URL。列表展示 URL 时也不显示内嵌 userinfo/query/fragment。空/不合法的历史地址仍可读取，但需明确修正后再保存；不会在 GET 中自动修复。模型按 literal 规则校验，允许目录以外的名称。

界面展示投影/持久化状态、迁移需求和明确保存可能持久化 v2 的提示。不存在自动迁移、修改版本标记或调用 `/api/registry/migrate` 的代码。后端明确 Connection 写入可能伴随 v2 持久化，属于原契约，界面不虚构“只写一个字段、绝无版本影响”。

## 凭据安全与失败恢复

- 普通 GET 只消费 `credential:{configured,masked,secret_ref}`；丢弃 `key`、`credential_ref`、绑定等额外数据。metadata 的 ref 不渲染或解析为凭据。
- 默认不 reveal。显式查看才 POST；关闭明文立即重置并取消在途 reveal。离开详情卸载，迟到成功也无法重新展示。
- 输入 Key 为临时 password 字段；空输入表示不修改，空白/掩码不能提交；不把 masked 预填到输入框。已有 Key 的替换携带当前 ref，未配置时可创建或补配。
- 清除是独立确认操作，不用空字符串代替。普通编辑也可能使旧 ref 失效，所以成功后重新 GET，而非继续沿用旧凭据快照。
- `stale_secret_ref` / `invalid_secret_ref` 自动重新读取脱敏详情，但**不重放 reveal、替换或 clear**。清理 Key 输入，要求用户核对当前状态后明确继续。
- 任何写失败/响应丢失/读回不确定均进入核对状态，阻止再次提交，先 GET，再由用户确认继续编辑。新增结果不明时返回列表核对，不提供原地盲目重发。
- 读回保留用户实际编辑的非密钥字段，未编辑字段采用新快照；Key 失败后需重新输入。操作成功并读回才显示已保存。
- Registry client 立即把共享 ApiError 转为只含安全 code/status/固定文案的 RegistryError，不保留原 message/data、校验 input、请求 body 或上游正文；未知诊断不直接显示。无日志或 storage 写 Key 的代码。

## 引用、停用和删除

显示 Feature Binding、Main、Diary、Theater、Persona、Game、Legacy compatibility 的 scope 和记录 ID；不读取这些记录的正文，不提供选择编辑。

停用允许存在引用，但先显示调用可能失败且不会自动切换的提示；共享影响操作有确认与影响勾选。引用失败不等于没有引用；尚未核实的引用也按可能存在影响处理。

只有成功读取且两个引用数组都为空，删除入口才可操作。确认删除后再请求一次 references；仍有引用或无法解析项则停止，随后 DELETE 的后端检查仍是最终权威。查询错误、损坏响应、409 `connection_in_use/profile_in_use/unresolved_selection_references` 均保守拒绝，并支持重新读取引用；没有级联、默认切换或绕过历史保护。

## 测试与模型发现

协议仅为主动操作的参数，提供当前 Adapter 已有的 OpenAI Chat Completions、Anthropic Messages、MiniMax Chatcompletion v2。Cloudflare 测试只允许 Anthropic；其余组合显示不支持。列表与页面初始化不自动测试。

测试说明明确：仅验证一次基础非流式请求，不证明完整 Chat、Streaming、Thinking、Cache、图片、长上下文。失败不切换连接或模型，不自动重试。

发现仅支持 direct OpenAI / Anthropic；Cloudflare 与 MiniMax 显示不支持，仍允许手填。Anthropic 用 `next_page → after_id` 显式读取下一页并去重；OpenAI 截断时说明不支持分页，不提供伪分页。

每个详情按 Connection ID 挂载独立实例；每项任务按请求身份校验，切协议立即 reset/abort 并清空旧候选。返回身份不匹配视为安全契约错误。即使接口忽略取消，旧 Connection/协议/序号的结果也无法发布。

成功、失败、空列表与分页均不修改手填测试 literal 或 default_model 草稿。候选的“填入预填草稿”只改编辑弹窗的 default_model 草稿，仍需明确保存。测试模型在独立测试弹窗手动填写。未保存名称/模型建议不妨碍使用已保存连接发现；URL/Transport/Gateway/启用状态/Key 的待保存改动则先保存核对再测试。

## 首次 PR2 验证结果（历史）

以下记录首次 PR2 交付；当前 UI 重构的结果见文末。

全部使用合成配置及临时浏览器上下文；API 拦截桩模拟后端与 Provider 的成功、失败、分页和迟到结果。不调用真实 Provider、不读取真实 Key，不写生产配置。未执行真实后端 Adapter 或生产迁移验证。

| 检查 | 结果 |
| --- | --- |
| 相关 Vitest | 7 文件、78 条通过（含 Registry 新增测试及概览清理）。 |
| 全量 `npm test` | **213 文件、2881 条通过**，包括既有 Chat、Diary、Desktop 测试。 |
| `npx tsc --noEmit --pretty false` | 通过。 |
| `npm run build` | 通过，沿用 `/penumbra/` base；未部署。 |
| `git diff --check` | 通过；构建缓存 `tsconfig.tsbuildinfo` 还原为起始内容。 |
| PR2 浏览器 | 经典/Editorial × 320/390/1440，共 6 组通过，页面异常 0、外部网络请求 0。 |
| 更新后的 PR1 浏览器 | 同样 6 组通过，外观和存储、返回、Session/readiness 分项错误/重试/迟到响应正常；不再请求概览 `/api/models`。 |
| 既有 production-subpath 浏览器 | 开发 `/` / 生产 `/penumbra/` × 390/1440，共 4 组通过；Desktop/Chat 打开、刷新、历史、返回、旧版跳转与玻璃样式保持正常。 |

PR2 浏览器覆盖：创建无 Key 连接、详情/改名时保留 Key、替换携带 ref、主动查看/关闭、过期 ref 重新读取并等待确认、显式清除、保存失败保留非秘密草稿、写入生效但响应丢失时核对且不重放；三个 Transport 和 Gateway ID、引用七种 scope、引用失败和无法解析时禁止删除、被引用连接停用/启用、无引用删除；测试成功/失败/不支持、发现成功/失败/空列表、OpenAI 截断提示、Anthropic 分页、快速切协议和连接的迟到隔离、手填测试模型和未保存预填草稿不被发现覆盖、候选不静默保存、离开/刷新/重开及临时 Key 清理。断言未调用 migrate、Feature/独立 selection 或业务模型写接口。

复现（先构建）：

```sh
npm test
npx tsc --noEmit --pretty false
npm run build
node tests/browser/settings-pr2-smoke.cjs <playwright模块路径> <Chrome可执行文件>
node tests/browser/settings-pr1-smoke.cjs <playwright模块路径> <Chrome可执行文件>
node tests/browser/production-subpath-smoke.cjs <playwright模块路径> <Chrome可执行文件>
```

本轮复用 `/private/tmp/penumbra-pr4b-tools/node_modules/playwright` 与系统 Chrome，未新增项目依赖。日志 `/private/tmp/penumbra-pr2-*.log`；PR2 JSON/截图 `/private/tmp/penumbra-settings-pr2-browser/`。已目视检查桌面列表、窄屏详情和滚动布局，未见横向溢出；截图使用合成连接且不展示 Key。

## 已知限制与待人工验收

- Registry 没有通用 revision/CAS；引用扫描、Settings 和 SQLite 不构成跨存储事务。前端明确确认、读回、局部 PATCH 和后端删除保护不能消除其他页面同时改同一字段的竞态。
- 新增响应丢失时后端无本轮可用的幂等键；需读取列表人工确认，不自动重新创建。网络取消也不保证后端写入未执行。
- 引用响应损坏或无法识别时安全失败并禁止删除，不把损坏记录当成空数组。不存在“强制删除”。
- 历史非法/含参数的 Base URL 需人工核对并修正；本轮不迁移或自动重写旧地址。
- 浏览器是桌面 Chrome 的窄视口验收，手机真机、Safari、部署环境 Session 和已批准的真实上游兼容性仍待人工验收；基础测试成功也不能替代完整 Chat 能力验证。
- 不提供分类深链或刷新后自动恢复弹窗，沿用 PR1 导航边界。未实现 Feature Binding、新会话默认分配、MCP、服务集成或其他业务设置。

完成后停止，等待人工验收。不 commit、push 或 deploy。


## 后续 UI/交互整理（2026-11-03）

### 工作区与范围

开始时 `main` / `e3dbdd8e`，PR2 文件已暂存。本轮未操作 index 或提交；工作期间检测到 HEAD 更新为 `17aa866f5baf5685a91201375bee8a90513f9408`（PR2 提交），继续保留其基线与未提交 UI 调整。没有 reset、clean、stash、push 或 deploy。

本轮只阅读 PR2 文档、现有前端及系统控件，没有重新审计后端。`src/domain/registry` 的类型、API client、契约与测试未修改；没有修改 Connection 字段、Transport/Protocol 语义或业务绑定。

### 系统组件与布局

- 所有编辑、发现、测试表单使用已有 `Input`、`AppSelect` 和 `Switch`；没有直接拼装原生 input/select/checkbox，也没有新增独立表单视觉体系。
- 新增/编辑使用 `Dialog / DialogContent / DialogHeader / DialogBody / DialogFooter`，桌面 `max-w-2xl` 居中；移动端沿用系统安全边距与可用视口高度，接近全屏。只有 DialogBody 滚动，底部操作固定；候选和引用不再各自嵌套滚动。
- 删除复用 `AlertDialog`，测试复用单独的 `Dialog`；按钮、禁用、焦点、深色材质与 Tooltip 均来自现有系统组件。页内分组使用轻量边界，减少大玻璃卡片。
- `ConnectionControls.test.tsx` 新增系统控件契约、测试/发现分离、手填 literal 保留、候选显式填入与迟到结果测试。`useRegistryTask` 只补了卸载后不再启动请求的守卫及测试，保留既有取消/请求序号机制。
- Connection 分类按需加载，避免把新增共享控件带入桌面首屏。最终入口包约 **445.25 kB / gzip 141.72 kB**；重构中曾因静态导入升至约 586 kB，已通过分类懒加载解决，没有调整构建警告阈值。

### 凭据和危险操作

复制 Key 只在行内按钮点击后调用原 reveal；以普通 GET 返回的当前 ref 校验。明文只作为调用内局部变量传给 `navigator.clipboard.writeText`，finally 释放变量引用，任务 state 仅保存 boolean；列表不展示明文，不写 storage、日志或全局状态。未配置 Key 时按钮禁用。

复制遇到 stale/invalid ref 会重新读列表元数据并等待“已核对，允许重新复制”，不会自动 reveal 或复制；重新读取失败时保留原行，允许主动“重新读取凭据状态”。复制成功提示在凭据快照变化时清理，避免显示旧 Key 的成功状态。离开分类后迟到 reveal 不写剪贴板。

编辑保留默认隐藏、未改留空保留、替换携带 ref、显式 clear 与确认、过期 ref 读取后确认、失败清理 Key 和禁止自动重放。关闭弹窗卸载明文状态和发现任务。复制进入系统剪贴板是用户主动操作的目标；本产品不自动清空系统剪贴板。浏览器验收使用 Fake Clipboard，没有触碰宿主机剪贴板。

删除按钮每次点击均重新查引用；有引用、无法解析或查询失败都不能确认。用户二次确认后再查一次引用，最后由 DELETE 的后端保护裁决；没有强制或级联删除。删除结果不明时禁止原地重放，提示关闭并刷新列表核对。

### 本轮验证

- 相关测试：**9 文件、91 条通过**。
- 全量前端：**214 文件、2886 条通过**；TypeScript、生产构建、`git diff --check` 均通过。
- 首次全量测试与多组浏览器并行时，一条既有 `Sender.interactions` 请求次数断言失败；该文件单独复核 22 条通过，浏览器结束后完整重跑 2886 条通过。未修改 Chat 测试或业务代码，记录为一次未复现的并发运行失败。
- 新版 PR2 浏览器：经典 / Editorial，各有 320 浅色、390 深色、1440 浅色和 1440 深色，共 **8 组**通过。每组 4 个合成连接，覆盖统一面板、默认折叠/单开、Direct 标签省略、两种 Cloudflare 标签、可选预填、四个图标操作、新增/编辑/测试/删除弹窗、系统表单控件、Key 复制/替换/查看/清除、stale ref、读取失败恢复、复制迟到取消、引用保护、共享连接启停、基础测试与分页发现、跨协议/连接迟到隔离、未保存模型草稿保留、离开/重进/刷新，以及无横向溢出。
- PR1 外观/导航/双接口概览浏览器 **6 组**通过；既有 Desktop/Chat 开发/生产 base path 回归 **4 组**通过。均为 Fake API/合成数据，页面异常和外部网络请求为 0。
- 已目视检查 320 面板、390 深色编辑弹窗及桌面浅/深色截图。当前浏览器报告为 `/private/tmp/penumbra-settings-pr2-browser/results-ui.json`，截图在同目录；本轮日志为 `/private/tmp/penumbra-pr2-ui-*.log`。构建产生的 `tsconfig.tsbuildinfo` 交付前恢复为当前已提交基线。

### 仍需人工验收

Safari/手机真机、部署环境剪贴板权限及真实上游兼容性仍未验证；剪贴板 API 需要浏览器允许的安全上下文/权限。网络取消无法撤销已经到达后端的写入，也无法撤销已提交给系统的剪贴板操作；保留读取核对和明确重试。Registry 无通用 CAS、跨存储引用竞态、无新增幂等键等既有限制不变。

未读取真实 Key、未调用真实 Provider、未写生产配置；没有 commit、push 或 deploy。完成后停止，等待人工验收。
