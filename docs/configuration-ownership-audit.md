# C1 Configuration Ownership & Flow Audit

> 审计日期：2026-08-06
>
> Penumbra：`main` @ `aa1f0dc8ef6a0d0aa5917ab91a7e5dc9247acf5b`
>
> AionsHome：`refactor-code-main` @ `d0c0bdb0c265e145cf4bd01e52e63a78ab6b86e0`

> 现行状态指引（2026-10-26）：本文保留审计当日判断。Main selection/Registry安全投影、C2A2请求参数及Composer现状已由后续契约取代；请查[统一清单](./settings-inventory.md)、[PR6.5审计](./chat-pr6-5-config-audit.md)与[实施记录](./chat-pr6-5-config-implementation.md)。本文中的Chat mock、旧model权威、raw secret、send忽略温度/effort写全局等历史描述不能作为当前实现依据。

本文是跨仓库静态审计，不是新契约的实现说明。审计期间未读取数据目录中的实际配置值，未调用 provider、MCP 或设置写接口，也未发送消息。文中的字段名、默认来源和代码路径来自源码；不会记录任何实际 credential、完整 provider endpoint、Cookie、Token 或密码。

事实等级：

- **Confirmed**：可由当前源码直接证明。
- **Inferred**：由多个调用点共同支持，但没有单一明确契约或端到端测试。
- **Unknown**：当前源码不足以确定；必须由后端确认或新增 characterization test。

## 1. Executive Summary

**Confirmed**

- 当前不存在一个可以被统称为 “Settings” 的配置领域。部署参数、模型注册、provider credential、conversation model、单次生成参数、能力配置和 UI 偏好分别由 env、Python 常量、JSON、SQLite、请求 DTO、浏览器存储和运行时内存持有。
- Penumbra Settings 当前只拥有 device-local 外观偏好，并组合安全的只读 Session、models 和 Chat readiness DTO；它不拥有 provider、generation 或 capability 的事实。
- AionsHome 的模型目录来自 `aion-chat/config.py::MODELS`；conversation 表持久化 `model`；send/regenerate 不接受 model override，最终按 conversation model 进入 provider resolver。
- Generation 没有统一优先级：`context_limit`、`fast_mode`、`whisper_mode` 是请求级；send 的 `temperature` 字段被接收但未消费；regenerate 的 `temperature` 直接进入 provider；请求中的 `thinking_effort` 会写入全局 `settings.json`；conversation 不持久化这些 generation 字段。
- MCP 的 server 定义、连接参数、credential、enablement、连接状态和上次连接时间共存在一个 JSON DTO；工具列表另有只按 Quick Notes hash 定位的缓存。没有用户级、conversation 级或 tool 级 enablement。
- 旧 `/api/settings`、Provider Admin、MCP config 和 Location config 会把原始 secret 字段返回浏览器；前端 mapper 丢弃字段不能弥补响应已经泄露。

**Inferred**

- Anthropic prompt builder 从 worldbook 读取 `whisper_mode`，而 send/regenerate 的请求值只传给 legacy prompt builder；因此 whisper/Toy 能力的实际效果依 provider format 分叉。
- MCP tools cache 不包含 server/config/tool 版本和 TTL；配置变化后可能继续以旧工具描述构建 prompt。

**Unknown**

- 产品期望的 generation 优先级究竟是 user default、conversation default 还是纯 request override；源码没有这三个层级的完整模型。
- `temperature` 和 `thinking_effort` 的 send/regenerate 差异是有意兼容还是缺陷。
- provider/model 的删除、重命名、capability 变化是否应阻止持久化、允许历史会话继续显示，或提供显式迁移。

结论：

> Settings 页面是配置入口和展示层，不应成为配置事实来源。

S6C 之前只应接入已经定义清楚的最小文本发送参数。不得把旧 UI 的 localStorage 值或 mock state 当作全局/会话默认值传给新发送链路。

## 2. Current Configuration Taxonomy

| 领域 | 当前载体 | 当前 owner | 目标 owner |
|---|---|---|---|
| Runtime / Deployment | Penumbra env、Vite config；AionsHome env、Python 常量、repo-relative paths | deployment + 两端启动层 | deployment config / service bootstrap |
| Provider / Model Registry | `MODELS`、`DEFAULT_MODEL`、`settings.json`、`api_configs` | AionsHome config/provider resolver | AionsHome model/provider domain |
| Conversation Configuration | SQLite `conversations`；worldbook JSON 是全局 persona，不是 conversation config | AionsHome conversation + prompt domain | Conversation persistence；persona 独立 domain |
| Generation Configuration | send/regenerate DTO、`settings.json`、adapter 常量、message cache metadata | AionsHome Chat/provider/cache | 明确分开的 model default、conversation config、request override、runtime-derived |
| Capability Configuration | SQLite、多个 JSON、`settings.json`、运行时内存、旧浏览器 localStorage | 各 capability 模块，部分混入 Settings | 各 capability 后端 domain |
| UI Preferences | Penumbra localStorage/IndexedDB/React state；旧 AionsHome Web localStorage | 浏览器 | Penumbra preference domain |
| Secrets | AionsHome env、auth JSON、`settings.json`、MCP/Location JSON | 后端与 deployment | 后端 secret storage / deployment；浏览器只见安全状态 DTO |

## 3. Source-of-Truth Matrix

表中“读/写”只列关键边界，不是简单文件清单；“责任·优先级”同时给出迁移责任与 `blocker / before-send / later`。

### 3.1 Runtime / Deployment

