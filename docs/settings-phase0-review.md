# Penumbra Settings · Phase 0：现状复核与实施边界

复核日期：2026-11-03（Asia/Shanghai）。状态：**静态源码复核完成，实施建议待人工确认**。

本轮只新增本文，不修改业务代码，不启动或 import 后端，不调用生产 API、Provider 或 MCP 服务，不读取真实 Settings、Worldbook、SQLite、密钥、个人记录或浏览器存储，不执行配置写入、迁移、commit、push 或部署。文中的默认值来自源码，不能解释为生产现值；既有测试只检查源码与覆盖范围，本轮没有重跑它们。

## 1. 结论与第一阶段边界

Settings 第一阶段应承接 **Connection 管理、技术层 Feature Binding 分配、安全凭据操作，以及独立 MCP 设置页**；保留已完成的设备外观和运行概览。语音、Web、Music、Embedding 的服务配置可随后按领域逐项迁移，不作为连接管理上线前的必要条件。缓存窗口和主动保活暂缓，不能直接包装成普通自动保存滑块。

需要纠正的前提：

- Registry v2 已经是可用后端契约，不应重新建立 API Pool/Profile 编辑系统。连接是 URL/凭据权威，协议和 literal 模型属于使用位置。
- Main Chat 已有持久聊天设置和会话模型入口，不再迁移或复制到总 Settings。
- Diary 已有 Entry 独立模型设置，Quick Note 已有时段编辑。旧清单中的“待迁移”不能直接照搬。
- MCP 必须是独立页面。保留 `mcp_config.json`、reconcile、发现缓存和调用权限边界，**不改造为 Registry Connection**。
- Worldbook 丢失 `diary_auto_feed` 的具体旧缺陷已修复；cache-config 全库重置副作用仍存在。两者不能继续按同一风险结论处理。

本轮属于配置边界复核，不重新审计所有业务。遵守 AionHome 渐进重构要求：不改变消息持久化、Prompt 输入顺序、WS type/payload/timing、Command 语法/副作用顺序、业务模型解析及 MCP 执行生命周期；Penumbra 不复制后端状态机。

## 2. Git、参考材料与最新交付

### 2.1 本地仓库快照

| 项目 | 位置 | 分支 | HEAD | 开始时工作区 |
| --- | --- | --- | --- | --- |
| Penumbra | `/Users/remix/Desktop/Penumbra` | `main` | `f51edec3c7a3a9b276f509c884fd8f8475a8056d` | `git status --short` 为空 |
| AionHome | `/Users/remix/Desktop/AionsHome-main` | `refactor-code-main` | `eb3d29a10cf33ccfb9853abc5cee47e359910e64` | `git status --short` 为空 |

未 fetch、checkout、stash、reset、clean，也未修改 AionHome。这里只证明本地 checkout，未核验远端 PR 合并、部署版本或生产迁移状态。完成时 Penumbra 应仅有本文新增，AionHome 仍无变更。

### 2.2 参考文件的适用性

| 文档 | 本轮如何使用 |
| --- | --- |
| 用户指定的 `docs/settings-domain-audit-2026-07-31.md` | 实际路径为 [docs/audits/settings-domain-audit-2026-07-31.md](./audits/settings-domain-audit-2026-07-31.md)。保留历史结论；其中 Chat mock、raw secret、旧模型权威等已经失效。 |
| [settings-inventory.md](./settings-inventory.md) | 2026-10-23 基线、10-26 Chat 增量；用作字段索引。本轮不重算 159 个逻辑单元，也不把旧完成率作为现状。 |
| [chat-pr6-5-config-audit.md](./chat-pr6-5-config-audit.md) | PR6.5-A 历史判断；临时请求覆盖建议已被后续实施取代。 |
| [chat-pr6-5-config-implementation.md](./chat-pr6-5-config-implementation.md) | 持久偏好实施记录；仍逐项核对当前 client、controller 和后端消费者。 |
| [AionHome Phase 5-D 契约][B1] | 当前 Connection/Feature API 的主要契约；Diary 后续变化以 10-30 源码和交付为准。 |
| [MCP 缓存契约][B9]、[工具启停契约][B10] | 已包含 10-30 增量；早期 MCP 计划不等于当前 transport 能力。 |

### 2.3 与本轮相关的最新交付

| 领域 | 可复核提交与记录 | 对范围的影响 |
| --- | --- | --- |
| Settings | Penumbra `c811a59`（08-06，安全概览）、`50e89f1`（10-23，配置盘点）；AionHome `f299734`（10-21，统一契约）、`1b5e480`（10-23，Worldbook 字段保留） | Settings 不是空壳；旧 Worldbook P0 不再成立。 |
| Main Chat | Penumbra `fb89ff3`、`77bd864`（10-26，持久设置/Thinking/携带历史）；后续 `1663162`（10-27，系统日志/请求检查）、`22fb1fe`（10-28，Thinking 渲染）、`422e6da`、`998ddc4`（10-29，编辑与流性能） | 模型、五项聊天设置、系统日志均保留 Chat 内入口。 |
| Chat 后端 | HEAD `eb3d29a` 与 `d975658`（11-01，后台期限验证、部分输出与安全 append 重试）；`1c24828`、`4145db1`（10-31，期限/SSE） | 不借 Settings 迁移改生成、重试或任务状态机。 |
| Diary | Penumbra `99ea5aa`、`b3aacb9`（10-30，聊天/投喂、Entry 模型），`db6af47`（11-03，日历提取）；AionHome `6589da3`、`7105f94`、`021b0ec`（10-30，投喂/消息顺序/统一模型解析） | 见 [Entry 模型交付](./diary-chat-model-settings.md)、[日历提取交付](./diary-chat-pr4b.md)，不迁到总设置。 |
| Quick Note | [10-29 时段配置交付](./quick-note-config-editing.md)，当前 controller 已实现保存和读回 | 旧盘点“只能读时段”已过时。 |
| MCP | AionHome `a0c80c8`、`6607243`（10-30，总开关与缓存解耦、逐工具启停） | 独立页必须包含工具级权限，不能恢复“总开关清缓存”的旧逻辑。 |
| 当前前端 HEAD | `f51edec`（11-03，生产玻璃模糊修复） | 保留现有 Settings/共享控件表面，不在迁移中重做外观基础。 |

交付文档里“未 commit/未部署”等是记录当时的状态。上表提交已在本地历史中；生产是否完成仍未确认。

## 3. 当前真实状态与旧审计差异

### 3.1 SettingsView 和设备外观

[SettingsView][P1] 当前实际包含：

1. 界面外观：跟随系统、浅色、深色。
2. 桌面背景：ambient/custom、选择/替换/移除图片、cover/contain、top/center/bottom、遮罩 clear/balanced/soft、文字 auto/dark/light；前端校验 `image/*`、不超过 20 MiB。
3. 主题色与 AI 主题色：预设、颜色输入及气泡预览。
4. 安全只读运行概览和手动重试。
5. “返回旧版知远”入口（`/`）。
6. **仍有“日历设置”占位**，没有已接通的配置；不应纳入迁移完成项，建议首页整理时移除或改为业务导航。

