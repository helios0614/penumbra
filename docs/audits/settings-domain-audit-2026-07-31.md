# Settings Domain Audit

> 审计日期：2026-07-31
>
> 状态：已完成，只读审计

[返回前端迁移路线图](../frontend-migration-plan.md)

本报告记录 Penumbra 在接入真实 Chat 前对 AionsHome Settings 领域所做的只读扫描。结论基于审计日期当天两个仓库的实际 checkout；AionsHome 当前实现、契约测试和强制文档仍是运行语义的权威来源。

核心结论：

- 旧 Settings 是跨领域配置管理页，不是单一领域，不应整体迁移。
- Chat 首批不依赖完整 Settings 页面，只依赖安全的 session、模型和 provider readiness 读模型。
- 全局 active API config 不等于 conversation model；Chat 的模型事实来源是 conversation 的 `model`。
- Provider routing 和 fallback 继续由后端负责，Penumbra 不复制这些规则。
- 当前多个 Settings endpoint 会向浏览器返回完整 secret，不能直接成为 Penumbra 的安全读取契约。
- 当前没有旧配置具备直接删除条件。

## 1. 扫描范围

### 1.1 仓库状态

审计以实际 checkout 为准：

- Penumbra：`/Users/remix/Desktop/Penumbra`，分支 `main`。
- AionsHome：`/Users/remix/Desktop/AionsHome-main`，分支 `refactor-code-main`。

本次为静态源码扫描，没有调用真实 endpoint，也没有修改两个仓库。

### 1.2 Penumbra

已阅读：

- `docs/penumbra-architecture.md`
- `docs/frontend-migration-plan.md`
- `docs/frontend-contracts.md`
- `src/lib/runtime-config.ts`
- `src/lib/api.ts`
- `src/lib/backend.ts`
- `src/components/settings/SettingsView.tsx`
- Settings 桌面入口、App registry、主题、壁纸和当前 Chat mock 实现。

关键证据：

| 文件 | 审计证据 |
|---|---|
| [`src/components/settings/SettingsView.tsx`](/Users/remix/Desktop/Penumbra/src/components/settings/SettingsView.tsx:70) | 当前 Settings 状态、外观设置和后端检测逻辑入口。 |
| [`src/components/settings/SettingsView.tsx`](/Users/remix/Desktop/Penumbra/src/components/settings/SettingsView.tsx:498) | 后端、登录、检测 endpoint 状态面板及 API base URL 展示。 |
| [`src/components/settings/SettingsView.tsx`](/Users/remix/Desktop/Penumbra/src/components/settings/SettingsView.tsx:539) | 模型、Chat、日历仍是预留区块。 |
| [`src/lib/backend.ts`](/Users/remix/Desktop/Penumbra/src/lib/backend.ts:3) | 当前使用 `/api/settings` 作为后端和登录状态探针。 |
| [`src/lib/api.ts`](/Users/remix/Desktop/Penumbra/src/lib/api.ts:71) | 统一 HTTP transport、cookie、timeout、AbortController 和 `ApiError`。 |
| [`src/components/chat/useConversations.ts`](/Users/remix/Desktop/Penumbra/src/components/chat/useConversations.ts:5) | Conversation 仍由 mock 驱动，新建会话使用硬编码 model。 |
| [`src/components/chat/mock-data.ts`](/Users/remix/Desktop/Penumbra/src/components/chat/mock-data.ts:12) | 当前 Chat 数据仅用于样式预览。 |

### 1.3 AionsHome

已阅读：

- `docs/aionhome-runtime-model.md`
- `docs/aionhome-refactor-master-plan.md`
- `aion-chat/static/settings.html`
- `aion-chat/routes/settings.py`
- `aion-chat/config.py`
- `aion-chat/ai_providers.py`
- `aion-chat/routes/chat.py`
- `aion-chat/main.py`
- `aion-chat/auth.py`
- Memory、Camera、Location、Schedule、TTS、ASR、Music 等配置消费点。
- Provider 相关 contract tests。

关键证据：

