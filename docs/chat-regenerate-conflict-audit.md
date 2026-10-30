# 普通 Chat 重新生成持续 409：只读审计

审计日期：2026-10-29（Asia/Shanghai）。本报告仅调查普通 Chat，与 Diary Chat 无关。

## 1. 结论与证据边界

**尚不能确定事故实际命中的后端分支。** 已把用户报告的 `HTTP 409 + {"detail":{"code":"regenerate_conflict"}}` 缩小到当前源码中三个入口阶段的分支：同目标已被占用、占用前后两次目标快照不同、第二次读取发生非契约异常。提交事务中的其他同名冲突通过 **HTTP 200 的 SSE error** 返回，不能直接解释截图中的 HTTP 409。

已经确认：

1. 实际调查场景是**一条 user message，展示为三个气泡**。新旧前端都在渲染时拆正文，不因此新增三条消息或三个持久 ID。没有发现气泡拆分参与冲突判断的路径。
2. 新前端按钮使用历史消息行的 assistant ID；URL 中的 ID 不来自用户气泡，也不来自气泡下标。事故中该 ID 是否就是当时应操作的持久 assistant，仍缺对应历史响应，不能只凭截图认定正确或错误。
3. 正常完整收尾的模型失败不会必然遗留目标占用。合成测试中，send 保存失败 assistant，canonical regenerate 再遇 502 后保留原内容并释放占用，随后可用**原 ID**成功生成。
4. 旧前端先 DELETE 所选 assistant，再走不带目标 ID 的旧 regenerate 接口，插入**新 ID**。合成测试确认：即使原目标的后台仍在等待、原占用仍在，旧版新 ID 也能生成，新接口随后能操作新 ID。**恢复不等于清除了原目标占用。**
5. 当前实现确有诊断混淆：入口第二次读取的任意普通异常，以及提交事务的任意普通异常，都被包装成 `regenerate_conflict`。这能把服务/存储故障显示成“会话已变化”，但尚无事故日志证明发生过。

证据分级：下文“源码确认”指当前本地源码；“合成验证”指临时 SQLite/fake provider；“用户观察”指本次描述及三张截图；“候选”均不是事故定论。没有事故 HAR、服务端分支日志、后台栈、失败前后数据快照，未验证事故时运行的前后端构建与本地源码完全一致。

审计基线：

| 仓库 | 本地 HEAD | 开始时状态 |
|---|---|---|
| `/Users/remix/Desktop/Penumbra` | `1e0411d41bba541b068f7fc618234afe70c5ba98` | `git status --short` 为空 |
| `/Users/remix/Desktop/AionsHome-main` | `ecb9ab4a9276a351442ff4f8e2c6d91a6c0e971a` | `git status --short` 为空 |

本轮属于普通 Chat canonical regenerate 契约调查，不实施重构 PR；遵守消息持久化、模型输入、命令副作用及 WS 契约不变，不改变运行时行为。

## 2. 事件时间线：可观察事实与缺口

| 顺序 | 用户报告/截图 | 可确认范围 | 不能推断的内容 |
|---|---|---|---|
| T0 | 正常对话中发送一条消息，显示为三个 user 气泡 | 按用户补充视为一个逻辑消息；截图显示三段正文 | 没有证据表明存在三次 send 或三条 user DB 行 |
| T1 | 首次回复失败，出现“会话已发生变化，请刷新后重试。”及重新生成按钮 | 图 1 证明页面显示此文案 | 首次 HTTP/SSE 的状态、原始 code、持久化情况、此前是否已有 regenerate 均未知 |
| T2 | 点击重新生成再次失败；随后显示 Anthropic API HTTP 502、`bad_response_status_code`、Cloudflare 上游说明 | 图 2 证明页面显示模型服务错误详情；版式与图 1 不同 | 无法从静态截图确认哪个请求产生详情、详情是否已持久化、生成是否已结束 |
| T3 | 再点击新接口，HTTP 409，响应为 `regenerate_conflict` | 图 3 确认 POST 与 HTTP 409；JSON 响应体来自用户文字陈述 | 图 3 是 Headers 页，没有展示 response body、SSE 或服务端命中分支 |
| T4 | 刷新新前端仍 409 | 用户观察 | 刷新是否改变目标 ID、后台是否仍执行、代理命中了哪个进程未知 |
| T5 | 旧前端重新生成成功，刷新新前端恢复 | 用户观察；源码和合成测试证明旧版会改变持久 assistant 身份 | 无法证明旧版取消任务、释放占用或修复了某个状态字段 |

