# PR CHAT-B1：手动核对不丢失 partial

> 2026-11-18：S6E2-C 已移除 Main 的返回编辑、二次确认和非终态 release；保留本文作为 B1 历史实施 / 人工验收记录。当前交互及终态门禁见 [S6E2-C 实施记录](./chat-b2-cancellation-audit.md#16-s6e2-c-实施记录2026-11-18)。

日期：2026-11-17（Asia/Shanghai）。本文包含初次实现交付与 CHAT-B1-CLOSEOUT 收尾记录。A–D 人工验收已完成；B 场景交互调整留待 CHAT-B2-D。人工验收结果与最终产品决定见末尾收尾记录，本轮未进入 CHAT-B2-A。

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

本节记录 CHAT-B1 当前已提交实现的行为；后续已确认、尚待 CHAT-B2-D 实施的交互调整见末尾收尾记录。

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
- 初次实现交付时已执行离线合同、组件交互和静态渲染验证。后续本地隔离环境的 A–D 人工验收已完成，结果见下文；真机键盘与生产联调不在此次记录范围内。
- 本次未修 CHAT-B2/B3/B4/D8、APP 或 SSE 格式问题，不将它们计入 B1 完成范围。

初次实现交付时未 commit、push、deploy；之后经用户授权完成工程原则及 CHAT-B1 本地提交。以下收尾只更新本文档、停止隔离服务并检查工作区，不新增 commit、push 或 deploy。

## CHAT-B1-CLOSEOUT：人工验收收尾

收尾日期：2026-11-17（Asia/Shanghai）。人工验收结论依据用户本轮明确提供的实际观察记录；与此前自动走查证据分别保留。本轮不修改业务源码、测试、配置、数据库或依赖。

### A–D 人工验收结果

| 场景 | 结论 | 实际观察结果 |
| --- | --- | --- |
| A：断流与重新核对 | 通过 | SSE 断开后后台生成继续运行；partial 保留；重新核对没有触发额外生成；Fake Provider 正常完成后，assistant 正文进入历史。 |
| B：返回编辑与保留临时回复 | 核心行为通过，发现一项交互优化 | partial 与原 execution 保留，没有取消或重发；返回编辑后可以继续操作。人工讨论确认返回编辑无需二次确认，后续交互调整见下节。 |
| C：旧请求迟到 | 通过 | 旧请求完成后正常进入历史；新请求执行状态不被旧结果覆盖；下一条草稿及附件保留；没有额外生成请求。 |
| D：历史读取失败 | 通过 | 故障注入针对 `b1-d`，历史读取请求正常触发；partial 与 execution 保留；读取失败时没有错误解除未知状态；恢复读取后可以再次核对。 |

D 场景仅记录本次实际观察到的读取与交互行为。本次人工验收未采集的 HTTP 响应状态码不作补填，也不以故障开关的设计值代替观测结果。

### B 场景交互问题与最终产品决定

人工讨论确认，独立的返回编辑入口及其二次确认步骤不再需要。最终产品行为已确认如下：

- 移除独立的「返回编辑」入口。
- 移除「保留临时回复，返回编辑」确认弹窗。
- 输入框始终允许编辑。
- 附件可以正常调整。
- 「重新核对」只负责查询状态，不再作为编辑的前置条件。
- 旧 execution 未终结时仍禁止发送。

上述交互调整纳入 **CHAT-B2-D**，尚待实施。本轮只记录决定，保留 CHAT-B1 已提交实现与测试；不擅自修复交互，不进入 CHAT-B2-A。B 场景核心稳定性验收通过，不表示上述后续产品行为已经上线或已经由当前实现提供。

### 隔离服务停止与证据保留

停止前核对 `/private/tmp/chat-b1-manual-20261117/processes.json` 与实际监听进程：

| 服务 | 停止前 PID | 端口 | 已核对工作目录 |
| --- | --- | --- | --- |
| 后端 Fake Provider 验收服务 | 14666 | 45672 | `/private/tmp/chat-b1-manual-20261117` |
| 前端验收服务 | 14667 | 45671 | `/private/tmp/chat-b1-manual-20261117` |

执行该目录内的停止入口：

```sh
python3 /private/tmp/chat-b1-manual-20261117/service.py stop
```

命令成功退出。随后 `service.py status` 显示两个端口均未运行、进程记录为空；`lsof` 确认 45671、45672 均无 TCP 监听，原两个 PID 不再持有该目录中的验收进程。未操作其他本地服务。

未执行 `reset` 或删除数据。以下合成数据库与验收证据继续保留在原目录：

- `source/backend/data/chat.db`
- `backend.log`、`ui-server.log`
- `browser-results.json`、`browser-check.log`、`transport-check.log`
- 其余既有辅助文件与截图。

### 两仓工作区与已有提交核对

| 仓库 | 当前分支与 HEAD | 本轮开始时 | 收尾后 |
| --- | --- | --- | --- |
| Penumbra | `main`；`8df2190b645326d63bd228cec203d145babd4920`，`doc: append-reply-pipeline-audit` | 已跟踪文件无修改；已有未跟踪文件 `docs/chat-b2-cancellation-audit.md` | 仅本文档新增未提交修改；原未跟踪文件保留；暂存区为空。 |
| AionHome | `refactor-code-main`；`86c3670139b42944a77a8cc4a4564fe5a65d1190`，`doc: sse-library-comparative-study` | 工作区干净 | 工作区保持干净；暂存区为空。 |

已有工程原则与 B1 提交保持不变：

- AionHome：`701760b9c0cf468e5d0b513b6058cc6172217f5f`，`docs(engineering): establish shared principles and agent instructions`。
- Penumbra：`baacd4327c97bc0b801428c3057c80153a72fb1b`，`fix(chat): preserve CHAT-B1 partials and establish engineering principles`。

此前三份审计报告现已分别由已有提交跟踪：Penumbra 的 `chat-streaming-state-audit.md` 对应 `faa11e840408be73a0e7e6f85d6f846c8cc20479`，`append-reply-pipeline-audit.md` 对应当前 HEAD；AionHome 的 `sse-library-comparative-study.md` 对应当前 HEAD。本轮未修改、删除或暂存三份报告，收尾前后内容 SHA-256 一致；原有未跟踪的 `chat-b2-cancellation-audit.md` 亦原样保留。

本轮只核对文档 diff、工作区与服务停止状态，不重跑业务测试或构建。未修改业务实现、测试、配置、数据库、依赖；未 commit、push、deploy。

B1 收尾执行事项已完成，暂无未完成的 B1 收尾事项。CHAT-B2-D 的交互调整为后续实施待办，不在本轮执行。到此停止，等待人工确认。