| 配置名称 | 当前字段名 | 领域 | 当前事实来源 | 当前读取点 | 当前写入点 | 默认值来源 | 作用范围 | 运行时消费者 | 敏感 | 当前问题 | 建议事实来源 | 责任·优先级 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Browser API base | `VITE_API_BASE_URL`, legacy `VITE_API_BASE` | Runtime | Penumbra build env | `src/lib/runtime-config.ts` | deployment | 同源空 base | deployment/build | HTTP client、upload/WS resolution | 否 | 两个 alias；build-time 暴露 | deployment env，经单一 runtime loader | deployment · before-send |
| Browser WebSocket base | `VITE_WEBSOCKET_URL`, legacy `VITE_WS_URL` | Runtime | Penumbra build env | `src/lib/runtime-config.ts` | deployment | `/ws` 相对 API/browser origin | deployment/build | realtime transport | 否 | alias 与派生规则并存 | deployment env，经 runtime loader | deployment · before-send |
| Browser upload path | `VITE_UPLOAD_URL` | Runtime | Penumbra build env | `src/lib/runtime-config.ts` | deployment | runtime loader 中的相对 upload path | deployment/build | upload client | 否 | 与后端 mount 兼容需保持 | deployment env | deployment · later |
| Browser API timeout | `VITE_API_TIMEOUT_MS` | Runtime | Penumbra build env | `src/lib/runtime-config.ts` | deployment | runtime loader 的固定毫秒 fallback | deployment/build | shared HTTP transport | 否 | 允许零；无按 endpoint 策略 | deployment env | deployment · before-send |
| Local dev proxy target | `PENUMBRA_DEV_PROXY_TARGET` | Runtime | Vite process env | `vite.config.ts`, `src/config/dev-proxy-config.ts` | developer/deployment | 无；未配置即不代理 | local development | `/api`, `/uploads`, `/ws` proxy | 是（主机信息） | 只在 serve 模式读取；正确地不进入浏览器 bundle | local deployment env | deployment · later |
| Penumbra dev port | Vite `server.port` | Runtime | `vite.config.ts` 常量 | Vite | 源码 | Vite config | local development | dev server | 否 | 不可由 env 覆盖 | deployment/dev tooling | deployment · later |
| AionsHome bind/port/reload | uvicorn arguments、`--reload` | Runtime | `aion-chat/main.py` 常量 + CLI flag | `main.py`, `start.sh` | deployment command / 源码 | `main.py` | deployment | ASGI server | 否 | host/port 无统一 env loader；reload 只看 CLI | service bootstrap/deployment | deployment · later |
| Backend data/upload/db paths | `DATA_DIR`, `DB_PATH`, `UPLOADS_DIR` 等 | Runtime | `aion-chat/config.py` repo-relative constants | config、database、file/capability modules | 进程导入时建目录；各 domain 写文件 | `config.py` | deployment | SQLite、uploads、cache、logs | 路径可能敏感 | import 有文件系统副作用；不可部署覆盖 | deployment storage config | deployment · later |
| Command parser rollout flags | `AION_COMMAND_PARSER_*` | Runtime | process env | `command_parser_shadow.py`, `command_parser_canary.py` | deployment | 模块常量与 env example | deployment | parser diagnostics/canary | 否 | 独立于通用 config loader | deployment feature flags | deployment · later |
| Auth bootstrap | `AION_AUTH_USERNAME`, `AION_AUTH_PASSWORD`, `ANDROID_PUSH_TOKEN` | Secret/Runtime | process env，首次写 auth JSON | `auth.py` | deployment；auth CLI 可轮换 | username fallback、生成 credential/token | deployment/global | HTTP/WS auth、push auth | 是 | 首次生成 credential 会写文件并输出一次；push token 有 env/file 双来源 | deployment secret + 后端 auth store | deployment/AionHome · later |

### 3.2 Provider / Model / Conversation

| 配置名称 | 当前字段名 | 领域 | 当前事实来源 | 当前读取点 | 当前写入点 | 默认值来源 | 作用范围 | 运行时消费者 | 敏感 | 当前问题 | 建议事实来源 | 责任·优先级 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Model registry key | `MODELS` dict key | Provider | `aion-chat/config.py` | `/api/models`, readiness, resolver | 源码 | 无动态 default | global/release | model list、resolver | 否 | 一个 key 在字典中重复，后定义静默覆盖前定义；无状态/label/capability | AionsHome model registry | AionHome · blocker |
| Model → provider/backend model | `provider`, `model` | Provider | `MODELS` entry | `provider_resolution.py`, provider wrappers | 源码 | registry entry | global/release | resolver、adapter payload | endpoint/model id 可能敏感 | registry、credential、protocol 分离不清；capability 不在 registry | AionsHome provider/model domain | AionHome · blocker |
| Available models projection | `key`, `provider` | Provider | `MODELS` 运行时迭代 | `GET /api/models`; Penumbra Runtime Domain | 无 API 写点 | registry | global | Settings/Chat setup UI | 否 | 不含 label、readiness、capability、enabled/default params；不是远端发现结果 | safe model catalog DTO | AionHome · before-send |
| Default model key | `DEFAULT_MODEL` | Provider | `config.py` 常量 | conversation create、readiness 无 query、缺失 conversation fallback | 源码 | 常量 | global/release | bootstrap、conversation、send fallback | 否 | 同一值又硬编码在 DB schema；版本漂移风险 | model registry 的显式 default 标记 | AionHome · blocker |
| Provider legacy config | `*_key`, `*_url`, `custom_model` 等 | Provider/Secret | `settings.json` | config getters、resolver、TTS/ASR/memory | `PUT /api/settings` 等旧接口 | `load_settings()` + endpoint/model constants；首次可导入 legacy plaintext file | global | resolver、provider/capability clients | 是 | credential、endpoint、普通设置混在同一 JSON/DTO | provider secret store + provider config | AionHome · later |
| Named provider configs | `api_configs[]` (`id/name/url/key/model/auth_mode/gateway_id/enabled`) | Provider/Secret | `settings.json` | config helpers、resolver、Provider Admin routes | legacy Provider Admin CRUD | legacy custom config 可自动迁移；字段 normalization | global | aipro/custom resolution | 是 | load 可触发迁移写入；raw credential/endpoint 被响应；selected 与 enabled 语义交叉 | Provider aggregate + separate secret | AionHome · later |
| Selected provider config | `selected_api_config_id` | Provider | `settings.json` | `select_active_api_config()` | Provider Admin select/delete/migration | first enabled fallback | global | provider resolver | 否 | active config 不等于 conversation model；selected disabled config 仍可被采用；fallback 规则隐含 | Provider aggregate | AionHome · later |
| Provider protocol/auth | `chat_format`, per-config `auth_mode`, `gateway_id` | Provider | `settings.json` | resolver、adapters | Settings/Provider Admin | global format fallback + normalization | global/provider-config | provider payload/headers | 间接敏感 | global legacy format与 per-config mode 并存 | Provider aggregate | AionHome · before-send |
| Provider generation defaults | hardcoded `max_tokens`; model/protocol branches | Generation/Provider | adapter 源码 | `ai_providers.py`, Anthropic adapter | 源码 | adapter constants | provider request | provider payload | 否 | 不在 model registry；所有模型能力/限制不透明 | model/provider registry defaults | AionHome · before-send |
| Conversation title | `conversations.title` | Conversation | SQLite | conversation list/export/UI | create/update routes | create DTO/runtime title | conversation | UI/export | 否 | 与 generation 无关，边界清楚 | Conversation persistence | AionHome · later |
| Conversation model | `conversations.model` / Penumbra `modelKey` | Conversation | SQLite | conversation list、send/regenerate、Penumbra Chat header/setup | create/update routes | create DTO uses backend default；DB 另有硬编码 default | conversation | readiness query、resolver、UI | 否 | 接受任意 string，无 registry validation；null update 被忽略 | Conversation persistence，引用 model registry key | AionHome · blocker |
| Conversation generation config | 当前不存在 | Conversation/Generation | 无 | 无 | 无 | 无 | conversation | 无 | 否 | UI 容易把全局值误称会话值 | 若产品需要则新增 Conversation config persistence | AionHome · blocker（先决定是否存在） |
| Persona / identity | `ai_persona`, `user_persona`, `ai_about`, `ai_name`, `user_name` | Conversation/Capability | `worldbook.json`（实际 global） | prompt builders、多个 proactive paths | `PUT /api/worldbook` | `load_worldbook()` | global | prompt | 可能含私密内容 | 名称似 worldbook，实际跨 conversation global；更新是整对象覆盖 | Persona/Identity domain | AionHome · later |
| Worldbook附加 flags | `diary_auto_feed`, `camera_running`, `whisper_mode`, legacy `system_prompt` | Capability | 同一个 `worldbook.json` | diary、Anthropic prompt builder等 | 各 domain；worldbook PUT 会丢弃未列字段 | 模块 fallback | global/runtime-like | prompt、diary | 可能 | 多 owner 共写；普通 worldbook 更新会覆盖其他 domain 字段 | 各 capability domain | AionHome · before-send（whisper）/ later |