没有 Connection 管理、Feature Binding 编辑、Secret 编辑、MCP、TTS/ASR、Music 登录、Web/Embedding、Cache 编辑表单。Settings 由经典/Editorial 桌面的 `isSettingsOpen` 挂载，并非已经存在可深链的新版 `/settings` 路由；新页面导航要显式设计并遵守部署 base path。[P8]

主题模式、主题色、AI 色和壁纸显示参数均在当前 origin 的 localStorage。壁纸 Blob 在 `penumbra-preferences / wallpapers / desktop`；贴纸 Blob 在 `penumbra-widget-assets / images / desktop-sticker`，贴纸选择入口在 Widget，非 Settings 表单。经典 Desktop 消费壁纸；Editorial 尚无相同消费链，不应声称两个桌面背景已经统一。[P2][P3][P8]

### 3.2 Main Chat 已接通的持久偏好

| 能力 | 当前入口、读写与作用域 | 总 Settings 边界 |
| --- | --- | --- |
| Connection / Protocol / Model | Composer 模型面板；`GET /api/main/configuration?conv_id=…`，会话 PUT `main_selection`；SQLite `conversations.main_selection` | 继续只编辑当前会话；Settings 管连接本身及新会话默认，不复制 Composer。 |
| 上下文消息数 | Header“聊天设置”；`GET/PATCH /api/main/chat-defaults`；整数 1–100，默认由后端投影 | 服务实例 Main HTTP 默认，不是某会话独有，也不是最终 Prompt 总消息数。 |
| Temperature | 同上；`main_chat_defaults.temperature_by_protocol`，实际范围由协议元数据提供 | 按协议保存，不能转成一个无协议全局滑块。 |
| Thinking | 同上；Anthropic 的 `{enabled, effort}` 原子对象，五档 low/medium/high/xhigh/max | 能力 unknown 不是已验证支持；其他协议不支持。关闭是请求不附此项，不保证模型不内部推理。 |
| 记忆浮现间隔 | 同上；根级 `SETTINGS.float_interval`，1–15，默认 12 | **Chat 与 Diary 共用**，不是所有记忆召回的总开关；不新增副本。 |
| 新会话携带历史 | 同上；`main_chat_defaults.carryover_count`，0–50 条消息，默认 0 | 新会话保存来源 ID，首次发送在后端消费；不是每次发送或按轮数复制。 |

前端已具备单字段保存、失败草稿/显式重试、revision 冲突、迟到响应隔离及生成/保存互锁。后端先原子保存候选再发布内存，`value:null` 清单项覆盖；float 的旧 setter 也共用该 revision。Main send/普通及 canonical regenerate 显式启用“请求字段 → 持久 Main 默认 → 后端默认”，binding/generation options 在请求解析时捕获；工具及后续生成继承父请求。不能扩大为“所有全局 Settings 均已冻结”。[P4][B3]

仍属全局兼容字段：`SETTINGS.temperature`、`enable_thinking/thinking_effort`、`include_heart/include_drift`、`enable_hidden_heart/enable_hidden_drift`、旧 `chat_format`/selected API Pool 指针。新 Main 偏好不导入或覆盖旧温度/Thinking；旧字段还有后台或历史消费者。`float_interval` 则是继续使用的原共享字段，不能与这些旧独立偏好混为一谈。HEART/DRIFT 不等于原生 Thinking；fast/whisper 仍是请求或兼容策略，不新增普通表单。[B2][B3]

### 3.3 Registry v2：连接、引用与模型

Connection 是 `SETTINGS.model_api_registry.connections` 中的稳定 ID 记录，包含 `name/base_url/enabled/default_model?/transport/gateway_id?` 和后端凭据。Connection **不声明 protocol 或 reusable_protocols 白名单**；协议在 Feature/会话选择内。transport 当前为 `direct`、`cloudflare_rest`、`cloudflare_anthropic`，Cloudflare 仅开放现有 Anthropic 组合。[B1][B4]

| API | 已实现契约 |
| --- | --- |
| `GET /api/registry/connections`、`GET /{id}` | 安全列表/详情；列表含版本、bindings、aliases、协议和迁移诊断。v1 仅做确定性内存投影；`authority_state` 区分 `projected_v2/persisted_v2`，不能用 GET 触发迁移。 |
| `POST /api/registry/connections` | 创建；后端分配 ID。 |
| `PATCH /api/registry/connections/{id}` | 部分编辑、启停、替换凭据；`default_model:null` 可清空预填提示。 |
| `GET /api/registry/connections/{id}/references` | Feature、Main、Diary、Theater/Persona、Game 及 legacy 引用与无法解析记录。 |
| `DELETE /api/registry/connections/{id}` | 引用存在或无法判断时拒绝；扫描失败不当成零引用。不是级联删除。 |
| `GET /api/registry/connections/{id}/prefill` | 交互预填，非运行时继承权威。仅用户明确切连接时采用，不覆盖保存的 literal。 |
| `POST /api/registry/migrate` | 显式持久迁移；不是页面加载动作，也不能当“修复所有问题”按钮。生产数据迁移另走人工确认/运维流程。 |

以上简写 `/{id}` 均接在 `/api/registry/connections` 后。所有新 Registry API 要求网页 session，push token 不授予配置权限，成功和失败均 no-store。GET 不迁移、不修复 Settings/SQLite；Connection/Feature 的明确写入可能同时完成 v2 持久化，所以“只编辑一项”也可能有格式迁移副作用，应显示版本状态。[B1][B4][B5]

旧 Profile CRUD、旧 binding 写入和旧 test/fetch-models 已返回 `409 use_connection_api`。旧 API Pool/固定字段的部分写入口仍是兼容适配，最终写 Connection 权威；不为 Penumbra 重建这套界面，也不删除仍被历史选择/Embedding/Speech 使用的只读兼容数据。[B1][B2]

### 3.4 Feature Binding：实际支持的九个 usage

有效读取必须使用 **`GET /api/registry/feature-bindings`** 的 `features[]`，其中有 `selection/diagnostic/allowed_protocols/lifecycle`；不能只看 connections 列表里的原始 `feature_bindings` 就认定配置可用。GET 保留可识别的失效三元组供修正，解析失败提供诊断，不自动换连接或模型。[B4]

| usage | 当前允许协议 | 生效生命周期 |
| --- | --- | --- |
| `main_chat` | OpenAI Chat Completions / Anthropic Messages | 新 Main Conversation 默认；已有会话不跟随修改 |
| `memory_sentinel` | 仅 OpenAI | Feature 请求 |
| `memory_digest` | OpenAI / Anthropic | 提取、总结、重总结 |
| `web_compression` | 仅 OpenAI | Web 压缩请求 |
| `quick_note_compression` | OpenAI / Anthropic | Quick Note Step1；独立于 Memory Digest |
| `camera_sentinel`、`location_sentinel` | OpenAI / Anthropic / 明确的 `minimax_chatcompletion_v2` | 各自 Sentinel 请求 |
| `book_annotation` | OpenAI / Anthropic | 下一次单次/批量任务默认；任务可显式覆盖 |
| `game_decision` | OpenAI / Anthropic | 新 Session 默认；已有 Session 冻结 |

