# Chat PR7-B：系统日志与实际请求查看

状态：已在两仓库本地实施，等待人工验收；未 commit、push 或部署。使用隔离源码、临时 SQLite、假 Provider 和合成 Prompt 测试，未读取生产会话或真实凭据。

## 已迁移与修复

保留侧栏底部入口（含手机抽屉）→ Dialog → 最新记录 → 行内详情。日志在关闭 Dialog 后继续接收当前页面可观察的 SSE/WS；迁移模型/协议、Token/缓存、实际 RAG/候选评分、哨兵/话题/关键词/查询、速记、安全错误、Anthropic 返回 metadata、复制、清空和未读错误点。新事件保留已展开项及阅读锚点；只有打开日志才确认已知未读错误。

后端修复 `send_message()`、legacy `regenerate_message()` 的 Fast Mode `debug_qn` 未初始化；canonical regenerate 补协议、usage、召回等已有选择结果及失败诊断。Token 的调试投影另记真实 usage 字段是否出现，缺失/null 不伪造零；Anthropic 后续 output usage 会更新派生总计，缓存计数仍单列，不改变原计费/生成 meta 的消费。

前端按本次 HTTP 执行身份收集；send 的 SSE/WS 只有确认同一 assistant ID 才合并，并保留更完整的安全详情。canonical 同一 target 每次使用新的调试执行 ID，原生成与两次 regenerate 分开；没有可靠归属的 WS/task 保留未关联。后台失败用回执原时间排序并按 task_id 去重。诊断格式错误、投影异常和捕获失败均不改变生成 reducer 或 SSE/WS 的正常消息处理；后续连接异常不会覆盖已收到的真实上游原因。

源码：[日志 store](/Users/remix/Desktop/Penumbra/src/application/chat-system-log/chat-system-log-store.ts)、[投影](/Users/remix/Desktop/Penumbra/src/application/chat-system-log/chat-system-log-projection.ts)、[传输观察](/Users/remix/Desktop/Penumbra/src/application/chat-execution/chat-execution-client.ts)、[Dialog](/Users/remix/Desktop/Penumbra/src/components/chat/SystemLogDialog.tsx)、[阅读锚点](/Users/remix/Desktop/Penumbra/src/components/chat/useSystemLogReading.ts)、[后端路由](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py)。

## 实际请求从哪里捕获

不使用 `debug_prompt`，不从 Settings、历史或记忆库重新拼装。五个现有流式 HTTP adapter 都在 `freeze_wire_request()` 返回之后、调用 `httpx.AsyncClient.stream(..., json=payload)` 之前捕获：

| Adapter | 捕获结构与证据 |
| --- | --- |
| SiliconFlow / OpenAI | [call_siliconflow](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:947) 的最终 JSON |
| AiPro / OpenAI | [call_aipro](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:1091) 的最终 JSON |
| Custom / OpenAI | [call_custom](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:1223) 的最终 JSON |
| Anthropic 原生（含 canonical/legacy renderer） | [call_anthropic 实现](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:1685) 已组装好的 system/messages/tools/options/cache JSON |
| Gemini 兼容路径 | [call_gemini](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:1014) 的原生 contents/generationConfig 等 JSON；模型也可能在 URL 路径中 |

[chat_debug.py](/Users/remix/Desktop/AionsHome-main/aion-chat/chat_debug.py) 只投影，不修改传给上游的对象。记录阶段为 `http_json_before_send`：表示实际构造的 HTTP JSON body，不宣称包含认证 Header、底层字节序列或上游接收确认。结构、角色、顺序、工具及参数保留各协议原样；UI 默认分组阅读，原始 JSON 继续复用共享 JsonViewer，复制始终取完整安全投影原文。

每次实际 HTTP 调用都有独立快照 ID，包括既有重试和工具/Web 续写。`ContextVar` 从已认证的 send/regenerate 传播到原后台任务和续写，标记真实发起执行及路由 conversation ID；续写归于其发起执行，**不猜测续写 assistant ID**。没有继承授权页面来源的主动后台调用不捕获私人请求，也不因此补建成功日志。