### 3.3 Generation Configuration

| 配置名称 | 当前字段名 | 领域 | 当前事实来源 | 当前读取点 | 当前写入点 | 默认值来源 | 作用范围 | 运行时消费者 | 敏感 | 当前问题 | 建议事实来源 | 责任·优先级 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Context window（send） | `context_limit` | Generation | send request | `routes/chat.py` history query、Anthropic cache builder | 无持久化 | send DTO `30` | request | history selection、prompt/cache segmentation | 否 | 无范围校验；`0` 被接受并选择零条历史 | execution request，带明确约束 | AionHome/Penumbra · blocker |
| Context window（regenerate） | query `context_limit` | Generation | regenerate query | regenerate history/prompt | 无持久化 | route `30` | request | history selection、prompt/cache segmentation | 否 | 与 send 同语义但不同 transport；Penumbra 保留显式 `0` | execution request，复用同一 contract | AionHome/Penumbra · blocker |
| Temperature（global） | `SETTINGS.temperature` | Generation | `settings.json` | send 在执行时读取；旧 UI 写接口 | `PUT /api/settings/temperature` | 未在 initial settings 中建立，缺失为 `None` | global | send provider payload | 否 | 旧 UI local default 与服务端缺失值不一致 | 若保留，命名为 user/global generation default | AionHome · blocker |
| Temperature（send override） | body `temperature` | Generation | send JSON DTO | DTO 接收；执行未读取 | 无 | `null` | request（名义） | 当前无消费者 | 否 | **字段被静默忽略**；`null/0` 均不能覆盖 global | 在 contract 中删除或真正作为 request override | AionHome · blocker |
| Temperature（regenerate override） | query `temperature` | Generation | regenerate query | regenerate → provider | 无 | `None` | request | provider payload | 否 | 与 send 不同；`0` 有效，`None` 表示 adapter 不发送 | execution request | AionHome · blocker |
| Thinking effort（global） | `thinking_effort` | Generation | `settings.json` | getter、Anthropic adapter | Settings/context toggle；send/regenerate side effect | `medium` normalization | global | Anthropic output config | 否 | request 与 global 写操作混在一起 | 明确的 user/global default 或 provider default | AionHome · blocker |
| Thinking effort（send） | body `thinking_effort` | Generation | send request | 非 `None` 时 setter；随后读取 global | **send 会写 `settings.json`** | `null` → 读取 global；非法/空 string → global fallback | 实际 global，不是纯 request | Anthropic adapter | 否 | 单次发送产生跨会话持久副作用 | request override 不写全局；或从 DTO 移除 | AionHome · blocker |
| Thinking effort（regenerate） | query `thinking_effort` | Generation | regenerate query | 与 send 相同的全局 setter/getter | **regenerate 会写 `settings.json`** | 同上 | 实际 global | Anthropic adapter | 否 | GET-like query 语义却持久修改 global | 同 send contract | AionHome · blocker |
| Fast mode（send） | `fast_mode` | Generation | send request | send memory/RAG branch | 无 | `false` | request | `true` 跳过即时摘要/记忆召回 | 否 | 不持久化；模型能力未声明 | execution request + documented capability | AionHome/Penumbra · before-send |
| Fast mode（regenerate） | query `fast_mode` | Generation | regenerate query | regenerate memory/RAG branch | 无 | `false` | request | 同上 | 否 | transport 不同但语义相同 | execution request | AionHome/Penumbra · before-send |
| Whisper mode（send） | `whisper_mode` | Generation/Capability | send request | legacy prompt builder | 无 | `false` | request | Toy command exposure | 否 | Anthropic builder读取 worldbook 而非请求值，格式间行为分叉 | execution capability override | AionHome · blocker |
| Whisper mode（regenerate） | query `whisper_mode` | Generation/Capability | regenerate query | legacy prompt builder | 无 | `false` | request | Toy command exposure | 否 | 同 send；未进入 conversation | execution capability override | AionHome · blocker |
| Carryover preference（legacy UI） | `aion_carryover_count`、`aion_carryover_<conversation>` | UI/Generation | 旧浏览器 localStorage | `static/chat.html` | 旧 UI | count `0` | browser/user/device | 组装首次 send body | 可能含消息内容 | 值是旧 UI 本地状态，不是后端 default；每会话 payload 未在发送后清除 | Penumbra 暂不迁移；未来明确 user preference | Penumbra · later |
| Carryover execution/persistence | `carryover_messages`, `messages.is_carryover` | Generation/Conversation | send request → SQLite messages | send insert、history/prompt filters | send | 空数组 | request 后转为 conversation data | prompt/history/message count | 可能含消息内容 | 输入结构弱类型；按 content 去重；不是纯临时 override | 独立 carryover command/contract | AionHome · before-send |
| Cache enabled | `cache_enabled` | Generation | `settings.json` | prompt/cache builders | Settings cache toggle | `true` | global | Anthropic system/history cache | 否 | 与 provider能力分支耦合 | cache policy domain | AionHome · later |
| Cache window sizes | `cache_freeze_size`, `cache_slide_max`; message `cache_region` | Generation | global JSON + SQLite/runtime-derived region | cache window builder、message queries | Settings cache config；send marks slide；重配会清 region | fixed global fallbacks | global + message-derived | prompt cache partition | 否 | policy 和每条消息运行结果混存；重配有全局数据副作用 | cache policy + derived execution metadata | AionHome · later |
| System cache TTL | `anthropic_system_cache_ttl` | Generation/Provider | `settings.json` | Anthropic prompt builder | Settings endpoint | validated fallback | global | provider cache control | 否 | provider-specific value在巨型 Settings | provider/cache policy | AionHome · later |
| Frozen message TTL | hardcoded cache TTL | Generation/Provider | cache builder source | cache window builder | 源码 | hardcoded | global/release | provider cache control | 否 | 与可配 system TTL 分离且不可见 | provider/cache policy | AionHome · later |
| Cache keepalive | `cache_keepalive_enabled`, `cache_keepalive_threshold_min` | Generation/Capability | `settings.json` | keepalive scheduler | Settings keepalive endpoint | fixed fallbacks | global | proactive/cache keepalive | 否 | generation policy与后台调度混在 Settings | cache keepalive domain | AionHome · later |
| Schedule-in-system | `anthropic_schedule_in_system` | Generation/Capability | legacy field + getter fixed `true` | prompt builder | compatibility endpoint强制写 true | hardcoded true | global | Anthropic prompt | 否 | API 看似可配，运行时实际不可关闭 | prompt contract constant或删除旧写入口 | AionHome · later |

### 3.4 Capability, UI and Secret Configuration