图 3 中请求目标为 `conv_1791510998706 / msg_1793245172180`，经本地 `localhost:3000` 发出。仅记录截图提供的定位信息，未查询该会话或该消息。显示时间 11:39/11:40 是消息 UI 时间，不能代替每次请求/提交的时间。

特别注意：当前前端精确文案“会话已发生变化，请刷新后重试。”来自 **regenerate HTTP 错误映射**；普通 send 并不在该映射分支，也不调用 target reserve。故不能把图 1 文案当作“首次 send 后端返回此 code”的证据。需要原始网络顺序验证，中间可能存在用户描述中未细分的阶段，也可能存在构建差异；本报告不替用户补造请求。

## 3. 新前端调用链与消息身份

### 3.1 从气泡到目标 URL

```text
HTTP 历史中的 Message（原 id/content/role）
  → presentChatMessage 保留原 id
  → Bubble 对 user.content 按换行拆显示片段
  → 一个消息行 / 一个 data-message-id，包含多个显示气泡

历史中最新普通 assistant（排除 carryover/其他 role，要求 reachesLatest）
  → BubbleList 的目标行获得 onRegenerate
  → 回调传 message.id
  → ChatView 重新检查当前 workspace、可用性、目标 ID 一致
  → send.regenerate({ conversationId, targetMessageId, targetCreatedAt })
  → 每会话 controller 捕获该 ID
  → openRegenerateExecution(conversationId, targetMessageId, generation)
  → POST /api/conversations/{conversationId}/messages/{targetMessageId}/regenerate
```

对应源码：

| 环节 | 源码位置 | 核查结果 |
|---|---|---|
| 原 ID 保留 | [message-mappers.ts:97](/Users/remix/Desktop/Penumbra/src/domain/message/message-mappers.ts:97)、[presenter:52](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/presentation/chat-message-presenter.ts:52) | DTO id 原样进入领域和展示行 |
| user 拆分 | [bubble-chunks.ts:3](/Users/remix/Desktop/Penumbra/src/components/chat/bubble-chunks.ts:3)、[Bubble.tsx:111](/Users/remix/Desktop/Penumbra/src/components/chat/Bubble.tsx:111) | 仅产生字符串数组，无 API/持久化操作；外层保留消息 ID |
| 按钮绑定 | [BubbleList.tsx:122](/Users/remix/Desktop/Penumbra/src/components/chat/BubbleList.tsx:122)、[BubbleList.tsx:277](/Users/remix/Desktop/Penumbra/src/components/chat/BubbleList.tsx:277) | 传 assistant 行的 `message.id`，只给策略选中的目标行 |
| 目标资格 | [chat-regenerate-policy.ts:58](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/chat-regenerate-policy.ts:58) | 从历史末尾选普通 assistant；若最后普通消息是 user 则无目标；不是从可见气泡数量推导 |
| 点击时复核 | [ChatView.tsx:125](/Users/remix/Desktop/Penumbra/src/components/chat/ChatView.tsx:125) | 使用当时的 workspace，检查回调 ID 与当前 target.id 相等 |
| 执行捕获 | [controller:511](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-controller.ts:511) | 本次请求固定 target ID，不在失败后猜测另一个 assistant |
| HTTP 适配器 | [execution-client:67](/Users/remix/Desktop/Penumbra/src/application/chat-execution/chat-execution-client.ts:67)、[execution-client:117](/Users/remix/Desktop/Penumbra/src/application/chat-execution/chat-execution-client.ts:117) | 路径分别 URL encode 两个 ID；只传生成参数，无浏览器会话快照/expected version |

`targetCreatedAt` 用于本地流式展示时间，不作为服务端版本条件发送。后端冲突快照由后端自己读取，**不是前端把旧快照上传导致后端比较失败**。

现有 [Bubble.chunks.test.tsx:51](/Users/remix/Desktop/Penumbra/src/components/chat/Bubble.chunks.test.tsx:51) 已断言：多行 user 的原始正文保留、仅一个 `data-message-id`、一组复制操作，乐观消息与 HTTP 历史气泡数一致。本轮已执行这些测试。

### 3.2 错误映射、失败收尾与重读

