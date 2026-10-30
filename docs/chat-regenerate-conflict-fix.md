# 普通 Chat canonical regenerate：错误分类与最小诊断修复

实施日期：2026-10-30（Asia/Shanghai）。依据 [只读审计](/Users/remix/Desktop/Penumbra/docs/chat-regenerate-conflict-audit.md)。本轮仅为普通 Chat 的错误契约和诊断补丁，不实施 regenerate 架构改造。

**此前持续 409 的实际根因仍未确定。** 本轮修复了可以从源码确认的 H3/C8 错误归类，并补上一个启动前取消的清理出口；没有证明事故实际发生过该取消，也没有证明后台占用泄漏。

## 1. 实施前核查与改动范围

两仓库 HEAD 仍为审计基线：Penumbra `1e0411d41bba541b068f7fc618234afe70c5ba98`；AionsHome `ecb9ab4a9276a351442ff4f8e2c6d91a6c0e971a`。开始时 Penumbra 仅有此前未跟踪的审计报告，后端工作树干净；原报告已保留，没有覆盖或清理其他工作。

核对确认：H3 仍在第二次 load_target 的普通异常分支包装 409；C8 仍在 commit_replacement 末尾将普通异常包装为 RegenerateContractError。现有 SSE `provider_execution_failed` 本来就用于 canonical 输出准备/执行等内部失败，可以复用。现有 HTTP 服务失败响应采用安全的 `{detail:{code}}` 形式，但没有能准确表示此处“尚未启动生成”的通用错误码。

不能直接把 H3 改为任意通用 500 后结束：前端对没有明确拒绝证据的 5xx 保持“结果未知”，不会直接开放再次生成；也不能放宽为“所有 500 都可重试”。因此只增加一个 canonical 启动前专用 code，在前端现有 service/error 状态中识别，不新增状态体系。

关联边界是普通 Chat 的 canonical regenerate 错误契约。保持原有消息身份/持久化、prompt 输入、命令副作用、WS 事件类型/形状/先后顺序及真实并发校验。运行时变化限于错误分类、安全诊断和启动前取消清理。

## 2. 错误契约变化

| 条件 | 修复前 | 修复后 | 客户端结果 |
|---|---|---|---|
| H1：同目标已占用 | HTTP 409 `regenerate_conflict` | 不变，增加 `busy` 诊断 | 保留现有冲突提示，不自动重试 |
| H2：两次读取快照不同 | HTTP 409 `regenerate_conflict` | 不变，增加 `snapshot_mismatch` 诊断 | 保留现有冲突语义 |
| 第二次读取抛出 RegenerateContractError | 原契约的状态/code | 不变 | 404/422/409 资格校验保持原样 |
| H3：第二次读取/连接等普通内部异常 | HTTP 409 `regenerate_conflict` | **HTTP 500，`{"detail":{"code":"regenerate_preflight_failed"}}`**；保留 exception cause | “重新生成服务暂时出错，请稍后手动重试。”；HTTP 历史对账后允许用户重试原目标 |
| C4 等显式提交契约冲突 | HTTP 200 SSE `type:error` / `regenerate_conflict` | 不变，增加 `commit_conflict` 诊断 | 保留冲突提示和原目标 |
| C8：DB/事务等普通内部异常 | 回滚后包装为 SSE `regenerate_conflict` | 回滚后原样重新抛出内部异常；路由转为现有 **HTTP 200 SSE `provider_execution_failed`** | 使用现有生成失败展示，不再显示“会话已发生变化”；不发 persisted receipt |

`regenerate_preflight_failed` 只在本次占用已成功释放、后台生成尚未创建时返回。前端仅对 **regenerate + HTTP 500 + 这个精确 code** 认定本次明确拒绝；send、裸 500、未知 code、代理错误继续按结果未知处理。前端不把任意错误当成安全重试依据。

C8 的 `provider_execution_failed` 是复用的现有通用执行失败通道，其名字不代表已确认 provider 出错；服务端用 `commit_internal_error` 区分真实阶段。HTTP 已开始 SSE 时不尝试重写 HTTP 状态。

如果 release 本身失败，则不伪造“已安全拒绝”的 H3 响应：保留该异常出口，并记录 release_failed。此时仍需按未知结果谨慎恢复。