`PUT /api/registry/feature-bindings/{usage}` body 仅 `{connection_id, protocol, model}`，返回完整 binding；`DELETE` 清选择。缺失是 `feature_binding_required` 等诊断；禁用通常是 `disabled_profile`，凭据缺失是 `missing_credential`，不是选择被删除。v2 清空后不从旧字段复活；v1 的只读投影和 deferred 迁移诊断必须保留区别。模型为 trim 后 1–256 字符、内部无空白/控制字符的 literal，不要求在 catalog 中。[B1][B4]

`KNOWN_USAGES` 不是可编辑清单。Camera/Location Core、Alarm、Monitor、Activity、Quick Note Step2 跟随目标 Main，没有独立重复绑定；Diary/Theater/Game 的已有记录选择走独立 selection API，Game PUT 为 `409 session_selection_frozen`。Diary 当前 GET 另有 `effective_selection/effective_diagnostic`，不要退回旧“Entry 字段即实际执行选择”的判断。[B6]

Diary 的显式 JSON Entry 选择优先；未独立配置时仍沿“最新 Main 的旧目录 `model` → Entry 旧目录 model → bootstrap”兼容顺序，不读取 Main 的新 `main_selection`。10-30 已统一 send/regenerate 使用同一选择函数，旧请求级 `body.model` 不再绕过 Entry。因此不能声称 Diary 已完全消除历史 Main 目录耦合，也不能再按旧审计描述 send/regenerate 的选择分歧。[B22]

总 Settings 的“模型与任务”只管上述技术连接分配，不迁入 Memory 召回、Diary 投喂、Quick Note 时段等业务策略。

### 3.5 Secret、连接测试与远端模型发现

| 领域 | 安全读取 | 替换/保留 | 显式读取/清除 |
| --- | --- | --- | --- |
| Registry Connection | `credential:{configured,masked,secret_ref}`，不回明文；`credential_ref` 是后端来源标识 | credential 省略/null 保留；空白拒绝 `explicit_clear_required`；已有 Key 替换须当前 `secret_ref` | `POST /connections/{id}/credential/reveal`、`/clear`，body `{secret_ref}`；快照过期 `stale_secret_ref`，重新读回，不自动重试 |
| 普通集成 Settings | `GET /api/settings` 公共字段 allowlist + `credentials` 元数据 | 仅提交实际改变的白名单字段；**该旧 PUT 的空串可能直接清空，与 Connection 不同**，不能提交完整 GET 或把占位值写回 | `POST /api/settings/secrets/reveal`、`/clear`，签名引用校验；固定凭据兼容写可能映射回 Connection |
| MCP | config/list 的 credential 元数据；独立 token 被移除 | create/update 的 token 空串保留旧值；与 Registry 不同，替换不要求 secret_ref | `POST /api/mcp/secrets/reveal`、`/clear`；引用绑定配置快照，清除会 evict；详见第 4 节 |

表中 Registry 的简写路径前缀是 `/api/registry`。masked 不是可提交值，secret_ref 也不是可展示或解析的凭据。新 UI 不在初始化时 reveal，不持久化到 localStorage/日志/错误对象；只有用户明确操作才可短暂显示。普通 URL 等公共字段仍不是自动的凭据清洗器，MCP 的具体缺口见第 4.5 节。[B2][B4][B7]

- **连接测试**：`POST /api/registry/connections/{id}/test`，body 明确提交同一 ID、protocol、model。固定短 prompt、max_tokens=16、30 秒、非流式；回 `test_type:basic_nonstream`、`validates_full_chat:false`。只证明这次基础调用，不证明 Thinking、缓存、图片、长上下文、Stream 或整个 Chat 可用；测试不改绑定/消息/配置。
- **模型发现**：`POST /api/registry/connections/{id}/fetch-models?protocol=…`，可选 Anthropic `after_id`；direct OpenAI/Anthropic 使用对应认证读取 `/models`，Cloudflare 不开放；OpenAI cursor 为 `unsupported_pagination`。结果有 `connection_id/protocol/operation/models/truncated/next_page`。前端须按 ID、protocol、请求序号丢弃迟到结果；不清空 literal，不自动切模型，失败仍允许手填。
- `/api/models` 是内置 catalog，只读模型目录；它不是远端发现列表，也不包含所有可手填的新模型。[B1][B4][B5]

### 3.6 其他设置能力与配置归属

| 能力 | 当前后端/旧入口 | Penumbra 现状与建议归属 |
| --- | --- | --- |
| TTS 服务 | safe Settings GET/PUT；MiniMax、SiliconFlow、ElevenLabs；provider、URL/Key、模型，ElevenLabs 输出格式；`GET /api/tts/voices`，`POST /api/tts` 执行合成 | 无服务编辑器。放“语音服务”子页；SiliconFlow 复用 Embedding 的 Connection 凭据，不能另建凭据池。Chat 自动播放/音色属于客户端使用偏好，另行完成播放/WS 契约，不放服务管理表单。 |
| ASR / Voice | MiniMax ASR URL/Key/model 经 Settings；`/api/voice/status/toggle/remote-asr` 等承接运行操作 | 无 Voice 页面。ASR 服务配置放语音页；唤醒、麦克风授权、录音、通话启停属于独立业务。当前本机 Voice→Main 无 session 且带非允许请求字段，不能把“配置保存成功”当语音闭环完成。 |
| Music | `netease_music_u`（MUSIC_U 凭据）经 Settings，变化后 `reload_login`；搜索/播放走 `/api/music/*` | Music App/Widget 仍为占位并已隐藏普通入口。登录凭据可在服务集成；音量是旧前端 `aion_music_volume` 本地偏好，不搬成服务全局。 |
| Embedding | `embedding_model` 和 SiliconFlow URL/Key；v2 兼容编辑回写导入 Connection；代码维度常量 1024 | 无编辑器。服务集成可显示配置和共享引用；模型/维度变化可能影响已有向量，实施前需明确重建策略，不作为普通无提示切换。不是现有九个 Feature usage 之一。 |
| Web | `web_access_enabled` 全局许可、`brave_search_key`；`web_compression` 单独 Feature Binding | 无设置 UI，但 Chat 已消费结果。Web 子页只管许可/凭据与压缩绑定导航；每会话/单次授权不是既有能力，不造假开关。抓取数、超时、诊断 env 留内部。 |
| 用户标识 | `GET /api/settings/user-info`、`PUT /api/settings/user-prefix`；服务实例 ID/metadata 前缀 | 可在高级身份信息页；不是账户名/昵称管理。Persona 名称仍在 Worldbook，UUID 不做普通可编辑项。 |
| Persona / Worldbook | 独立旧 `/worldbook`，GET/PUT 五个表单字段；共享 Worldbook 文件仍含其他领域键 | Penumbra 仅有用户名安全消费，没有完整编辑页。保留独立领域页，Settings 仅导航。 |
| Diary / Memory / Quick Note | Diary 投喂、Entry 模型/元数据、Memory 内容/置顶等、Quick Note 时段已有各自入口 | 保留各 App；旧 Memory 锚点等缺口仍在业务范围，不进入总设置。 |
| Activity / Location / Schedule / Camera 等 | 各自路由；Activity 手机可见性/Wi-Fi、Location 配置和日程已各自接入；Camera 仍有独立旧页 | 保持领域入口；技术 Sentinel 绑定在模型分配，设备/静默/家/周期/任务等不迁入总设置。 |

