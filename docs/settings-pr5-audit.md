# Penumbra Settings PR5-A · 服务集成配置契约审计

审计日期为 2026-11-09。本文以两个本地 checkout 为基线。**源码事实**描述当前实现，**历史记录**用于定位设计意图与旧交付，**推断／建议**单独标注。状态、默认值与生效时机均从源码推导，生产实例配置和数据库内容未抽查。

## 1. 结论与开工基线

- **Web**可先接全局联网许可、Brave 凭据状态、显式查看与非空替换，以及到既有 `web_compression` 分配的导航。Brave 的显式清除依赖后端修正保存顺序。
- **Speech**已有 TTS Provider、各自模型、MiniMax TTS/ASR 与 ElevenLabs 的独立凭据。建议同页分区、独立保存。SiliconFlow TTS 与 Embedding 共用导入 Connection。URL 编辑需要先核验公开投影与换主机时的凭据边界。ElevenLabs 格式先只读，ASR 配置与 Voice 运行验收分别处理。
- **Music**只需管理 MUSIC_U。替换已具备持久化契约，回执只确认保存。若要完整开放凭据管理，先修正清除顺序，再决定是否需要独立的登录状态契约。
- **Embedding**只读展示模型与共享连接关系。1024 是当前默认模型的维度常量，代码会接受其他长度的向量并继续比较。可写字段本身无法证明安全切换。

| 仓库 | 开工分支 | HEAD | 开工工作区 |
| --- | --- | --- | --- |
| Penumbra，`/Users/remix/Desktop/Penumbra` | `main`，与本地 `origin/main` 相同 | `ecd8a25ad7085e4d8967a3af95ce1523a88ea6da` | 暂存、未暂存、未跟踪均无 |
| AionHome，`/Users/remix/Desktop/AionsHome-main` | `refactor-code-main`，比本地 `origin/refactor-code-main` 落后 1 提交 | `5fad4172805dc58808ea8f24ac1c641626eeffc6` | 暂存、未暂存、未跟踪均无 |

审计期间后端 checkout 经外部 pull 快进到 `9c0c2d8f3cb07d6f5161dbdd96849ca2ba362921`。收尾时仍在 `refactor-code-main`，与本地跟踪引用一致且工作区干净。两版差异仅涉及 Trojan watchdog 脚本、文档与运维测试，已确认 `aion-chat`、`AionApp` 和本轮后端参考文档无差异。Penumbra 分支及 HEAD 保持开工值，工作区仅新增本文。审计操作未 fetch 或切换分支，远端与部署版本待人工确认。Penumbra 根目录无 `AGENTS.md`，采用本轮提供的规则与上级 `/Users/remix/AGENTS.md`。AionHome 根指引要求渐进迁移并保留消息持久化、Prompt 顺序、WS 事件及 command／副作用顺序。PR5-A 属于 Phase 3 前端接入前的契约调查，本轮 Runtime 行为不变。 [AionHome 指引][A0] · [Runtime Model][A1] · [Master Plan][A2]

### 参考资料及适用性

| 历史资料 | 本轮采用范围 |
| --- | --- |
| [Phase 0 复核](/Users/remix/Desktop/Penumbra/docs/settings-phase0-review.md:144) | 服务范围、导航建议和历史风险。当前 Connection、Feature、MCP 入口以 PR2–4 和源码为准。 |
| [Settings Inventory](/Users/remix/Desktop/Penumbra/docs/settings-inventory.md:171) | 字段及旧入口索引。1024 维须区分默认与强制，当前以 BLOB 和比较代码为准。 |
| [2026-07-31 Domain Audit](/Users/remix/Desktop/Penumbra/docs/audits/settings-domain-audit-2026-07-31.md:270) | 早期 Settings、旧凭据暴露和 mock 基线。当前普通 GET 有白名单，Registry v2 已落地。 |
| [PR2](/Users/remix/Desktop/Penumbra/docs/settings-pr2.md:47) · [PR3](/Users/remix/Desktop/Penumbra/docs/settings-pr3.md:32) | Connection 凭据协议、任务分配三元组及生命周期。可复用交互，不混用凭据 DTO。 |
| [PR4-A](/Users/remix/Desktop/AionsHome-main/docs/settings-pr4a.md:32) · [PR4-B](/Users/remix/Desktop/Penumbra/docs/settings-pr4b.md:34) | PR4-A 实际位于 AionHome，Penumbra 无同名文件。MCP 的原子写入器、URL 安全投影和清除语义只适用于 MCP。PR4-B 的链深字段是普通 Settings 白名单写入的现成例子。 |
| [Phase 5-D Unified Settings Contract](/Users/remix/Desktop/AionsHome-main/docs/refactor/phase5d-unified-settings-contract.md:7) | Registry v2 权威、投影和迁移边界。历史保存验证覆盖普通 PUT 的候选发布与 Music reload，显式 clear 须单独审计。 |

## 2. 普通 Settings 与凭据安全

### GET 白名单

**源码事实。** `GET /api/settings` 从共享 `SETTINGS` 投影以下 36 个公共字段，另加 `credentials`。值以保存内容或投影默认值为主，服务模型与 URL 的有效默认值由各 Runtime getter 另行解析。四个路由计算字段是 `thinking_effort`、`anthropic_system_cache_ttl`、`anthropic_schedule_in_system` 和 `mcp_max_chain_depth`。历史 `include_simplethink` 与 `enable_hidden_simplethink` 只映射到对应 Drift 名称。 [S1] · [S2]