| 文件 | 审计证据 |
|---|---|
| [`aion-chat/static/settings.html`](/Users/remix/Desktop/AionsHome-main/aion-chat/static/settings.html:22) | 旧 Settings 的用户标识、Chat API、Cache、Memory、Voice、Music 和 legacy 配置入口。 |
| [`aion-chat/static/settings.html`](/Users/remix/Desktop/AionsHome-main/aion-chat/static/settings.html:461) | API config list、select、create、update、delete 和 fetch-models 调用。 |
| [`aion-chat/static/settings.html`](/Users/remix/Desktop/AionsHome-main/aion-chat/static/settings.html:518) | 旧页面直接渲染 config URL、model 和完整 key。 |
| [`aion-chat/routes/settings.py`](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:82) | `/api/settings` 返回跨领域设置和 secret。 |
| [`aion-chat/routes/settings.py`](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:524) | API config 管理 endpoints。 |
| [`aion-chat/routes/settings.py`](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:608) | `fetch-models` 远端模型探测。 |
| [`aion-chat/config.py`](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:257) | 静态 `MODELS` 映射和默认模型。 |
| [`aion-chat/config.py`](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:603) | API config 加载、legacy `custom_*` 自动迁移和 active config 选择。 |
| [`aion-chat/ai_providers.py`](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:1080) | conversation model、provider、chat format 和实际 provider 调用分支。 |
| [`aion-chat/routes/chat.py`](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:361) | Chat send、conversation model 和服务端 runtime 配置消费。 |
| [`aion-chat/main.py`](/Users/remix/Desktop/AionsHome-main/aion-chat/main.py:143) | Cookie session 鉴权中间件及 API 401 行为。 |

## 2. Settings 结构摘要

旧 Settings 实际混合了五类能力：

1. Chat 启动配置；
2. Provider 高级管理；
3. Chat runtime 和 prompt 参数；
4. Memory、Voice、Music 等独立 integration；
5. Legacy compatibility。

其中“全局 active model”并不存在。Chat 的模型事实来源是每个 conversation 的 `model`；active API config 是另一套配置状态。

| 设置领域 | 前端入口 | 后端 endpoint | 当前用途 | 是否影响 Chat | 建议 |
|---|---|---|---|---|---|
| API Config 管理 | 旧 `/settings` | `/api/settings/api-configs*` | 管理自定义、Anthropic、Cloudflare 配置及 active config | 直接影响 custom，部分影响 aipro Anthropic 路径 | Chat 必需的仅是安全 readiness；CRUD 属于高级管理 |
| 模型目录与选择 | 旧 `/chat` | `GET /api/models`；conversation API | 静态模型目录；模型保存于 conversation | 直接 | Chat 必需；由 Chat setup 和 Conversation 承接 |
| Chat format | 旧 Settings | `GET/PUT /api/settings/chat-format` | 选择 OpenAI-compatible 或 Anthropic 流程 | 直接影响 aipro/custom | Chat 相关但可延后；服务端继续拥有运行语义 |
| Legacy `custom_*` | 旧 Settings | `GET/PUT /api/settings` | 无 API config 时的兼容回退和自动迁移来源 | 直接影响 custom | Legacy compatibility；从普通 UI 隐藏，不删除 |
| Gemini 配置 | 旧 Settings 标记“废弃” | `GET/PUT /api/settings` | Gemini provider 仍读取，默认模型仍为 Gemini | 直接 | Legacy compatibility；待后端确认退出条件 |
| User Prefix / User ID | 旧 Settings | `/api/settings/user-info`、`user-prefix` | 构造 provider metadata `user_id` | 间接 | Chat 相关但可延后；归 Identity 或高级设置 |
| Persona / Worldbook | 独立 `/worldbook` | `GET/PUT /api/worldbook` | Prompt persona、名称和介绍 | 直接影响 prompt | 独立 Persona 子域；不混入 provider 表单 |
| Temperature / Thinking / Context toggles | 旧 `/chat` | `/api/settings/temperature`、`context_toggle` | 全局生成和 prompt 参数 | 直接 | Chat 相关但可延后；变更前需契约覆盖 |
| Float interval | 旧 `/chat` | `/api/settings/float_interval` | Chat/Diary 派生行为频率 | 间接 | 高级管理 |
| Cache window / TTL / keepalive | 旧 Settings，部分无页面入口 | 多个 `/api/settings/cache-*` | Prompt cache 分区、TTL 和保活 | 直接影响 prompt/cache | 高级管理；不可作为 Chat 启动必填项 |
| MCP chain depth | 旧 Settings | `GET/PUT /api/settings` | 限制 Chat MCP 链式执行深度 | 影响复杂 Chat | 高级管理；MCP 管理仍是独立领域 |
| Memory / Sentinel | 旧 Settings | `GET/PUT /api/settings` | Memory digest、Camera/Location sentinel | 间接影响 Chat/Core | 独立领域；延后 |
| Auxiliary models | 旧 Settings | `GET/PUT /api/settings` | Schedule status、Memory 辅助生成 | 非核心 Chat | 独立领域；延后 |
| Embedding | 旧 Settings | `GET/PUT /api/settings` | Memory embedding 和 RAG | 间接影响 Chat | Memory integration；延后 |
| TTS | 旧 Settings + Chat | `/api/settings`、`/api/tts*` | Provider 配置、voice list、语音生成 | 不影响文本核心闭环 | 独立领域；延后 |
| ASR | 旧 Settings + Voice | `/api/settings`、`/api/voice/*` | 远程语音识别 | 不影响文本核心闭环 | 独立领域；延后 |
| Music cookie | 旧 Settings | `GET/PUT /api/settings` | 音乐搜索和播放登录 | 只影响 command side effect | 独立领域；隐藏到高级设置 |
| Camera | 独立 `/camera` | `/api/cam/*` | 摄像头和监控状态 | Core Wake 间接影响 Chat | 独立领域，不进入 Settings domain |
| Location | 独立 `/location` | `/api/location/*` | 定位、天气、POI、prompt context | 间接 | 独立领域，不进入 Settings domain |
| Schedule | 独立 `/schedule` | `/api/schedules*` | 日程事实和 prompt 注入 | 间接 | 独立领域，不进入 Settings domain |

