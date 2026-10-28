# Penumbra Chat PR7-C-B：Thinking 展示修复记录

2026-10-28。已实施，等待人工验收；未 commit、push、deploy。只使用源码、合成 HTTP/SSE/WS、临时 SQLite 和独立浏览器配置；未调用真实 Provider，未读取私人会话、真实数据库或凭据。

## 修复与最终行为

| 缺口 | 实施结果 |
| --- | --- |
| F1：控制范围提前结束 | 显示扫描器跟踪 Thinking 深度，嵌套/重复 START 段判为畸形并隔离到明确的外层 END；孤立 END 不进入正文。DRIFT/SIMPLETHINK 与其他方括号私有范围使用嵌套、引号/转义隔离，不在内层 `]` 返回正文。Thinking 内已知私有命令和嵌套 meta 被过滤；历史 `thinking` 字段也只在展示入口过滤，原值仍用于回执核对 |
| F2：Gemini parts | 仍选现有第一个 candidate，按顺序遍历全部 parts；只输出非 `thought:true` 的字符串 text，跳过非文本/异常 part。thought 不显示为正文或 Thinking，不增加任何请求参数或能力 |
| F3：DRIFT 权限事实 | 三条既有 SSE start 增加可选布尔 `drift_enabled`，值仅来自后端 `hidden_drift_enabled()`。为真且首个 DRIFT 完整、无嵌套时可在落库前显示；未闭合、畸形、明确禁用或旧后端缺字段时不提前显示。HTTP 确认的独立 `drift` 继续使用 SimpleThink；不读前端 Settings 推断，不改 HEART 入口 |
| F3：失败详情旁路 | 合成失败测试发现错误详情拒绝规则原先遗漏 DRIFT/SIMPLETHINK；补入两种私有标记，防止它们通过错误文字出现。未改错误生命周期、日志采集或请求捕获 |
| F4：分段与临时结果 | 完整 Thinking 段分别 trim，以 `\n\n` 连接；内部区分完整段与开放临时段。EOF 不放出残缺控制前缀、不补 END；合法开放文本仍作为临时结果保留，HTTP 接管后只显示权威字段。未改变 PR7-A 的 receipt、超时、失败、结果未知与恢复流程 |

正常 Thinking 继续实时更新，沿用原有折叠、纯文本展示和 Chat 主滚动；首正文到来后不会强制折叠。未修改 ThinkingBlock、Markdown 架构、气泡拆分、样式、参数配置、Runtime Binding、缓存、数据库或历史结构。

## DRIFT 两类开关核对

源码明确分离：`config.hidden_drift_enabled()` 决定生成能力及意外输出清理；`include_hidden_drift()` 是“功能开启且 AI 回显开启”，只用于历史上下文恢复。canonical `_prepare_canonical_regenerate_output()` 保存门控只调用前者。**没有发现把回显关闭当作禁止保存/展示的分支，因此未修改这两类开关。**

| 功能启用 | AI 回显 | 本轮能力指令 | 意外/正常输出的最终保存 | Penumbra 新流 | 后续上下文注入 |
| --- | --- | --- | --- | --- | --- |
| 关 | 关 | 不提供 | 意外 DRIFT 被现有规则过滤 | 不展示原始 DRIFT | 不注入 |
| 关 | 开 | 不提供 | 意外 DRIFT 被现有规则过滤 | 不展示原始 DRIFT | 不注入 |
| 开 | 关 | 提供 | 正常解析并保存 | 完整合法首段可显示 | 不注入 |
| 开 | 开 | 提供 | 正常解析并保存 | 完整合法首段可显示 | 注入 |

已有历史 `drift` 的展示不因“禁止 AI 回显”被删除。矩阵已分别通过 send、canonical regenerate、legacy regenerate 的实际路由/临时库测试，并验证下一轮 send 的上下文标记。

SSE 增量契约示例：`data: {"type":"start","id":"…","drift_enabled":true}`。不新增 WS 事件或字段，不改变原事件顺序；不把 `include_drift` 传入前端权限判断。此值是 start 时的后端功能事实，HTTP 最终结果仍为权威；未新增执行期间的设置锁定或 gate 冻结策略。

## 修改文件

Penumbra 业务改动：

- [chat-send-accumulator.ts](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-accumulator.ts)：显示隔离、Thinking 分段及受后端许可的完整 DRIFT 流式投影。
- [chat-execution-events.ts](/Users/remix/Desktop/Penumbra/src/application/chat-execution/chat-execution-events.ts)、[chat-execution-types.ts](/Users/remix/Desktop/Penumbra/src/application/chat-execution/chat-execution-types.ts)：兼容可选的布尔功能事实；缺失/非布尔不授予流式展示权限。
- [chat-message-presenter.ts](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/presentation/chat-message-presenter.ts)：只过滤历史 Thinking 展示，不改 canonical 原值。
- [assistant-failure.ts](/Users/remix/Desktop/Penumbra/src/domain/message/assistant-failure.ts)：错误详情拒绝 DRIFT/SIMPLETHINK 控制串。