| 配置名称 | 当前字段名 | 领域 | 当前事实来源 | 当前读取点 | 当前写入点 | 默认值来源 | 作用范围 | 运行时消费者 | 敏感 | 当前问题 | 建议事实来源 | 责任·优先级 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MCP server/connection | global `enabled`; server `name/url/token/enabled` | Capability/Secret | `mcp_config.json` | MCP manager、routes、Chat | MCP CRUD/enable routes | config loader | global/server | connect/discover/call | 是 | server definition、connection、secret、enablement 同对象；仅实现 remote SSE，未实现 command transport | MCP Server aggregate + secret store | AionHome · later |
| MCP runtime health | `status`, `last_connected`, in-memory `connections` | Capability | config JSON + process memory | MCP routes/manager | connect/list/call 会回写 config | offline-like fallback | runtime/server | UI、reconnect | 否 | 运行状态写进配置；disabled 与 failed 需要两个维度 | MCP runtime status store/DTO | AionHome · later |
| MCP tool discovery/cache | discovered tools；`mcp_tools_cache.json` | Capability | remote discovery + cache file | Chat send/regenerate、manager | discovery/cache save | 无工具 / stale fallback | global/runtime | Anthropic prompt descriptions | 工具描述可能敏感 | cache key 只含 Quick Notes hash；无 server/config version、TTL 或 tool enablement | MCP tool registry/cache | AionHome · later |
| MCP execution permission/depth | global/server enabled；`mcp_max_chain_depth` | Capability/Generation | MCP JSON + `settings.json` | prompt/command loop | Settings + MCP routes | global false、server bool、depth fallback/clamp | global/request runtime | model command parser、tool calls | 否 | 无 model/conversation/tool级权限；direct call path不复核 enable flags | MCP policy，支持 conversation override 时单独持久化 | AionHome · later |
| Memory configuration | `include_*`, `float_interval`, embedding/sentinel/aux fields及算法常量 | Capability/Secret | `settings.json` + source constants + SQLite memory data | Chat RAG、memory/activity routes | Settings/Memory routes | 多模块 fallback | global | prompt recall、digest、embedding | credential/记忆内容敏感 | provider config、召回开关、算法参数和数据混在多处；fast mode又覆盖执行 | Memory domain + provider reference | AionHome · later |
| Camera configuration | camera index、monitor interval、retention、quiet hours、`monitor_enabled` | Capability | `cam_config.json` | camera manager、status/prompt | camera config + monitor start/stop | `DEFAULT_CAM_CFG` | global/device | capture、proactive prompt | 设备/图像敏感 | status DTO混合 config/runtime；启动开关由运行操作持久化 | Camera domain | AionHome · later |
| Camera crop | `zoom/cx/cy` | Capability | process memory | camera frame path | crop endpoint | Camera instance constants | runtime/device | image crop | 否 | 重启丢失；与持久 Camera config 分裂 | Camera runtime preference或明确不持久 | AionHome · later |
| Location config/status | map credential、home/threshold/heartbeat/POI/quiet/enabled；当前位置状态 | Capability/Secret | location config JSON + status JSON | Location routes、prompt、proactive | Location routes/runtime | location module defaults | global/device | geofence、prompt、push | 是 | config response返回 raw credential并混入 active runtime；status含位置隐私 | Location domain + secret store + runtime status | AionHome · later |
| Activity | `activity_tracking_enabled` + JSONL events | Capability | `settings.json` + activity logs | activity collector/proactive | activity config route | fallback true | global/device | proactive/context | 行为数据敏感 | enablement在 Settings，数据在日志，runtime另有状态 | Activity domain | AionHome · later |
| TTS | provider、credential、endpoint、model/output；voice selection | Capability/Secret/UI | `settings.json`；旧 UI localStorage；SQLite voice metadata | TTS provider、chat UI/message voice | Settings、voice endpoints、旧 UI | config constants + browser defaults | global + device/user + message | synthesis/playback | 是 | provider secret与普通偏好混合；旧 UI 选择不等于后端配置 | TTS domain + secret store；Penumbra device preference | AionHome/Penumbra · later |
| ASR / voice wake | ASR provider fields；wake enabled/word/source/call state | Capability/Secret/UI | `settings.json` + process memory + 旧 UI localStorage | ASR、voice routes、旧 UI | Settings/voice routes/旧 UI | module/browser constants | global + runtime/device | recognition/wake | 是 | wake 状态不持久；credential经旧 Settings暴露 | ASR domain + secret store；voice runtime status | AionHome/Penumbra · later |
| Music / Toy | music credential；Toy presets、BLE state、whisper gate | Capability/Secret/UI | `settings.json` + old localStorage + browser runtime | music/Toy command paths | Settings/旧 UI | source/browser defaults | global + device/request | music API、BLE command | 是（music credential） | server credential、device preset和request capability混淆 | Music backend domain；Toy Penumbra device domain + execution gate | AionHome/Penumbra · later |
| Schedule / Quick Notes | SQLite schedules；trigger hours/labels；scheduler intervals | Capability | SQLite + `settings.json` + hardcoded fallbacks | schedule/quick-note/activity/prompt | schedule/quick-note routes | defaults在多个模块重复 | global | scheduler、prompt、proactive | 内容敏感 | 同一默认在多模块；data/config/runtime混合 | Schedule与Quick Notes各自 domain | AionHome · later |
| HEART / SIMPLETHINK | `include_heart`, `include_simplethink`; persisted hidden content | Capability | `settings.json` + SQLite/messages | prompt history、command parser | Settings toggle；Chat execution writes data | fallback true | global + message | prompt、hidden journals | 内容敏感 | prompt inclusion开关不等于 capability permission；多条命令分散判断 | Prompt policy + Heart domain | AionHome · later |
| Diary auto-feed | `diary_auto_feed` + diary DB config/status | Capability | worldbook JSON + SQLite | diary manager/routes | diary route + worldbook PUT conflict | false-like fallback | global | diary generation/prompt feed | 内容敏感 | 同一能力跨 worldbook/DB；整对象写可能丢 flag | Diary domain | AionHome · later |
| Proactive messaging | camera/location/activity/schedule config + latest conversation/model | Capability | 各 domain store + SQLite + runtime | background workers | 各 capability routes | 多处硬编码 interval/fallback | global/latest conversation | provider send、push/WS | 是 | 组合多个 owner；没有统一可观测 contract | Orchestrator只引用各 domain安全配置 | AionHome · later |
| Penumbra theme/colors | `penumbra-theme-mode`, `penumbra-theme-color`, `penumbra-ai-color` | UI | localStorage | `src/lib/theme.ts` | Settings/UI helpers | module constants/presets | device/browser | CSS/theme UI | 否 | 正确地不属于后端 Settings | Penumbra preference domain | Penumbra · later |
| Penumbra wallpaper | `penumbra-wallpaper-settings`; custom blob | UI | localStorage + IndexedDB `penumbra-preferences` | `src/lib/wallpaper.ts` | Settings/UI helpers | module defaults | device/browser | desktop UI | 本地图片可能私密 | settings metadata与blob分存，属合理设备偏好 | Penumbra preference domain | Penumbra · later |
| Penumbra desktop layout/assets | layout/version；widget asset store | UI | localStorage + IndexedDB | `src/widgets/storage.ts` 等 | widget UI | widget defaults/version | device/browser | desktop UI | 本地内容可能私密 | 与后端无关；需要版本迁移而非 server sync | Penumbra preference domain | Penumbra · later |
| Penumbra signature | 两个不同 storage key | UI | localStorage | 两个 signature 组件 | 各组件 | 相同硬编码文案 | device/browser | desktop UI | 可能含用户文本 | 同语义两份 key/default，容易漂移 | 一个 Penumbra preference key | Penumbra · later |
| Legacy UI generation prefs | context/temp/thinking/float/carryover 等 keys | UI/Generation | AionsHome旧 Web localStorage | `static/chat.html`, diary/theater pages | 旧 UI，部分同时写后端 | 页面常量 | browser/device | request composition/显示 | 可能 | 展示值不等于运行时值；跨页面各有默认 | 不迁移为SOT；按目标 domain重新建契约 | Penumbra/AionHome · blocker |
| Provider credentials | provider/API config key fields | Secret | `settings.json` | resolver/capability providers | legacy Settings/Provider Admin | 空/legacy import | global/provider | outbound auth | 是 | 与普通配置同文件并由GET返回 | AionHome secret store | AionHome · later |
| Session/push secrets | auth file + env | Secret | deployment/env、auth JSON | auth middleware、WS/push | auth initialization/CLI | generated | deployment/global | auth | 是 | 文件内多种 secret；bootstrap输出有运维暴露面 | deployment secret + auth store | deployment/AionHome · later |
| Debug/cache payload | Chat debug `api_payload`、cache `raw_metadata` | Secret-like runtime data | SSE/WS/debug objects + SQLite cache metrics | legacy debug UI、cache stats | provider execution/cache record | 无 | request/history | diagnostics | 是（prompt/context） | 完整 prompt/provider payload可到浏览器或数据库；不是“设置”却是泄露面 | server-only observability with redaction | AionHome · before-send |