## 私密内容与交付边界

- 普通日志 DTO 是允许字段投影，不保存 `prompt_messages`、原始 HTTP body、headers、binding 或配置；错误段与 metadata 复用/补齐既有安全规则。旧 WS debug 也会携带历史 Prompt，本轮将该诊断投影收敛为安全摘要，旧 `prompt_messages` 置空。事件名称、原发送位置和正常消息事件不变。
- 私人请求允许真实 Prompt、历史、记忆、HEART/DRIFT，只在“本次模型请求”内再次展开。后端必须验证登录 Cookie，结合每页随机 128-bit 身份派生隔离 owner；不同登录会话/页面不能取彼此快照。conversation 与执行类型取真实路由，不接受客户端伪造会话归属。页面可以查看自己主动发起的 A/B 请求。
- 不传入 HTTP Header；body 中的凭据键、已知配置 Secret、Bearer/Cookie 等文本以及 URL 用户信息/签名参数在后端处理。媒体 Base64/二进制变为类型、大小等占位，保留原消息/附件位置；JSON 字符串形式的工具参数同样处理。未标明类型的大型编码数据不能确定语义时，明确标不完整。
- 主 SSE 结束后仍可能有工具续写，因此私人快照不塞入 SSE，也不进入全局 WS、普通错误对象、文件或数据库。使用受保护的 `POST /api/chat/debug/drain`，每次只交接本登录页面尚未领取的有界快照，领取即移除；它不是系统日志全量查询或历史补抓 API。
- 页面存在 Chat 订阅、且已发起过请求后，每 2 秒消费交接区；SSE debug/现有 WS 失效事件也可触发消费。共用现有 socket，不增加生成 POST，不轮询生成结果或反向决定成败。401 清空私人页面内存；刷新更换页面身份并清空前端记录。

## 容量与缺口

| 层 | 边界 |
| --- | --- |
| 单次请求投影 | 最多 512 KiB UTF-8 JSON；深度 32、约 20,000 节点。文本/结构超预算或媒体引用不完整时带限制标记，`complete=false`；捕获失败返回无私密内容的失败占位 |
| 后端临时交接 | 每 owner 最近 20 次 / 4 MiB 序列化预算；全进程 16 MiB、最多 32 个 owner；owner 无新快照约 180 秒过期，30 秒清理周期。容量/过期移除只保留有界计数提示，不保存 Prompt |
| 前端当前页面 | 请求最多 20 次、payload 字符串按 UTF-16 估算共 4 MiB（不含小型对象/React 开销）；移除后有提示。普通诊断最近 200 条，达到上限时标题说明；无 localStorage/IndexedDB/数据库 |
| 展开 | 请求默认折叠；超过 128 Ki 字符需主动加载分组，或切换原始 JSON 阅读；复杂结构使用共享 Viewer 的尺寸/深度保护。关闭后不持续挂载私密详情树 |

当前[启动源码](/Users/remix/Desktop/AionsHome-main/aion-chat/main.py:517)使用默认单 worker；交接区是**进程内**的，外部若使用多 worker，必须让生成请求与该页面的交接请求落同一 worker。未验证真实部署的负载均衡，不为此引入共享存储。重启、离开 Chat 后超时、页面刷新、预算移除或交接响应丢失都可能使快照不可用，不能重建；没有快照时 UI 明示未提供，不标成完整。

`memory.py` 的独立非流式 embedding HTTP 等未经过上述 adapter 的调用、Settings 单次测试、外部 SDK/其他服务，以及没有授权页面来源的主动后台调用不在此捕获覆盖内。已覆盖路径的阶段是最终 HTTP JSON 提交前；本轮没有把未覆盖路径冒充成最终 wire 请求。

不新增生命周期状态机、持久日志、筛选仪表盘或捕获开关。没有改 PR7-A 的 receipt、30 秒超时修复、optimistic User 去重、A/B 独立执行、导航、冻结 binding/options、canonical target/persisted/HTTP 核对、未知解除条件、工具幂等或重试策略。Thinking 展示仍属 PR7-C。