| 输入事实 | 前端处理 | 是否说明持久化 |
|---|---|---|
| HTTP 409 / `regenerate_conflict` | [chat-send-errors.ts:78](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-errors.ts:78) 映射为“会话已发生变化，请刷新后重试。”；[chat-send-rejection.ts:23](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-rejection.ts:23) 将此特定 code 视为本次请求明确拒绝 | 不代表前一个后台任务已结束；仅本次请求未启动生成 |
| HTTP 200 SSE `type:error/code:regenerate_conflict` | [chat-send-errors.ts:176](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-errors.ts:176) 映射“会话已发生变化，重新生成未提交。请重新读取状态。” | 本次替换未提交；与 HTTP 409 入口阶段不同 |
| SSE chunk/历史中上游模型错误 | [assistant-failure.ts:24](/Users/remix/Desktop/Penumbra/src/domain/message/assistant-failure.ts:24) 提取 provider/HTTP 状态及安全详情 | 单独看到错误气泡无法确定它是流式临时信息还是已保存正文 |
| 断流/没有有效提交凭证 | controller 进入 finalization-uncertain，保留只读恢复路径 | HTTP 旧 target 的同 ID 存在不足以证明本次 regenerate 成功 |

[controller:320](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-controller.ts:320) 核对 start、error/debug 与 persisted receipt 的目标 ID；错误身份不匹配作为契约错误处理。完成/失败后，固定用原 `targetMessageId` 调 HTTP 对账；成功必须具备同目标 start、persisted receipt，以及 HTTP 同 ID/content/Thinking/DRIFT，见 [controller:200](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-controller.ts:200) 和 [controller:701](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-controller.ts:701)。这里正文比较用于**已有同 ID 的提交对账**，没有用正文推断目标身份。

[workspace-controller:429](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/chat-workspace-controller.ts:429) 重读历史并按 ID 提取目标；[composer:22](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/presentation/chat-execution-composer.ts:22) 在明确失败后保留持久目标，在其上显示本次错误；未保存 partial 另显示临时行，不获得可操作持久身份。失败后不自动 DELETE、不自动 POST 重试，也不改目标 ID。满足失败确认、历史最新与 readiness 后，原目标可再次由用户点击。

### 3.3 刷新恢复来源与旧列表的可能性

整页刷新会重新加载 JS，因此 [useChatSend.ts:20](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/useChatSend.ts:20) 的模块内 sessions/执行错误消失；SPA 内切换或重进 Chat 则可能保留同会话 controller，二者不能混为一谈。历史及会话来自：

- [chat-workspace-service.ts:28](/Users/remix/Desktop/Penumbra/src/application/chat-workspace/chat-workspace-service.ts:28)：先读 `/api/conversations`，再读 configuration/readiness 与初始历史。
- [message-history-service.ts:23](/Users/remix/Desktop/Penumbra/src/application/message-history/message-history-service.ts:23)：初始及从头重读使用 `/messages/window?limit=50`；并非恢复旧的气泡数组。
- 后端 [routes/chat.py:1218](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1218)：window 从只读 SQLite 连接、同一读事务恢复公开消息，返回 `Cache-Control: no-store`；没有读取/释放 `_active_targets` 或返回 canonical 执行终态。

页内重读会保留较早的已加载页，[message-history-window.ts:64](/Users/remix/Desktop/Penumbra/src/application/message-history/message-history-window.ts:64) 对重叠 ID 使用新 HTTP 数据；两边均达到最新且有重叠时替换尾部；不连续窗口只更新已有 ID 并标记有新消息、`reachesLatest=false`，策略据此禁用 regenerate。故页内列表理论上可保留旧页/已删除行，但没有发现靠气泡拆分生成旧 assistant ID 的路径。整页刷新仍稳定复现同码，降低了“仅内存旧列表”的解释力；历史响应、代理缓存、实际构建版本仍需验证。

## 4. 后端所有 `regenerate_conflict` 条件

源码范围为 [routes/chat.py:3893](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:3893) 与完整 [regenerate_contract.py](/Users/remix/Desktop/AionsHome-main/aion-chat/regenerate_contract.py)。没有发现单独的 service 层再产生此 code；契约模块负责目标校验/占用/事务，路由负责生成与 SSE。

### 4.1 HTTP 409：启动生成之前

