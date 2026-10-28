# PR7-B follow-up：drain 生命周期与系统日志密度

2026-10-28；仅前端修改，未 commit、push、deploy。

## 原因与信号核实

旧 `observeSystemLogPage` 随 Chat 挂载创建永久 2 秒 interval。首次 send/regenerate 分配 page 身份后，空结果既不降频也不关闭 interval，故空闲仍约 30 次/分钟；全新页面尚无身份时原本就不发请求。

本次仅检查相关传输/续写边界：

- `openSendExecution` / `openRegenerateExecution` 是真实调用入口；SSE 迭代器的 finally、HTTP 错误和 duplicate JSON 分支可可靠标记主传输结束。
- 现有 `mcp_loading`、`poi_search`、`cam_check`、`location_check`、`activity_check` 及 WS `web_search_result` 等表示后续活动，不能证明所有 Provider 调用已结束。
- 后端 `perform_reply_result_batch` 会在主回复后执行工具并继续调用模型。`mcp_chain_diagnostics` 的 `chain_terminal` 是内部诊断；现有前端协议没有整个续写链的可靠终态。单个消息创建或单个任务 debug 不作为全链终态。

因此采用现有要求允许的有界宽限与退避，没有新增任务状态机、消息协议或后端状态查询。

## 调度条件

- 实际 send/regenerate 入口取得一个页面级活动租约；约 200ms 合并初始领取，执行期间成功领取后约 2 秒继续。
- 主 SSE 结束、错误或 duplicate 响应释放自己的租约；其他执行仍活动则继续 2 秒领取。
- 无活动执行后，空结果间隔逐步变为 2 / 4 / 8 / 16 / 30 秒。最后一次执行结束、相关事件或非空领取续期 180 秒；到期补领一次后停止。新 send/regenerate 随时重新启动。
- SSE 相关事件合并进调度；WS 使用已有 message owner、regenerate target 和本页执行的 conversation 识别需求。没有消息/会话标识的工具事件仅在已有需求时续期；其他会话事件不会激活领取。
- single-flight 持有整个 HTTP 读取、解析与同步归档；事件不能绕过最小间隔或网络错误退避。
- 网络/5xx 错误按 4 / 8 / 16 / 30 秒退避，成功后恢复正常节奏。没有执行时，错误也不无限延长宽限期。
- 401 保留私人日志清空与 page 身份失效语义，移除旧活动租约；后续真实执行可分配新身份。403/404/405 在本页禁用后续领取。
- Chat UI 卸载、A/B 切换、首页及重入不拥有租约，不取消领取 HTTP，也不丢弃已经取得的数据。刻意清空日志和 401 仍通过原 clearedAt 隔离旧响应。
- 浏览器延迟计时器时保留一次欠下的领取机会，取得仍在后端交接区中的快照后继续归档。

170 秒晚到的第二次 Provider 请求有定时测试；相关后续事件或非空结果会续期。没有任何信号且超过最后活动 180 秒才开始的调用，无法保证自动领取；现有协议缺少终态，不能承诺无限静默续写仍可领取。页面关闭、浏览器长时间冻结或网络持续失败也无法绕过后端既有 180 秒保留契约。本次不修改保留、容量、授权或脱敏。

| 场景（不含错误/密集新活动） | 原实现 | 新实现 |
| --- | --- | --- |
| 全新页面，未执行 | 0 | 0 |
| 生成执行中 | 约 30 次/分钟 | 约 30 次/分钟，事件合并 |
| 完成后的 3 分钟，全为空 | 约 90 次 | 约 10–11 次，随后 0 |
| 已领取过、长期空闲 | 约 30 次/分钟持续 | 0 |

## UI

- 摘要分为时间/协议/状态、可换行模型名、Token/缓存/RAG 短标签；保留 0 与缺失值的区分及错误/结果未确认状态。
- 普通诊断继续字段展示；缩小分区间隔。RAG 实际召回和候选评分仍为独立分区，正文和完整评分默认折叠；metadata 继续使用共享 JsonViewer。
- 取消「本次模型请求」外层折叠；每次请求保留独立折叠、序号、时间、来源和模型，不合并调用。
- Disclosure 去掉累积缩进，缩小点击表面与留白；System / Messages / Tools 默认折叠，纯文本内容可单独复制。
- 生成参数改为按内容自然换行，消除强制双列造成的空白；保留协议原始字段顺序、原始 JSON、完整安全投影复制与大请求按需加载。
- 压缩标题/主体/底部操作区，保持唯一主体滚动区；展开和新日志到达仍复用既有 key 与阅读锚点。

## 修改文件

实现：

- `src/application/chat-system-log/request-snapshot-drain.ts`：页面级调度器。
- `src/application/chat-system-log/chat-system-log-client.ts`：入口、活动事件和领取归档接线。
- `src/application/chat-system-log/chat-system-log-store.ts`：只读查询现有 message owner。
- `src/application/chat-system-log/chat-system-log-types.ts`：补齐既有 context 中 targetId 的条目类型。
- `src/application/chat-execution/chat-execution-client.ts`：主传输释放领取租约，保留时间线 trace、SSE 映射和正常 HTTP 语义。
- `src/components/chat/SystemLogDialog.tsx`、`system-log.css`。
- `src/components/chat/system-log/LogDisclosure.tsx`、`SystemLogRequest.tsx`、`SystemLogWire.tsx`。

测试：

- 新增 `src/application/chat-system-log/request-snapshot-drain.test.ts`、`chat-system-log-lifecycle.test.ts`。
- `src/application/chat-execution/chat-stream-timeouts.test.ts`、`src/application/chat-send/chat-send-abort.test.ts`、`src/components/chat-workspace/useChatSend.lifecycle.test.ts`：隔离可选领取调度，使原有全局计时器/AbortController 断言继续只检验正常 Chat 传输；领取与导航由新增集成测试验证。
- `tests/browser/chat-system-log-smoke.cjs`、`chat-system-log-details-smoke.cjs`、`chat-system-log-details.tsx`：适配新层级，添加长模型/错误/Prompt、RAG 多条和 320px 边界，移除常规截图输出。

## 验证

- 针对性 Vitest：24 文件、429 测试通过；包含调度、真实 api/SSE 接线、send/regenerate、receipt/HTTP 对账、WS 协调、导航、传输取消/超时和已有时间线测试。
- `npm run build`（`tsc -b && vite build`）通过；仍有 Vite 大 chunk 提示。
- 两组 Chrome 浏览器交互测试均在 320 / 390 / 1280px 通过，并验证 320px 高度；无页面运行错误。覆盖原始投影复制、多次请求和 regenerate、长内容折叠/复制、RAG 空/多条/评分、metadata、展开后新增日志锚点、横向溢出、唯一主体滚动区与底部按钮。
- 全部 HTTP/SSE/WS 测试使用合成数据，无真实 Provider 调用；没有常规截图或逐页视觉对比。
- 初始工作区干净。已有 Main Chat 开发时间线诊断调用和实现保留，没有修改后端、请求捕获投影、PR7-A 执行策略或 PR7-C Thinking 语义。

人工验收：实际数据下的暖纸张/Mist 视觉密度、字体/留白偏好，以及远程后端的真实长工具续写体验。
