# Chat PR1 — 契约对齐与验收记录

日期：2026-10-23（Asia/Shanghai）。PR1 保持未提交，未 push、部署或使用浏览器自动化。

PR0 已独立提交：`cfbde6debf4847e26ea5ddb26d344535acca462e`，提交仅包含 `docs/chat-implementation-audit.md`。实施前 Penumbra 工作区干净，本轮未重复提交 PR0。

## 当前契约映射

| 边界 | 当前处理 |
|---|---|
| HTTP history | `drift` → 现有 Domain/UI 的 `simpleThink`，保持 Thinking 独立；HTTP 不要求 `simple_think` |
| 旧 HTTP / receipt | 仅 wire reader 接受 `simple_think`。只要 canonical `drift` 属性存在，包含 null/空字符串，始终优先；冲突忽略旧值；canonical 类型错误时拒绝，不回退旧值。HTTP 两字段均缺省时归一为 null；persisted receipt 两字段均缺失仍为格式错误 |
| canonical `event: persisted` | 读取 `{id,content,thinking,drift}`；原目标 ID、start ID、receipt ID 与 HTTP 投影确认仍受保护。空可选文本按原规则归一为 null，必须 receipt + 最终 HTTP 匹配才确认成功 |
| SSE chunks | 跨 chunk 保留控制标记前缀；DRIFT/旧 SIMPLETHINK 进入独立辅助展示，THINKING 进入 Thinking；HEART、当前内部命令、meta 不进入正文。MCP 内嵌数组和引号中的括号也不会使控制内容提前结束 |
| canonical failure | `type:error {id,code}` 与后续最小 `debug {msg_id,has_error,error_code}` 均可解析；已知 provider/重生成失败码使用安全文案；未知失败安全降级；不保留 endpoint、Prompt、payload、任意错误原文。先保留的真实失败不会被后续格式错误覆盖 |
| WS | 保持既有协议和 `simple_think` 兼容形状；仅作为失效通知与 HTTP 重读协调依据 |
| Conversation | 保留 `main_selection` 与 `main_selection_diagnostic`。旧 `modelKey` 继续表示兼容字段，不参与当前模型选择的执行资格判断 |
| Main configuration | `GET /api/main/configuration?conv_id=...` 读取当前会话；省略 conv_id 单独读取新会话默认。canonical `connection_selection` 存在时优先于 legacy selection；支持 profile 兼容读取 |
| Readiness | `GET /api/chat/readiness?conv_id=...`；不再用 model query 冒充会话状态。当前 Main Chat 不请求 `/api/models`，catalog membership 不再阻止发送或重生成 |
| 模型保存 | `PUT /api/conversations/{id}` 仅传 `main_selection:{connection_id,protocol,model}`；不双写旧 model。保存后重新读取摘要、configuration、readiness，确认身份；未确认时阻止发送并保留只读恢复 |

## 模型来源与 Readiness

当前模型显示来自会话 configuration 的 canonical selection；发送/重生成资格来自同一会话 readiness，并验证 configuration 与 readiness 的 literal 一致。并发变化导致不一致时，保留可读历史并阻止执行。

最小入口位于原 Chat 页头下面的折叠区域：选择 Connection、协议，直接填写 literal。协议候选取 Main `allowed_protocols`，按 Connection transport 限制：direct 使用 Main 允许集合，两种 Cloudflare transport 仅 Anthropic；未知 transport 不猜测可用协议。`default_model` 只在用户明确选择 Connection 后预填草稿，不自动选择协议、不保存、不代表 Main 默认。

已保存但缺失/禁用/不可执行的连接、协议和 literal 保持可见，不切到其他连接。新会话默认只读，当前会话保存不写全局默认。profile/Gemini 等旧选择保持读取身份；本轮新写入使用当前 canonical Connection 选择。

Readiness 保留安全 reason code，覆盖选择缺失/无效、连接缺失/禁用、协议不兼容、凭据缺失、URL/Registry 配置问题、历史迁移诊断和会话不存在。未来合法新 code 安全降级为不可确认，不令整个历史页面失败。401/403 仍按鉴权失败处理；网络、超时、服务或格式错误降级为不可确认，历史仍可读取。Readiness 只说明本地配置，不证明远端余额、网络或模型能力。