| 分组 | GET 字段 |
| --- | --- |
| 旧连接／辅助配置 | `custom_url`, `custom_model`, `aipro_url`, `sentinel_model`, `aux_url`, `aux_model_status`, `aux_model_memory`, `gemini_url`, `gemini_free_url` |
| Embedding | `siliconflow_url`, `embedding_model` |
| Speech | `minimax_tts_url`, `minimax_tts_model`, `tts_provider`, `siliconflow_tts_model`, `elevenlabs_tts_url`, `elevenlabs_tts_model`, `elevenlabs_tts_output_format`, `minimax_asr_url`, `minimax_asr_model` |
| Chat 与缓存 | `include_heart`, `include_drift`, `enable_hidden_drift`, `enable_hidden_heart`, `enable_thinking`, `thinking_effort`, `cache_enabled`, `anthropic_system_cache_ttl`, `anthropic_schedule_in_system` |
| MCP、切流和许可 | `mcp_max_chain_depth`, `canonical_path_enabled`, `force_legacy`, `anthropic_canonical_path_enabled`, `anthropic_force_legacy`, `web_access_enabled`, `device_context_ai_visible` |

`credentials` 是按固定字段名索引的对象。条目覆盖 `custom_key`、`aipro_key`、`brave_search_key`、`aux_key`、`siliconflow_key`、`minimax_tts_key`、`elevenlabs_tts_key`、`minimax_asr_key`、`netease_music_u`、`gemini_key`、`gemini_free_key`。每项结构为 `{configured: boolean, masked: string, secret_ref: string | null}`。空字符串和非字符串得到 `false, "", null`。非空字符串使用固定八个掩码字符，长度至少 12 时可附末四字符，有掩码碰撞保护。`configured` 仅表示存在非空字符串，空白字符串也可能显示已配置，实际 Provider 各有读取规则。白名单排除了这些字段的根级明文与原始 Registry 对象。公开 URL 字符串按保存值投影，代码未应用 MCP 的 URL 脱敏。若历史 URL 内含 userinfo、query 或路径凭据，该内容可能随 GET 返回。 [S1] · [S3]

### 读、替换、清除与失败语义

| 操作 | 当前源码契约 |
| --- | --- |
| Session 与缓存 | 四个普通路径均受网页登录 Session 保护，Push token 不能访问，未登录为 401。敏感路径中间件补 `Cache-Control: no-store`，普通路径的 Pydantic 校验错误投影为 `422 {detail:[{loc,type,msg}, ...]}`，移除原始 input。 [S7] |
| 获取引用 | 从当前 GET 的 `credentials[field].secret_ref` 获取，只在该字段非空时签发。它是 URL-safe Base64 locator 加 HMAC-SHA256，普通固定字段 locator 是 `{v:1,k:"setting",f:field}`，签名绑定当前 `{field,secret}` 和服务端 Session 签名密钥，purpose 为 `settings-secret-projection-v1`。不绑定 URL、整份 Settings 或某个浏览器 Session，无单独 TTL 或版本计数。字段值更改后旧 ref 校验失败，若恢复同值且签名密钥未变，旧 ref 可再次有效。兼容旧 API-config ref 绑定数组位置和整条记录，服务集成只取固定字段引用。普通 signer 通过旧 auth loader，正常 GET 不写 Settings，签名或 Session 校验走的旧 loader 可能初始化或补齐 auth 文件。 [S3] · [S4] · [S8] |
| 查看 | `POST /api/settings/secrets/reveal`，JSON `{secret_ref: string}`。手动读取请求 JSON 并检查类型，额外键未参与处理。成功为 `200 {secret: string}`，返回该项原值。没有读取后自动填表的需求。 [S5] |
| 显式清除 | `POST /api/settings/secrets/clear`，JSON `{secret_ref: string}`，DTO 用 `SecretStr` 且 `extra="forbid"`。成功为 `200 {ok:true}`。普通目标字段由引用定位，body 无 `field` 或 `key`。Brave、MiniMax TTS/ASR、ElevenLabs、Music 的现行分支先写共享内存的空串，再保存。Music 在保存前还会 reload。SiliconFlow 等导入连接字段转入 PUT 的候选写入分支。 [S5] |
| 过期引用 | reveal／clear 对常规无效签名、已替换、清空、未知或跨域引用返回 `422 {"detail":"Secret reference is invalid or stale"}`，有 no-store，校验失败先于 mutation。前端重读元数据并要求再次明确操作，不重放旧 ref。签名载荷内 `f` 未先检查字符串类型，伪造数组／对象可在集合查找时报 `TypeError`，因此统一 422 仍有未覆盖的畸形输入。 [S4] · [S5] |
| 替换与缺省 | `PUT /api/settings` 仅提交实际改变的字段，替换发送 `{字段名:新值}`，没有 ref/CAS，不验证掩码或 Provider。省略和 JSON null 保留字段，原始空字符串写入空值，普通 Key／MUSIC_U 因而被清空，URL 与模型由各自 getter 回退。空字符串用于 `tts_provider` 时归一为 `minimax`，`web_access_enabled` 的空字符串不通过布尔校验。SiliconFlow URL 走连接校验，变更为无效或空地址不等同于根字段的默认回退。保留凭据应通过省略实现，拒绝误粘掩码与空白替换，清除使用独立确认。 [S2] · [S6] · [R2] |
| PUT 保存与回执 | `deepcopy(SETTINGS)` → 应用字段 → `save_settings(candidate)` → 清空并更新共享对象 → 若 MUSIC_U 原始字符串改变则尝试 reload → `{ok:true}`。无同步远端校验，非 Music 普通字段无显式重启或重载。已退役的模型字段即使来自 GET，非 null 回传也可触发 `409 use_feature_binding_api`。兼容连接不存在可报 `409 use_connection_api`，候选持久化的 Registry 校验异常返回 422，OSError 包装为 `503 persistence_failed`。 [S2] · [S6] |
| 持久化异常 | 普通 PUT 在保存抛错时不会执行共享内存发布或 Music reload。原子文件写入先 fsync 临时文件再 `os.replace`。若 POSIX 在 replace **之后**打开或同步目录失败，会抛错，但磁盘已是新值，RAM 仍旧。普通 clear 的情况相反，若在 replace 前失败，RAM 已清、磁盘仍旧，Music 可能已尝试切换到匿名会话。无统一事务或补偿，客户端遇到错误或响应丢失应核对状态且不盲重试。 [S2] · [S5] · [S6] |

