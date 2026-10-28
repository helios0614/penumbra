# PR7-B 系统日志信息架构与视觉层级

2026-10-28。仅前端展示与交互；未 commit、push、deploy。

## 展示行为

- 每条日志的「详情」提供「生成诊断 / 模型请求」两个轻量切换项，默认诊断。访问过的面板保留展开状态与局部阅读位置；其他日志保持独立。
- 生成诊断默认展示本轮判断和实际召回正文。实际召回每条显示三行预览、类型、独立的 score，以及弱化的 vec_sim / kw_score / importance；长正文才提供全文展开。实际 0 条保留，缺失评分不填零。
- 候选分区整体默认折叠，标题显示数量；展开后同样提供正文预览。候选与实际召回不合并，score 与 vec_sim 分别标记。
- 速记显示日期/时段及已授权的安全正文预览或隐藏状态。Provider metadata 保持共享 JsonViewer，默认折叠；真实错误位于诊断顶部，文本、代码和安全上游字段保留。
- 模型请求：一次请求直接显示；多次请求按快照 ID 独立选择，列出原始序号、时间、模型和来源，访问过的请求保留分组/原始 JSON 状态。
- Messages 默认直接展示最后 5 条的正文预览；较早历史由一个入口展开，展开后仍为正文预览。编号和发送顺序保持原样，不合并 role；复杂工具/媒体块显示类型和必要 metadata，并能查看原始块。已有超量结构回退至原始 JSON 的边界保持。
- System 显示块数量和简短预览，一次展开全文及原有缓存标记；Tools 显示数量/名称，按需查看定义。

## 参数与颜色

参数 mapper 只接收真实捕获字段和快照协议，不读取 Settings：

- Anthropic：temperature / max_tokens / stream 等采样参数；thinking.type、budget_tokens、output_config.effort、thinking.display 组成同一 Thinking 组。
- OpenAI：max_tokens 与 max_completion_tokens 分别标注；reasoning_effort / reasoning.effort / reasoning.summary 按原始字段展示，不解释成 Anthropic Thinking。
- Gemini：使用 generationConfig 或 generation_config 的真实嵌套路径，分别展示 thinking budget / level / include thoughts；不凭预算或布尔值推断未捕获的运行模式。
- 只有可准确标注的标量字段进入摘要；未识别字段、已知对象中的扩展字段及其他复杂值保留在「其他请求字段」。原始 JSON 和完整安全投影复制始终使用原 payloadJson，字段/消息/内容块顺序不改写。

缓存读固定绿色：浅色 `#166534`、深色 `#86efac`；缓存写固定橙色：浅色 `#9a3412`、深色 `#fdba74`，不依赖主题色，始终带文字标签。

摘要只展示严格大于 0 的缓存计数；0、缺失和 null 均不显示缓存标签。此规则不修改原始 usage / metadata，也不影响输入、输出或 RAG 的实际 0 与缺失值区分。

## 阅读位置

- 保持唯一主体滚动区和固定 Header/Footer；日志 Dialog 使用受视口约束的稳定阅读高度，避免短内容切换或新增日志时整个窗口重新居中。
- 原阅读 hook 继续在 store 更新前保存可见锚点。短内容没有天然滚动范围时，补入锚点补偿必需的底部余量；内容自然范围足够、清空或关闭后释放。
- 面板按需首次挂载，后续切换保留 DOM 状态；复制仍使用完整安全文本，三行预览只影响显示。

## 修改文件

实现：

- `src/components/chat/SystemLogDialog.tsx`
- `src/components/chat/system-log.css`
- `src/components/chat/useSystemLogReading.ts`
- `src/components/chat/system-log/LogDisclosure.tsx`
- 新增 `src/components/chat/system-log/LogTextPreview.tsx`
- 新增 `src/components/chat/system-log/LogViewSwitch.tsx`
- `src/components/chat/system-log/SystemLogDiagnostics.tsx`
- `src/components/chat/system-log/SystemLogRequest.tsx`
- `src/components/chat/system-log/SystemLogWire.tsx`
- `src/components/chat/system-log/system-log-presentation.ts`

测试：

- `src/components/chat/system-log/system-log-presentation.test.ts`
- `src/components/chat/system-log/system-log-details.test.tsx`
- 新增 `src/components/chat/useSystemLogReading.test.tsx`
- `tests/browser/chat-system-log-details.tsx`
- `tests/browser/chat-system-log-details-smoke.cjs`
- `tests/browser/chat-system-log-smoke.cjs`

## 验证与边界

- 针对性 Vitest：25 文件、445 测试通过，包含原轮询、SSE/WS 观察、send/regenerate、receipt/对账、超时/恢复、会话导航和时间线回归；最后一次 mapper 补充检查 17 项通过。
- 类型检查、`npm run build` 与 `git diff --check` 通过。构建保留原有大 chunk 提示。
- 两组 Chrome 定向交互测试在 320 / 390 / 1280px 及 320px 高度通过；页面运行错误为 0。覆盖 28 条消息及早期历史、System/Tools/复杂块、两种协议实际请求切换、参数真值、缓存读绿写橙及主题独立性、完整复制、日志/请求新增时锚点、多次 regenerate、短面板阅读补偿、唯一滚动区域和溢出边界。
- 使用合成 HTTP/SSE/WS，无真实 Provider 调用，无常规截图或全站视觉巡检。
- 未修改 application 层、debug/drain 生命周期、安全投影、请求捕获/授权、后端、正常 SSE/WS、PR7-A、PR7-C 或开发时间线诊断器。

人工截图验收：真实数据下两个视图的视觉重点、RAG/消息预览密度、参数分组、浅深色缓存标签，以及移动端展开后的阅读观感。