| 编号 | 实际条件 | 源码 | 解释 |
|---|---|---|---|
| H1 | `reserve_target(conversation_id, message_id)` 返回 false | [route:3936](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:3936)、[contract:60](/Users/remix/Desktop/AionsHome-main/aion-chat/regenerate_contract.py:60) | 同一进程的 `_active_targets` 已有完全相同的二元键。不是会话级锁，没有超时/持久任务状态检查 |
| H2 | 首次 `load_target` 与占用后的第二次 `load_target` 返回的 dataclass 不相等 | [route:3941](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:3941) | 比较全部字段：conversation/message ID、legacy model 字段、target rowid/created_at、完整消息快照、目标设备快照 JSON。可能由两次读之间的并发改变触发 |
| H3 | 占用后第二次连接/读取/比较发生任意非 `RegenerateContractError` 异常 | [route:3952](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:3952) | 先释放占用，统一包装为 HTTP 409。DB/代码故障也可进入，不证明真实数据冲突 |

H2/H3 均在发起 provider 前；H1 在新的请求中也不会调用 provider。首次 load 的一般 DB 异常不经过 H3。`_require_executable_conversation_model` 的其他 409 是其他 code，不能统称此问题。

### 4.2 提交阶段：HTTP 200 SSE error 的同名 code

`commit_replacement` 先 `BEGIN IMMEDIATE`，然后在同一事务重验；以下分支抛契约错误，由 [route:4242](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:4242) 转成 SSE `type:error`，此时响应状态已经是 200。

| 编号 | 实际条件 | [regenerate_contract.py](/Users/remix/Desktop/AionsHome-main/aion-chat/regenerate_contract.py) 行号 |
|---|---|---|
| C1 | conversation 已不存在 | 176–181 |
| C2 | target 不存在、conv_id 不同、role 不再是 assistant、或已变为 carryover | 183–195 |
| C3 | 按 `created_at DESC,rowid DESC` 的最后普通 user/assistant 不再是 target，或不存在 | 197–206 |
| C4 | 完整 `_conversation_state` 与启动时不同 | 208–209 |
| C5 | target 的设备上下文 JSON 与启动时不同 | 210–211 |
| C6 | 同 ID/conv/assistant 条件的 UPDATE rowcount 不等于 1 | 213–228 |
| C7 | UPDATE 后回查 target 得到 None | 253–259 |
| C8 | 事务任意其他普通异常，包括 BEGIN、写入、关联数据清理、回查或 commit 错误 | 266–268，保留原异常 cause 后统一包装 |

C4 快照的精确字段与范围见 [contract:76](/Users/remix/Desktop/AionsHome-main/aion-chat/regenerate_contract.py:76)：当前会话**所有** messages，按 rowid 排序；每行比较 `rowid,id,role,content,created_at,attachments,simple_think,thinking,mcp_tool_calls,is_carryover,cache_region`。可空部分被 COALESCE；不比较 conversations.updated_at、独立 message version、WS 状态、前端快照、一般生成任务表、send receipt 或 debug drain。设备快照由 C5 单独比较。`public_display`、reaction 等也不在此完整消息元组中；不能把它描述成覆盖一切业务状态的通用版本锁。

### 4.3 必须区分的其他目标错误

[load_target:88](/Users/remix/Desktop/AionsHome-main/aion-chat/regenerate_contract.py:88)：

| 条件 | 入口响应 |
|---|---|
| conversation 不存在、message 不存在或 message 不属于指定 conversation | 404 `regenerate_target_not_found` |
| target 不是 assistant，或是 carryover | 422 `regenerate_target_invalid` |
| target 不是最后一条非 carryover 的 user/assistant | 409 **`regenerate_target_not_latest`** |

“最后一条”并非 DB 全角色最后一行；system 等行可以在后面。它们仍进入 C4，因此新增 system 不必导致入口 not_latest，却可导致提交 snapshot conflict。入口两次 load 中若直接遇到上述契约错误，保留相应 code，不一概改成 `regenerate_conflict`。

### 4.4 安全校验与可能过宽的判断

- 同目标执行排他、目标归属/角色检查、提交时保护并发删除/编辑/追加，能阻止错替换和丢失更新；不可直接删除或把所有 409 当作可重试成功路径。
- **确认存在过宽的错误归类**：H3/C8 将非冲突异常归为冲突。合成注入验证 H3；现有 DB 更新失败/回滚测试验证 C8。错误文案因此不足以证明“会话改变”。
- **候选为过宽校验，尚不能宣称应移除**：C4 包含未进入本次 context_limit 的旧行及 cache_region。合成中只改历史 user 的 cache_region，即触发 SSE conflict；重新加载快照后的下一次生成成功。因此一次失败后的静态历史差异不会永久污染下一次快照。cache_region 可能影响 prompt/cache 语义；只有证明具体字段/行不影响本次输入和替换安全时，才有依据局部缩小比较范围。
- 不存在“曾失败过就永久禁止”的布尔字段校验。Canonical 只用进程内目标占用，不查询通用执行记录或 append-reply 任务终态。进程重启后内存占用会消失；本轮未执行重启。