配置保存、会话切换、列表刷新使用 owner/sequence/AbortSignal 丢弃旧响应。WS 列表刷新每次失效当前 configuration/readiness，不依赖旧 `conversation.model` 是否变化；保存期间暂停发送。取消正在保存的 A 并切换到 B，不让 A 的旧响应覆盖 B；若切换失败，A 在重新读取前保持不可确认。

界面说明保存会更新会话时间，可能使其成为最近 Main 会话，Camera、Location、闹钟、查岗、Activity greeting、速记 Step2 仍可能跟随最近 Main 的模型或目标。没有改变这些任务的绑定/目标，也没有热切换已启动 Runtime。

## 错误、超时与恢复

- HTTP 历史始终是持久化权威，SSE 仅展示生成中内容。重生成保持原 ID、旧持久历史及回执比较；有传输错误也不跳过成功确认保护。
- 明确的 4xx 拒绝与 canonical failure 进入安全错误反馈；恢复按钮重新读取历史和有效配置，不调用 send/regenerate。
- 请求打开阶段网络失败、超时、5xx 或无法处理响应时，先只读 HTTP。未收到响应头不表示用户消息未保存；草稿仍保留，界面不自动重发。
- 断流后，send 需在 HTTP 中确认预期 assistant ID；regenerate 仍需原目标 start + persisted receipt + HTTP 同 ID/正文/Thinking/DRIFT 匹配。无法确认则保留“结果未知”。成功重读后展示 HTTP 历史，不用临时 overlay 掩盖旧重生成目标或制造第二条乐观用户消息。
- “重新读取状态”可反复只读；没有成功 HTTP 重读时不允许解除未知状态。成功重读但后端是否结束仍未知时，用户可明确选择“已核对历史，返回编辑”，界面说明这不会停止后台生成，并提醒避免重复提交。此操作不证明完成、不自动提交草稿。
- Main Chat 响应头等待仍使用配置的 request timeout（默认 30 秒）；收到成功响应后改用每次收到字节重置的 120 秒流内空闲时限，取消总时长限制。活跃 SSE 超过 30 秒仍正常；连续 120 秒无数据会中断客户端读取并走结果确认/未知恢复。
- AbortController 只释放客户端读取，不等价于后端停止生成。没有自动重试 send、regenerate、命令或模型 PUT。

后端的具体最小缺口：响应头丢失时，没有按执行身份查询“仍在运行/已终止”的只读接口，HTTP history 也不暴露本次请求的执行状态。因此不能自动判定该请求完成或保证一次新的人工提交不重复。依据是现有 send 先提交 user、再准备上下文并打开 SSE；canonical regenerate 与 send 的后台任务和客户端读取分离。前端采用上述保守恢复，未为此修改 AionHome。若以后要求自动确认，需另立带持久执行身份及只读终态查询的后端契约；不能用重发探测状态。

## 修改文件

下表均为 `src/` 下路径，保留原 Main Workspace / Send / Realtime 分层。