## 初次实施验证与人工验收

| 检查 | 结果 |
| --- | --- |
| 前端全量 Vitest | 169 文件 / 2209 项通过；新增日志 store 与传输观察 17 项，覆盖去重、同目标 regen、缺失/零值、错误升级提醒、真实原因保留、内存、投影失败不影响 SSE、HTTP 身份及私人 WS 隔离 |
| TypeScript + 生产构建 | `npm run build` 通过；保留既有超过 500 kB chunk 提示，无新增依赖 |
| 隔离后端 | 12 个相关 suite、225 项通过，含请求投影、五 adapter 与实际 json 参数一致、两主要协议的顺序/Thinking/cache、跨事件 usage、Fast Mode、授权隔离、续写继承、多媒体/大内容/失败/过期，以及 send receipts、canonical/atomic regen、冻结 binding、defaults、renderer handoff 回归 |
| 新日志真实 Chat 浏览器 | 320/390/1280px 与 320px 短屏通过；SSE+WS 合并、两次同 target regen、工具续写第二快照、大请求延迟解析、复制、阅读锚点、关闭收集、错误未读、刷新清除、Esc/焦点恢复；pageerror 为 0 |
| 原 PR6.5 smoke | 320/390/1280px 通过，覆盖配置持久、协议隔离、send/regen、短屏/焦点与搜索 |
| 原 PR7-A interaction smoke | 1280/390px 通过，覆盖返回首页/重入、A/B 所有权、在途模型/Settings 调整、失败 regen、拒绝编辑和 499 receipt 恢复 |

新浏览器脚本：[chat-system-log-smoke.cjs](/Users/remix/Desktop/Penumbra/tests/browser/chat-system-log-smoke.cjs)。截图已检查：[390px 概要](/private/tmp/penumbra-pr7b-browser/log-summary-390.png)、[1280px 短屏](/private/tmp/penumbra-pr7b-browser/log-short-1280.png)。测试日志在 `/private/tmp/pr7b-*`，后端隔离副本在 `/private/tmp/penumbra-pr7b-backend`。

人工验收：两仓库同批运行后，以合成或可授权内容检查真实模型长流、反向代理/断网下的快照交接、真实手机键盘/返回手势、跨设备及多 worker 配置。不要用日志或快照代替 PR7-A 的权威结果对账。本轮未连接真实 Provider，未部署。

## 详情 UI 整理（2026-10-27）

仅调整前端详情呈现；捕获、授权、日志内存及生成链路没有变更，本次没有修改后端。

- 话题、查询、关键词、哨兵、上下文条数和任务来源改为普通字段；保留 `false`、真实 `0`，缺失值不补零。错误仅在安全错误数据存在时显示，复制包括错误文本、代码及已有安全上游对象。
- 实际召回与候选分区，正文按项展开；`score / vec_sim / kw_score / importance` 仅展示有效数值，候选明确不等同注入。生活速记按来源日期/时段显示，只有既有安全 `output` 可展开；隐藏内容无查看按钮，不读取 `raw_output` 或重新取正文。
- 请求以捕获的顶层字段顺序分组，仅合并相邻生成参数。OpenAI 的 system/developer 仍在原 Messages 位置；Anthropic system blocks、Gemini contents/parts、工具及缓存选项保留原顺序和字段。消息、内容块和工具默认折叠；未知复杂结构回退共享 Viewer。原始 JSON 与完整安全投影复制均保留原字符串，不按当前 Settings 重建。
- Provider 返回 metadata 仍用共享 JsonViewer。普通字段和私密正文均按纯文本换行，不执行 HTML、Markdown 或媒体 URL。新增日志复用稳定 entry/request 身份及正文阅读锚点，保留已展开阅读位置。手机为单列小字号，桌面普通字段双列，仍由 Dialog Body 统一滚动。

