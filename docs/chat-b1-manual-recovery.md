# PR CHAT-B1：手动核对不丢失 partial

日期：2026-11-17（Asia/Shanghai）。本项完成后停止，等待验收；未进入 CHAT-B2。

## 交付范围与工作区

先完成两个仓库的长期工程原则，再实施 Main Chat 前端恢复生命周期的 D1 修复。

| 仓库 | 开工基线 | 开工已有改动 | 本轮范围 |
| --- | --- | --- | --- |
| Penumbra | `main`，`cf15b1564d38e57de1d758c164755c1b8eaa7bce` | 未跟踪的 `docs/chat-streaming-state-audit.md`、`docs/append-reply-pipeline-audit.md` | 工程原则及 AGENTS 入口；CHAT-B1 controller、会话恢复、临时消息投影、解除交互和合同测试 |
| AionHome | `refactor-code-main`，`ee130a95b64af3a8aaff0604459075fc05e5cdd9` | 未跟踪的 `docs/sse-library-comparative-study.md` | 仅工程原则与原 AGENTS 的追加入口；无业务源码修改 |

原有三份审计报告保持原样；未覆盖、丢弃或重置既有工作区改动。构建生成的已跟踪 `tsconfig.tsbuildinfo` 按本轮构建前备份恢复。

## 工程原则交付

- Penumbra：[完整原则](engineering-principles.md)、[根 AGENTS 入口](../AGENTS.md)。原有 `CLAUDE.md` 与 UI 规范不变，新入口要求继续遵循。
- AionHome：[完整原则](/Users/remix/Desktop/AionsHome-main/docs/engineering-principles.md)、[根 AGENTS 入口](/Users/remix/Desktop/AionsHome-main/AGENTS.md)。原 AGENTS 全文保留，仅追加原则入口。
- 两份完整原则逐字节一致，均包含全部十三条原则、实施前检查与最终目标。此次文档本身不改变运行时行为。

## 依据与实施前判断

本次重新读取实际文件，而非只使用聊天摘要：

1. [Chat 状态审计](chat-streaming-state-audit.md)：D1 是 controller 手动核对/解除边界清除未保存正文，与 SSE parser 无关。
2. [追加回复审计](append-reply-pipeline-audit.md)：主回复 receipt 与后台 append owner 是不同生命周期，本次不修改追加执行、恢复、期限或工具交接。
3. [SSE 对比研究](/Users/remix/Desktop/AionsHome-main/docs/sse-library-comparative-study.md)：更换 SSE 库不能修复 execution 丢失；本次不引入依赖或改变 EOF 语义。

同时核对现有 Chat PR1、稳定性 follow-up、后端运行时模型/重构计划及 SSE PR-A/B/C 文档；检查 controller、sessions、composer、ChatView、后端 `chat_send_receipts.py` 与 send 持久化源码及既有合同测试。

仅重置读取标记不能解决正文丢失；仅禁止解除则可能长期锁定。原 follow-up 文档禁止暴露返回编辑，与本次治理目标存在冲突。已在实施该交互前明确指出并由用户确认采用「显式人工解除、保留旧执行记录、隔离迟到事件」，据此更新相关交互契约。

## 行为契约

| 场景 | 结果 |
| --- | --- |
| 本次历史读取失败或尚在进行 | 保留未知、partial 与 execution；不提供人工解除，旧读取成功标记不生效 |
| HTTP 与本轮 receipt/消息身份确认完成 | 正常恢复，无需人工解除 |
| 权威历史确认失败 | 按现有失败状态恢复，保留保存的失败正文与安全错误 |
| 历史读取成功，但本次执行仍未知 | 保留未知；提供独立的返回编辑动作 |
| 用户明确返回编辑 | 保留正文、Thinking、DRIFT、安全错误、原 execution/消息身份及恢复信息；只解除当前提交锁，不生成成功标记，不提交、不重试 |
| 旧请求稍后完成 | 继续以原身份进行只读对账；仅清除对应临时恢复记录，不改变新请求的状态、正文、输入或附件 |

解除说明使用：

> 上一次请求可能仍在运行

上一次生成尚未确认结束。返回编辑不会取消后台任务，也不会自动重新发送。如果后台稍后完成，回复仍可能出现在聊天记录中。用户明确选择「保留临时回复，返回编辑」才解除。

正常发送、完成和明确失败流程不增加确认或等待。未知且读取成功时的显式解除是异常路径中的用户选择；下一次显式发送仍需用户操作。

## 实现与防御取舍