Penumbra 的设置能力应拆分为：

- device-local appearance；
- backend/session status；
- Chat setup/readiness；
- provider administration；
- Chat runtime advanced；
- Persona/Identity；
- 各独立 integration 的设置入口。

不建立一个覆盖旧 `/api/settings` 全部字段的全局 `Settings` DTO。

## 3. Provider / API Config 分析

### 3.1 当前真实流程

```text
conversation.model
        ↓
config.MODELS[model key]
        ↓
provider + backend model
        ↓
chat_format（仅 aipro/custom 分叉）
        ↓
provider-specific config / active API config / legacy fallback
        ↓
AI request
```

具体分支：

- `siliconflow`：读取 legacy SiliconFlow URL/key。
- `gemini`：读取 legacy Gemini URL/key。
- `aipro + openai`：读取 `aipro_url/aipro_key`。
- `aipro + anthropic`：`call_anthropic` 可能优先采用 active API config，否则回退 AiPro 配置。
- `custom`：优先 active API config；不存在时回退 `custom_*`。

API config 的 auth mode 目前包括：

- `anthropic`
- `cloudflare_rest`
- `cloudflare_anthropic`

因此：

- `/api/models` 是静态模型目录，不是 provider config 列表。
- `selected_api_config_id` 是 active config 选择，不是 Chat 当前模型。
- Provider config 中的 `url`、`key`、`model`、`auth_mode`、`gateway_id` 会进入真实请求。
- `id`、`name`、时间戳主要用于管理展示。
- `enabled` 参与 fallback，但已选中的配置当前不一定因 `enabled=false` 被排除；该语义待后端确认。
- 旧 `custom_*` 会在 API config 为空时自动迁移，不能直接删除。

### 3.2 Penumbra 安全视图

普通 UI 只应接收类似以下摘要：

```text
id
name
endpoint
model
authMode
gatewayId
enabled
isActive
hasSecret
maskedKey
updatedAt
```

完整 key 只应在创建或明确替换时从输入端短暂提交。读取和普通编辑不应获得现有明文 key。

## 4. Endpoint 使用地图