源码：[展示 mapper](/Users/remix/Desktop/Penumbra/src/components/chat/system-log/system-log-presentation.ts)、[普通诊断](/Users/remix/Desktop/Penumbra/src/components/chat/system-log/SystemLogDiagnostics.tsx)、[请求分组](/Users/remix/Desktop/Penumbra/src/components/chat/system-log/SystemLogRequest.tsx)、[协议结构阅读](/Users/remix/Desktop/Penumbra/src/components/chat/system-log/SystemLogWire.tsx)。共享 Viewer 只增加向后兼容的初始 `defaultMode`，现有使用者默认行为不变。

### 部署与兼容确认

“本次模型请求未提供快照”只能说明当前页面没有拿到该执行的快照。前次实施和本次整理均未部署；本次未访问远程登录态，**未独立确认远程版本**。如果远程仍是旧后端，缺少新接口/捕获实现确实会导致此提示，但它也可能由以下条件导致：

| 条件 | 处理与真实边界 |
| --- | --- |
| 新后端/代理尚未支持 drain，返回 404/405 | 部署完整 PR7-B 后端及路由；前端遇到 403/404/405 会暂停本页消费，部署后须刷新，再新发 send/regenerate。旧日志不补抓 |
| 登录或页面身份不足 | `owner_for_request()` 验证签名登录 Cookie 和 32 位 hex `X-Penumbra-Debug-Page`；发起执行还须有有效 `X-Penumbra-Debug-Execution`。单有公开 WS debug 不具备私密请求访问权；全局认证 401，私密 scope 不足 403 |
| 页面/会话或 worker 不一致 | 同一 Cookie、页面身份、进程才能领取该页快照。当前 API client 默认 `credentials: include`；同源 `/api` 反代最直接。跨域可配置，但需配套带凭据 CORS、自定义 Header 放行/转发及可用的 Cookie 策略。不能只部署静态页面 |
| 旧记录、未覆盖调用、过期/预算移除/重启/交接响应丢失 | 没有可恢复快照，不能据当前历史重建；仍以现有边界提示缺失 |

旧 Chat 的 `addSystemLog()` / `renderSystemLogList()` 继续接收扁平字段，WS 外层 `type/data` 与时机不变；SSE 的可选 `system_log` 不影响旧字段。使用隔离后端产生合成 OpenAI/Anthropic WS+SSE 事件，执行旧版真实渲染/合并函数通过，metadata、召回、候选、速记和 Token 可展示。`renderDebugPrompt(null, count)` 安全省略已退役的截断 Prompt。旧 Chat 没有页面/执行 Header，因此不会自动取得新的私人快照。此结论不包含修复旧 UI 原有的缺失评分 `.toFixed` 或按 target ID 合并限制。

证据：[页面交接 client](/Users/remix/Desktop/Penumbra/src/application/chat-system-log/chat-system-log-client.ts)、[凭据请求默认值](/Users/remix/Desktop/Penumbra/src/lib/api.ts:185)、[后端 scope](/Users/remix/Desktop/AionsHome-main/aion-chat/chat_debug.py:53)、[drain 路由](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:424)、[旧渲染](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:3131)。

### 本次验证

- 全量前端：171 文件 / 2,222 项通过；新增 mapper/详情交互 13 项，覆盖缺失/零值、实际与候选分离、隐藏正文、顺序、复制、展开保持、大请求延迟解析及畸形结构回退。
- TypeScript / 生产构建通过，保留既有大 chunk 提示。隔离后端捕获与授权 suite 23 项通过；后端源码未改。
- [定向 DOM 脚本](/Users/remix/Desktop/Penumbra/tests/browser/chat-system-log-details-smoke.cjs)：390/1280px 及 320px 短屏通过；展开、复制原文、纯字段/metadata 分离、隐藏正文、新日志阅读锚点、长文本横向溢出及唯一主体滚动，页面错误 0、API 请求 0。只用合成数据，**未截图或做大规模视觉比较**。
- 人工验收：暖纸张/Mist 的密度与字体、真实手机触摸阅读；后端部署后登录刷新页面，再新发请求验证真实反代/权限/同进程交接。本次不 commit、push、deploy。