Penumbra 测试：新增 [chat-thinking-display.test.ts](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-thinking-display.test.ts)、[chat-thinking-smoke.cjs](/Users/remix/Desktop/Penumbra/tests/browser/chat-thinking-smoke.cjs)；更新 `chat-current-wire.test.ts`、`chat-send.test.ts`、`chat-regenerate.test.ts`、`chat-generation-flow.test.tsx` 的新旧 SSE 及 HTTP 接管断言。`chat-generation-flow` 和 `tests/integration/chat-send-proxy.test.ts` 的 fixture 单独处理 PR7-B 异步 drain，避免把诊断请求误计为生成重试；日志业务逻辑未改。

AionHome：

- [ai_providers.py](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py)：仅 Gemini 响应 parts 读取。
- [routes/chat.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py)：仅 send、canonical/legacy regenerate 三处 start 增加功能事实；所有保存/gate/上下文代码不变。
- 新增 [test_gemini_text_parts.py](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_gemini_text_parts.py)、[test_drift_display_contract.py](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_drift_display_contract.py)；更新 `test_canonical_regenerate_route.py` 的两处 start 精确契约断言。

## 兼容边界

- 旧后端未给出 `drift_enabled` 时，正文与 Thinking 仍可流式；DRIFT 等 HTTP 明确字段后显示。新后端对旧客户端是 SSE 可选字段增量。
- 仅首个完整、无嵌套的 DRIFT 在流中展示；复杂/畸形范围不猜测后端最终提取结果，后续由现有 HTTP 投影接管。保留 SIMPLETHINK 的历史兼容，不将其解释为 Provider reasoning。
- 开放 Thinking 是未提交临时文本；断流后不声称已保存，不从原始流或日志恢复私有尾部。完整 Thinking 的内容投影与刷新一致；开放尾部是否落库仍由原后端规则决定。
- OpenAI-compatible 继续只消费 `delta.content`，不猜 `reasoning_content`、`reasoning` 或 `<think>`；Anthropic 摘要/原生可读 Thinking 按实返回显示，不重建签名或 redacted 内容。
- 旧 content-only Thinking 仍保守过滤；搜索/Context Dialog 的公开白名单和 HEART 专属读取不变。

## 验证与验收

| 验证 | 结果 |
| --- | --- |
| `npm test` 全量前端 | **176 个文件、2294 项通过**，含 PR7-A receipts/超时/失败/未知结果及 PR7-B 日志/快照回归 |
| 类型检查与生产构建 | `npx tsc -b` 及最终 `npm run build`（含 `tsc -b`）通过；保留既有大 chunk 提示，未为此扩展拆包范围 |
| 隔离后端 | **160 项通过、2 项 deselected**：Gemini/OpenAI-compatible、DRIFT 四组合及三条路由、Anthropic Thinking/redacted/signature、canonical regenerate、send receipts、atomic replacement、upstream errors、PR7-B capture |
| 关键浏览器 | 320/390/1280px 通过键盘展开/收起、展开时流式更新、功能开/回显关 DRIFT、A/B 隔离、HTTP 刷新、复制仅正文、万字长文本/长 URL/代码围栏的横向边界；页面错误为 0，无截图 |

后端在 `/private/tmp/penumbra-pr7c-thinking-fix` 的纯源码隔离副本运行，未导入原仓库运行配置。两项 deselected 是审计已记录的旧 `api_configs` round-trip 测试，属于配置范围，未修改，不能据本结果声称后端全量 suite 通过。

新增解析用例枚举全部二分切点及逐字符输入，覆盖畸形嵌套、HEART/DRIFT 混入、残缺前缀、完整段聚合、开放临时段及错误详情。集成测试验证 send/canonical regenerate 的 HTTP 接管和 A/B 显示隔离；浏览器只使用合成数据及独立临时 profile。浏览器脚本复用现有 `chat-pr3.html` 与 mock fixture，启动本地 Vite 时可将 `PENUMBRA_DEV_PROXY_TARGET` 指向 `http://127.0.0.1:9`，所有 API/WS 均由 fixture 拦截。

测试记录：`/private/tmp/penumbra-pr7c-all-tests.log`、`/private/tmp/penumbra-pr7c-backend-final.log`、`/private/tmp/penumbra-pr7c-build.log`、`/private/tmp/penumbra-pr7c-browser.log`。首次全量测试中的诊断 drain 计数问题已修正 fixture，最终全量通过；首次浏览器初始化遇到 Vite 依赖优化缓存失效，重建缓存后通过，无产品渲染改动。

人工验收建议：在待发布环境确认功能开/回显关时 DRIFT 正常显示、后续上下文不回注；确认真实断网后的待确认提示、真实模型摘要语义，以及手机软键盘/触屏阅读。真实 Provider、真实网络中断和线上版本不在本轮合成验收范围。

**需要重新部署 AionHome 后端**，以生效 Gemini 修复和 SSE 功能事实；Penumbra 前端也需要发布才能生效解析隔离。当前均未部署，等待人工验收。旧后端组合的 DRIFT 降级行为如上，不修改历史数据。