**Registry 对照。** `GET /api/registry/connections` 用单数 `credential` 元数据。原生 Connection ref 绑定 `registry_connection`、Connection ID 与连接快照，名称、地址、启停等变化也会改变绑定。已有 Key 的 PATCH 替换需要当前 `secret_ref`，省略／null 保留，空白与掩码拒绝。显式查看和清除走该 ID 的 `/credential/reveal` 与 `/credential/clear`，前者返回 `{secret}`，后者返回脱敏 Connection。Registry 的 `stale_secret_ref` 为 409，无效引用为 422。两类 API 共享部分签名基础设施，引用、DTO、错误及替换规则各自独立。 [R1] · [R2]

**前端建议。** 普通服务使用自己的窄 DTO 和字段白名单，共用既有 session 请求与错误处理基础。仅本页状态持有单字段新值和有意 reveal 的临时值，离开、关闭、成功回读或目标切换后清理并丢弃迟到响应。禁用自动 reveal，输入框不回填掩码或明文。避免把原始 GET、ref、草稿和错误 body 放入持久缓存、全局 store、URL、遥测或日志。更新回执后重新读取当前字段与元数据，明确区分保存结果、配置状态和服务验证结果。

## 3. 配置契约矩阵

**源码事实。** 表中 `GET/PUT` 指普通 `/api/settings`，`C[field]` 指该 GET 的 `credentials[field]`，`S` 指普通 reveal／clear 及非空替换。普通 clear 失败风险见上节。`Registry` 指现有 Connection API。生效时机是 Runtime 下次读取的边界，已取用配置的请求可能继续完成。

| 服务 | 字段 | GET来源 | 写入接口 | 凭据安全接口 | 实际消费者 | 生效时机 | 副作用 | Penumbra状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Web | `web_access_enabled` | GET 根字段，缺省 false | PUT bool | — | Main send 的 URL Reader／搜索许可，WEBSEARCH 执行复查 [S2] · [W1] · [W2] | 新一轮捕获，搜索派发时复查 | 只控制新 Web I/O，保留已有证据 | Chat 有结果投影，无许可入口 [P1] · [P7] |
| Web | `brave_search_key` | `C[brave_search_key]` | PUT 新 Key | S | `search_candidates` 的 `X-Subscription-Token` [S2] · [S5] · [W3] | 下一次 Brave 请求 | 不改变 URL Reader，空 Key 报未配置 | 无编辑器 [P1] |
| Web | `web_compression` | Registry Feature GET 的 usage | Feature PUT／DELETE | Connection 管理该绑定的 Key | `compress_candidates` 解析 binding [R3] · [W4] | 下一次需要辅助压缩时 | 缺失或失败采用证据截断／摘取 | PR3 已编辑，服务页只导航 [P3] |
| Speech TTS | `tts_provider` | GET 根字段，缺省 minimax | PUT 字符串，支持三值 | — | `get_tts_provider`，音色列表、手动合成、分段合成 [S2] · [S9] · [T1] · [T2] · [T3] | 下一次选择 Provider，分段逐段读取 | 原有 voice ID 可能不适配新 Provider | 无服务选择 [P1] |
| Speech TTS | `minimax_tts_url` | GET 根字段 | PUT 字符串 | URL 按公共字段投影 | MiniMax 合成与音色列表 [S2] · [S9] · [T1] | 下一次请求 | 已保存 Key 随新目标发出 | 无服务编辑器 [P1] |
| Speech TTS | `minimax_tts_key` | `C[minimax_tts_key]` | PUT 新 Key | S | MiniMax 合成与列表的 Bearer [S2] · [S5] · [T1] | 下一次请求 | 缺 Key 时拒绝合成／列表 | 无 [P1] |
| Speech TTS | `minimax_tts_model` | GET 根字段 | PUT 字符串 | — | MiniMax `/t2a_v2` 的 `model` [S2] · [S9] · [T1] | 下一次合成 | 空值回到代码默认 | 无 [P1] |
| Speech TTS | `siliconflow_tts_model` | GET 根字段 | PUT 字符串 | Key 见共享 Connection | SiliconFlow `/audio/speech` 的 `model` [S2] · [S9] · [T1] | 下一次合成 | 不改 Embedding model | 无 [P1] |
| Speech TTS | `elevenlabs_tts_url` | GET 根字段 | PUT 字符串 | URL 按公共字段投影 | ElevenLabs 合成与 `/v2/voices` [S2] · [S9] · [T1] | 下一次请求 | 已保存 Key 随新目标发出 | 无 [P1] |
| Speech TTS | `elevenlabs_tts_key` | `C[elevenlabs_tts_key]` | PUT 新 Key | S | ElevenLabs 合成与列表的 `xi-api-key` [S2] · [S5] · [T1] | 下一次请求 | 缺 Key 时拒绝合成／列表 | 无 [P1] |
| Speech TTS | `elevenlabs_tts_model` | GET 根字段 | PUT 字符串 | — | ElevenLabs 合成的 `model_id` [S2] · [S9] · [T1] | 下一次合成 | 空值回到代码默认 | 无 [P1] |
| Speech TTS | `elevenlabs_tts_output_format` | GET 根字段 | PUT 字符串 | — | ElevenLabs 合成 query `output_format` [S2] · [S9] · [T1] | 下一次合成 | 任意格式与固定 MP3 响应／缓存可能不一致 [T2] · [T3] | 无，建议只读 [P1] |
| Speech ASR | `minimax_asr_url` | GET 根字段 | PUT 字符串 | URL 按公共字段投影 | 本机和远端 `/audio/transcriptions` [S2] · [S9] · [V1] · [V2] | 下一次转写 | 已保存 Key 随新目标发出 | 无 Voice 或服务配置页 [P1] |
| Speech ASR | `minimax_asr_key` | `C[minimax_asr_key]` | PUT 新 Key | S | 本机和远端 ASR 的 Bearer [S2] · [S5] · [V1] · [V2] | 下一次转写 | 缺 Key 返回空转写或错误字段 | 无 [P1] |
| Speech ASR | `minimax_asr_model` | GET 根字段 | PUT 字符串 | — | 本机和远端 multipart 的 `model` [S2] · [S9] · [V1] · [V2] | 下一次转写 | 空值回到代码默认 | 无 [P1] |
| Music | `netease_music_u` | `C[netease_music_u]` | PUT 新 MUSIC_U | S | `_ensure_login` 的 `LoginViaCookie` [S2] · [S5] · [M1] | PUT 发布后同步 reload，失败后下一业务调用再试 | clear 先 reload 再保存，空值尝试匿名登录 | Chat 详情／代理播放已接，凭据无入口 [P1] · [P8] |
| Embedding | `embedding_model` | GET 根字段 | PUT 字符串，当前建议不开放 | — | Memory 与 Diary 共用 `get_embedding` [S2] · [S9] · [E1] · [E3] | 下一次生成向量 | 新旧向量可能跨维度／空间比较 | 无，建议只读 [P1] |
| Embedding／SiliconFlow TTS | `siliconflow_url` | v2 Connection `base_url`，普通 GET 有兼容投影 | Registry PATCH，旧 PUT 可映射 | 按 Connection 地址规则 | Embedding `/embeddings`、TTS `/audio/speech` 和音色列表 [R2] · [S9] · [E1] · [T1] | 下一次请求 | 同时影响两条服务，换端点可能改变向量空间 | PR2 有连接编辑，服务关系无展示 [P2] |
| Embedding／SiliconFlow TTS | `siliconflow_key` | v2 Connection `credential`，普通 GET 有 `C[siliconflow_key]` 兼容投影 | Registry PATCH，旧 PUT 可映射 | Registry credential 路由，普通 S 仅供旧入口 | Embedding 和 SiliconFlow TTS 共用 Bearer [S5] · [R2] · [E1] · [T1] | 下一次请求 | 清除影响两条服务，兼容写可固化 v2 | PR2 有凭据管理，服务页无引用 [P2] |