证据：[Settings 路由][B2]、[Speech 配置 getter][B8]、[Voice 路由及发送者][B16]、[Web 搜索][B17]、[业务客户端与挂载][P6][P7][P8]。此表确认配置归属，不宣称相关业务完整迁移或做过真机/真实服务验收。

### 3.7 缓存、高级配置与系统状态

| 能力 | 当前语义 | 迁移决定 |
| --- | --- | --- |
| cache_enabled | GET Settings，PUT `/api/settings/cache-toggle`；服务全局缓存策略 | 高级页候选；不等同浏览器缓存，也不宣称关闭后清除历史。 |
| freeze_size / slide_max | GET/PUT `/api/settings/cache-config`，默认 20/10，非负；保存后更新全库消息缓存标记 | 暂缓，见第 5 节；不能自动保存或“无副作用试用”。 |
| Anthropic system TTL | PUT `/api/settings/anthropic-system-cache-ttl`，只接受 `1h/5m`，默认 `1h` | 后续高级项；不改变冻结历史的 5m TTL。 |
| Anthropic 日程分层 | getter 固定 true；兼容 PUT 总是保存/返回 true | **不迁可关闭开关**，旧 UI 状态不能凌驾于消费者。 |
| keepalive | GET/PUT `/api/settings/keepalive`；默认开、阈值 50 分钟，写入夹在 1–55；后台 activity 消费 | 后端已有、没有完整普通旧控件；涉及主动调用/费用，暂缓至高级运行 PR。 |
| 隐藏 HEART/DRIFT、legacy 温度/Thinking/format | 有旧 setter 或消费者，部分受额外 gate 限制 | 兼容/诊断保留，不复制普通 Chat 设置。 |
| renderer cutover、force_legacy、shadow/诊断 | Settings/env/内部策略，虽有 HTTP 接受字段 | 仅内部管理；“API 接收字段”不等于用户产品范围。 |

Settings 当前概览并行读取 `/api/session`、`/api/models`、`/api/chat/readiness`，三者任一失败即整体错误。readiness 不带 conv_id 时检查新会话默认的本地配置，不发送上游请求；Session 可达不等于数据库、磁盘、后台任务、所有 Provider 均健康。当前没有独立通用 `/api/health` 聚合契约。[P5][B18]

另有一个当前展示缺口：runtime mapper 接受 `missing_credential/disabled_profile` 等安全诊断码，但 `SettingsSafeBasics.readinessCopy` 仅列四类旧文案，未知码可能显示空说明；应在概览整理 PR 补通用安全兜底。Available Models 仅 catalog；有效 literal 不在列表时不应提示它必然不可用。若要求完整系统健康，需后端新增无密钥、无个人内容的状态摘要，不能靠读取完整配置/业务数据来探活。

## 4. MCP 专项：当前配置与独立页面建议

### 4.1 配置字段与真实默认值

| 层级/字段 | 源码默认或规则 | 页面处理 |
| --- | --- | --- |
| 根 `enabled`、`servers` | 缺文件/解析失败时 `{enabled:false, servers:{}}` | 总开关与 Server 开关分别显示；注意当前加载副作用，见 4.5。 |
| Server ID | `servers` 的 key，create body `name` | 稳定定位；现有 update 不支持改 ID，路径必须编码。 |
| `name` | 显示名；create/update 使用 `display_name` | 与 ID 分开，列表返回 camelCase `displayName`。 |
| `url`、`token` | URL 必填；token 默认空 | 公开地址与凭据分开；不在前端拼私有 endpoint。 |
| `credential_mode` | 缺失为 `query_token`；另支持 `path_segment` | query 模式追加 token；path 模式拆分最后路径段为独立 token，公开 base 以 `/` 结尾。 |
| `enabled` | create 默认 false | 保存/启用不等于连接成功。 |
| `status`、`last_connected` | create 为 offline/0；列表缺失回 unknown/0 | `online/offline` 是最近验证结果，时间戳为秒，不是持续心跳。 |
| `transport` | runtime 兼容缺省 `sse`，当前唯一支持 SSE | create/update/test DTO 未提供 transport 编辑字段；不加 Streamable HTTP/stdio/headers 表单。 |
| `disabled_tools` | 可选精确工具名称列表，缺失 `[]` | 新发现工具默认启用；同名工具按 Server 隔离，移除后重现仍沿用显式关闭。 |
| `mcp_max_chain_depth` | **不在 MCP 文件**，在 Settings 根级；默认 5，clamp 0–20 | 语义归 MCP 独立页高级项；沿现有 safe Settings GET/PUT 单字段，不复制存储，不宣称 0 等于总开关关闭。 |

`path_segment` 限制 HTTP(S)、无 userinfo/query/fragment，歧义输入返回通用 422；query 模式保留旧 URL 语义。旧计划中的 MCP-07～09、CEDAR 预设或其他 transport 不能按“计划已写”标为实现。[B11][B12][B13]

### 4.2 管理、发现、保存与 reconcile

| 操作 | API 与实际行为 |
| --- | --- |
| 读取 | GET `/api/mcp/config`（嵌套 shape）或 `/api/mcp/servers`（列表 shape）；分别适配，不把两种 DTO 混用。 |
| 总开关 | PUT `/api/mcp/config` `{enabled}`；先保存，再 await reconcile，开启时 await initialize。关闭移除运行连接并拒绝工具派发，但保留有效工具说明缓存。 |
| 新建 | POST `/api/mcp/servers`；保存 → topology 变化则缓存失效 → reconcile；enabled 时启动后台 initialize（客户端仍检查根开关）。重复 ID 400。 |
| 更新/启停 | PUT `/api/mcp/servers/{id}`；需提交 display_name/url/enabled，token 空串保留，credential_mode 可省略保留旧值；不是 PATCH。保存后失效/reconcile，根与 Server 均开时后台初始化。 |
| 删除 | DELETE `/api/mcp/servers/{id}`；保存后失效/reconcile。不存在 404；不涉及 Registry 引用删除。 |
| 测试草稿或已保存连接 | POST `/api/mcp/servers/{id}/test`；可传 url/token 或 url/secret_ref，token 与 ref 不能同时提供。无 url 时后端取保存配置。短生命周期 initialize + list_tools，不保存到全局连接；未保存 Server 也可测。 |
| 工具列表 | GET `/api/mcp/servers/{id}/tools`；返回 `server/tools[]`，每项含 server/name/description/inputSchema/enabled。优先读完整发现缓存，缺失时按需恢复，可能连接远端并写派生缓存/状态，不是纯本地读。 |
| 工具启停 | PUT 同 tools 路径 `{name,enabled}`；仅修改本地 `disabled_tools`，不 reconcile、不失效缓存、不调用 list_tools。成功后刷新管理元数据以获取新的 secret_ref。 |