## 4. Model Configuration Flow

### 4.1 当前链路

```text
config.py MODELS
  ├─ key + provider + backend model
  ├─ GET /api/models -> [{ key, provider }]
  └─ provider_resolution.resolve_provider(model_key, SETTINGS snapshot)

readiness request model query
  └─ omitted -> DEFAULT_MODEL
      -> immutable SETTINGS snapshot
      -> resolver
      -> safe { ready, model_key, reason_code, setup_action_required }

conversation create/update
  -> SQLite conversations.model（任意 string，无 registry validation）
  -> Penumbra Conversation.modelKey / Chat header

send or regenerate
  -> request 不含 model override
  -> SELECT conversations.model
  -> conversation 不存在时才使用 DEFAULT_MODEL
  -> resolver
  -> provider adapter
  -> outbound provider payload
```

### 4.2 模型问题逐项回答

1. **模型 key**：**Confirmed**，定义在 `config.py::MODELS` 的 dict key。
2. **provider 映射**：**Confirmed**，同一 registry entry 的 `provider`/`model`；credential/protocol 再由 resolver 从 `SETTINGS`/active API config解析。
3. **available models**：**Confirmed**，`GET /api/models` 直接迭代 registry，不调用 provider，也不是 readiness 过滤结果。
4. **readiness model key**：**Confirmed**，来自 query；缺省才用 `DEFAULT_MODEL`。Penumbra Settings Overview 当前不传 query，所以展示的是启动默认模型 readiness。
5. **conversation 是否存 model**：**Confirmed**，SQLite 非空列；create/update均可写。
6. **send 是否允许 model override**：**Confirmed**，不允许；Penumbra execution client也没有该字段。
7. **provider 默认参数**：**Confirmed**，不在 registry；token上限等在 adapter硬编码，endpoint/model fallback在 config/resolver。
8. **conversation 参数**：**Confirmed**，除 model/title外没有 generation config。
9. **send 覆盖默认**：**Confirmed**，不同字段各走不同路径，不能用一个总优先级描述；详见第5节。
10. **regenerate 参数**：**Confirmed**，query 接收 context/whisper/fast/temperature/thinking；模型仍来自 conversation。
11. **旧 Settings 能否修改**：**Confirmed**，能改 provider/credential、global temperature/thinking/cache等；不能通过 Settings 修改 model registry，conversation model在旧 Chat下拉框修改。
12. **重复默认**：**Confirmed**，default model 同时在 Python常量和DB schema；generation/UI默认散落于后端DTO、旧HTML、Penumbra mapper contract、adapter。
13. **unknown model**：**Confirmed**，可被 conversation持久化；readiness返回unknown；执行不回退，而是错误路径。
14. **删除/重命名**：**Confirmed**，现有conversation保留旧string并变unknown；没有迁移或alias机制。用户可继续看到 key，但不能成功解析。
15. **前端未来展示/修改**：展示 safe catalog 的 key/label/provider/capabilities/readiness/status；修改只写 conversation model。不得显示或复制 provider routing/credential；provider administration另属后续安全页面。

### 4.3 当前真实优先级

模型选择不是示例中的四层 cascade，而是：

```text
send/regenerate request model override：不存在
    ↓
conversation.model：执行的正常事实来源
    ↓（仅 conversation 行不存在时）
DEFAULT_MODEL
    ↓
registry/provider resolver

unknown conversation.model：报错，不回退
```

Provider 配置选择和模型选择是两条链：conversation model 先决定 registry entry；resolver 再结合 legacy provider settings 或 active named config 得出 endpoint、credential、protocol和backend model。active provider config 不能替代 conversation model。

## 5. Generation Parameter Flow

### 5.1 实际优先级图

```text
context_limit
request value -> DTO default 30 -> history/prompt/cache consumer
conversation/model/global default：不存在

temperature on send
request value：被接收但忽略
SETTINGS.temperature -> provider adapter -> None 时不发送

temperature on regenerate
query value -> provider adapter
None -> adapter 不发送
global temperature：不参与该路径

thinking_effort on send/regenerate
request non-null -> 写入 SETTINGS -> normalized global getter -> Anthropic adapter
request null/omitted -> global getter -> hard fallback medium

fast_mode
request value -> false 时完整 recall；true 时跳过即时 digest/memory recall

whisper_mode
legacy format: request -> prompt capability
Anthropic format: worldbook flag -> prompt capability

carryover
legacy browser local payload -> send request -> persistent is_carryover messages -> prompt/history

cache
global cache policy + runtime message regions + adapter/model branches
```

因此当前不存在可证明的统一：

```text
single request -> conversation config -> model registry default -> hard-coded fallback
```

除上述逐字段实现外，其他总优先级应标记为 **未定义 / 实现分散**。

### 5.2 DTO、空值和消费者