## 4. Runtime 消费链

### Web

- **许可。** `config.web_access_enabled()` 只认可保存的布尔 `true`。Main 新 send 在原始用户消息持久化后捕获全局许可。开启后，当前消息可触发 URL Reader，Prompt 可提供 WEBSEARCH 能力，`WebSearchTurn` 限同一轮一次搜索。命令派发还复查当下全局开关。关闭后，新轮不启动 Web 访问，尚未通过执行复查的搜索会被拦截。由读取位置推断，保存不会取消已经通过检查的网络工作，也不会让起始许可为 false 的在途轮次获得权限。 [S9] · [W1] · [W2]
- **Regenerate 与证据。** Legacy 和 target-aware regenerate 都不开放新的 Web 执行，原有证据由已保存的事件恢复到历史上下文，结果回执可继续展示。开关不删除或重抓已有 URL 证据、搜索证据与回执。 [W5] · [W6] · [P7]
- **Brave。** 搜索时读取并 trim Key，向固定 Brave endpoint 发 `X-Subscription-Token`，缺失时在发请求前返回 `provider_unconfigured`。Key 不参与 URL Reader 直接抓取。搜索内部上限为查询 300 字符、8 个候选、3 个抓取页面。URL Reader 最多识别当前消息 3 个地址。抓取 10 秒整体限额、2 MiB 响应、3 次重定向，来源和总证据预算常量分别 800 和 2000，辅助压缩调用超时 6 秒。Brave 使用 HTTP 客户端超时及显式 HTTPS proxy 环境变量。未找到用户可写的 Brave endpoint、搜索超时、抓取数量、预算或诊断设置，也未找到专用的安全配置测试接口。 [W3] · [W4] · [W7]
- **压缩。** 当证据超预算且可尝试压缩时，`compress_candidates` 解析当前 `web_compression` binding，冻结该调用的连接／协议／literal model，协议为 `openai_chat_completions`。Feature GET 提供 selection、diagnostic、allowed_protocols 和 lifecycle。缺绑定、缺凭据或压缩失败时，走本地截断／摘取，v2 清除后不会从旧 sentinel 字段复活。PR3 的 Feature API 是该模型配置唯一管理入口。Connection 的单轮测试验证模型连接，无法验证 Brave、URL 抓取或证据链。 [R3] · [W4] · [P3]

### Speech · TTS

**源码事实。** 支持 `minimax`、`siliconflow`、`elevenlabs`。空值／未知值归到 `minimax`，保存只改变选用的服务适配器。URL getter trim 后用默认值，适配器再去除尾斜杠。模型及格式以空值回退，非空白文本是否可用由远端决定，getter 不统一 trim 模型或 Key。三个适配器都在发请求前检查对应 Key，当前没有跨 Provider 凭据回退。 [S2] · [S9] · [T1] · [D1] · [D2]