| Endpoint | 用途 | Chat 依赖 | Penumbra 建议 |
|---|---|---:|---|
| `GET /api/models` | 静态模型 key/provider 目录 | 是 | 进入 Chat setup 只读 client |
| `GET /api/settings` | 返回跨领域设置和运行开关 | 后端依赖；前端非必需 | 当前含明文 secret，需要后端调整；禁止作为普通 Settings DTO |
| `PUT /api/settings` | 批量更新 legacy provider 和 integration 配置 | 部分字段影响 Chat | 高级或兼容管理；不迁移成一张总表 |
| `GET/PUT /api/settings/chat-format` | OpenAI/Anthropic 格式 | 是，服务端读取 | 高级设置；不阻塞首个 Chat UI |
| `PUT /api/settings/temperature` | 全局温度 | 是 | 待迁移；先确认请求参数与全局值的权威关系 |
| `PUT /api/settings/context_toggle` | Thinking、heart、simplethink | 是 | 高风险 runtime 设置；延后 |
| `PUT /api/settings/float_interval` | 派生行为频率 | 间接 | 高级管理 |
| `GET/PUT /api/settings/cache-config` | Freeze/slide 窗口 | 是 | 高级管理；写入会清理消息 cache region |
| `PUT /api/settings/cache-toggle` | 缓存开关 | 是 | 高级管理 |
| `PUT /api/settings/anthropic-system-cache-ttl` | Anthropic cache TTL | 是 | 高级管理 |
| `PUT /api/settings/anthropic-schedule-in-system` | 旧客户端兼容，当前固定启用 | 否 | 不迁移；Do not change |
| `GET/PUT /api/settings/keepalive` | Cache keepalive | 间接 | 高级管理；延后 |
| `GET/POST /api/settings/api-configs` | 列表、新建配置 | Custom/部分 aipro | 高级管理；必须先提供无 secret 的 read DTO |
| `PUT /api/settings/api-configs/select` | 选择 active config | 是 | Settings domain mutation；需 readiness 对账 |
| `GET /api/settings/api-configs/active` | 返回 active config | 是 | 当前返回完整 key，需要后端调整 |
| `PUT/DELETE /api/settings/api-configs/{id}` | 编辑、删除配置 | 是 | 高级管理；secret 替换语义需契约测试 |
| `POST /api/settings/fetch-models` | 用 URL/key 请求远端模型 | 配置阶段使用 | 高级管理；不是正式 test-connection endpoint |
| `GET /api/settings/user-info` | User ID/prefix | 后端自动使用 | Identity domain；延后 |
| `PUT /api/settings/user-prefix` | 修改 metadata prefix | 间接 | Identity domain mutation |
| `GET/PUT /api/worldbook` | Persona/name/prompt 配置 | 后端自动使用 | Persona domain，不放入 Provider client |
| `GET /api/chat_status` | 文件型 Chat 状态 | 否 | 不是 session status，不作为连接探针 |
| `POST /api/tts`、`GET /api/tts/*` | 语音生成、音频和 voice list | 文本 Chat 否 | TTS domain，不进入 Settings client |
| `POST /api/auth/login`、`POST /api/auth/logout` | Cookie session | 是 | Account/session domain；当前缺少专用 session status endpoint |

没有发现通用 Provider “test connection” endpoint。`fetch-models` 只能算一次带 key 的远端模型探测，且 Cloudflare 配置在旧 UI 中不会调用它。

## 5. Chat 最小依赖配置

| 能力 | 当前事实来源 | Chat 首批是否需要 |
|---|---|---:|
| 登录/session 状态 | `aion_session` cookie；受保护 API 返回 401 | 是 |
| Backend reachability | 任一安全、轻量受保护 endpoint | 是 |
| 模型目录 | `GET /api/models` | 是 |
| 当前 conversation model | Conversation DTO | 是 |
| 创建/切换 conversation model | Conversation API | 是 |
| Provider readiness | 当前没有安全摘要 endpoint | 发送前需要 |
| 完整 Provider CRUD | Settings API configs | 否，可延后 |
| Chat format | 服务端 Settings | 服务端需要；Chat UI 首批不必编辑 |
| Temperature/thinking/cache | 服务端 Settings | 首批可使用服务端现有值 |
| User prefix | 服务端自动加入 metadata | 前端不必读取 |
| Worldbook/persona | 服务端构造 prompt | 前端不必为发送而读取 |
| Memory/location/schedule | 服务端召回和注入 | 前端不应通过 Settings 复制 |
| TTS/ASR/MCP admin | 独立领域 | 文本核心闭环不需要 |