| 参数 | send DTO | regenerate | `null` / omitted | `false` / `0` / empty string | 持久化 | prompt | provider payload / adapter覆盖 | 能力限制 |
|---|---|---|---|---|---|---|---|---|
| `context_limit` | 是，默认30 | 是，默认30 | omitted使用route default | `0`有效并选择零历史 | 否 | 是 | 影响Anthropic cache context | 无model元数据；无范围约束 |
| `temperature` | 是，但执行忽略 | 是，直接消费 | send回global；regen为不发送 | regen `0`有效；send `0`仍忽略 | global另有值；request不存 | 否 | 各adapter仅在非None时写；send global、regen query | 无registry能力限制 |
| `thinking_effort` | 是 | 是 | 读取global | empty会被normalize为global medium；不是false/0字段 | **非null请求写global** | 否 | 仅Anthropic thinking路径消费；还受global `enable_thinking` | model type靠字符串/protocol分支 |
| `fast_mode` | 是，默认false | 是，默认false | route default false | false=完整路径 | 否 | 间接（改变memory召回） | 不直接进入payload | 无registry capability |
| `whisper_mode` | 是，默认false | 是，默认false | route default false | false=不声明Toy（legacy） | 否 | 是 | 不直接进入payload；Anthropic路径来源不同 | 无registry capability |
| `carryover_messages` | 是，默认空数组 | 否 | 空=不复制 | 不适用 | 复制后成为messages | 是 | 通过history进入payload | item结构弱；无capability元数据 |
| `attachments` | 是，默认空数组 | 否 | 空=无附件 | 不适用 | user message中持久化 | history/prompt路径 | provider-specific | registry未声明vision能力 |
| cache region/key | 不由请求直接指定 | 不由请求直接指定 | runtime派生 | region字符串/Quick Notes hash | message/JSON cache | 是 | cache builder/provider-specific | 未集中声明 |

### 5.3 旧 UI 与 Penumbra

**Confirmed**

- 旧 Chat 将 context、temperature、thinking、carryover、float interval 存在 localStorage；部分值又调用全局 Settings写接口，并在每次请求重复提交。
- 旧 UI 初始 temperature 显示默认与服务端缺失 `temperature` 的实际语义不同；send又忽略请求temperature，所以 UI显示不等于运行时。
- Penumbra Chat Execution mapper忠实保留显式 `false`、`0`、空string；send中的显式null会发JSON null，regenerate中的null会省略query。该mapper描述线格式，不证明后端优先级正确。
- Penumbra production Chat尚未组装或发送这些参数；旧 `useChat`/`useConversations` 是未进入production workspace的mock，不能成为配置来源。

S6C 初始组合必须显式列出允许发送的字段；未完成 C2A 前不要从 Settings mock、旧 localStorage 或UI常量自动填入高级参数。

## 6. MCP Configuration Flow

### 6.1 概念拆分

| 概念 | 当前实现 | 作用域 | 当前问题 | 目标 owner |
|---|---|---|---|---|
| Server 定义 | `mcp_config.json.servers` | global | 与secret/status混合 | MCP Server aggregate |
| 连接配置 | server URL + token；remote SSE | global/server | 不支持源码虽导入但未接入的command transport；raw secret被GET返回 | MCP Connection + secret store |
| 工具发现 | connect/list时远端发现 | runtime/server | 失败会使用旧缓存 | MCP Tool Registry |
| 工具启用/禁用 | 只有global/server enabled | global/server | 无tool级开关 | MCP policy |
| 模型是否允许调用 | prompt/command grammar隐式允许 | runtime | 无model capability或policy | model capability + MCP policy |
| 会话是否启用 | 不存在 | — | 所有会话共享global | 可选Conversation capability config |
| Prompt工具描述 | 只在Anthropic system builder接收tool list | request/runtime | provider format行为分叉 | Prompt builder从safe Tool Registry读取 |
| 单次执行状态 | in-memory connections + loading event | runtime | 与持久config DTO交叉 | MCP runtime status |
| 执行结果持久化 | system message `mcp_tool_calls`，结果截断；即时follow-up使用更完整结果 | message | args/结果可能含敏感数据；结构缺乏稳定schema | Message capability record + redaction policy |
| 前端展示 | 旧 UI/ Penumbra已有只读result card helper | message/UI | 管理状态未接入；execution event schema有限 | Penumbra presentation，仅消费safe DTO |

### 6.2 当前流

```text
mcp_config.json
  -> global enabled + server enabled
  -> startup / route-triggered connect
  -> remote tool discovery
  -> in-memory connection registry
  -> mcp_tools_cache.json（Quick Notes hash key）
  -> Chat send/regenerate读取tools
  -> Anthropic prompt中的工具描述
  -> model输出MCP command
  -> command parser / chain depth
  -> tool call
  -> loading event + follow-up prompt
  -> truncated result/args/error写入message capability
  -> history API / Penumbra展示
```

逐项结论：

1. server列表：**Confirmed**，在 `mcp_config.json`。
2. transport/command/URL：**Confirmed**，当前route/schema只有remote URL/token；command/args/env未成为可用配置。
3. credential：**Confirmed**，token明文存同一JSON，并进入连接query。
4. discovery：**Confirmed**，初始化、连接、list/call路径可触发。
5. enable/disable：**Confirmed**，global/server bool写同一JSON；无tool级开关。
6. scope：**Confirmed**，global；不是用户级或conversation级。
7. prompt：**Confirmed**，Chat取得tools后传Anthropic builder；legacy builder没有等价tool list入参。
8. send启用：**Confirmed**，主要以global enabled决定是否加载tools；**Confirmed**，低层direct call对已有server不再次验证enable flags。
9. execution结果：**Confirmed**，即时follow-up使用结果；持久化到system message的结构化字段并截断；history会返回。
10. 旧页面修改：server CRUD、global/server开关、连接测试和链深度；不是conversation/tool policy。
11. 安全接口：需要server summary、credential-status、runtime health、tool discovery、write-only credential replacement；见第10节。
12. 绝不能返回浏览器：raw token、完整auth header、command env（未来若支持）、credential path、完整连接异常、未脱敏tool args/result。
13. config/runtime混合：**Confirmed**，`status`/`last_connected`与定义、secret一起回写。
14. 失败与禁用：字段层面可看enabled与status，但现有聚合DTO没有稳定的disabled/failed状态契约；应拆分。

## 7. Secret Exposure Review

本节只记录字段类别和代码路径，不记录任何实际值。