| Provider | 代码默认 base URL | 认证 | 代码默认模型 | 合成与格式 |
| --- | --- | --- | --- | --- |
| MiniMax | `https://api.minimax.chat/v1` | 独立 `minimax_tts_key`，Bearer | `MiniMaxAI/MiniMax-User` | POST `/t2a_v2`，`voice_setting.voice_id`，非流式，MP3、16 kHz、128000 bitrate，超时 30 秒 |
| SiliconFlow | `https://api.siliconflow.cn/v1` | 共享 `siliconflow_key`，Bearer | `FunAudioLLM/CosyVoice2-0.5B` | POST `/audio/speech`，`voice`，固定 MP3、speed 1.0、gain 0，超时 30 秒 |
| ElevenLabs | `https://api.elevenlabs.io` | 独立 `elevenlabs_tts_key`，`xi-api-key` | `eleven_multilingual_v2` | POST `/v1/text-to-speech/{voice}`，`model_id`，query 默认 `output_format=mp3_44100_128`，超时 45 秒 |

- `GET /api/tts/voices` 使用已保存的当前 Provider，成功返回 `{provider, voices:[{uri, customName, provider}]}`，失败返回 HTTP 200 的 `{voices:[], error:string}`。列表用于语音选择。`uri` 是音色 ID，不能当播放 URL。MiniMax 首选 GET `/audio/voice/list`，失败后尝试 POST `/v1/get_voice`，兼容多种返回键。SiliconFlow GET `/audio/voice/list`，归一化对象或字符串。ElevenLabs GET `/v2/voices`，用 `voice_id` 或 `voiceId` 与 `name` 归一化，只读当前响应的 voices，无分页 DTO、预览 URL 或其他元数据。列表成功仅验证该调用。 [T1] · [T2] · [T4]
- `POST /api/tts` 请求为 `{text: string, voice?: string, msg_id?: string | null}`。DTO 的 voice 缺省为空，handler 实际要求非空。text trim 后也必须非空。成功返回原始 bytes、`audio/mpeg`。传入可清洗的 `msg_id` 会写 `tts_cache/{id}.mp3`、upsert 并提交 `message_voices`，有元数据时附 `X-Aion-Voice`。无 `msg_id` 可用作一次已保存配置的主动试听，仍会真实合成、传输文本并可能计费。失败可能返回 400 或 500 的 `{error:string}`，包含异常字符串。未找到独立、脱敏、无写入地验证未保存配置的接口。 [T2]
- 分段合成 `TTSStreamer` 在每段读取当前 Provider，写 MP3 文件后广播 `tts_chunk`。已有音频文件和消息元数据不会因设置保存而重写。格式参数可自由保存，但合成响应、缓存文件名、取回媒体类型和分段均固定 MP3。开放任意格式前须约束可接受的 MP3 选项或提供一致的媒体类型／缓存契约。Provider 切换也可能使旧音色不可用，甚至影响尚未合成的分段。 [T1] · [T2] · [T3]
- 旧 Chat 的 `aion_tts_enabled`、`aion_tts_voice` 是客户端偏好。WS `tts_state` 和 Voice 的 AI speaking 状态属于运行期，部分主动唤醒路径仍消费 WS 状态。Provider 保存不启动自动播放、不切换客户端音色，也不启动录音。 [T3] · [T4] · [T5]

### Speech · ASR

- **配置与消费者。** 三字段走普通 Settings，URL 默认 `https://api.minimax.chat/v1`，模型默认 `MiniMaxAI/Speech-01`。本机 `VoiceWakeup._asr` 与服务端 remote handler 在每次转写读取同一组配置。都向 base URL 的 `/audio/transcriptions` 发送 Bearer、multipart WAV 文件、`model` 与 `language=zh`，超时 15 秒。本机缺 Key 或失败返回空文本。远端上传失败可返回 HTTP 200 的 `{text:"",error:string}`，成功 `{text:string}`。原始异常、转写和上游结果存在日志或响应回显，现有转写接口不适合当安全配置探针。 [S9] · [D1] · [V1] · [V2]
- **Voice HTTP 契约。** `GET /api/voice/status` 返回本机单例的 `{enabled,in_call,ai_speaking,wake_word}`。`POST /api/voice/toggle {enabled,wake_word?}` 启停本机线程，返回 `{ok:true,enabled}`。`POST /api/voice/ai-speaking {speaking}` 与 `POST /api/voice/cam-check-start` 更新半双工运行状态，回 `{ok:true}`。`POST /api/voice/remote-asr` 只接受 multipart `file` 并转写，未检查本机 `voice.enabled`，也无独立持久远端启用字段或 Voice 配置路由。 [V2]
- **录音边界。** 本机用 sounddevice 和 WebRTC VAD，开关、唤醒词、录音与通话是进程状态。旧远端客户端优先走 Android 原生桥接，再回退到浏览器 `getUserMedia`，由其页面 `remoteVoice.enabled` 记录运行状态，唤醒和通话也在页面。旧页面仅持久保存麦克风来源等本机偏好，权限由系统或浏览器决定。 [V1] · [V3]
- **Voice → Main。** 本机 Voice 取最新活跃会话，向 `http://127.0.0.1:8080/api/conversations/{id}/send` POST `{content,context_limit:20,fast_mode:true,tts_enabled,tts_voice}`，超时 60 秒。没有带网页登录 Session，send 也不在 Push token 放行列表，按当前中间件应先得到 401。即使提供有效 Session 且会话模型可执行，Main 的字段校验也会因 `tts_enabled`／`tts_voice` 拒绝，返回 422 `invalid_generation_options`。调用端未 `raise_for_status` 或解析失败。旧远端客户端则把转写结果交给当前页面的聊天发送流程。配置保存回执只说明凭据与模型已保存，无法证明录音、唤醒、发送和播放闭环可用。 [V4] · [V5] · [V3] · [S7]