## 5. 模型失败、持久化、SSE 和任务清理

| 阶段 | 普通 send | canonical regenerate |
|---|---|---|
| provider 前 | [_persist_send_messages:764](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:764) 原样 INSERT 一条 user，更新 conversation.updated_at 并 commit；有 client ID 时写 send receipt | 两次读取目标、reserve 后启动后台；原 assistant 保留；不先 DELETE，也不写“生成中”的 target 正文 |
| provider 抛 HTTPStatusError/普通异常 | [route:2351](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2351) 标记 has_error，追加安全错误文本到 full_text，继续失败消息保存路径 | [route:4166](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:4166) 发安全错误 chunk、`provider_execution_failed`，return |
| provider 以错误文本结束，如规范 502 标记 | send 检测 has_error；[route:2620](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2620) INSERT 失败 assistant、链接 receipt、更新 updated_at，commit 后 WS msg_created | [route:4182](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:4182) 发 `provider_request_failed`，return；不调用 commit_replacement、不保存本次失败正文 |
| 空输出/Thinking-only 等失败 | 视已有 provider/空正文处理进入相应失败保存分支 | [route:4190](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:4190) 失败且不替换原 target |
| 成功 | 插入新 assistant | [route:4230](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:4230) 原子 UPDATE 同 ID，created_at/rowid 保留，替换正文/附件/DRIFT/Thinking/工具字段、声音/HEART/设备快照，更新 updated_at；commit 后 WS msg_updated，再发 persisted receipt，再执行命令等副作用 |
| 后台异常/结束 | [route:2777](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2777) 外层异常打印 traceback，finally 发 done；异常发生在 assistant commit 前可能只剩 user，发生在 commit 后可能已有结果 | [route:4330](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:4330) CancelledError 和其他正常退出均经过 finally：release_target，再发 done；普通异常即使未转为安全 failure 也经过 finally |
| SSE 断开 | [route:2837](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2837) 后台与转发独立，不因客户端断开停止 | [route:4339](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:4339) 同样不取消后台，原目标占用保持到后台 finally |

失败 helper [route:3693](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:3693) 发 chunk（可选）、error、debug；这些事件不写 target 消息。调试包装 [chat_debug.py:65](/Users/remix/Desktop/AionsHome-main/aion-chat/chat_debug.py:65) 只传递请求诊断 scope，不是执行任务终态或互斥依据。

因此必须区分“模型已经给出错误文本”“客户端已经停止读取”“后台任务已执行到 finally”。源码正常失败路径会释放占用；单靠看到 502 不能证明释放已发生，也不能证明没有发生。若后台停留在准备上下文/provider/诊断/提交后副作用的 await，刷新并不取消它，H1 可以持续发生。**普通 send 本身不 reserve_target；H1 假设要求此前已有一次针对该 assistant 的 canonical regenerate 尚未退出，不能仅由首次 send 失败推出。** 没有事故后台栈，不能进一步断言是哪一个 await 卡住、或认定发生了锁泄漏。再次取消打断 finally 等仅属理论边界，未有本案证据。

失败 assistant 的 device snapshot 不会被当作完成回复保存，见 [device_prompt_context.py:252](/Users/remix/Desktop/AionsHome-main/aion-chat/device_prompt_context.py:252)。读取设备快照时缺少表被兼容为 None，见同文件 226–234；不能预设“旧失败消息没有设备快照”就必然触发 409。

## 6. 新旧接口行为对照