## 3. 实现位置及原因

| 文件 | 修改原因 |
|---|---|
| [routes/chat.py:3893](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:3893) | H3 安全 500；入口/提交/后台出口分支日志；现有 release 调用外包一层结果日志；启动前 CancelledError 释放 |
| [regenerate_contract.py:263](/Users/remix/Desktop/AionsHome-main/aion-chat/regenerate_contract.py:263) | 显式契约冲突仍回滚并重抛；普通内部异常回滚后原样重抛，保留对象、traceback 与 cause，不再伪装冲突 |
| [chat_debug.py:86](/Users/remix/Desktop/AionsHome-main/aion-chat/chat_debug.py:86) | 复用已有 ContextVar scope 的执行 ID 和 Python logging；新增最小结构化日志 helper |
| [test_canonical_regenerate_route.py](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_canonical_regenerate_route.py) | H1/H2/H3、入口取消、释放失败、502 后原 ID 重试、C8/SSE 分类及诊断断言 |
| [test_atomic_regenerate_persistence.py](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_atomic_regenerate_persistence.py) | 更新内部异常类型预期，补事务开始、部分更新后清理、commit 失败的完整回滚/cause 回归 |
| [test_chat_debug_capture.py](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_chat_debug_capture.py) | 验证关联 ID/目标哈希/异常类别及敏感内容不进日志；日志 sink 故障不影响调用流程 |
| [test_device_context_dc3.py:428](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_device_context_dc3.py:428) | 仅更新同一 canonical 设备快照写失败测试的异常类型预期：原消息/快照仍共同回滚；没有修改设备上下文业务实现 |
| [chat-send-errors.ts:42](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-errors.ts:42) | 将精确 H3 响应映射为现有 service 错误及手动重试文案 |
| [chat-send-rejection.ts:14](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-rejection.ts:14) | 只把专用 H3 响应识别为 canonical 启动前拒绝，不放宽其他 500 |
| [chat-regenerate.test.ts](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-regenerate.test.ts) | 前端精确匹配/未知 500、H3/C8 手动同目标重试、无自动请求回归 |
| 本实施报告 | 记录契约、诊断、验证和证据限制；原审计保持历史事实 |

后端业务变更仅三个文件，另外四个后端文件都是相关测试；前端业务变更仅两个错误适配文件，另一个为测试。没有修改 Chat UI、数据库 schema 或其他功能。

## 4. 最小诊断契约

Logger：`chat.regenerate`。消息前缀为 `chat_regenerate `，其后是 JSON。

| branch | 含义 |
|---|---|
| `busy` | 本次 reserve_target 返回 false；仅说明当前进程目标键已被占用 |
| `snapshot_mismatch` | 两次已读目标 dataclass 不一致；不打印差异正文或快照 |
| `preflight_contract_error` | 第二次校验的明确契约拒绝，保留原 code |
| `preflight_internal_error` | 第二次读取等内部普通异常，记录 exception_type/cause_type |
| `preflight_cancelled` | 占用后、后台创建前的取消出口 |
| `commit_conflict` | 提交期间显式 RegenerateContractError，与内部故障区分 |
| `commit_internal_error` | 提交/DB 连接等普通内部异常 |
| `output_prepare_internal_error` | 提交前输出准备异常，避免误标为 DB 冲突 |
| `generation_failed` | 进入现有安全 SSE failure helper，记录公开 failure code |
| `background_cancelled` / `background_internal_error` | 后台取消或外层未处理异常；不改变原先传播语义 |
| `release_complete` / `release_failed` | release_target 调用正常返回或异常；附 `stage=preflight/background` |

字段只包含固定分支、阶段、公开 code、异常类名、直接 cause 类名，以及必要关联信息：

- `target_ref`：对 conversation ID 与 message ID 的组合做 SHA-256，保留前 16 个十六进制字符。用于诊断关联，不是业务身份，不用于选择/替换目标或并发判断。日志不写原始会话/消息 ID。
- `execution_id`：仅在现有已认证诊断 scope 存在时带上其通过格式校验的执行 ID，后台沿用现有 ContextVar 继承；没有该 scope 的请求不另建执行记录/注册表。
- 日志不 stringify 异常，不输出异常 args、正文、prompt、设备快照、API Key、响应原文或 traceback locals。异常对象/cause 在原有抛出链中保留，供受控服务端调查；不是把异常全文持久化进日志。