### Music

- **权威与登录。** `netease_music_u` 存在服务实例 `aion-chat/data/settings.json` 根字段，内存读取共享 `SETTINGS`。GET 只有该凭据元数据，非空替换与显式查看／清除见 §2。Music 使用 `strip()` 后的值，非空调用 pyncm `LoginViaCookie(MUSIC_U=...)`，空值匿名登录。会话状态为进程变量 `_inited`、`_last_login_time`，TTL 两小时。 [S1] · [S2] · [S5] · [S6] · [M1]
- **Reload。** 普通 PUT 在磁盘与 RAM 发布后、HTTP 返回前同步调用 `reload_login`，仅当字段原始字符串变化时触发。显式 clear 当前在 RAM 清空后、磁盘提交前调用，可能向上游发起匿名登录。重载清掉就绪标志与时间，再按当前配置登录。如果登录抛错，AionHome 就绪标志保持 false、时间为 0，外层吞异常，成功保存仍返回 `ok:true`。配置不会因登录失败回滚，后续搜索、详情或音频读取会再尝试，重发同值 PUT 不会主动 reload。上游库内部 Cookie 是否仍残留不在本地 AionHome 状态保证内。 [S2] · [S5] · [M1]
- **业务调用。** `GET /api/music/search?q=…&limit=…` 搜索，`GET /api/music/detail/{id}` 取详情和音频地址，`POST /api/music/play {keyword}` 搜索后返回首选和候选，`GET /api/music/stream/{id}` 用当前登录态解析新鲜音频 URL 并代理 Range。取不到 URL 时业务层强制再登录一次后重试。它们依赖登录配置但都会做真实 Music I/O，不能作为无副作用的设置读取或登录探测。未找到额外的 Music 用户服务设置或登录状态接口。请求参数、两小时 TTL 和 `aion_music_volume` 本机音量各有自己的作用域。 [M1] · [M2] · [P8]

### Embedding

- **凭据权威与兼容。** v1 的根字段是旧权威，Registry GET 可只读投影。v2 成功导入后 `model_api_registry.connections` 中带 `legacy_origin.kind=setting, source=siliconflow` 的 Connection 保存唯一 URL／Key。`legacy_settings_view` 只把 URL 与 Key 投影回内存供 getter 使用。历史缺值由代码默认 URL 补足。兼容 PUT 先捕获 Connection 状态，修改旧字段，再由 `canonical_settings_write` 把值映射回同一 Connection，移除成功转换的根级影子，提交一次文件。v1 的这类写可同时固化 v2，无法匹配导入连接时拒绝并指向 Connection API。通用新建同名 Connection 不会替代这个旧来源。 [S2] · [S6] · [R2] · [R4]
- **共享边界。** Embedding 与 SiliconFlow TTS 都使用 `get_api_url("siliconflow")` 和 `get_key("siliconflow")`。两条路径未检查 Connection 的 `enabled`、transport 或 `default_model`。禁用 Connection 不能当这两个兼容 Runtime 的停用开关。改地址或清 Key 同时影响两条链路，既有 Registry 引用还可能扩大范围。后端列表公开 `profile_aliases["legacy:siliconflow"].connection_id`，引用接口可报告 `legacy_compatibility`。Penumbra 列表 parser 当前未保留 aliases。建议通过后端返回的引用定位已有连接，无法解析时导航到连接列表并明确未确认关系，避免按名称、URL 或内部 ID 模板猜测。 [R1] · [R4] · [S9] · [T1] · [E1] · [P2]
- **向量写读。** `memory.get_embedding` 对文本预处理并截到 400 字符，向 SiliconFlow `/embeddings` 传 `{model,input}`，默认 `BAAI/bge-large-zh-v1.5`。返回直接取 `data[0].embedding`，无 `dimensions` 请求参数或长度校验。SQLite 的 `memories.embedding` 和 `diary_entries.embedding` 为 BLOB，可空，按向量实际长度打包 float，读取按字节数除以 4 解包。默认模型的 `EMBEDDING_DIMS = 1024` 在 `config.py` 定义，`memory.py` 引入但未用于校验，schema 也无维度约束。常规记忆、摘要及日记完成时会产生新向量，常规／核心／闪现召回、日记相关记忆和相似记忆检索会比较既有向量。生产 BLOB 实际维度及模型来源未测量。 [D2] · [E1] · [E2] · [E3] · [E4]
- **推断与处置。** 不同长度能进入现有 BLOB，余弦点积用 `zip` 截断到短边，范数仍按各自全长计算，可能悄悄改变召回排序。相同维度也无法保证跨模型或同名不同端点的向量空间一致。向量记录没有 Embedding 模型或版本标识，Diary 的 `model` 字段属于聊天选择。现有逐条写入／重总结或 Registry 迁移无法提供向量版本隔离、完整重建、回切或回滚保证。本轮未找到安全的切换协议。建议只读展示，任何模型切换及共享端点变更都应先确认向量兼容性。 [E1] · [E2] · [E3] · [E4]

## 5. Penumbra 接入状态