reconcile 按根/Server 开关和 URL/transport/credential_mode/token 的 fingerprint 对齐当前连接，锁内更新 generation，锁外清理旧对象。改名/状态不会无意义重连；旧初始化/发现结果不能回填新 generation。连接操作按需打开短生命周期 SSE session，不应在 UI 标“持续长连接”。已经派发的工具不强制中断；新的调用在连接前、派发前和重试边界重新检查当前工具权限。[B11][B12]

### 4.3 工具缓存失效：必须保留 10-30 的新语义

- `mcp_tools_cache.json` 是派生的完整发现缓存，含工具、`qn_hash/updated_at/mcp_topology_hash`，无固定 TTL。
- topology 包含 Server 集合/ID、Server enabled、URL、transport、credential_mode、token 摘要；不含总开关、显示名、状态、连接时间、排列顺序或 `disabled_tools`。
- Server 增删、启停、地址/凭据变化或清凭据：保存成功后才按 topology 失效。改显示名不失效。总开关 off/on 不清有效说明缓存；每次 Prompt 选择和工具派发仍检查开关。
- 工具开关只影响 Prompt 筛选与派发权限，完整缓存保留关闭工具及其 schema，方便重新启用；不能用“删除缓存条目”实现关闭。
- 普通 send/旧 regenerate 仍以该 generation 捕获的 Quick Note hash 判断刷新；canonical regenerate/append 路径保留原 QN 策略，只在缺失/拓扑失效时恢复。不在 Quick Note 保存时新增 MCP 网络动作。
- 成功空列表有成功时间戳；失败不写成成功空列表；刷新结束再核对拓扑和开关，迟到结果不得覆盖新缓存，较早发现不得盖过较新结果。失败仅可回用同 topology 的旧缓存。[B9][B10][B14]

### 4.4 状态、错误与前端展示契约

测试返回 HTTP 成功也可能是 `{success:false,error:"连接超时"|"连接失败",tools:[]}`；成功为 `success:true` 和工具名称/说明。必须检查业务字段，不能仅看 HTTP 200。后端诊断日志会脱敏，管理 API 没有可直接展示的稳定详细异常/失败时间/reconcile 进度 DTO；前端不解析或要求原始异常、请求 URL 或响应正文。[B12]

工具列表：Server 关闭为 400，不存在 404，策略错误 422，恢复失败 503。工具写入：缓存缺失/拓扑改变 409，未知工具 404，无效输入 422，保存失败 500。根开关关闭且缓存有效时仍可管理工具；关闭且无缓存时不能假装已发现。配置 CRUD 多数只回 `{ok:true}`，表示保存/同步步骤已完成，**不证明异步初始化成功**。状态/缓存/测试结果应分别展示。

独立页建议：顶部总开关；Server 列表卡片；独立新建/编辑表单；单 Server 工具面板；MCP 高级区放链深。显示“已启用/最近验证状态/最后成功时间/工具选择数量”，保存后重新读安全列表，初始化期间可做有界刷新并提供手动重试。测试结果标注“本次草稿测试”，不修改保存状态。所有响应按 Server ID、编辑版本、请求序号隔离；权限/网络错误保留草稿，不自动重发配置或工具执行。

Server 名称、工具说明和 inputSchema 都按外部文本/JSON 展示，不拼进 HTML；延续旧工具面板的文本节点边界。

Penumbra 当前没有 MCP 设置页、domain client、DesktopAppId 或管理导航；已有的是 Chat 的 `mcp_loading`、工具结果卡片、系统日志投影。这些是运行结果展示，不能当作管理页已完成。旧 `/mcp` 是独立页面，可在迁移期间作为明确旧版入口；新页独立导航与返回栈适配经典/Editorial 和部署子路径，不将表单塞入 Settings 首页。[P8][P9][B18]

### 4.5 MCP 上线前的具体边界问题

| 当前问题/限制 | 影响 | 推荐替代/前置工作 |
| --- | --- | --- |
| `load_mcp_config` 在文件缺失或读取/解析异常时调用 `save_mcp_config(default)` | GET 可能创建默认文件；损坏文件可能被默认值覆盖，不能承诺“读取失败保留原配置”。 | 新页上线前拆开纯读取与显式初始化；损坏返回安全错误并保留文件。只补存储/错误边界，不重构 MCP 生命周期。 |
| `save_mcp_config` 是直接打开文件写 JSON；状态回写和管理写共享文件，无统一 revision/CAS | 写失败/中断存在文件风险，多 worker/多页面不能保证不覆盖。reconcile generation 解决运行对象迟到，不能代替文件事务。 | 对新增管理入口优先补原子保存及失败不丢旧文件，明确单实例写入模型；多写者支持需要另定并发契约。 |
| query_token 模式 URL 原样保存/投影；仅独立 token 字段脱敏 | 若用户把凭据直接放在旧 URL 的 query/path 内，普通 GET 仍可能暴露；不能笼统宣称所有 MCP 地址已安全化。此为代码路径风险，未读取实际配置证明其发生。 | 新客户端要求公开 base + 独立 token；后端先补兼容 URL 检测/安全投影与明确修正契约，不静默截断历史 URL。需要处理的旧记录不要自动 reveal 或迁移。 |
| 更新不重置旧 status/last_connected，初始化有异步阶段；缺少统一结构化失败状态 | 可能显示旧 online，无法准确做“实时连接/保存失败原因”面板。 | 首版明确“最近验证”，测试另显；若需实时健康/进度，后端先提供安全 DTO，前端不推导运行状态机。 |

上述是独立页实施前置建议，不在本轮修复。transport 扩展、额外认证方式、强制刷新 API、自动发现重试策略均不混入该 PR。

## 5. 六项历史问题的当前结论