- `retryFinalization({manual:true})` 与自动核对使用同一只读完成判定，不再隐式清空 execution。
- 每轮 finalization 开始时清除本 execution 的读取成功标记；只有本轮 HTTP 读取成功才恢复资格。
- controller 复用原 execution 对象与 finalization 方法。人工解除后，按 execution ID 在当前会话内存中保留恢复快照，并与前台 active 分开；没有新后台任务消费者或持久化机制。
- sessions 的现有恢复入口继续读取已解除的记录；沿用 focus、online、重连、重新进入与手动核对触发，不加轮询。
- composer 保留未保存的临时回复，并标记为未确认。已解除的 regenerate 即使后续读取失败，也不再以 partial 覆盖原持久正文。
- 迟到完成只发布原提交的精确 identity，用于清除对应 SubmissionRecovery；新执行状态与下一条草稿/附件保持独立。旧记录核对不能顺带重置新请求的拒绝状态。

保留的必要防御：receipt + HTTP 历史权威、conversation/client/user/assistant 身份校验、canonical start + persisted receipt + HTTP 投影匹配、finalization/receipt GET 合并、同会话前台 active 约束、陈旧结果与 dispose 隔离、partial 安全过滤，以及全部后端持久化与 Provider 契约。

移除的错误行为：手动读取成功后直接丢弃未知 execution/partial；跨读取沿用旧成功标记；人工解除时删除执行记录。没有删除保护不同生命周期的重复检查，没有增加全局锁、自动重试、超时、fallback 或持久化队列。

新增保留机制的保护对象是尚未保存的回复和原执行身份；仅显式解除未知结果时触发。正常路径不新增网络读取或等待。恢复使用原 receipt/history GET，确认后仅移除对应恢复记录；读取失败继续保留。

## 测试与验证

先补合同测试，再修改实现。初始测试复现 send/regenerate 手动核对丢正文与旧成功标记泄漏；第二组复现人工解除丢记录；最后补充并修复旧请求晚到后清除新拒绝状态的隔离问题。旧的“手动核对即 idle”断言按本次授权契约更新，未放宽身份或持久化确认断言。

覆盖：两类执行的 partial/Thinking/DRIFT、只读核对、本轮失败/在途不可解除、明确解除但不确认成功、旧结果晚到、新请求流中/拒绝状态隔离、缺 canonical receipt 不误成功、并发 GET 合并、A/B 会话恢复、原持久正文、下一条附件、普通正常完成及错误展示。

| 检查 | 最终结果 |
| --- | --- |
| 前端相关回归 | **88 文件、1121 项通过** |
| 后端既有合同 | **47 项通过**：send receipts、canonical regenerate route、atomic regenerate persistence |
| TypeScript | `./node_modules/.bin/tsc --noEmit` 通过 |
| 生产构建 | `npm run build` 通过；Vite 提示部分 chunk 超过 500 kB，本项未调整拆包 |
| Diff 检查 | 两仓库 `git diff --check` 通过；AionHome 原 AGENTS 前缀保留；原则文档一致 |

前端命令（使用临时配置隔离 env/cache，并禁止真实网络）：

```sh
node node_modules/vitest/vitest.mjs run --config /private/tmp/chat-b1/vitest.config.mjs \
  src/application/chat-send src/components/chat-workspace src/components/chat \
  src/application/chat-execution src/application/chat-realtime \
  src/application/realtime-reconciliation src/lib/sse \
  src/lib/api-stream.test.ts src/lib/api.test.ts
```

后端验证从当前源码复制 415 个 Python 文件及所需静态文件到 `/private/tmp/chat-b1/backend`，不复制 data、settings、凭据或数据库。使用现有 venv、假 Provider/工具和临时 SQLite；guard 禁止网络，并拒绝临时目录外的 SQLite 连接。没有运行真实应用 lifespan、Provider、生产数据库或服务故障注入。AionHome 业务源码无变化，不涉及其生产构建。

临时证据：[前端日志](/private/tmp/chat-b1/related-tests.log)、[后端日志](/private/tmp/chat-b1/backend-tests.log)、[类型检查](/private/tmp/chat-b1/typescript.log)、[构建日志](/private/tmp/chat-b1/build.log)。长期合同用例已纳入仓库，临时日志不作为唯一交付。

## 剩余风险与验收边界

- 恢复记录仅保留于现有页面会话的内存生命周期；浏览器刷新/进程退出仍不能保证未保存 partial 留存。本次按要求不新增持久化机制。
- 返回编辑不会停止旧后台任务。用户随后显式提交时，旧任务可能仍运行并稍后出现于历史；界面在解除前明确说明，不伪造停止确认。
- canonical receipt 丢失时仍可能无法确认新结果。不会以旧 target 存在或文字变化代替本轮提交证明；用户可保留记录并返回编辑。
- 已执行离线合同、组件交互和静态渲染验证；未进行真机键盘、真实浏览器视觉或生产联调验收。
- 本次未修 CHAT-B2/B3/B4/D8、APP 或 SSE 格式问题，不将它们计入 B1 完成范围。

未 commit、push、deploy。到此停止，待 CHAT-B1 验收后再进入下一项。