| 项目 | 新前端 canonical | 旧前端普通 Chat |
|---|---|---|
| 展示拆分 | user 按换行拆，只保留一个消息 ID | [static/chat.html:2967](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:2967) user 按换行拆；动作仍绑定原 m.id |
| 选择目标 | 最新普通 assistant 的持久 ID，点击时再次验证 | [static/chat.html:2952](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:2952) 菜单绑定所选 assistant 的 m.id，没有同等的最新目标限制 |
| 实际请求顺序 | 直接 POST `/messages/{id}/regenerate` | [static/chat.html:4416](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:4416) 先 DELETE `/api/messages/{aiMsgId}`，删本地行，再 POST `/conversations/{id}/regenerate` |
| 后端目标身份 | 显式 ID；保留同 ID/created_at/rowid | [route:5110](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:5110) 不收目标 ID；按删除后的会话历史生成；后台分配新 assistant ID |
| 并发校验 | reserve_target、两次 load、提交事务再验 | 旧 regenerate 不 reserve_target，也不执行 canonical 的目标/快照/最新校验；DELETE 也不释放此占用 |
| 历史/上下文 | 只载入严格早于 target 的上下文；排除原回复 | 读取删除后的最近 user/assistant/system 历史；不是逐条锁定“被替换目标之前” |
| delayed/cache 处理 | [route:2891](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:2891) 只在内存转角色，明确不修复 DB cache_region | [route:5175](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:5175) 含将 delayed cache_region 改为 slide 的旧分支；该上下文连接中未见对应 commit，不能只凭此语句断言本案持久修复了缓存 |
| 模型失败 | 原 target 保留；本次失败通过 SSE 告知 | 旧 target 已删；[route:5906](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:5906) 标记错误，仍可插入新失败 assistant；不回滚此前独立 DELETE |
| 保存/广播 | 同 ID 原子替换 → msg_updated → persisted → 后续副作用 | [route:6053](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:6053) INSERT 新 assistant/设备依据、更新 conversation.updated_at、commit → msg_created |
| 后台取消/覆盖 | SSE 断开不取消，最后 finally 释放 | 同样后台独立；无取消旧 canonical 任务的调用，不覆盖/清空其 `_active_targets` |

DELETE 的真实实现 [route:1266](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1266) 删除指向目标的 interaction_events、message_voices、messages 后 commit、广播 msg_deleted 并导出；设备快照存在删除 trigger 时随消息清理。该函数没有 release_target、任务 cancel 或执行注册表操作。它不是一个“清除失败任务”的 API。

**旧版成功后新前端恢复的可证明机制**：被选中的失败 assistant A 被删除，新回复 B 持久化、conversation.updated_at 更新，刷新新前端读到 B，最新目标变成 B。如果 H1 占用键是 `(conv,A)`，它不挡 `(conv,B)`。本轮临时测试实际调用 delete_message、legacy regenerate、canonical regenerate 验证了这条链；原 A 占用在 B 已可操作时仍然存在。上下文和模型入口在测试中有 fixture/fake，不能据此推断事故 A 真实在执行。

## 7. 根因候选优先级与验证方法

| 优先级 | 候选与证据 | 限制/反证 | 最小验证方法（不读个人正文） |
|---|---|---|---|
| 1 | H1：同目标 canonical 后台尚未收尾；最能同时解释 HTTP 409、刷新无效、换新 ID 恢复；合成验证完整机制 | 正常 502/异常/取消收尾均释放；未取得实际 active key、持有执行身份、后台栈或持续时长 | 在隔离环境用受控 Event 延迟后台，独立请求同目标并记录 reserve 分支；事故需已有脱敏日志中的进程/请求/目标关联及完成时点；没有则不能定案 |
| 2 | H3：第二次目标读取有稳定异常，却被伪装为冲突；合成注入已验证 | 第一遍读取仍需成功；持续故障为何只在第二遍出现及旧版为何可绕过均需解释 | 本地临时库注入第二次 read 异常；确认 exception class/cause 和分支；不要将 DB 报错全文/消息正文展示给用户 |
| 3 | H2：两次 load 之间发生反复并发变更，包括消息或 legacy model/设备快照 | 单次偶发竞态通常不能解释每次刷新持续失败；每个请求新建快照，不沿用旧前端快照 | 用隔离并发写在两次 load 之间触发；只比较字段名/ID/哈希，确认是否持续写入，不按时间相近猜身份 |
| 4 | C4/C8：生成期间上下文变化、cache 字段变化或事务失败；解释某次 SSE conflict | **不直接解释已确认的 HTTP 409**；可能与入口 409 分属不同请求 | 既有 append/edit/delete/DB trigger 回滚测试；核对 HTTP 状态及 SSE 原 code，区分各次请求 |
| 5 | 前端旧列表/目标选错、运行构建或代理目标差异 | 当前源链按原 ID；user/错会话通常为 422/404，旧 assistant 非最新通常为另一个 409 code；纯内存问题不易解释整页刷新 | 对照同一请求 URL、window 中精确 id/role/conv、构建版本与路由，使用合成 ID/脱敏元数据；不靠正文或“最新看起来像回复”的消息猜测 |
| 无直接证据 | 三个气泡导致三个 user message 或目标错位 | 源码及多行用户测试不支持这一推论；与用户补充场景不符 | 已用一条三行 user 跑 send→失败→同 ID regenerate→再失败→成功；不按三次 send 复现 |