| 范围 | 文件 |
|---|---|
| 消息 wire | `domain/message/drift-wire.ts`、`message-dto.ts`、`message-mappers.ts` |
| Main 配置 / readiness | `domain/runtime/main-configuration.ts`、`runtime-client.ts`、`runtime-dto.ts`、`runtime-mappers.ts`、`runtime-types.ts`、`index.ts` |
| 会话选择读写 | `domain/conversation/conversation-client.ts`、`conversation-dto.ts`、`conversation-mappers.ts`、`conversation-types.ts` |
| Setup | `application/chat-setup/chat-setup-service.ts`、`chat-setup-types.ts`、`chat-setup-view-model.ts` |
| SSE / send / recovery | `application/chat-execution/chat-execution-client.ts`、`chat-execution-events.ts`、`chat-execution-types.ts`；`application/chat-send/chat-send-accumulator.ts`、`chat-send-controller.ts`、`chat-send-errors.ts`、`chat-send-types.ts`；`lib/api.ts` |
| Controller / 最小 UI | `components/chat-workspace/chat-workspace-controller.ts`、`chat-sender-policy.ts`、`chat-regenerate-policy.ts`、`useChatSend.ts`、`useChatWorkspace.ts`；`presentation/chat-execution-composer.ts`、`chat-message-presenter.ts`；`components/chat/ChatView.tsx`、`MainModelSelection.tsx` |
| 新 fixtures / 测试 | `test-fixtures/main-chat-wire.ts`；`domain/runtime/main-configuration.test.ts`；`application/chat-send/chat-current-wire.test.ts`；`application/chat-execution/chat-stream-timeouts.test.ts`；`components/chat-workspace/chat-main-selection.test.ts`；`components/chat/MainModelSelection.test.tsx` |
| 更新既有回归 | `domain/message/message.test.ts`；`domain/runtime/runtime.test.ts`；`application/chat-execution/chat-execution.test.ts`；`application/chat-send/chat-send.test.ts`、`chat-regenerate.test.ts`；`application/chat-setup/chat-setup.test.ts`；`application/chat-workspace/chat-workspace-readiness.test.ts`；`components/chat-workspace/chat-sender-policy.test.ts`、`chat-regenerate-policy.test.ts`、`chat-workspace-controller.test.ts` |

另新增本验收文档。未改 Chat 整体视觉、气泡组件、Diary 状态机、后端 SQLite/历史投影/Prompt/命令/WS/Runtime/Provider Registry 架构。

## 验证与人工联调

截图追查补充：请求均为 200，但页面显示契约错误。只读核对 AionHome 的 `drift_compat.py:20` 与 `routes/chat.py:1063` 后发现，物理 `simple_think` 为空字符串/null 时，HTTP canonicalizer 会删除旧字段且可能不添加 `drift`。之前合成 fixtures 只覆盖显式 null/空字符串，漏掉此省略形状。已先用合成数据复现 mapper 和完整 Workspace 的相同失败，再仅在 HTTP 历史边界允许缺省值；persisted receipt 保持严格，并验证 null 回执与省略字段的 HTTP 结果能正确配对。截图没有响应体，因此不能断言现场没有其他异常形状；本轮没有读取真实消息。

所有自动测试使用人工合成数据，无真实会话、凭据、后端 HTTP/WS 或模型调用。

| 检查 | 最终结果 |
|---|---|
| 相关回归 | Chat execution/send/setup/workspace、模型读写、Readiness、presentation、UI 静态渲染、stream timeout 测试通过；新 case 全部纳入下述全量运行 |
| `npm test -- --reporter=dot` | 110 个文件，1693 项测试全部通过（含截图问题补充回归） |
| `npx tsc --noEmit` | 通过 |
| `npm run build` | `tsc -b` 与 Vite production build 通过 |
| `git diff --check` | 通过；构建生成的已跟踪 tsbuildinfo 已恢复，临时测试日志已清理 |

长流测试使用虚拟时钟验证 100 秒持续输出、响应头 30 秒等待超时与 120 秒空闲读取超时，未实际等待模型生成或连接后端。

建议在测试环境人工检查：

1. 打开有非空 DRIFT/Thinking 的历史，复制正文确认不包含 HEART、meta、内部命令或隐藏 Camera 上下文。
2. 选一个真实可用但不在 catalog 的 literal，保存后检查 connection/protocol/literal 和 readiness；发送正常回复并运行一次 canonical regenerate，确认目标 ID 与 created_at 不变、原历史仍在。
3. 分别测试缺少凭据、禁用连接、无效历史选择、会话不存在；确认历史可读、已存身份可纠正、无 silent fallback。
4. 连续切换 A/B，模拟慢 configuration、慢保存、慢历史与切换失败，检查页头模型、历史和保存 owner 一致。
5. 流式输出持续超过 30 秒；模拟响应头前断网、流中断网、HTTP 确认失败与 canonical conflict；只使用重新读取恢复，检查网络中没有自动第二次 send/regenerate。
6. 核对保存会影响“最近 Main”时间的说明与现有后台行为，确认已开始的 Runtime 继续使用原冻结选择。

尚未进行人工 UI/移动设备或真实后端联调；以上建议不能视为已执行。