`release_complete` 使用 INFO，其他上述分支使用 WARNING。收集释放成功事件时，运行环境应允许 `chat.regenerate` 的 INFO 级别；本轮没有修改全局日志配置或重启服务。日志 sink 抛普通异常时 helper 安全返回，不能阻止异常分类或必要清理。

`release_complete` 说明释放函数正常返回，不等同于持久执行终态；`busy` 不能单独证明卡死、泄漏或占用持续时间。多 worker 场景仍需结合原有日志的进程信息，不能把不同进程的同 target_ref 当成一个全局锁。

## 5. 生命周期检查及最小清理修复

原后台已经通过 finally 释放，正常模型错误、输出准备失败、提交失败和 SSE 断开都不能据此推断漏释放。本轮保留后台 release 的位置，未在刷新、SSE 断开、收到模型错误或 persisted receipt 时提前清占用。

发现的明确缺口是：reserve 成功后第二次 load_target 被取消，`asyncio.CancelledError` 属于 BaseException，现有 `except Exception` 不接住它；后台尚未创建，也没有后台 finally 接管。新增专门的 CancelledError 出口：记录取消、释放本次占用、原样继续抛出取消。回归验证该出口不会调用 provider，目标内容不变且占用已释放。

没有增加 shield、超时清锁、任务表、全局锁、自动重试或后台轮询。若 release 本身因再次取消/其他异常而失败，记录其类别并保留异常，不把该情况虚构为已清理，也没有进行无证据的生命周期扩张。

## 6. 验证结果与环境限制

所有后端测试在隔离源码副本、临时 SQLite、fake provider/既有 mock transport 中运行。副本不包含运行时 data/logs/.env、个人头像或真实配置。全量测试所需的源代码静态 CSS/JS/HTML、合成 JSON fixtures、vendor 游戏静态数据及安装脚本文本单独复制；没有执行安装脚本或启动真实业务服务。socket connect/connect_ex 由测试 guard 拦截。

前端验证：

| 范围 | 结果 | 日志 |
|---|---|---|
| 相关 regenerate/current-wire/policy/generation-flow | 94 项通过 | [frontend-targeted.log](/private/tmp/chat-regenerate-fix-qq6q3cqy/frontend-targeted.log) |
| 前端全量 | 193 个文件，**2,629 项通过** | [frontend-full.log](/private/tmp/chat-regenerate-fix-qq6q3cqy/frontend-full.log) |
| TypeScript | `tsc --noEmit --incremental` 通过 | [types.log](/private/tmp/chat-regenerate-fix-qq6q3cqy/types.log) |
| 生产构建 | Vite build 通过；保留现有大 chunk 提示 | [build.log](/private/tmp/chat-regenerate-fix-qq6q3cqy/build.log) |

类型检查和构建输出位于 `/private/tmp/chat-regenerate-fix-qq6q3cqy`，没有改工作区的构建产物或 tsbuildinfo。初次尝试 `tsc -b --tsBuildInfoFile` 被当前 TypeScript 拒绝（TS5094），随后使用同一 tsconfig 的 `tsc --noEmit --incremental --tsBuildInfoFile ...` 完成检查，再运行 Vite 生产构建，没有改配置来规避检查。

后端相关九个测试模块合计 **212 项通过**，涵盖 canonical/atomic/device snapshot/debug capture/stability/upstream/send receipts/frozen binding/provider-input characterization，见 [expanded.log](/private/tmp/chat-regenerate-fix-qq6q3cqy/expanded.log)。修改后的七个 Python 文件均通过纯编译检查，并逐字节核对与测试副本一致。

后端全量与同环境未修改源码对照：

| 运行 | 通过 | 失败 | 证据 |
|---|---|---|---|
| 修改版全量 | **3,595** | 14 | [complete-full.log](/private/tmp/chat-regenerate-fix-qq6q3cqy/complete-full.log) |
| 原源码全量 | **3,583** | 14 | [complete-baseline-full.log](/private/tmp/chat-regenerate-fix-qq6q3cqy/complete-baseline-full.log) |
| 精确失败 node ID 对照 | 新增失败 **0** | 两边 14 项完全一致 | [full-suite-comparison.json](/private/tmp/chat-regenerate-fix-qq6q3cqy/full-suite-comparison.json) |