| 必查项 | 当前结论与源码证据 | 实施边界 |
| --- | --- | --- |
| Worldbook 保存丢 `diary_auto_feed` | **具体缺陷已修复**：PUT 先 load 原对象，只 update 五个表单字段再 save；`1b5e480` 和 `test_worldbook_save_preservation.py` 覆盖 on/off/缺失、未知字段、两种同事件循环调用顺序及不额外广播。 | 不再标“必须先修 Worldbook P0”。文件仍非跨进程 CAS/事务；Persona 编辑提交的仍是其五字段，不授予 Diary 开关管理权。[B2][B15] |
| Connection 更新影响其他功能 | **会影响共享引用的后续解析/请求**：PATCH 原连接，不复制连接、不改各 binding literal；修改默认模型只影响预填。禁用/清 Key 使相关选择保留但不可执行；在途已冻结 binding 不因此改路由。 | 编辑前展示 references；仅想改变一个功能时创建新 Connection 并显式改该绑定。后端只对删除作强引用保护，不会自动阻止危险的共享编辑。Settings/SQLite 无跨存储原子性。[B4][B5] |
| Feature 有效、缺失、禁用 | **已具备独立有效读取**：features 的 selection 和 diagnostic 分离，缺失/禁用不冒充默认；只开放九个 usage，不能据 KNOWN_USAGES 生成表单。 | 保留失效的选择便于修复；清空后不 fallback；v1 投影/deferred 单列，不能用 connections 原始数组替代有效读取。[B4] |
| Main Chat 持久偏好与兼容全局字段 | **五项持久设置已完成**，模型仍会话级；温度/Thinking 按协议，float 为原共享字段；旧温度、旧 Thinking/HEART/DRIFT/format 不是新面板的别名。 | 不复制、导入或覆盖；新 Main 全局模型默认不重写已有会话，后台继承目标 Main 也不能改造成额外全局下拉框。[P4][B3] |
| cache-config 数据库副作用 | **仍存在**：先 `set_cache_config` 保存 Settings，再无 conv_id 过滤地 `UPDATE messages SET cache_region='' WHERE cache_region IN ('freeze','slide')` 并 commit。相同值再次 PUT 也执行重置。配置和 SQLite 不构成同一事务，失败可出现部分成功，setter 先改 RAM。 | 不迁普通自动保存控件。先明确显式维护动作、影响范围、失败/未知结果和恢复契约，隔离 DB 验证；不以“没有删除正文”解释成无业务影响。[B2][B8] |
| 壁纸/贴纸本地与服务端资源 | **仍为本地 Blob**：没有上传调用和服务器 Appearance 记录；重启页面能重读 IDB，不代表换设备/origin 可恢复。服务器已有通用上传，但无外观资产引用/删除回收系统。 | 第一阶段保留本地标识与数据；服务器化另立 PR，成功上传/核验/保存引用/读回前保留原 Blob。不得把 blob URL 当持久资源或把 Chat 上传接通等同外观同步。[P2][P3][B19] |

与旧清单额外不同：通用上传现在已委托 `upload_validation.py`，具有 64 KiB 分块、20 MiB 限制、UUID/exclusive 命名、图片格式/解码/解压炸弹检查及临时文件清理。旧文档的“完整读入才限流、只有 MIME 检查、毫秒命名”已过时；但依旧没有外观资产 registry/ownership/引用更新、删除/GC 与跨设备偏好契约。服务器只接受 JPEG/PNG/GIF/WebP 等明确类型，而本地 `image/*` 可能更宽，不能假设所有旧 Blob 能直接无损上传。[B19]

## 6. Settings 首页分类与独立页面

以下是实施建议，当前并未新建页面或路由。

| 首页分类 | 包含内容 | 承接方式与边界 |
| --- | --- | --- |
| 外观与本机偏好 | 已有明暗、两类颜色、壁纸；贴纸/布局可导航到桌面入口 | 保留现有本地 owner，不顺带改变同步语义；服务器资源迁移另做。 |
| API 与连接 | Connection 列表、CRUD/启停、引用、凭据、基础测试、远端模型发现 | 独立列表/详情编辑页；只使用 Registry v2。协议/模型为测试上下文或使用位置，不变成连接白名单。 |
| 模型与任务 | 九个技术 usage，状态/允许协议/来源/生命周期；Main 新会话默认、Book/Game 默认 | 独立任务分配页。已有 Main/Diary/Theater/Game 记录只提供业务导航，不在此编辑。业务策略不在此页。 |
| 服务集成 | 语音服务（TTS/ASR）、Web、Music 登录、Embedding | 各自子页/分批交付，白名单 patch，不整包保存 `/api/settings`；本机播放/麦克风不混入服务凭据。 |
| MCP 工具 | 总开关/Server/工具状态摘要与入口 | **独立 MCP 设置页**，不是“服务集成”内的一段表单，也不是 Registry tab。沿第 4 节生命周期。 |
| 系统与高级 | Session/本地 readiness、catalog、旧版入口；将来安全健康摘要、必要用户前缀 | 状态页可先迁；缓存/保活必须在后端边界清楚后独立高级页。env/cutover/内部常量不开放。 |

Persona/Worldbook、Camera、Voice 运行控制、Theater、Reading/Game 保留独立领域；Settings 只做明确导航。Diary、Memory、Quick Note、Activity、Location、Schedule/Todo/Alarm 的内容、自动化和设备配置继续在业务 App，不能再有总开关副本。

Chat 保留 Composer 模型选择、Header 五项持久设置、会话管理/搜索、系统日志；将来“管理连接”可以导航到唯一 Connection 页面并返回 Chat，不在 Chat 创建第二份管理 controller。全局技术绑定页面不能重新命名为“所有 App 设置”。

## 7. 配置作用域与存储归属

| 作用域 | 当前权威 | 代表配置 | 约束 |
| --- | --- | --- | --- |
| 当前浏览器/origin | localStorage + 两个 IndexedDB | 外观、壁纸/贴纸、布局；旧播放音量/自动播放/音色 | 不按服务端用户同步；不同端口/域名隔离，同 origin 下部署子路径不是新存储隔离。LS 可用但 IDB 丢失时不能恢复图片。 |
| 服务实例全局 | `data/settings.json` + `SETTINGS`，canonical/atomic save | v2 Connection/Feature、Main Chat 默认、float、语音/Web/Music/Embedding、缓存等 | **不是用户级多租户偏好**。配置文件原子替换不等于所有 setter 均有 CAS、失败回滚或跨 DB 事务。 |
| 独立 MCP 配置 | `data/mcp_config.json`；`mcp_tools_cache.json` 为派生缓存 | 总/Server/工具开关、endpoint 凭据、最近验证状态 | 不迁入 Registry；链深仍在 Settings 根级，只在 MCP 页面承接语义。 |
| 会话/Entry/Session | SQLite 既有字段；Theater Persona 在独立 JSON | Main `main_selection`、Diary Entry model、Theater、Game | 生命周期不同；默认变更不批量回写历史。Game 活跃 Session 保持冻结。 |
| 业务领域配置 | Worldbook、Location、Camera 等各自 JSON/Settings 字段 | Persona、diary_auto_feed、静默/家、截图/监控等 | 共用存储不代表应共用产品页面；保留非本领域键。 |
| 请求与运行时 | 请求 DTO、冻结 binding/options、进程 Voice/WS 状态 | 显式请求覆盖、fast/whisper、tts_state、工具执行状态 | 不把实时状态伪装成可长期保存的偏好。 |
| 服务器文件资源 | `data/uploads`、screenshots、TTS cache；仓库 public 为发布资源 | Chat 附件等 | 与本地外观 Blob 分开；无完整外观引用/删除协议，备份/持久卷和反代认证未经生产验证。 |
| 部署/内部策略 | env、auth 配置、构建参数、代码常量/运维文件 | VITE 端点、代理、数据目录、登录/Push、TZ、cutover、诊断、算法阈值、备份 | 不转成普通用户表单，不读取或展示真实凭据。 |

后端配合的范围：核心 Connection/Feature 表单可复用现成 API；MCP 存储/错误边界、缓存维护契约、完整系统健康、新外观资源同步/删除、Embedding 模型切换迁移，以及可靠 Voice/TTS 使用偏好需要各自后端工作。不能把这些缺口压成前端“接几个字段”。

## 8. 三类清单

分类只覆盖本轮 Settings 相关范围，不替代全系统 inventory。后端已存在不等于 Penumbra 已完成；保留在业务 App 的已完成能力不代表应移动到总设置。