| 位置 | 当前能力与可复用边界 |
| --- | --- |
| Settings 首页与导航 | classic／editorial 共用 SettingsView。实际分类是外观与本机偏好、API 与连接、模型与任务分配、MCP 服务、系统状态。`服务集成` 目前只出现在「后续开放」静态文本，四项均无服务页。SettingsShell 已有父子页面和 History state 回退，当前分类不是独立 URL 深链。 [P1] · [P10] |
| Connection | Registry domain client、Connection DTO、引用、凭据编辑、测试与模型发现，以及页面级 `useRegistryTask`。可复用单项操作、重读和迟到保护交互，以及系统 Input、Dialog、Button、Switch。Connection 的替换 DTO 和 ref 校验保留在原 client。 [P2] |
| Feature Binding | PR3 已有九项任务的 DTO、分组、编辑弹窗与 GET／PUT／DELETE。Web 压缩已在「记忆与联网」，现有 Feature 页也支持导航到连接管理。 [P3] |
| MCP | 独立 MCP 页面、domain client、Server 草稿和校验、测试／工具／确认弹窗及任务 hook。高级项 `mcp_max_chain_depth` 通过普通 Settings 投影读取单字段和白名单 PUT。MCP URL、凭据、连接生命周期继续留在 MCP client。 [P4] |
| 应用服务及窄 DTO 先例 | Settings overview application service 仅加载 Session 和 Chat readiness 并清洗错误。Device Context 有普通 GET 的窄解析和单字段 PUT。可沿用 transport 和安全错误映射，四项尚无专用 service／DTO／表单。 [P5] · [P6] |
| Web、Voice 与音乐的业务接入 | Chat 已映射历史 Web 结果和实时回执。消息 DTO 能识别 voice 元数据，未发现 Settings 的 TTS／ASR 调用。Chat MusicCard 消费歌曲详情与代理播放，音量在本机。Music App 仍为占位，两种桌面的快捷入口与相关 Widget 被可见性过滤。 [P7] · [P8] · [P9] |

## 6. 实施分类与 PR 拆分建议

**建议。** 按下表区分存储契约和服务可用性。所有设置都按服务提交实际变更，Music、Web 许可、TTS、ASR 可各自保存，凭据的显式查看和清除按字段操作。

| 分类 | 可交付范围 |
| --- | --- |
| 已具备完整契约，可直接接入 | Web 许可、Brave 状态／显式查看／非空替换。现有 Feature 与 Connection 导航。Speech Provider 与各 TTS／ASR 模型的配置读写，普通凭据状态／查看／非空替换。Music 的保存与凭据状态／查看／非空替换，回执只承诺配置保存。 |
| 后端已有，但需要前置修正 | Brave、MiniMax TTS/ASR、ElevenLabs、Music 的显式 clear 先保存候选，再发布，Music reload 在提交后执行。修复 replace 后目录同步失败造成的回执与 RAM／磁盘分歧，并用失败注入固定边界。Speech URL 应先确认历史 URL 的公开投影安全，明确目标地址改变时的凭据确认与服务端校验。若要开放任意 ElevenLabs 格式，先固定音频媒体契约。 |
| 只能安全只读展示 | Embedding 的模型、默认维度说明与共享连接关系，以及 ElevenLabs 现有输出格式。Speech 自定义 URL 在公开值安全性未确认时仅显示是否使用默认或暂缓展示具体值。 |
| 需要后端新增契约 | 若产品要求主动配置测试，需按服务提供有界、脱敏且明确是否触网／计费的探测能力。Music 可验证的登录状态或失败回执、Embedding 模型版本与安全切换策略，须独立设计。完整本机 Voice → Main 还需明确内部调用鉴权及 DTO，归 Voice 业务后续。 |
| 不属于本轮迁移 | Web Evidence、URL Reader、Web Search 执行链、每会话联网开关及内部预算。麦克风权限、唤醒词、录音、通话、Chat 自动播放和音色偏好。本机音量、Chat Music 播放器重构和 Music App／Widget。向量批量重建、修改历史向量、增加 Embedding Feature Binding 或独立 SiliconFlow 凭据。 |

1. **PR5-B · Web 最小接入。** 在「服务集成」下设独立 Web 页面，交付许可、Brave 安全元数据与查看／非空替换，到「模型与任务分配」定位既有网页内容压缩。独立保存许可与凭据，可在 clear 修正后补齐清除。若产品要求首版具备完整清除，先合并下一个后端前置 PR。
2. **独立后端前置 · 普通 Settings 清除与提交边界。** 延续现有 DTO，把签名核验、候选持久化、发布和 Music reload 的顺序补齐，并验证失败与回读。Speech URL 安全、格式限制可按各自契约独立推进。清除入口不以空字符串 PUT 绕行。
3. **PR5-C · Speech 服务配置。** 同一子页分 TTS／ASR，分别保存。TTS 切换 Provider 只影响 Provider 字段，其他 Provider 的草稿与保存值独立。ASR 分区保存服务字段，回执仅描述服务配置状态。SiliconFlow 显示「与 Embedding 共用连接」并导航现有「API 与连接」。共享 URL／Key 由同一 Connection 入口管理。输出格式先只读，试听与 Provider 探测另行验收。
4. **PR5-D · Music 凭据。** 服务集成中的单一凭据管理入口，显示已配置状态、查看、替换和明确清除。清除前说明会尝试切换匿名登录。保存反馈使用「配置已保存」，只有后端提供独立证据时才显示登录成功。可与 Speech 并行验收，分别发布。
5. **PR5-E · Embedding 只读。** 展示已保存模型及默认回退、与 SiliconFlow TTS 的连接引用。连接管理入口保留在 PR2，提示地址变更同时影响语音与向量生成。缺少明确的模型兼容性时保留当前配置。模型编辑进入独立后续计划。

## 7. 验证与人工验收事项