新增 12 项后端用例全部通过；不宣称后端全量全绿。相同的基线失败分布为：activity_summary_accuracy（1）、anthropic_shadow_renderer（1）、cloudflare_anthropic_provider（2）、core_prompt_source_snapshot（1）、credential_resolution（2）、monitor_trigger_prompt（1）、proactive_prompt_source_snapshot（3）、registry_usage_runtime（2）、schedule_context（1）。未顺带修改这些功能或旧断言。这里的“基线失败”指相同隔离测试环境下复现，未进一步将每项归因于生产代码或测试顺序。

首次收集因本机虚拟环境缺少已声明的 `markdown-it-py`、`mdit-py-plugins` 和隔离夹具而中断，之后只在临时 test-deps 补齐依赖，核实实际导入版本为 requirements 已固定的 4.0.0/0.5.0，未改仓库 requirements/lock 或原虚拟环境。初步副本还因未复制静态 CSS、仓库 JSON fixtures、游戏静态数据和安装脚本文本出现 56 项失败；原源码同样为 56 项。补齐这些非个人源码材料后，两边重新全量运行，得到上表最终的相同 14 项失败。

可复查的最终命令（工作目录分别为临时根目录下的 `complete-run/aion-chat`、`complete-baseline/aion-chat`；不要在真实数据目录运行）：

```sh
PYTHONPATH=/private/tmp/chat-regenerate-fix-qq6q3cqy/network-guard:/private/tmp/chat-regenerate-fix-qq6q3cqy/test-deps \
PYTHONDONTWRITEBYTECODE=1 /Users/remix/Desktop/AionsHome-main/.venv/bin/python -m pytest \
  -q -p no:cacheprovider tests --basetemp=/private/tmp/chat-regenerate-fix-qq6q3cqy/manual-recheck
```

回归重点已验证：

1. H1 仍 409、不多调用 provider；关闭 SSE 转发不清占用；原后台结束后原 ID 可以再次操作。
2. H2 的真实两次读取间修改仍 409，H3 的普通读取异常为安全 500；原始错误/cause 不进响应或日志正文；占用释放。
3. C4 追加冲突仍 SSE conflict，无成功 receipt；原数据保护保留。
4. C8 在 BEGIN、UPDATE 后关联清理、COMMIT 三个阶段失败时回滚消息字段、voice、HEART、conversation.updated_at；原始内部异常对象/cause 保留，没有部分替换或错误 receipt；设备快照写失败仍共同回滚。
5. 规范 Anthropic 502 错误后保留原 ID/内容；完整收尾后用户可按原 ID 手动成功重试。
6. 前端 H3/C8 失败后不会自动再次请求；手动重试继续原 conversation/assistant ID；泛化 500 保护不变。消息删除、换目标和重建会话路径未引入。

## 7. 仍未覆盖的事故证据

没有连接生产或当前运行的 localhost API，没有调用真实模型或读取真实个人对话。未模拟真实 Cloudflare/反向代理断开、多 worker 实际路由和进程重启，未进行实际浏览器事故重放。

进一步定位持续 409 仍需要：同一请求的 HTTP 状态/原 code/SSE 顺序、实际前后端构建版本、进程/worker、同 target_ref 的 busy 与 release 时序、存在时的 execution_id，以及受控后台栈/阶段证据。只有在匹配上述身份后，才能判断原任务仍在执行、某次内部故障或快照变化；不根据一次 busy 日志判断泄漏。不需要提供消息正文、完整 prompt 或设备快照。

## 8. 最终范围与停止边界

原审计报告保持不变；本轮仅修改第 3 节列出的十个业务/测试文件并新增本报告。未修改 Diary Chat、Memory、速记、旧前端、模型 adapter、数据库 schema/业务数据、依赖清单或运行配置；没有新增任务注册表/全局锁/执行持久化/轮询。

两仓库 diff/空白检查通过；后端实际文件与受测副本一致。未 commit、push、deploy 或重启服务。完成报告后停止，等待人工验收。
