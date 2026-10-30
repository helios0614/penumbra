# Diary Chat PR4-A：消息操作接入

2026-10-30，Asia/Shanghai。Phase 3 / Diary Chat PR4-A，仅接入编辑、删除和重新生成。交付未 commit、暂存、push 或 deploy，等待人工验收。

## 开工检查与范围

| 仓库 | 开工 HEAD / 分支 | 状态 |
| --- | --- | --- |
| Penumbra | `99ea5aa7425db0983e0feecc8b1abf64e141fbe7` / `main` | 工作区干净；PR3 已独立提交为 `feat(diary): enable chat messaging and calendar auto-feed` |
| AionHome | `7105f948d2965ead1f8023a691100112e0b4f5c3` / `refactor-code-main` | 工作区干净，包含 PR1 身份契约和父回复先保存修复；本轮没有修改 |

已检查 PR0 审计、PR1、PR3 交付、当前 Diary DTO / mapper / presenter / controller / send client、共享 MessageActions / Bubble / BubbleList / 编辑弹框，以及 Main 编辑和 regenerate 调用点。遵守用户 AGENTS 指令、CLAUDE.md、前端架构/UI 文档和后端 AGENTS/runtime model/master plan。

PR0 中“无 SSE 身份/保存回执”“父回复晚于派生消息保存”等结论已过期；以下契约来自当前源码。开工时已说明 PUT/DELETE 空命中仍可能成功、regenerate 删除快照后缀和保存后命令不可回滚等限制。当前契约能够支持本轮目标，无需修改后端。

没有修改 Diary Prompt、召回、自动投喂批次、ReadOriginalDialogue / NextGroup、数据库、后台任务策略或 Main Chat 业务逻辑。正文提取、归档和日历快捷提取未接入。原暖色背景、6px 磨砂、气泡、Markdown、Thinking/DRIFT 和两种桌面布局沿用原实现。

## 实际修改文件与职责

| 文件 | 职责 |
| --- | --- |
| `src/domain/diary/diary-chat-actions-client.ts` | Diary 原有 PUT/DELETE；只提交正文或精确目标身份；校验 `ok:true`，不将回执当作行存在证明；安全业务错误类型 |
| `src/domain/diary/diary-chat-send-client.ts` | 增加 Diary regenerate 的 start 快照 ID 解析和 POST；与原 send 共用 transport、SSE 解帧及 done.message mapper |
| `src/application/diary-chat/diary-chat-controller.ts` | 当前 Entry 的持久目标检查、局部编辑/删除、统一历史回读与结果验证、取消旧读取、晚到结果隔离 |
| `src/application/diary-chat/diary-chat-send.ts` | 在 PR3 原有局部流请求中增加 regenerate；绑定新 ID、保留旧历史、保存确认后按精确快照替换、结束回读；没有另建 Runtime |
| `src/components/diary/DiaryChatView.tsx` | 装配消息操作、共享编辑弹框、删除/重新生成确认与影响范围提示；仅用户可编辑、仅 AI 可重生成，普通 user/assistant 可删除 |
| `src/components/chat/MessageEditDialog.tsx` | 消息参数改为保留调用方类型的泛型，增加可选安全错误文案适配；继续复用原编辑草稿、保存/取消、失败保留和软键盘视口适配；Main 默认行为保持原样 |
| `src/components/chat/BubbleList.tsx` | 可选逐消息操作策略与删除回调；未传策略时保持 Main 原有编辑和最新目标 regenerate 规则 |
| `src/components/chat/Bubble.tsx` | 将可选删除回调交给原有 MessageActions；操作仍在原元信息行，临时执行状态不显示操作 |
| `src/components/chat/MessageActions.tsx` | 现有删除按钮补充 `aria-label="删除消息"` |
| `src/domain/diary/diary-chat-actions-client.test.ts` | 实际 HTTP 方法/路径/正文白名单、转义、regenerate 分片 SSE 与身份契约 |
| `src/application/diary-chat/diary-chat-actions.test.ts` | 编辑/删除/再生成、失败、缺失目标、精确后缀、新 ID、SSE/WS/HTTP 竞态、取消与 Entry 隔离 |
| `src/components/diary/DiaryChatActions.test.tsx` | 共享组件真实渲染下的角色、持久化、overlay 和局部操作入口边界 |
| `tests/browser/diary-chat-pr4a-smoke.cjs` | 生产 App + 本地合成 HTTP / 分段 SSE / WS；Classic / Editorial 的窄屏、桌面与深色验收 |
| `docs/diary-chat-pr4a.md` | 本交付文档 |