| 接口/路径 | 分类 | 证据与风险 | 目标处理 |
|---|---|---|---|
| `/api/session` | 安全 | 只返回authenticated boolean并禁缓存 | 保持 |
| `/api/models` | 安全 | 只返回key/provider | 扩展时仍用allowlist |
| `/api/chat/readiness` | 安全 | 固定四字段，无endpoint/credential | 保持；可增加safe status但不回传原因原文 |
| `GET /api/settings` | **直接泄露** | 返回多种provider/TTS/ASR/music raw key、URL及普通配置；masked字段与raw字段并存；短secret的mask函数原样返回 | 退役raw GET；拆领域safe DTO |
| Provider Admin list/active/create/update | **直接泄露** | raw config含key、URL、auth/gateway等；响应回显创建/更新对象 | summary DTO + write-only replacement |
| `/api/mcp/config`, `/api/mcp/servers` | **直接泄露** | server对象含raw token和URL；config又含runtime status | 拆summary/credential-status/runtime DTO |
| MCP test/connect logs/errors | 脱敏不足 | test URL和异常可能包含query credential；工具args/result被日志输出 | structured redacted logs；浏览器只收错误码 |
| `/api/location/config` | **直接泄露** | raw map credential与masked字段同时返回，并混入active runtime | safe config + credential-status + separate runtime status |
| TTS/ASR config | 仅旧接口泄露 | 专用synthesis/voice列表未直接返回key，但raw配置经旧Settings返回；远端错误原文可能暴露endpoint细节 | capability safe DTO；错误码化 |
| `/api/settings/fetch-models` | 脱敏不足 | 接受credential/endpoint并记录目标、远端响应headers/body片段和异常；错误原文返回浏览器 | server-side validation + redacted logs/error code |
| Chat legacy debug event | **直接泄露（私密上下文）** | debug含prompt、recall、quick notes和provider payload；Penumbra mapper已只投影safe usage/model/error bool | 后端生成safe debug DTO；不要依赖前端丢弃 |
| `/api/cache/stats` raw metadata | **直接泄露（私密上下文）** | cache usage metadata持久化完整provider payload，stats查询返回raw record | 去除payload或仅server admin redacted summary |
| Provider runtime logs | 脱敏不足 | 部分路径记录endpoint/config name和消息预览；远端异常可能附请求信息 | structured redaction |
| Auth file / HTTP session response | 安全（响应）/ 运维风险 | auth文件未被API返回；session DTO安全；首次生成credential会输出一次 | 保持server-only，限制日志访问与文件权限 |

未来secret-safe DTO最小语义：

```ts
type CredentialStatus = {
  configured: boolean;
  maskedLabel: string | null;
  status: "valid" | "invalid" | "unknown";
};
```

`maskedLabel` 必须由后端生成，不能是可逆子串；`status` 必须说明是本地完整性、最近验证还是实时验证。写接口只接收 replacement secret，不回显；空值、保留现值和清除必须使用不同命令语义。

## 8. Duplication and Conflict Inventory

| 冲突 | 证据 | 风险 | 优先级 |
|---|---|---|---|
| Default model重复 | Python `DEFAULT_MODEL`、conversation DB schema、theater schema | 数据不一致、版本不可控 | blocker |
| Registry key重复 | 同一个model key在Python dict出现两次，后值覆盖前值 | provider映射不可见、运行时不可预测 | blocker |
| Temperature三份语义 | 旧UI local default、global Settings、send/regenerate request | UI与运行时不一致、用户无法理解 | blocker |
| Thinking request写global | 单次send/regenerate参数调用global setter | 跨会话副作用、运行时不可预测 | blocker |
| Context默认重复 | send DTO、regenerate route、旧Chat、Diary、Theater、Penumbra contract说明 | 版本不可控 | blocker |
| Whisper来源分叉 | legacy builder用request；Anthropic builder用worldbook | provider格式导致行为不同 | blocker |
| Provider registry与credential混合 | registry决定provider；settings/named config决定secret/protocol/model override | 迁移困难、用户无法理解 | before-send |
| Capability判断分散 | registry无capabilities；provider/model substring和protocol分支各自判断 | 运行时不可预测 | before-send |
| env/JSON/legacy file多来源 | auth env→file、push env/file、首次Settings可导入legacy plaintext | 数据不一致、安全泄露 | later |
| Worldbook多owner整对象写 | persona PUT只保存allowlist；diary/camera/whisper附加字段共用JSON | 数据丢失、迁移困难 | before-send |
| MCP config/runtime同DTO | server definition/secret/status/last_connected一起保存和返回 | 安全泄露、状态不可解释 | later |
| MCP cache key不足 | tool cache只按Quick Notes hash，不含server/config版本 | prompt可能过期、运行时不可预测 | later |
| Secret与普通设置同DTO | 旧Settings、Provider Admin、Location、MCP | 直接安全泄露 | later（启用管理UI前为blocker） |
| Schedule/Quick Notes defaults重复 | route、scheduler、activity等模块各有fallback | 数据不一致 | later |
| Penumbra signature重复 | 两组件使用不同key且相同default | UI数据不一致 | later |
| Config与运行状态混合 | Camera status、Location active、MCP status等 | 用户无法区分禁用/失败/未连接 | later |
| Carryover跨localStorage/request/DB | 旧UI payload不清除，send复制为持久messages | 隐私、重复注入、用户无法理解 | before-send |
| Debug数据进入浏览器/DB | Chat debug、cache raw metadata | 私密上下文泄露 | before-send |

## 9. Target Ownership

### Deployment Runtime

`env / deployment config` 拥有host、port、proxy、storage path、runtime mode、日志与rollout flags。浏览器只接收必须公开的base URL与timeout；server secret env不进入Vite变量。

### Provider Registry

`AionsHome model/provider domain` 拥有stable model key、display label、provider reference、backend model、protocol、capabilities、enabled/deprecated状态和model defaults。registry key重命名必须有alias或conversation迁移策略。

### Provider Secrets

`AionsHome secret storage` 拥有credential。普通读取只返回credential status；provider config可引用secret id，不内嵌raw值。

### Conversation Config

`Conversation persistence` 拥有title、model和产品明确需要的conversation-scoped generation/capability overrides。不存在的scope不得由Settings UI臆造。

### Single Execution Overrides

`send/regenerate request` 只拥有真正一次性的override，且不得产生global持久副作用。omitted、null、false、0必须有contract test。

### Capability Config

`各 capability 后端 domain` 分别拥有MCP、Memory、Camera、Location、Activity、TTS、ASR、Music、Schedule、HEART、Diary等配置；运行状态、数据和secret采用不同DTO。

### UI Preferences

`Penumbra local preference domain` 拥有theme、wallpaper、desktop layout、animation和device-only voice/Toy偏好。只有明确需要跨设备同步时才新增后端preferences domain。

### Settings UI

Settings只组合上述domain的safe read/write能力，显示scope和状态，不建立巨型`GET/PUT /api/settings`，也不缓存成为运行时事实来源。

## 10. Proposed API Boundaries

以下仅为边界草案，不实现。命名优先延续当前conversation、chat、MCP和capability路由；legacy `/api/settings` 在兼容期保留但不作为Penumbra契约。