| 类别 | 清单 | 第一阶段处置 |
| --- | --- | --- |
| **已完成/保留** | 本机明暗/主题/AI 色/壁纸，贴纸存储；安全运行概览；Main 模型和五项持久设置；Diary 投喂/Entry 模型；Quick Note 时段编辑；Activity 手机可见性/Wi-Fi、Location、日程及 Memory 已有入口 | 保留唯一 owner；只完善概览诊断及导航，不重复迁移或改存储。 |
| **待迁移/按边界分批** | Penumbra Connection CRUD/引用/凭据/test/fetch-models；九项技术 Feature 编辑；独立 MCP 页与工具开关；TTS/ASR/Web/Music/Embedding 服务页；Persona 独立编辑页；必要前缀；后续缓存/保活高级管理 | 首批 Connection/Feature + 独立 MCP；其余依赖第 9 节分批。业务 App 旧配置缺口仍由各领域承接，不算总 Settings 表单。 |
| **仅内部或兼容保留，不进普通设置** | env/部署地址/代理/数据路径/认证与 Push/TZ/备份/retention/算法常量；renderer cutover/shadow/诊断；原 catalog/profile aliases/旧 Pool 指针与 format；全局旧温度/Thinking/HEART/DRIFT gate；固定 true 的日程分层；工具缓存 hash/原始 schema 缓存状态 | 不构造普通编辑表单，不因隐藏 UI 删除仍有效的消费者或历史数据；无效占位“日历设置”不算功能。 |

服务器化外观、每会话 Web 授权、Streamable HTTP/stdio、OpenAI reasoning effort/budget 等是**新能力**，不伪装成“旧设置待迁”。

## 9. 已知风险与对应前置条件

| 优先级/适用阶段 | 风险 | 必须先做或推荐替代 |
| --- | --- | --- |
| 首批前端必修 | Settings readiness 新诊断码无说明；全概览 Promise.all 单项失败遮蔽其他状态 | 补安全通用文案；分项错误可在同 PR 改善，不把 Provider 不就绪误称后端离线。 |
| Connection 编辑必需交互 | 共享连接影响其他绑定；后端没有对 PATCH 作引用确认或全局 revision/CAS | 先读引用，明确共享影响；单一功能改路由则新建连接再重绑；保存读回、未知结果核对，不自动重放写入。不声称能消除跨页并发。 |
| Secret 页面必需 | 三种领域空值/替换/ref 语义不同；stale response 可能串对象 | 各 domain client 单独实现白名单、身份检查与 transient reveal，禁止通用“整包 Settings 表单”。Registry ref 失效重读后由用户决定重试。 |
| MCP 新页前置后端 | 缺失/损坏读会写默认、非原子保存、query URL 可携带凭据 | 按 4.5 补窄范围契约/合成测试；不把 reconcile 重写为新状态机，不自动转换真实配置。未解决前保留旧版入口并明确新编辑页尚未交付。 |
| 缓存编辑前置后端 | 全库标记重置，先内存/Settings 后 DB，重复同值也重置 | 明确独立维护操作与结果核对/失败恢复；Settings UI 暂不提供自动保存，隔离数据库测试通过后再启用。 |
| 旧高级 setter 上线前 | keepalive/cache/context 等仍先更新 RAM 再 save；不是 Chat defaults 的“失败不发布”契约 | 对实际迁移项逐个补候选保存/安全失败，不泛化重写全系统；首阶段可暂不开放。 |
| Embedding 切换前置 | 固定 1024 维与已有 DB 向量、SF TTS/历史连接共享 | 先核共享引用及数据重建/兼容策略；不要默认自动重嵌入，也不要覆盖其他服务凭据。 |
| Voice/TTS 使用功能前置 | 本机 Voice→Main 鉴权/DTO 缺口、旧 Chat 未完成 tts_state 同步、浏览器权限 | 独立修调用链与客户端偏好，再实施播放/唤醒；不作为 Settings 服务配置已完成的证明。 |
| 外观服务器化前置 | 本地可能是唯一 Blob，服务器暂无引用/删除/同步协议 | 用户明确触发导入，原字节上传核验、引用保存读回后再标完成；原 Blob 保留，不能清站点数据或先删旧图。 |

Worldbook 历史字段丢失 **不在必须先修清单**；现存文件并发能力的限制仍如实记录。Registry/Settings/MCP 的生产迁移状态、上游 literal 能力、真机权限、备份与资源持久性均未验证，不能据静态审计宣称生产可用。

## 10. 建议 PR 拆分、顺序与验收边界

| 顺序 | PR | 范围与依赖 | 实施时验证重点 |
| --- | --- | --- | --- |
| 0（本轮） | 现状复核 | 仅本文；停止等待人工确认 | 两边 HEAD/工作区、源码证据和文档范围。 |
| 1 | Settings 首页/导航与概览收口 | 复用外观和概览；分类导航、readiness 兜底、处理日历占位；不新增持久设置 | 两种桌面、部署 base path、返回/刷新、401/分项错误、键盘/窄屏。 |
| 2 | Connection 管理 | v2 domain adapter + 列表/详情、引用、安全凭据生命周期、启停/删除；版本状态可读，加载不迁移 | 合成 v1/v2 读取不写、共享影响、引用拒删、ref 过期/迟到响应、失败/结果未知/读回；不触碰真实 Key。 |
| 3 | Feature 分配及连接测试/发现 | 复用 PR2；九个 usage 的协议/lifecycle、literal 编辑、主动作 test/fetch-models；Chat 仅导航到唯一管理页 | 缺失/禁用/清空、不 fallback、不覆盖已有会话/Entry；发现失败仍手填、分页/身份隔离；basic test 不夸大能力。 |
| 4a | MCP 存储与安全读边界 | 先修 4.5 的纯读/原子写/URL 安全契约；保留生命周期和当前配置形状 | 仅合成文件/transport：缺失/损坏不覆盖、保存失败保留旧值、旧 URL 安全投影、既有 reconcile/cache/tool 权限回归。 |
| 4b | 独立 MCP 设置页面 | 依赖 4a；总/Server/工具、Secret、草稿测试、最近验证状态、链深；独立路由/返回栈 | 总开关不清缓存、拓扑变化失效、逐工具不发现、不串 Server、配置成功/测试失败分开、异步初始化/缓存不可用。 |
| 5（可逐项选择） | Web / Speech / Music 服务配置 | 每领域一个 PR；继续安全 GET/单字段写/显式清除；Embedding 先明确重建策略 | 不改 Chat/Voice 的执行语义；空值/替换/清除不误伤共享凭据，失败保留草稿；Provider 调用仅 fake。 |
| 6（后续） | 缓存/主动保活高级边界 | 必须先有缓存维护、持久失败与恢复契约；可先只读 | 临时 DB 验证影响范围、同值保存、Settings/DB 任一阶段失败、未知结果核对；明确调用成本。 |
| 独立后续 | Persona、Voice 闭环、服务器外观资产 | 各自独立 PR，不作为 Settings 首批附带工作 | Worldbook 非本域字段保留；Voice auth/DTO/播放权限；资产引用/格式/替换/GC/持久部署与无损导入。 |