现有诊断不足以从同一 `regenerate_conflict` 反推出 H1/H2/H3。本轮没有连接运行中的 localhost 后端、没有从生产日志或真实 DB 补证。后续若需要日志，应只提供现有的脱敏分支/执行元数据；本轮不新增日志代码，不要求导出个人对话正文。

## 8. 最小修复建议与待补回归（均未实施）

当前没有证据支持一个可直接落地的“持续 409 根因修复”。建议先确认 H1/H2/H3，然后只修改命中的边界：

1. **错误归类可独立改善**：H3/C8 保持 rollback/释放及所有数据安全检查，把已确认的并发冲突与非冲突内部异常区分；内部异常走现有安全服务失败路径，保留私有诊断 cause。HTTP busy 与已变更也宜使用可区分语义。前端仅针对明确 code 显示“当前目标仍在执行”或“状态已改变/服务故障”的真实提示，不承诺刷新能解除后台占用，不把所有 409 设为自动重试。具体返回码/code 需先固化契约并经人工确认。
2. **若证实 H1 是终态后仍未清理**：修复具体退出路径的 release，保留现有 finally 和目标身份。若是某个 await 没结束，修复该具体阶段的收尾/终止语义；不能在看到失败文本或前端刷新时直接 discard key，否则旧任务仍可提交/执行副作用。若占用跨越提交后长耗时工作，先确认哪些副作用仍要求互斥，再决定释放边界；不新增全局锁、任务注册表或自动重试。
3. **若证实 H2/C4 比较了无关变化**：先建立本次输入与替换安全所需字段/行的证据，再局部缩小相关比较。保留目标归属、角色、最新普通消息、并发编辑/删除/追加防护；不得直接去掉整段快照校验。一次旧差异已在下次 load 中成为新基线，不能把“清空快照”当作修复。
4. **若证实前端窗口/构建问题**：修复精确 ID 的历史合并或运行版本问题；不重选“正文相同的 assistant”、不以新建用户消息规避冲突、不借用旧版 delete-then-append 作为新接口降级。

建议进入仓库的回归用例：

| 用例 | 必要断言 |
|---|---|
| 一条三行 user → send 502 → canonical 502 → 成功 | user 仅一条/一个 ID；三个气泡；同一原 assistant ID/created_at；失败不替换；成功 receipt + HTTP 对账 |
| 实际生成中断 SSE + 模拟整页新客户端 | 第二个请求明确 busy；不额外调用 provider；原任务最终收尾后同 ID 可重试；不靠刷新释放占用 |
| 各失败出口（错误文本、HTTPStatusError、上下文异常、空输出、取消、DB 异常） | guard 释放、原 target/附属数据一致、无错误成功 receipt；未落盘结果不被当作成功 |
| H1/H2/H3 分支独立 | HTTP 状态/code 不互相混淆；H3 不被宣称数据变化；前端不自动 POST |
| 生成期间并发 edit/delete/追加普通消息 | 仍阻止旧结果覆盖；回滚正文、声音、HEART、设备快照及 updated_at |
| 历史 system/cache/设备快照变更 | 明确哪些相关变化应冲突；无关变化的任何豁免需先有输入等价证据 |
| 新旧页面身份 | 旧版 DELETE A/新建 B 不被误记为释放 A；新前端只按 HTTP B ID 更新目标；不存在基于正文/时间匹配 |
| 窗口重读、整页刷新、模型错误与冲突提示 | 目标精确 ID、窗口 reachesLatest、receipt 丢失的未知状态均保留；分清上游 502、HTTP 409、SSE conflict |

## 9. 本轮验证、产物与未执行事项

### 9.1 测试证据