- 从后端 checkout 复制必要源码与测试到临时目录，排除 `aion-chat/data` 与隐藏配置，清空进程环境并拦截网络连接和 DNS。定向运行现有 **23 条测试，全部通过**。覆盖 Settings 投影、空值／替换、过期引用、成功清除、PUT 保存失败及 Music reload 顺序、Registry v2 切换及签名、Fake Brave 请求、许可关闭、历史回放、regenerate。此结果只适用于所选用例。 [Q1] · [Q2] · [Q3] · [Q4] · [Q5]
- 另用合成凭据、失败注入和临时文件核对三个缺口。五项普通 clear 在保存前失败时均已修改 RAM，Music 的 reload spy 已看到空值。POSIX 目录 fsync 注入异常时，临时 Settings 文件已替换。直接执行源码余弦函数可为长度不同的合成向量返回分数。 [S5] · [S6] · [E1]
- 人工验收先核对拟部署版本、Registry 权威状态、SiliconFlow legacy alias 与共享影响。服务侧如需实测，须另行批准并在受控环境验证 URL 安全、有效模型、ElevenLabs MP3 兼容、ASR 麦克风与 Main 鉴权、Music Cookie／匿名状态及失败反馈。若日后考虑 Embedding 编辑，先在获准副本确认向量维度与来源分布、切换和回滚策略。
- 交付仅新增本文。未访问生产 Settings、真实 SQLite、实际凭据或 `.env` 值，未调用真实服务、保存生产配置、执行迁移或 Runtime reload。后端 checkout 的外部快进及收尾状态见 §1。报告交付后等待人工验收。

[A0]: /Users/remix/Desktop/AionsHome-main/AGENTS.md
[A1]: /Users/remix/Desktop/AionsHome-main/docs/aionhome-runtime-model.md:516
[A2]: /Users/remix/Desktop/AionsHome-main/docs/aionhome-refactor-master-plan.md:211
[S1]: /Users/remix/Desktop/AionsHome-main/aion-chat/settings_secret_projection.py:33
[S2]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:66
[S3]: /Users/remix/Desktop/AionsHome-main/aion-chat/settings_secret_projection.py:139
[S4]: /Users/remix/Desktop/AionsHome-main/aion-chat/settings_secret_projection.py:453
[S5]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:694
[S6]: /Users/remix/Desktop/AionsHome-main/aion-chat/settings_persistence.py:9
[S7]: /Users/remix/Desktop/AionsHome-main/aion-chat/main.py:155
[S8]: /Users/remix/Desktop/AionsHome-main/aion-chat/auth.py:23
[S9]: /Users/remix/Desktop/AionsHome-main/aion-chat/config.py:259
[D1]: /Users/remix/Desktop/AionsHome-main/aion-chat/provider_defaults.py:2
[D2]: /Users/remix/Desktop/AionsHome-main/aion-chat/config.py:51
[R1]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/registry.py:154
[R2]: /Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:507
[R3]: /Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:546
[R4]: /Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:290
[W1]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1420
[W2]: /Users/remix/Desktop/AionsHome-main/aion-chat/reply_result_execution.py:81
[W3]: /Users/remix/Desktop/AionsHome-main/aion-chat/web_search.py:31
[W4]: /Users/remix/Desktop/AionsHome-main/aion-chat/external_content.py:649
[W5]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2922
[W6]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:5230
[W7]: /Users/remix/Desktop/AionsHome-main/aion-chat/url_reader.py:22
[T1]: /Users/remix/Desktop/AionsHome-main/aion-chat/speech/tts.py:19
[T2]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:390
[T3]: /Users/remix/Desktop/AionsHome-main/aion-chat/tts.py:191
[T4]: /Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:2155
[T5]: /Users/remix/Desktop/AionsHome-main/aion-chat/ws.py:30
[V1]: /Users/remix/Desktop/AionsHome-main/aion-chat/voice.py:117
[V2]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/voice.py:16
[V3]: /Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:1780
[V4]: /Users/remix/Desktop/AionsHome-main/aion-chat/voice.py:231
[V5]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:638
[M1]: /Users/remix/Desktop/AionsHome-main/aion-chat/music.py:14
[M2]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/music.py:18
[E1]: /Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:110
[E2]: /Users/remix/Desktop/AionsHome-main/aion-chat/database.py:107
[E3]: /Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:573
[E4]: /Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:671
[P1]: /Users/remix/Desktop/Penumbra/src/components/settings/SettingsView.tsx:12
[P2]: /Users/remix/Desktop/Penumbra/src/domain/registry/registry-client.ts:26
[P3]: /Users/remix/Desktop/Penumbra/src/domain/registry/feature-bindings.ts:1
[P4]: /Users/remix/Desktop/Penumbra/src/domain/mcp/mcp-client.ts:104
[P5]: /Users/remix/Desktop/Penumbra/src/application/settings-overview/settings-overview-service.ts:9
[P6]: /Users/remix/Desktop/Penumbra/src/domain/device-context/device-context-client.ts:8
[P7]: /Users/remix/Desktop/Penumbra/src/domain/message/web-receipt-mappers.ts:16
[P8]: /Users/remix/Desktop/Penumbra/src/components/media/MusicCard.tsx:10
[P9]: /Users/remix/Desktop/Penumbra/src/lib/desktop-entry-visibility.ts:1
[P10]: /Users/remix/Desktop/Penumbra/src/components/settings/SettingsShell.tsx:28
[Q1]: /Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_settings_secret_projection.py:100
[Q2]: /Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_explicit_secret_clear.py:218
[Q3]: /Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_registry_writes.py:170
[Q4]: /Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_connection_registry_v2.py:264
[Q5]: /Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_web_search_v1.py:609