现有 DTO、presenter、realtime hook 和导航直接复用，没有为了接线改变消息格式或再建组件体系。Diary DTO 无“真人输入/后台素材”来源标志；自动投喂持久化的 `role=user` 消息继续按真实 user 处理，不靠正文或 ID 前缀猜测来源。未知角色保留显示，不提供持久消息操作。

## 当前后端契约

以下行号重新核对 AionHome 当前 `aion-chat/routes/diary.py`，仅描述此源码快照，不代表线上部署版本。

| 接口 / 事件 | 当前行为 |
| --- | --- |
| `GET /api/diary/entries/{entryId}/messages`（636） | 全量读取同 Entry；`ORDER BY created_at ASC`，无第二排序键、分页或版本号；前端原样保留数组顺序。字段包括 id、entry_id、role、content、created_at、updated_at、drift/simple_think、thinking |
| `PUT .../messages/{messageId}`（1170） | `{content:string}`；仅更新同 ID、同 Entry 且 role=user 的 content / updated_at。不换 ID、不重排、不生成 AI。不检查 rowcount，目标不存在或非 user 仍返回 `{ok:true}`；无编辑 WS |
| `DELETE .../messages/{messageId}`（1162） | 只删除同 ID、同 Entry 的一条 diary_messages；不检查 rowcount，返回 `{ok:true}`；无删除 WS |
| `POST .../messages/{messageId}/regenerate`（1183） | 沿用原 Entry 模型、Diary Prompt、召回及目标前历史构建。前端不传 Main 的上下文、模型或温度覆盖。目标缺失 404，目标前没有非空 user 内容时 400；前端额外限制只能选择持久 assistant |
| regenerate SSE `start`（1504） | `{type:'start',entry_id,id,replaced_message_ids}`；id 为新预留 assistant ID，replaced_message_ids 为路由读取时目标及其之后全部消息的精确快照。start 不证明保存成功 |
| `chunk` / `error` | chunk 为原始生成文本，仅用于临时展示；error 不当作成功，也不展示可能含配置的 provider 原始异常 |
| 替换事务（1564 起） | 有有效正文或 Thinking/DRIFT 后，在同一事务内删除快照中的旧 ID 并 INSERT 新 assistant，随后 commit；数据库异常 rollback，provider/空回复失败早退。因此失败提交前原后缀保留；生成期间并发追加且不在快照内的消息保留 |
| 保存 WS（1580） | commit 后广播 `diary_msg_created`，payload 为新消息；沿用共享 realtime 身份投影，仅失效当前 Entry 的历史。WS wire 继续兼容 drift/simple_think |
| 命令副作用（1587 起） | 已保存父回复后，按原顺序处理 ReadOriginal、NextGroup、HEART、异步 MEMORY_WRITE、日程命令。可能追加派生消息、推进批次、写独立业务记录或启动后续生成；并非所有动作与替换事务一起回滚 |
| regenerate SSE `done`（1628） | `{type:'done',drift,thinking,message}`；message 为已 commit 的新 assistant 保存对象，是明确保存回执。done 位于命令处理之后；保存后命令失败/断流可能导致没有 done，此时不能推断未保存或未执行命令 |

普通发送的 start 仍为 `{entry_id,id,user_message_id}`，与 regenerate 不混用。两种请求共用响应头 30 秒、流空闲 120 秒的 transport 策略，无整条生成 30 秒总时限。后端没有幂等键或全局生成锁；前端不自动重复 POST。

### 与 Main Chat 的差异

| 项目 | Diary | 当前 Main |
| --- | --- | --- |
| 身份范围 | `(entryId,messageId)` | Main conversation / message 身份 |
| 编辑入口 | 仅持久 user | 现有持久 User/Assistant 编辑规则；本轮不变 |
| regenerate 目标 | 任一普通持久 assistant，需满足原后端前置 user 条件 | 现有最新普通回复规则 |
| regenerate 保存 | 新 ID，成功后替换目标及请求快照后缀 | 现有同目标 ID 的 canonical/持久化处理 |
| 保存回执 | SSE `done.message` + WS/HTTP 核对 | Main 现有 persisted/执行控制器契约 |
| 删除接线 | 原 Diary 单消息 DELETE + AlertDialog + 历史回读 | 当前 Main MessageActions 虽有可选 onDelete，但 ChatView/Bubble 原先未装配单消息删除；会话删除流程保留 |

