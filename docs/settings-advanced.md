# Settings 高级设置与 Chat 高级控制

2026-11-11 · 本轮范围依据 [Settings 第二轮审计](./settings-inventory-followup-2026-11.md)。

## 全局 Settings → 高级设置

「高级设置」接替「系统状态」的导航位置，提供「缓存配置」与「缓存保活」两组配置。Session 和 Chat readiness 的后端接口继续服务原有调用方。

| ID | 配置 | 读取 | 单字段写入 | 默认值和 Runtime 消费者 |
| --- | --- | --- | --- | --- |
| C14 | 缓存总开关 `cache_enabled` | GET `/api/settings` | PUT `/api/settings/cache-toggle`，`{cache_enabled}` | `true`。后续消费该字段的 Anthropic system / history 构造读取当前缓存策略。历史固定 AiPro 调用的 system adapter 仍沿用自己的默认策略。 |
| C17 | Anthropic System Cache TTL `anthropic_system_cache_ttl` | GET `/api/settings` | PUT `/api/settings/anthropic-system-cache-ttl`，`{ttl}` | `1h`，可选 `5m`。后续 Anthropic system prompt 构造使用新值，冻结历史缓存的 TTL 仍为 `5m`。 |
| C18 | 服务端缓存保活 `cache_keepalive_enabled` | GET `/api/settings/keepalive` | PUT 同路径，`{cache_keepalive_enabled}` | `true`。Activity 日间与夜间保活检查每次读取。 |
| C19 | 回复间隔阈值 `cache_keepalive_threshold_min` | GET `/api/settings/keepalive` | PUT 同路径，`{cache_keepalive_threshold_min}` | `50` 分钟，写入接受整数，后端限制为 1–55 分钟。Activity 用它比较距最近 assistant 回复的时间，日间还用它约束重复触发的间隔。 |

四项均写入 AionHome 实例的 `aion-chat/data/settings.json`。C14 和 C17 在旧端有编辑器，C18 和 C19 原本只有后端接口与消费者，旧前端无配置 UI。Penumbra 在写入确认后重新 GET，两组均使用服务端读回值。保活关闭时隐藏阈值，重新启用后显示后端已保存的阈值。浏览器语音播放使用独立的保活路径。 [设置路由](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:368) · [旧端缓存设置](/Users/remix/Desktop/AionsHome-main/aion-chat/static/settings.html:1025) · [缓存构造](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:2601) · [Anthropic System TTL](/Users/remix/Desktop/AionsHome-main/aion-chat/prompts/builder.py:139)

Activity 线程由服务启动，先检查一次，此后每轮检查结束再等 300 秒。两项配置在下一次进入日间或夜间检查时生效。循环在速记触发时间前后 10 分钟跳过保活。日间检查避开静默时段，夜间检查在静默时段运行且每天最多触发一次。满足条件后走现有主动问候调用链。缓存总开关与保活开关各自被消费，关闭缓存总开关仍可能触发已开启的保活。 [启动](/Users/remix/Desktop/AionsHome-main/aion-chat/main.py:112) · [日间检查](/Users/remix/Desktop/AionsHome-main/aion-chat/activity.py:847) · [循环](/Users/remix/Desktop/AionsHome-main/aion-chat/activity.py:913) · [夜间检查](/Users/remix/Desktop/AionsHome-main/aion-chat/activity.py:1010)

C15 `cache_freeze_size` 与 C16 `cache_slide_max` 保持无编辑入口。其旧写入路径会在更新 JSON 后执行全库 SQLite 缓存分区重置，仍需单独治理跨存储一致性与失败恢复。 [旧写入路由](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:568)

### D07 · Provider 用户标识前缀

本轮暂缓 D07。旧设置页通过 GET `/api/settings/user-info` 读取 `user_prefix`、内部 `user_id` 和最终 ID，通过 PUT `/api/settings/user-prefix` 提交 `{prefix}`。旧页与后端均去除首尾空白，设置写入根字段 `user_prefix`。后端把非空前缀和实例生成的 UUID 拼为 `<prefix>-<user_id>`，作为 `metadata.user_id`；清空后使用原 UUID。新界面没有调用这两个编辑接口，也没有展示内部 ID。 [旧端读写](/Users/remix/Desktop/AionsHome-main/aion-chat/static/settings.html:947) · [API](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:842) · [元数据构造](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:841)

该前缀是实例级配置。使用 Anthropic Messages 的适配器以及 SiliconFlow、AiPro、Custom 的 OpenAI-compatible 适配器会随请求发送 metadata，包括借用这些适配器的 Registry Connection。Gemini 原生适配器没有这项投影。Main Anthropic 在请求入口捕获 metadata，兼容路径可在组装 payload 时读取。修改会改变后续相关请求的上游身份标识，影响范围取决于 Connection 实际选择的协议和端点。 [协议派发](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:2576) · [OpenAI-compatible payload](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:927) · [Gemini payload](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:993) · [Anthropic payload](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:1495) · [Main 快照](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1362)