PR2/3 的核心后端 API 已具备，不以重建 Registry 为前置；MCP 页面与普通连接表单各自审阅和回滚。第一阶段建议验收点是 PR1–4b，PR5 可按实际需要选择；PR6 和新外观资产系统不纳入首批。所有 runtime 副作用验证只在排除 data/凭据的隔离源码副本、临时文件/SQLite、fake Provider/MCP 中进行；真实迁移或服务验证另需明确授权。

本报告完成后停止。下一轮须人工确认首批范围及 MCP 前置后端修复，再开始业务实现；本轮不创建页面、调用测试连接或修改任何配置。

本轮交付校验：43 个源码引用的文件与行号、相对文档链接均有效；文档无行尾空白。结束检查确认两边分支与 HEAD 未变，Penumbra 仅新增本文，AionHome 工作区仍干净。未运行业务测试或构建，未执行任何在线验证。

## 11. 源码证据索引

以下为本轮实际 checkout 的入口，行号对应第 2 节 HEAD；历史文档只作线索。

- [P1 SettingsView][P1]：当前表单、概览和占位。
- [P2 壁纸][P2]、[P3 贴纸][P3]、[主题实现][P10]：本地存储与显示。
- [P4 Chat defaults client][P4]、[聊天设置 UI][P11]、[保存 controller][P12]：已完成的持久偏好。
- [P5 Overview service][P5]、[状态文案][P13]、[runtime mapper][P14]：安全读取与诊断展示边界。
- [P6 Diary selection client][P6]、[P7 Quick Note controller][P7]：业务入口已完成增量。
- [P8 App 挂载][P8]、[经典桌面][P15]、[Editorial][P16]、[子路径工具][P17]、[隐藏占位入口][P18]：导航边界。
- [P9 Chat MCP 执行事件][P9]：运行结果消费，不是设置管理。
- [B1 Phase 5-D][B1]、[B4 Connection 服务][B4]、[B5 Registry HTTP][B5]：Connection/Feature/Secret/探测。
- [B2 Settings HTTP][B2]、[B3 Main defaults][B3]、[Main defaults HTTP][B20]、[Main request 解析][B21]：字段消费者与保存差异。
- [B6 独立选择 API][B6]、[Diary 统一模型选择][B22]：Entry/Session 和兼容来源。
- [B7 Secret 投影][B7]、[B8 config getters][B8]：安全 DTO、默认值与持久化入口。
- [B9 MCP 缓存契约][B9]、[B10 工具开关契约][B10]、[B11 MCP HTTP][B11]、[B12 MCP client][B12]、[B13 transport][B13]、[B14 缓存选择][B14]、[endpoint 规范化][B23]：独立生命周期。
- [B15 Worldbook 保留测试][B15]：具体历史缺陷已有回归覆盖；本轮仅阅读。
- [B16 Voice HTTP][B16]、[本机发送者][B24]、[B17 Web][B17]、[B18 auth/session/静态入口][B18]：集成和状态边界。
- [B19 上传校验][B19]、[上传路由][B25]：当前文件能力，不能等同外观资产系统。

[P1]: /Users/remix/Desktop/Penumbra/src/components/settings/SettingsView.tsx:54
[P2]: /Users/remix/Desktop/Penumbra/src/lib/wallpaper.ts:1
[P3]: /Users/remix/Desktop/Penumbra/src/widgets/sticker-storage.ts:1
[P4]: /Users/remix/Desktop/Penumbra/src/domain/runtime/chat-defaults.ts:1
[P5]: /Users/remix/Desktop/Penumbra/src/application/settings-overview/settings-overview-service.ts:10
[P6]: /Users/remix/Desktop/Penumbra/src/domain/diary/diary-model-client.ts:12
[P7]: /Users/remix/Desktop/Penumbra/src/application/quick-note/quick-note-config-controller.ts:1
[P8]: /Users/remix/Desktop/Penumbra/src/components/apps/DesktopAppView.tsx:40
[P9]: /Users/remix/Desktop/Penumbra/src/application/chat-execution/chat-execution-events.ts:58
[P10]: /Users/remix/Desktop/Penumbra/src/lib/theme.ts:36
[P11]: /Users/remix/Desktop/Penumbra/src/components/chat/ChatRequestParametersMenu.tsx:1
[P12]: /Users/remix/Desktop/Penumbra/src/components/chat-workspace/chat-settings-controller.ts:1
[P13]: /Users/remix/Desktop/Penumbra/src/components/settings/SettingsSafeBasics.tsx:26
[P14]: /Users/remix/Desktop/Penumbra/src/domain/runtime/runtime-mappers.ts:15
[P15]: /Users/remix/Desktop/Penumbra/src/widgets/Desktop.tsx:369
[P16]: /Users/remix/Desktop/Penumbra/src/components/desktop-v2/EditorialDesktop.tsx:25
[P17]: /Users/remix/Desktop/Penumbra/src/lib/app-paths.ts:1
[P18]: /Users/remix/Desktop/Penumbra/src/lib/desktop-entry-visibility.ts:1
[B1]: /Users/remix/Desktop/AionsHome-main/docs/refactor/phase5d-unified-settings-contract.md:7
[B2]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:119
[B3]: /Users/remix/Desktop/AionsHome-main/aion-chat/chat_defaults.py:1
[B4]: /Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:421
[B5]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/registry.py:111
[B6]: /Users/remix/Desktop/AionsHome-main/aion-chat/registry_selection_settings.py:1
[B7]: /Users/remix/Desktop/AionsHome-main/aion-chat/settings_secret_projection.py:269
[B8]: /Users/remix/Desktop/AionsHome-main/aion-chat/config.py:310
[B9]: /Users/remix/Desktop/AionsHome-main/docs/mcp-tool-cache-invalidation.md:16
[B10]: /Users/remix/Desktop/AionsHome-main/docs/mcp-tool-toggle.md:6
[B11]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/mcp.py:77
[B12]: /Users/remix/Desktop/AionsHome-main/aion-chat/mcp_client.py:63
[B13]: /Users/remix/Desktop/AionsHome-main/aion-chat/mcp_transport.py:1
[B14]: /Users/remix/Desktop/AionsHome-main/aion-chat/mcp_tool_cache.py:13
[B15]: /Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_worldbook_save_preservation.py:106
[B16]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/voice.py:25
[B17]: /Users/remix/Desktop/AionsHome-main/aion-chat/web_search.py:32
[B18]: /Users/remix/Desktop/AionsHome-main/aion-chat/main.py:255
[B19]: /Users/remix/Desktop/AionsHome-main/aion-chat/upload_validation.py:17
[B20]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/main_configuration.py:24
[B21]: /Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py:122
[B22]: /Users/remix/Desktop/AionsHome-main/aion-chat/diary_model_selection.py:8
[B23]: /Users/remix/Desktop/AionsHome-main/aion-chat/mcp_endpoint.py:1
[B24]: /Users/remix/Desktop/AionsHome-main/aion-chat/voice.py:231
[B25]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/files.py:199