没有用 Main 的“最新回复/同 ID”策略限制或改写 Diary 后端。共享层只增加可选展示回调和类型适配。

### 关联清理的实际限制

DELETE 和 regenerate 的旧后缀 DELETE 都只作用于 diary_messages，不清理 HEART、记忆、日程或已经启动的派生任务。`database.py:163` 的 heart_whispers 使用普通 conv_id/msg_id 字段，没有外键级联约束；删除 Diary 消息后，旧 HEART 行可能仍指向已不存在的 message ID。已经写出的记忆/日程也继续存在，重新生成还可能再次产生同类副作用。前端没有补删、回滚或迁移这些数据；确认框说明重新生成可能再次执行命令，已执行操作不会撤回。

## 消息状态和请求时序

`state.messages` 保存 HTTP 历史，`overlays` 保存当前本地流的临时展示/保存回执。所有操作都先验证目标属于当前 Entry 且已在持久历史中；UI 对所有 overlay（包括尚待 HTTP 对账的回执）隐藏编辑/删除/重新生成。不同 ID 的同文消息完整保留。

| 阶段 | 行为 |
| --- | --- |
| 打开编辑 | 使用持久消息完整原文快照，含首尾空白、多段内容；历史/WS 刷新不覆盖草稿 |
| 保存编辑 | 当前 Entry 局部 mutation 防重入；PUT 后由同一 controller 读 Entry + 全量历史；同 ID、同 Entry、user、正文精确相等才允许关闭弹框。请求失败、目标缺失、正文不一致或回读失败都保留草稿 |
| 确认删除 | AlertDialog 说明对象并预览原文，取消零请求；DELETE 在途保持原消息；成功后历史确认目标消失才关闭，失败保持弹框反馈与最后可确认历史 |
| 确认 regenerate | 明确提示替换目标、删除其后全部对话，显示当前条数且说明范围以提交时历史为准；取消零请求。即使当前为最后一条，也保留范围说明，避免确认和后端取快照间新增消息被静默删除 |
| 开始 regenerate | 原目标与后续历史全部保留，增加独立 streaming assistant overlay；不先清空，不创建新 Entry |
| 收到 start | 将本次 overlay 精确绑定新 ID，记录后端替换 ID 列表；不凭内容/时间或“最新 AI”猜测身份，不据此删除旧消息 |
| WS 先到 / start 前 WS | 原 150ms 事件合并失效后读取历史；新 ID 已在历史时撤下同 ID overlay，后续 raw chunk 不覆盖持久正文 |
| done.message 先到 | 校验同 Entry、同预留新 ID、assistant 身份；只移除 start 指定的快照 ID，原子发布新保存对象；同时使更早的在途读取失效，防止晚到旧快照复活被替换后缀 |
| 失败 / 断流 / 无 done | 未确认的新 regenerate overlay 撤下，原历史不提前删除。若已由 WS/HTTP 确认保存，则以服务端事实为准；保留错误/结果待核对提示，命令不宣称回滚 |
| regenerate 收尾 | 在本次局部请求结束前完成一次历史回读，再开放下一次本页消息操作；失败回读也释放本地状态、保留错误，允许人工刷新。不自动重发、不循环轮询 |
| 编辑/删除结果未知 | 即使 mutation 抛错，也尝试一次当前 Entry 历史读取；保持未确认反馈，不自动重复写请求 |
| 切 Entry / Entry 删除 / 卸载 | 中止本页流、mutation 和在途 GET，使对应 owner 失效；晚到 PUT/DELETE、SSE、HTTP 和收尾均不能写入另一 Entry。取消浏览器请求不承诺取消后端已执行操作 |

本地 mutation 只覆盖一次编辑/删除和它的回读；既有 sending 承载一次 send/regenerate，不表示自动投喂任务忙碌。没有全局 busy、永久轮询或任务注册表。HTTP 回读继续原子发布消息/overlay 快照，按服务端数组顺序展示；回读失败保留可确认内容和手动刷新入口。

## 验证结果