本地代码中，前缀未参与 Prompt 内容、缓存断点、冻结区标识、缓存隔离或分区重置。Anthropic 公共文档将该元数据字段用于上游请求身份标识及滥用检测，将 Prompt Cache 命中描述为缓存断点前的 Prompt 匹配，并按 workspace 或平台规定的组织边界隔离。据此推断，单独修改前缀不会按公开契约触发 Anthropic Prompt Cache 重建，且没有可确认的命中收益。第三方代理的路由、缓存键和身份校验取决于代理实现，项目未建立跨端点行为契约，本轮也未发出真实 Provider 请求。 [Claude Messages API](https://platform.claude.com/docs/en/api/http/messages) · [Anthropic Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)

## Chat → 聊天设置 → 高级控制

Chat 内提供四个开关。读值使用 GET `/api/settings` 的安全投影，保存时每次只发送被修改的字段，收到写入确认后重新 GET。四项均为同一服务实例的 `settings.json` 根字段，Chat 与 Diary 共用。

| ID | 字段 | 写入 | 默认值 | 用途 |
| --- | --- | --- | --- | --- |
| C12 | `include_heart` | PUT `/api/settings/context_toggle` | `true` | 向 AI 回注已有 HEART 历史，需同时开启 D10。 |
| C13 | `include_drift` | PUT `/api/settings/context_toggle` | `true` | 向 AI 回注已有 DRIFT 历史，需同时开启 D09。 |
| D10 | `enable_hidden_heart` | PUT `/api/settings` | `false` | 控制 HEART 生成指令及现有输出处理 gate。 |
| D09 | `enable_hidden_drift` | PUT `/api/settings` | `false` | 控制 DRIFT 生成指令及现有输出处理 gate。 |

历史开关和生成开关独立存储。关闭历史回显，生成仍可继续，已存历史保留，DRIFT 仍由消息读取路径返回给用户。关闭生成后，后续构造省略对应指令，后端清洗意外输出的禁用标记，既有解析、命令执行和持久化流程继续按原契约运行。旧 `include_simplethink` / `enable_hidden_simplethink` 由后端迁移和兼容。 [设置投影](/Users/remix/Desktop/AionsHome-main/aion-chat/settings_secret_projection.py:75) · [配置 gate 与清洗](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:185) · [Main 输出处理](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2271) · [DRIFT 消息投影](/Users/remix/Desktop/AionsHome-main/aion-chat/chat_public_display.py:148)

Main 的发送和重生成，以及 Diary 的对话和重生成，共用后端的历史 gate。Main 构造 Prompt 时应用相应能力开关，Diary 也在自身 Prompt 中根据同一配置拼接指令。Memory 的 HEART 历史消费者继续使用同一 gate。写入后由后续 Prompt 构造、流式开始或输出清洗阶段按原方式读取，已组装的请求不会被前端重发，后端也没有为这些字段提供统一的在途请求快照。 [Main 历史](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1550) · [Anthropic 能力块](/Users/remix/Desktop/AionsHome-main/aion-chat/prompts/builder.py:267) · [Diary 历史](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:921) · [Diary 指令](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1020) · [Diary 输出](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1167) · [Memory 消费](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:456)

## 验证与限制

- `npm test` 通过，220 个测试文件、2,972 个用例。TypeScript、生产构建与 `git diff --check` 通过，Vite 报告入口 chunk 超过 500 kB。
- 合成浏览器验证通过。全局设置覆盖 Classic / Editorial 各自的 320、390 和 1440px，验证导航、四项保存与刷新读回、阈值显示、服务端错误和布局。Chat 覆盖 320、390 和 1280px，验证四项独立写入与读回、短视口滚动、DRIFT 历史显示及原参数交互。Diary 模型、MCP、Memory 和 Speech 的现有浏览器回归通过。 [Settings 浏览器测试](../tests/browser/settings-pr1-smoke.cjs) · [Chat 浏览器测试](../tests/browser/chat-advanced-settings-smoke.cjs)
- AionHome 隔离副本的 180 个契约用例通过，覆盖 Main 发送及两条重生成路径、DRIFT 禁用时的意外输出清洗、历史回显与生成的组合、HEART 能力与历史 gate、Diary 的私有输出与消息顺序，以及 Anthropic 缓存策略。
- 隔离 ASGI 路由和临时 `settings.json` 探针通过。实际 GET/PUT、写后读回、文件重载和 C19 上限均验证通过。Activity 真实循环以模拟时钟运行，验证日间和静默时段均能在下一轮消费更新的阈值与开关。上游调用用测试替身截断。
- 旧版写入路径仍保留原有并发与持久化契约。C12/C13、C14、C17–C19 会先更新进程内配置再落盘，异常时服务端内存与文件可能有差异。界面显示保存错误并提供重新读取，读回只证明服务端当时返回的配置。跨客户端刷新仍通过重新进入页面或重新读取完成。
- 生产实例、真实 Provider 缓存命中率与实体移动设备留待人工验收。