| 边界草案 | read/write | secret-safe | scope | 时序 | 说明 |
|---|---|---|---|---|---|
| 现有 `GET /api/session` | read | 是 | runtime/session | before-send | 保持当前allowlist |
| 现有 `GET /api/models` 的安全扩展 | read | 是 | global | blocker | 增加label/capabilities/status/default marker；不含routing/endpoint |
| 现有 `GET /api/chat/readiness?model=...` | read | 是 | model | blocker | 必须按selected conversation model查询 |
| `GET /api/providers` | read | 是 | global | later | provider summary，不含raw config |
| `GET /api/providers/{id}/credential-status` | read | 是 | provider | later | 返回安全credential状态 |
| `PUT /api/providers/{id}/credential` | write | 写入型 | provider | later | replacement/clear命令；永不回显 |
| 现有 `GET/PUT /api/conversations/{id}` | read/write | 是 | conversation | blocker | model仍由Conversation拥有；PUT需model validation/unknown策略 |
| `GET/PATCH /api/conversations/{id}/config` | read/write | 是 | conversation | blocker（若决定存在） | 只放明确的conversation generation/capability字段；否则不创建 |
| 现有 send/regenerate | write/execution | 是 | request | blocker | 对齐参数优先级、范围、null与副作用；不接secret |
| `GET /api/mcp/overview` | read | 是 | global | later | global enable + counts；不返回server connection细节 |
| `GET /api/mcp/servers`（安全重定义或新版本） | read | 是 | global/server | later | server summary + health，移除token |
| `GET /api/mcp/servers/{name}/credential-status` | read | 是 | server | later | credential状态 |
| `PUT /api/mcp/servers/{name}/credential` | write | 写入型 | server | later | replacement-only |
| `GET /api/mcp/servers/{name}/tools` | read | 是（需结果脱敏） | server/runtime | later | discovery状态与tool summary；与enablement分开 |
| `PATCH /api/mcp/servers/{name}/policy` | write | 是 | server，未来可conversation | later | server/tool enablement，不含connection secret |
| 现有 `/api/activity/config` | read/write | 是 | global/device | later | 从巨型Settings移出enablement事实 |
| `GET/PATCH /api/location/config` + credential-status | read/write | 是 | global/device | later | config不含raw credential；runtime status另路由 |
| 现有 `/api/cam/config` 与 `/api/cam/status` | read/write + read | 是 | global/device + runtime | later | 明确拆config/status；monitor command保持操作接口 |
| `/api/tts/config`, `/api/asr/config` + credential-status | read/write | 是 | global | later | provider config与device UI preference分开 |
| 现有 schedule/quick-notes/memory/diary routes | domain-specific | 逐项 | global/data | later | 不再经通用Settings DTO聚合raw数据 |
| Penumbra local preferences | local read/write | 本地 | device/browser | later | 当前无需后端API |

## 11. Migration Sequence

### C2A Model & Generation Contract — S6C blocker

1. 为model registry重复key、default model、unknown/deprecated model建立characterization tests。
2. 明确并测试send/regenerate每个generation字段的scope、优先级、范围与null语义。
3. 解决send temperature忽略、regenerate差异、thinking request写global、whisper format分叉。
4. 为model catalog补最小safe metadata；Penumbra只读取，不复制resolver。
5. 决定S6C首发允许字段；高级字段未稳定前保持省略。

### C2B Conversation Config — S6C blocker

1. 保持conversation model为发送模型事实来源。
2. 定义unknown/deleted/renamed model的read/update/send策略。
3. 决定是否真的需要conversation-scoped generation config；若不需要，明确不存在，禁止UI伪造。
4. readiness必须按selected conversation model查询；Settings bootstrap readiness不能覆盖它。

### C2C Provider Admin Safe DTO — later

1. 先新增provider summary和credential-status read DTO。
2. 再新增replacement-only credential write与验证状态。
3. 迁移Penumbra Provider UI后，才评估legacy raw Provider Admin/Settings接口退役。

### C2D MCP Configuration Domain — later

1. 分离server definition、secret、policy、runtime health和tool registry。
2. 修正enablement检查与cache invalidation/version。
3. 新增safe MCP管理DTO后再接Penumbra；connection测试不得回传原始异常。

### C2E Other Capabilities — later

按Memory、Location/Activity、Camera、TTS/ASR、Music/Toy、Schedule/Quick Notes、HEART/Diary逐域迁移；每域先拆secret/config/runtime/data，再接UI。

### C2F Legacy Settings Retirement — last

在所有调用方和后台任务有明确替代后，按字段关闭raw GET/PUT，最后移除巨型Settings页面与兼容字段。不得一次性删除。

## 12. Backend Blockers

S6C前必须解决或以明确contract绕开：

1. model registry重复key与default model单一来源。
2. conversation model validation，以及unknown/deleted/renamed model策略。
3. send/regenerate generation参数优先级和一致性。
4. send `temperature`名义override被忽略。
5. request `thinking_effort`产生global持久副作用。
6. whisper/Toy在legacy与Anthropic prompt builder之间来源不同。
7. `context_limit`允许`0`和任意数值的边界；send/regenerate默认重复。
8. S6C应传哪些字段、哪些必须省略的allowlist。
9. Chat debug/cache stats在启用新发送UI后可暴露私密prompt；需限制消费者或先提供server-side safe projection。

可后置：provider credential UI、完整Provider CRUD、TTS/ASR、Memory管理、Camera/Location控制、高级MCP管理、cache monitor、Toy preset同步、视觉整理。

## 13. Frontend Follow-ups

- S6C Sender只从selected conversation和draft取得必要输入；不要读取Settings mock或旧AionsHome localStorage。
- readiness按`selectedConversation.modelKey`请求，响应key必须匹配；unknown model保持可见并阻止发送，不从models第一项替换。
- 在C2A完成前，不自动提交temperature、thinking、fast、whisper、carryover等高级字段。
- 如果后端决定省略字段即使用server default，Penumbra不要再次硬编码同一默认；UI显示“服务端默认”而非伪造数值。
- Settings Overview继续是bootstrap/global安全概览，不代表当前conversation runtime。
- Provider、MCP、Location、TTS/ASR页面必须等待后端safe DTO；不能用前端mapper遮蔽raw secret响应。
- 合并两个Penumbra signature preference key可作为普通cleanup，不阻塞Chat。

## 14. Confirmed Facts vs Unknowns

### Confirmed

- 两仓库当前分支、HEAD和初始工作树均符合本轮门禁。
- Penumbra只有runtime env和device-local UI偏好；Settings安全概览不写后端。
- AionsHome配置跨env、源码、JSON、SQLite、request、runtime memory和旧localStorage。
- model list、readiness、conversation model、send resolver链路如第4节。
- generation逐字段行为如第5节，不存在统一四层优先级。
- MCP定义/secret/status混存、全局scope、Anthropic prompt注入和message结果持久化如第6节。
- 旧Settings、Provider Admin、MCP和Location存在raw secret response。

### Inferred

- whisper mode在Anthropic路径对send request无效；需要针对真实resolved protocol的contract test确认端到端结果。
- MCP配置变化后工具缓存可能陈旧；需要cache invalidation test。
- provider远端异常、MCP异常和TTS/ASR错误原文可能带endpoint/credential片段；需要redaction test，不能依赖库行为。

### Unknown / 需要后端确认

- 产品需要的user default和conversation default是否存在；若存在，哪些字段可持久化。
- `temperature`与`thinking_effort`当前不对称行为是否为兼容要求。
- model capability的稳定schema与unknown/deprecated生命周期。
- production部署如何注入env、持久目录、日志级别和secret rotation；仓库内没有统一loader契约。
- MCP tool result允许持久化和返回浏览器的最大安全字段集合。
- Camera crop、voice wake等runtime-only状态是否产品上应跨重启持久。

建议补充的测试：model registry唯一性/default引用完整性；conversation model validation；send/regenerate参数表驱动测试；request不写global配置测试；prompt format parity；MCP enablement/cache invalidation；所有safe DTO的secret canary测试；debug/cache redaction测试。