| 验证 | 结果 |
| --- | --- |
| 前端全量 `npm test` | **204 个文件、2717 项通过**，含新增 33 项：领域 5、应用 21、展示 7；Main 原有发送、编辑、再生成、会话与能力测试均通过 |
| TypeScript | `npx tsc -b --pretty false` 通过；最终 `npm run build` 再次执行 `tsc -b` 通过 |
| 生产构建 | 隔离源码副本 `npm run build` 通过，包含项目原有字体资源；最终源文件逐项比对 |
| 当前后端隔离契约 runner | **149 项 Python + 26 项旧页 Node 测试通过**，包括父回复顺序、生成失败保留后缀、替换事务和并发追加范围 |
| 新 Diary 浏览器验收 | **八组通过**：Classic/Editorial × 320/390/1280px 浅色六组，390px 深色两组；视口高 640px |
| PR3 原脚本回归 | **六组通过**：Classic/Editorial × 320/390/1280px；日历投喂回执、继续/替换、归档保留、发送、SSE/WS、未知网络结果与历史对账 |
| Main 原脚本回归 | `chat-message-edit-smoke.cjs` 原样 **320/390/1280px 三组通过**：User/Assistant 编辑、失败草稿/重试/冲突、原 ID 再生成、发送/receipt 去重、会话归属、IME 和短视口 |
| 差异检查 | `git diff --check` 通过；两仓 HEAD 未变，暂存区为空；AionHome 工作区仍干净 |

新增合成验收覆盖：编辑成功/失败/目标不存在、用户/AI 删除、请求在途及失败不提前消失、新 ID 替换、生成失败保留原后缀、后续两条消息范围警告和取消零请求、WS-before-done / done-before-WS / WS-before-start、未知结果单次 POST 后读取、并发追加不误删、旧在途读取不复活后缀、操作期间切 Entry 的晚到 SSE/读回/mutation 隔离、同文不同 ID、原数组顺序，以及自动投喂 Entry 操作后继续同 Entry 聊天。

浏览器每组新验收执行 5 次 regenerate（含一次失败、一次结果未知、一次切 Entry 后完成）和 1 次同 Entry 发送；7 次 PUT/DELETE 包含失败及缺失目标。所有请求均指向明确的合成 Entry，没有 Main 写请求。手机操作栏与确认弹框检查无水平越界；共享编辑弹框的软键盘/短屏行为由 Main 既有浏览器脚本回归。已目视检查稳定状态的 320px 后缀警告和 Editorial 深色消息页面。

前端最终全量测试/构建副本位于 `/private/tmp/penumbra-pr4a-xpjxyn6g`；只复制源码、构建配置、公开字体/静态资源，未复制 `.env`、个人配置或真实数据库。浏览器 HTTP/SSE/WS 全为本地合成 fixture，新 Diary 脚本拒绝外域请求。后端 runner 只复制源码白名单，使用 AST/fake integrations/临时 SQLite，禁止 Python 外连，不启动生产应用或模型。

截图位于 `/Users/remix/.codex/visualizations/2026/10/30/01a18c04-c0c1-71c1-a1a0-419ba625da4a/diary-pr4a`（八组各范围确认/聊天两张）。临时日志为 `/private/tmp/penumbra-pr4a-tests.log`、`penumbra-pr4a-isolated-build.log`、`penumbra-pr4a-backend-contracts.log`。

## 未覆盖边界

- 未接真实服务、真实 provider/记忆/日记数据或做生产端到端测试；移动端是 Chromium 触摸/视口模拟，不等于 Safari、iOS/Android 真机键盘和返回手势验收。
- PUT/DELETE 没有版本号、CAS、rowcount 或 mutation WS。前端只能确认回读时的事实，不能保证跨设备/后台并发原子更新；本轮不增加版本体系。编辑不会触发 AI，也不会重写已有回复。
- regenerate 无跨客户端/后台锁。确认框当前计数和后端实际快照之间仍可能新增消息，提示明确以提交时历史为准；生成期间新追加且不在快照内的消息保留。后台任务、自动投喂总体完成状态和取消契约未改动。
- 保存成功而命令处理/网络失败时，旧后缀可能已被替换，命令也可能部分执行；真实 HTTP/WS 事实优先。无法在前端恢复已删除后缀或撤销外部副作用，不提供自动重试。
- 后端历史只有 created_at 单键排序、毫秒 ID 策略等原有限制继续保留；前端不二次排序或按正文合并。旧后端缺 start/保存对象不属于本轮支持的当前契约；解析失败会保留待核对反馈。
- 若未知 send overlay 始终无法关联持久 ID，仍按 PR3 保留未确认展示且无持久操作入口；本轮不猜测或扩展恢复协议。正文提取、首次归档、日历快捷提取继续留给 PR4-B。