推荐最小 read model：

```text
sessionState
backendReachability
availableModels
conversationModel
providerReadiness
setupActionRequired
```

`providerReadiness` 应由后端根据实际 provider 分支计算或提供安全投影，前端不应复制 provider fallback 规则。

Settings 不应提供：

- conversation/message 状态；
- streaming/SSE 状态；
- WebSocket 业务事件；
- attachment/upload 状态；
- optimistic message 状态；
- Chat command 或 prompt 编排。

完整 Settings 页面不是 Chat 的前置条件。安全 read layer 和最小 setup 能力完成后即可继续 Chat domain client。

## 6. Secret 和安全风险

| 风险 | 当前事实 | 建议 |
|---|---|---|
| `/api/settings` 返回明文 secret | 同时返回 raw key 和 masked 字段；`aux_key` 没有对应 masked 字段 | 新增安全 read DTO；普通 UI 不调用 raw endpoint |
| 短 secret 掩码失效 | 当前 mask 对长度小于 8 的值原样返回 | 后端统一只返回 `hasSecret` 或不可逆掩码 |
| API config 列表泄密 | List、active、create、update response 均可包含完整 `key` | Read/write DTO 分离 |
| 旧页面直接显示 key | 配置详情渲染 `cfg.key`，编辑时回填完整值 | 新 UI 使用“保留现有 / 替换 secret”语义 |
| Penumbra 状态探针过宽 | `src/lib/backend.ts` 用 `/api/settings` 检测连接，实际下载全部设置 | 改用专用 session/status endpoint，或至少使用安全轻量 endpoint |
| `fetch-models` 服务端代请求 | 接受用户 URL/key，尝试 `/v1/models` 和 `/models` | 做 URL/egress 校验、超时、错误归一化和安全审查 |
| 远端响应日志 | 会记录远端响应头和前 500 字符 | 日志脱敏，不记录潜在敏感响应 |
| UI 错误详情 | Penumbra 当前直接展示 `status.message` | 用户信息和开发详情分层 |

仅在 Penumbra mapper 中删除 secret 字段不够安全：数据已经进入浏览器、网络面板和 transport error data。必须优先调整后端投影契约。

## 7. Penumbra 当前承接能力

### 7.1 当前已支持

- 统一 runtime URL resolution。
- Cookie HTTP transport。
- Timeout、AbortController 和 `ApiError`。
- Backend reachability/login heuristic。
- API base URL 展示。
- 主题模式、主题色、AI 色和本地壁纸。

### 7.2 当前仍是 demo

- “模型设置 / Chat 设置 / 日历设置”只是 placeholder。
- Chat conversation/message 仍来自 mock。
- 新建 conversation 使用硬编码模型字符串，尚未接入 `/api/models`。
- 后端状态检测虽调用真实 endpoint，但当前探针并非安全的 Settings domain contract。

### 7.3 可以保留

- Settings 的桌面入口和页面外壳。
- 本地 Appearance 能力及其本地存储。
- 通用 transport。
- 状态面板和基础 section 组件。
- 连接状态展示概念，但需要更换探针和错误 mapper。

### 7.4 需要拆分

- Appearance：继续作为 device-local preferences。
- Backend/session status：平台级状态，不与 provider DTO 混合。
- Chat setup/readiness：只读、低风险。
- Provider administration：高级、包含 secret mutation。
- Chat runtime advanced：format、cache、thinking 等。
- Persona、Memory、Voice 等独立领域入口。

### 7.5 是否需要新的 Settings domain 层

需要，但应由多个小 client、DTO 和 mapper 边界组成，不是一个覆盖旧 `/api/settings` 全部字段的大 client。React 组件只依赖安全 view model。

Settings 保持特殊系统入口、不强制注册成普通 Desktop App 是合理的；不需要为了领域层重排整个 app registry。

## 8. 显示方式优化