| 执行范围 | 结果 | 证据 |
|---|---|---|
| 前端 regenerate/controller、current wire、结果对账、regenerate policy、Bubble chunks、stability | 6 文件，115 通过 | [/private/tmp/chat-regenerate-audit-frontend.log](/private/tmp/chat-regenerate-audit-frontend.log) |
| 前端 HTTP execution adapter、generation flow | 2 文件，97 通过 | [/private/tmp/chat-regenerate-audit-frontend-extra.log](/private/tmp/chat-regenerate-audit-frontend-extra.log) |
| 后端 canonical route、atomic replacement、upstream errors、chat stability，加本轮临时 probes | **77 通过**（已有 69 + 临时 8） | [backend-final.log](/private/tmp/chat-regenerate-audit-d99rx4tc/backend-final.log) |

前端合计 212 项，不是全量测试。后端源码复制到 `/private/tmp/chat-regenerate-audit-d99rx4tc/aion-chat`，仅复制 `.py/.html/.js`，排除 data/logs/.env/虚拟环境/缓存等，不复制真实配置或会话；配置模块的初始化只作用于这个副本。DB 均为 fixture 临时 SQLite；autouse fixture 拦截 socket connect/connect_ex，provider/工具使用 fake 或既有 mock transport，没有真实模型请求。

临时测试源码：[test_readonly_regenerate_audit_probe.py](/private/tmp/chat-regenerate-audit-d99rx4tc/aion-chat/tests/contract/test_readonly_regenerate_audit_probe.py)。8 项分别覆盖：一条三行 user 的失败后同 ID 重试；后台未结束/关闭转发/两次独立 HTTP 拒绝/实际 DELETE+legacy 新 ID+新 canonical；三种失败/取消释放；第二次快照差异/读取异常；历史 cache 改变的单次 SSE 冲突及新快照恢复。后台未结束对照测试对 canonical context builder 使用现有 fixture，未模拟真实代理或真实浏览器刷新；用独立 route 调用验证服务器占用不属于客户端状态。既有前端测试补充 UI/适配器验证，未宣称复现真实事故网络时序。

临时 probes 首轮夹具不完整（旧目标上下文 fixture、interaction_events 表字段）曾失败，修正临时夹具后 8 项通过，再与既有 suites 合跑得到上述 77 项；没有为使测试通过而修改业务副本或仓库业务代码。此前失败记录留在同一临时根目录的 probe 日志中，不作为事故证据。

复查命令（在上述隔离副本中执行；不要改为真实服务目录运行以免模块初始化触及数据）：

```sh
PYTHONDONTWRITEBYTECODE=1 /Users/remix/Desktop/AionsHome-main/.venv/bin/python -m pytest -q -p no:cacheprovider \
  tests/contract/test_canonical_regenerate_route.py \
  tests/contract/test_atomic_regenerate_persistence.py \
  tests/contract/test_chat_upstream_errors.py \
  tests/contract/test_chat_stability.py \
  tests/contract/test_readonly_regenerate_audit_probe.py \
  --basetemp=/private/tmp/chat-regenerate-audit-d99rx4tc/recheck-pytest
```

### 9.2 文件与操作边界

仓库内唯一新增文件：`docs/chat-regenerate-conflict-audit.md`。所有原有已跟踪文件均未修改，包括：

| 范围 | 明确未修改的关键文件 |
|---|---|
| Penumbra UI/身份 | `src/components/chat/{ChatView.tsx,Bubble.tsx,BubbleList.tsx,bubble-chunks.ts}`、`src/components/chat-workspace/chat-regenerate-policy.ts`、`src/components/chat-workspace/chat-workspace-controller.ts`、`src/components/chat-workspace/useChatSend.ts` |
| Penumbra 执行/读取 | `src/application/chat-send/*`、`src/application/chat-execution/*`、`src/application/message-history/*`、`src/domain/message/*`、`src/components/chat-workspace/presentation/*` |
| 后端/旧前端 | `/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py`、`regenerate_contract.py`、`database.py`、`device_prompt_context.py`、`chat_debug.py`、`chat_history_read.py`、`static/chat.html`（同一 aion-chat 根目录）及全部既有测试 |
| 其他 | Diary Chat 所有文件、两仓库配置/依赖清单、现有 docs、数据库 schema/migration、构建产物与业务数据 |

临时测试脚本、隔离源码副本、合成 DB 和测试日志仅在 `/private/tmp`，未加入仓库。未修改真实个人对话、未连接生产或运行中的本地业务 API、未读真实 data/logs/.env、未调用真实模型/外部工具、未启动业务服务或后台调度、未执行业务重构/修复、未新增锁/注册表/重试/防御层、未运行 build、未 commit、未 push、未部署、未重启服务。

完成本报告后停止；任何修复均等待人工确认。
