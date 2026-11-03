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
| `src/components/settings/connections/ConnectionsList.tsx`（新增） | 移动优先连接卡片、版本状态、新增和详情入口。 |
| `src/components/settings/connections/ConnectionDetail.tsx`（新增） | 创建/部分编辑/启停、临时 Key、影响确认、引用、删除、读回和结果不明恢复。 |
| `src/components/settings/connections/ConnectionProbe.tsx`（新增） | 本次协议与 literal、基础测试、主动发现、Anthropic 分页、候选填入草稿。 |
| `src/components/settings/connections/ConnectionShared.tsx`（新增） | 玻璃分组、脱敏错误、Registry 版本状态。 |
| `src/components/settings/connections/useRegistryTask.ts`、`.test.tsx`（新增） | 独立任务、AbortSignal、请求身份、重置与卸载隔离测试。 |
| `src/components/settings/SettingsView.tsx`、`SettingsShell.tsx` | 注册 API 与连接和嵌套详情；详情期间高亮父分类；离开详情卸载临时凭据状态。 |
| `src/application/settings-overview/settings-overview-types.ts`、`settings-overview-service.ts`、`src/components/settings/settings-overview-controller.ts`、`SettingsSafeBasics.tsx` | 删除专用模型目录状态、请求和卡片，仅保留 Session/readiness。 |
| 对应 overview、SettingsSafeBasics、SettingsView 测试 | 清理旧模型目录断言，保留双接口错误/取消隔离及页面回归。 |
| `tests/browser/settings-pr2-smoke.cjs`（新增） | 生产 UI、Fake API / 模拟 Provider 结果，覆盖六组桌面/窄屏管理流程。 |
| `tests/browser/settings-pr1-smoke.cjs` | 适配已激活的分类及双接口概览，新增不请求 `/api/models` 断言，保留外观/返回回归。 |
| `docs/settings-pr2.md`（本文） | 实际契约、边界、验证及人工验收事项。 |

未改动其他 `/api/models` 业务消费者或 runtime client；未删除后端路由；未修改外观资源、Chat Composer、Diary、Feature Binding、MCP 或业务持久化实现。

## 页面与导航

连接列表显示名称、Base URL、Transport、启用状态、Key 配置状态和可选模型预填建议；通过“详情与管理”进入编辑、启停、凭据、测试、发现及删除操作。列表使用卡片，详情表单在宽屏两列、窄屏单列。

沿用 PR1 的内部返回栈：分类 → 连接列表 → 详情/新增；shell“返回上级设置”和详情“返回连接列表”均先回列表，列表返回分类，关闭仍交给原 Desktop。创建成功切换到后端返回 ID 的新详情并重新 GET。不新增路由，不改变 URL，因此沿用 `/penumbra/` 部署路径；刷新后仍按原 Desktop 重新进入 Settings。

连接列表/详情仅在激活时挂载。离开详情、切换分类或关闭 Settings 即卸载任务与临时 Key，不把凭据保存在 shell、全局 store 或存储中。外观页仍保留 PR1 的挂载与保存行为。

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

成功、失败、空列表与分页均不修改手填测试 literal 或 default_model 草稿。候选的“用于测试”只填单次模型；“填入预填草稿”只改本页 default_model 草稿，仍需明确保存。未保存名称/模型建议不妨碍使用已保存连接发现；URL/Transport/Gateway/启用状态/Key 的待保存改动则先保存核对再测试。

## 验证结果

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
- 不提供分类深链或刷新后自动恢复详情，沿用 PR1 导航边界。未实现 Feature Binding、新会话默认分配、MCP、服务集成或其他业务设置。

完成后停止，等待人工验收。不 commit、push 或 deploy。