| 分类 | 建议 |
|---|---|
| 保留 | Appearance、本地壁纸、连接概览、明确的 active config 状态 |
| 重做 | Provider readiness、API config 编辑、secret 替换流程、用户友好错误、加载和空状态 |
| 隐藏 | Legacy `custom_*`、Gemini compatibility、cache internals、MCP depth、原始 endpoint/key、内部 user ID |
| 删除 | 本阶段无可安全删除项；不迁移无消费者证明不足的旧控件不等于删除后端配置 |
| 后续 | Persona、Memory/Sentinel、Embedding、TTS、ASR、Music 以及其他 integration |

旧页面需要避免的模式：

- 把所有领域放在一次性长表单中；
- 页面初始化即获取全部 secret；
- Provider 和 prompt/cache runtime 混合保存；
- 用“active provider”掩盖 conversation model 与 provider routing 的差异；
- 把后端异常原文直接显示给普通用户。

## 9. 推荐 PR 顺序

| PR | 做什么 | 不做什么 | 依赖 | 主要风险 |
|---|---|---|---|---|
| S1：Safe Settings Read Contract | AionsHome 新增安全 session/readiness/provider summary DTO 与契约测试 | 不改变 provider 路由，不删除旧 endpoint | 后端确认 readiness 规则 | 新旧客户端兼容、遗漏 secret |
| S2：Penumbra Settings Domain Read Layer | 添加模型、session、readiness DTO/client/mapper | 不做 Provider CRUD，不迁移完整 UI | S1；现有 transport | 把 raw DTO 扩散到组件 |
| S3：Chat Setup 接入 | Chat 使用真实模型目录和 conversation model；展示 setup-required 状态 | 不实现完整 send，不管理 secret | S2、Conversation client | 模型 key 和 backend provider mapping |
| S4：Provider Admin Contract | 安全 list/create/update/select；secret replace 语义 | 不删除 legacy fallback | S1、后端 mutation 契约 | 误清空 key、active config 对账 |
| S5：SettingsView 结构接入 | 保留 Appearance，接入 status/readiness/provider view model | 不复制旧 Settings 长页面 | S2、S4 | 页面重新耦合多个领域 |
| S6：Advanced Runtime | Format、cache、thinking 等逐项迁移 | 不在一个 PR 中迁完 | 相应契约测试 | 改变 prompt/cache/runtime 行为 |
| S7+：Integration Settings | Memory、TTS、ASR、Music 等按领域迁移 | 不并入 Chat core PR | 各领域审计 | 跨领域 secret 与副作用 |

Chat domain client 可在 S2/S3 后继续，不需要等待 Provider administration、完整 Settings UI 或 integrations 完成。

## 10. 待确认问题

以下事项均保持待确认，不作为既定事实：

1. 是否新增专用的 `session/status` endpoint，替代 Penumbra 对 `/api/settings` 的探测？
2. Provider readiness 应按 conversation model 判断，还是仅报告全局 active API config？
3. `aipro + anthropic` 使用 active API config 覆盖 AiPro 配置是否是长期契约？
4. 已选但 `enabled=false` 的 API config 是否仍应生效？
5. API config 的安全更新是否采用“key 缺省即保留、显式 replace 才更新”？
6. Gemini 已被旧页面标记废弃，但仍在模型目录且是默认模型；正式退出条件是什么？
7. `custom_*` 自动迁移后，旧字段的保留期限和旧客户端依赖是什么？
8. 全局 temperature 与 send request 中 temperature 的权威关系是什么？
9. `fetch-models` 是否需要演进为受限的 provider-specific test/list-models contract？
10. Worldbook、User Prefix 和 provider metadata 应由哪些独立 domain 拥有？
11. Production 是同源反代还是跨域部署；cookie、SameSite、CORS 和 WebSocket 鉴权如何约定？
12. 是否允许普通前端获知 provider endpoint，还是只返回 provider label/readiness？

## 11. 本轮是否修改文件

否。

这里的“本轮”指 2026-07-31 的 Settings Domain Audit 只读扫描轮次：

- Penumbra 当时 `git diff --check` 通过，工作树无变化。
- AionsHome 当时 `git diff --check` 通过，工作树无变化。
- 未修改代码、文档或配置。
- 未安装依赖，未暂存、未提交。

本文件是在后续文档归档任务中创建的历史审计记录，不改变上述只读审计结论。
