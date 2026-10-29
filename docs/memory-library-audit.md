# Penumbra 记忆库功能完整性审计

审计日期：2026-10-29（Asia/Shanghai）。源码基线：Penumbra `422e6da`，AionHome `f46a47f`；两仓库开始时工作树均干净。本轮只新增本文，不修改业务代码，不 commit、push、deploy。

本次对应 Penumbra 的 S7B Memory Mutations 后续缺口审计，以及 AionHome 渐进迁移中的 Memory contract 边界。遵守现有 API、消息持久化、WS、Prompt、命令及召回契约；本轮不改变运行时行为。已阅读用户提供的 AGENTS 指令、AionHome AGENTS、runtime model、refactor master plan 和相关源码。既有迁移文档仅作定位线索，以下结论以当前实现和合成验证为准。

## 1. 结论与需要纠正的假设

1. **Penumbra 已有查看、分页、搜索筛选、新增和单条“待继续”标记。** 不是只有查看和新增。编辑、删除、重新总结在 UI、controller、domain client 三层均未接入，没有找到可开启的隐藏管理入口。
2. **旧版真正的记忆管理页是 `static/memory.html`。** 当前 `chat.html` 已把记忆库拆为独立页面；聊天气泡上的“重新生成”调用聊天消息接口，与记忆操作无关。
3. **旧版确有单条“重新总结”：`POST /api/memories/{id}/re_summarize`。** 它调用记忆辅助模型重新总结材料，再计算摘要的 Embedding，原位覆盖同一条记忆的正文、关键词、重要度和待继续状态。它不是单纯改写文字、单纯重算向量或批量消化。
4. **编辑、删除、重新总结都不需要改造 Memory V2 才能接入。** 但“已有接口”不等于“完整一致性已保证”：编辑和重新总结遇到 Embedding 失败仍保存；没有版本冲突检查；编辑/重新总结可能对已删除目标返回成功；删除没有清理日记发送关联；其他设备没有完整失效通知。
5. **推荐先补 P1 编辑、删除及最小后端契约加固，再补 P2 重新总结。** 只增加按钮会继承上述风险。无需重构记忆系统、迁移数据库或修改召回算法。

若“重新生成”的预期是仅润色正文、保留人工重要度/待继续状态、生成副本或提供历史版本恢复，这些都属于**新增产品语义**，不能宣称现有接口已经支持。

## 2. 源码证据索引

下文使用 F / L / B 编号对应这些实际文件；行号为本次审计基线。

| 编号 | 证据与追踪范围 |
| --- | --- |
| F1 | [MemoryView.tsx](/Users/remix/Desktop/Penumbra/src/components/memory/MemoryView.tsx:29)：新增入口、列表状态、分页和唯一列表操作回调 |
| F2 | [MemoryItem.tsx](/Users/remix/Desktop/Penumbra/src/components/memory/MemoryItem.tsx:8)、[memory-presentation.ts](/Users/remix/Desktop/Penumbra/src/components/memory/memory-presentation.ts:6)：正文展开、元数据、标签和 Pin；没有详情页或编辑菜单 |
| F3 | [MemoryFilters.tsx](/Users/remix/Desktop/Penumbra/src/components/memory/MemoryFilters.tsx:12)、[MemoryCreateDialog.tsx](/Users/remix/Desktop/Penumbra/src/components/memory/MemoryCreateDialog.tsx:41)：可见筛选、新增字段、提交和关闭约束 |
| F4 | [useMemoryList.ts](/Users/remix/Desktop/Penumbra/src/components/memory/useMemoryList.ts:35)、[memory-list-controller.ts](/Users/remix/Desktop/Penumbra/src/application/memory-list/memory-list-controller.ts:87)：300ms 搜索防抖、请求序列、单条 pending、写后 GET 和恢复 |
| F5 | [memory-list-service.ts](/Users/remix/Desktop/Penumbra/src/application/memory-list/memory-list-service.ts:34)、[memory-list-types.ts](/Users/remix/Desktop/Penumbra/src/application/memory-list/memory-list-types.ts:6)：30 条分页、04:00 本地日界、错误分类 |
| F6 | [memory-client.ts](/Users/remix/Desktop/Penumbra/src/domain/memory/memory-client.ts:26)、[memory-dto.ts](/Users/remix/Desktop/Penumbra/src/domain/memory/memory-dto.ts:1)、[memory-mappers.ts](/Users/remix/Desktop/Penumbra/src/domain/memory/memory-mappers.ts:156)、[memory-types.ts](/Users/remix/Desktop/Penumbra/src/domain/memory/memory-types.ts:1)：实际三个请求、字段契约和投影 |
| F7 | [DesktopAppView.tsx](/Users/remix/Desktop/Penumbra/src/components/apps/DesktopAppView.tsx:27)、[realtime-events.ts](/Users/remix/Desktop/Penumbra/src/application/realtime/realtime-events.ts:26)：实际页面挂载；`memory_added` 未映射为业务事件 |
| L1 | [memory.html 列表与筛选](/Users/remix/Desktop/AionsHome-main/aion-chat/static/memory.html:105)、[请求和 WS](/Users/remix/Desktop/AionsHome-main/aion-chat/static/memory.html:178)、[操作入口](/Users/remix/Desktop/AionsHome-main/aion-chat/static/memory.html:343) |
| L2 | [旧版编辑/删除/Pin/重新总结/新增](/Users/remix/Desktop/AionsHome-main/aion-chat/static/memory.html:402)、[批量摘要/原文/锚点/导出](/Users/remix/Desktop/AionsHome-main/aion-chat/static/memory.html:504) |
| L3 | [chat.html 消息操作](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:2952)、[消息重新生成请求](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:4416)、[页面拆分说明](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:5082)、[实际 /memory 页面路由](/Users/remix/Desktop/AionsHome-main/aion-chat/main.py:403) |
| L4 | [diary.html 记忆选择/全选/撤销发送标记](/Users/remix/Desktop/AionsHome-main/aion-chat/static/diary.html:1005)、[批量导入并复制正文发送](/Users/remix/Desktop/AionsHome-main/aion-chat/static/diary.html:1163)、[原文查看](/Users/remix/Desktop/AionsHome-main/aion-chat/static/diary.html:1645) |
| B1 | [routes/memories.py 模型、筛选、列表](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/memories.py:22)、[新增/编辑/删除/Pin](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/memories.py:168) |
| B2 | [摘要与锚点接口](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/memories.py:247)、[原文接口](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/memories.py:280)、[单条重新总结](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/memories.py:316) |
| B3 | [memory.py Embedding](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:109)、[普通/核心/闪现召回](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:219)、[原文追溯](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:396)、[背景浮现](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:510)、[低频浮现](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:1320) |
| B4 | [摘要 Prompt 与辅助模型调用](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:779)、[批量摘要串行锁及消息选择](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:886)、[批量摘要写入/锚点](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:950) |
| B5 | [database.py memories 表与索引](/Users/remix/Desktop/AionsHome-main/aion-chat/database.py:108)、[日记发送关联表](/Users/remix/Desktop/AionsHome-main/aion-chat/database.py:402)、[实际连接方法](/Users/remix/Desktop/AionsHome-main/aion-chat/database.py:483) |
| B6 | [日记发送关联读写](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1630)、[记忆导出与下载](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/files.py:81)、[日记独立召回存储](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:670) |
| B7 | [Chat 选中记忆快照](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1912)、[不可变语义投影](/Users/remix/Desktop/AionsHome-main/aion-chat/selected_memory_context.py:130)、[Game 会话 sticky 记忆](/Users/remix/Desktop/AionsHome-main/aion-chat/game/memory_context.py:32)、[API 会话鉴权](/Users/remix/Desktop/AionsHome-main/aion-chat/main.py:255) |

## 3. 三方功能矩阵

“未接入”表示当前 Penumbra 没有对应 UI 和请求链；“未发现”仅限本次相关源码范围，不推断线上部署或更早历史版本。

| 功能 | 旧版 AionHome 前端 | Penumbra 当前前端 | 当前后端与实际差异 |
| --- | --- | --- | --- |
| 列表加载与分页 | 独立 `/memory`；50 条/页；默认近 3 天；兼容旧全量数组；请求序列防旧结果覆盖 | 真实页面，30 条/页，默认全部时间；仅接受分页对象，拒绝全量数组 | `GET /api/memories?page=&page_size=` 返回 items/page/page_size/total/total_all/has_more；不传 page 才是旧全量响应。F1/F5/F6/L1/B1 |
| 刷新与排序 | 自身操作后 GET；`memory_added` 触发 150ms 合并刷新第一页；日期倒序、可钉选优先 | 初入页面、翻页、筛选、新增、Pin 后 GET；读取失败可“重新读取列表”；没有常态独立刷新按钮 | 分页按 `created_at DESC, id DESC`，pin-first 时前置 `unresolved DESC`；无升序或自定义排序。F4/L1/B1 |
| 记忆详情 | 列表完整正文、类型、重要度、关键词、时间；有来源时间才显示原文弹窗 | 列表完整正文已获取，长文可展开/收起；类型、重要度、时间、标签；无独立详情/来源面板 | 列表已返回完整正文和 source_conv/source_start_ts/source_end_ts；无 `GET /api/memories/{id}` 详情路由；`/{id}/source` 返回原始消息。F2/F6/L2/B1/B2 |
| 新增记忆 | 正文+六种类型，其他字段用后端默认值 | Dialog：正文、八种已知类型、0–1 重要度（步长 0.1，默认 0.5）、逗号分隔关键词；默认 event | `POST /api/memories` 先算向量再 INSERT；没有来源范围/会话，不推进摘要锚点；不是自动摘要。F3/F6/L2/B1 |
| 编辑单条 | 编辑正文、关键词、重要度；没有类型编辑控件 | **未接入**；不是只有按钮缺失，DTO/client/controller 也没有 | `PUT /api/memories/{id}` 已有；必传 content，可传 type/keywords/importance/unresolved；同 SQL 更新正文和 embedding。L2/B1 |
| 删除单条 | confirm 后 DELETE，再 GET 当前页 | **未接入** | `DELETE /api/memories/{id}` 硬删除同一行和向量；无回收站/恢复；关联清理不完整。L2/B1/B5/B6 |
| 单条重新总结 | **有真实入口**：仅 source_start_ts 和 source_end_ts 均为真值时显示“重新总结”；单按钮禁用、等待、Toast/错误 | **未接入**；Chat 的重新生成能力不等同于它 | `POST /api/memories/{id}/re_summarize` 原位覆盖五类字段；后端接受无来源记忆并回退正文。L2/L3/B2 |
| 搜索与筛选 | 正文/类型文本搜索、今天/3/7/30天/全部、自定义起止日期、重要度、钉选优先 | 搜索（最多 200 字符，300ms 防抖）、今天/7/30天/全部、重要度、钉选优先；**缺自定义日期与近3天选项** | 服务端 q 查询正文、已知类型的中文标签或未知类型原值；**不查询 keywords 列**；无精确 type、来源、待继续-only 筛选参数。F3/F5/B1 |
| 分类与状态 | 六种新增类型，八种已知展示标签，未知类型原样展示；Pin | 同八种展示/新增类型，未知类型原样展示；Pin 命名为“待继续” | 普通/核心/背景是召回通道，非三个 CRUD 表或 type 枚举；Pin 是 unresolved，会影响召回。无类型级只读/核心保护规则。F2/F3/B1/B3 |
| 批量编辑/删除/重总结 | **记忆库页未发现**多选或批量 CRUD；不能把“总结新记忆”当作多选重总结 | 未接入，也未发现入口 | memories 路由没有批量 CRUD API；手动 digest 是跨新消息的批量生产任务。L1/L2/B2/B4 |
| 其他页面的批量记忆选取 | 旧 Diary 有全选/最新 N 条选择、正文/关键词/类型本地搜索、批量发送到日记和单条撤销发送标记；还可查看原文 | 未发现对应 Memory 请求链 | `/api/diary/entries/{id}/import-memories` 只存发送关联；旧前端另把正文复制为日记消息发送。“撤销”删发送标记，不删除 memories 或撤回已发正文。属于日记工作流，本轮仅记录，不纳入记忆库 P1/P2 改造。L4/B6 |
| 摘要、锚点、导出 | “总结新记忆”、Markdown 导出可见；锚点 UI 的 HTML 与初始化调用已注释，函数保留 | 均未接入 | 有 digest、anchor GET/POST、export/file；导出是全库文件下载，不是当前筛选导出，且文件存在时不会即时重建。L2/B2/B6 |
| 操作反馈 | 删除 confirm；重新总结/批量摘要有等待；错误多为 alert；编辑/删除缺统一 pending 与重复提交保护 | 读 loading/empty/error；创建锁表单并保留失败输入；每条 Pin pending；成功 Toast；已写但 GET 失败单独提示 | 普通修改接口大多无完整实体回执；必须 GET 收敛。写成功不代表列表刷新成功。F1/F3/F4/L2/B1/B2 |
| 本地/跨设备同步 | 自身操作后 GET；其他端新增可用 memory_added 刷新；其他端编辑/删除/重新总结无统一通知 | 自身新增回第一页、Pin 保持页和筛选；卸载重进重新 GET；无 Memory WS/reconnect/focus 同步 | create/add_memory/digest 有 memory_added；编辑/删除/Pin/re_summarize 不广播相应变更。Penumbra 当前将 memory_added 视为 unknown。F4/F7/L1/B1/B2/B4 |
| AI 后续召回 | 管理页不承担召回 | 管理页不承担召回 | 后续重新查询从 DB 读到新行/不再读到删除行；受向量可用性、通道规则和已有上下文影响；不保证已开始的生成、历史消息和其他快照同步撤销。B3/B7 |

### 已实现字段与显示边界

Penumbra domain 已保留 `id/content/type/createdAt/sourceConversationId/tags/importance/sourceStartedAt/sourceEndedAt/isPinned`，其中 `isPinned` 映射后端 `unresolved`。当前页面没有展示来源会话和来源时间范围；列表也不返回 `activation_count/last_recalled_at/embedding/source_type/source_game_id/source_campaign_id/source_chapter`，前端不能据此展示准确的完整来源/召回统计。

标签在 mapper 中最多保留 32 个，列表仅显示前 8 个并显示剩余数量；这不是完整元数据编辑器。未来编辑时若直接把展示用 tags 回写，可能截断原有关键词。应使用完整编辑数据契约，或对超出投影范围的记录保留原值，不能把展示截断当成用户删除。F2/F6。

### 分类与管理权限

- 当前已知 `type` 为 `shared_moment/emotion/life_event/preference/promise/milestone/event/digest`，数据库和 API 并未将其限制为枚举。
- 核心向量通道选择 `importance >= 0.8`；普通向量通道排除核心；背景从待继续、话题相关、近期补充组成；同一行可能参与多个选择步骤后去重。不存在 `type=core/background` 的独立管理接口。
- 日记召回读取 `diary_entries`，不在 memories CRUD 的覆盖范围内。memories 还保留 Game 来源列，通用 API 没有按来源分流或只读限制，列表却不暴露这些列。
- Memory API 受应用登录会话保护，路由内没有按来源/类型划分的管理权限。Pin 会改变背景优先与衰减输入，不是纯列表排序偏好；“钉选优先”筛选则只控制列表排序。B1/B3/B5/B6/B7。

## 4. 单条“重新生成”的真实语义

### 4.1 逐项回答

| 问题 | 核实结果 |
| --- | --- |
| 旧版有真正单条入口吗？ | 有，`memory.html::renderMemories/reSummarize`，按 memory ID 操作；但 UI 只给有来源时间范围的记录显示。不是 `chat.html::regenerateMsg`。 |
| 使用什么 API？ | `POST /api/memories/{id}/re_summarize`，无请求 body；返回业务 `ok`，失败可以是 HTTP 200 + `ok:false/message`，不能只检查 HTTP 状态。 |
| 使用什么材料？ | 服务端读该行的 source_start_ts/source_end_ts；取闭区间内 role=user/assistant 且 is_carryover=0 的消息，按 created_at/id 排序，每条正文截到 300 字符，附时间及当前 worldbook 的双方名字。无范围或未找到消息则改用现有记忆正文。 |
| 是否精确对应原始来源？ | **不保证。** 原文和重新总结接口均按全库时间范围选消息，不限制 source_conv，也不保存这次使用的消息 ID 列表；重叠会话可能共同进入。批量 digest 原本就跨会话选消息并写 source_conv=NULL，因此不能不加区分地补一个 conv 条件。原始消息后续被编辑/删除也会改变输入。 |
| 调用哪个模型？ | `_call_flash_lite` 是兼容函数名，实际转 `_call_aux_model`，解析 usage=`memory_digest` 的已保存 binding；不是固定 Flash Lite，也不是主聊天模型。最多 3 次尝试，每次 timeout=180 秒。 |
| 覆盖还是新建？ | 对原 ID 执行 UPDATE；不 INSERT，不生成副本、不推进 digest anchor，也不重跑批量 digest。 |
| 覆盖哪些字段？ | content、embedding、keywords、importance、unresolved。关键词经过 normalize_keywords 去泛词/双方名字，最多 8 个；重要度来自模型，待继续来自模型。 |
| 保留哪些字段？ | id、type、created_at、source_conv、source_start_ts/source_end_ts、activation_count、last_recalled_at 和 Game 来源列未被 UPDATE；既有 ID 引用不换号。旧类型仍保留，即使文字语义已变；创建时间仍为旧值。 |
| 可直接复用吗？ | **可以复用“同条重新总结并覆盖元数据”的业务能力。** 需要新增前端契约/操作生命周期，并先处理下述可靠性问题；不能声称它支持预览、仅改写正文、保留人工评分或历史恢复。 |

证据：L2/B2/B4。辅助模型绑定已有 [test_phase5c_auxiliary_runtime.py](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_phase5c_auxiliary_runtime.py:409) 合成测试，覆盖已保存模型及模型失败保留原内容；本轮阅读该测试，未执行整套 Phase 5-C 运行时。

### 4.2 不能混用的能力

| 操作 | 当前能力 |
| --- | --- |
| 从原始材料重新总结这条记忆 | 已有 re_summarize；材料不存在时有正文回退 |
| 只润色正文，其他元数据保持人工值 | **新增需求**；当前 re_summarize 会改重要度、关键词和待继续状态 |
| 重新计算当前正文的 Embedding | `get_embedding` 是内部能力；没有专用单条 re-embed API。PUT 相同正文会重算，但它是编辑写接口，不能冒充独立重建功能 |
| 重建索引/重新执行召回 | 没有在这组管理路由中发现专用入口；召回发生在 Chat/Core 等服务路径 |
| 再跑一次批量消化 | `POST /api/memories/digest` 按锚点后的消息分组、新建多条并推进锚点；与原 ID 的 re_summarize 不同 |
| 新建重总结副本、预览后采纳、历史版本恢复 | **新增需求**；现有接口直接覆盖，没有版本记录或恢复接口 |

### 4.3 P2 前必须明确的风险

- 旧 UI 的“有来源时间”只证明存有范围，不证明原文仍在。当前后端静默回退正文；若产品要求“必须根据原文”，需要小范围后端显式拒绝/返回材料状态。前端一次 source 预检也不能消除预检与生成之间的变化。
- 重新总结会覆盖人工重要度与待继续标记，可能切换核心/普通通道并改变背景浮现。确认文案必须说明覆盖范围；不能只写“刷新”。
- 辅助模型结果仅做少量解析：summary.strip、float(importance)、真值转 unresolved；没有完整结果 schema、有限数/0–1 校验或并发版本检查。坏形状可能抛错或写入异常元数据。
- 模型空结果、短摘要返回 `ok:false` 且未写；Embedding 返回 None 却继续 UPDATE，并把旧 embedding 清空；不等同于批量 digest 的“Embedding 失败停止并保留 checkpoint”。
- 单条接口不受 manual_digest 的串行锁保护。长模型调用期间人工编辑可能被覆盖，删除后 UPDATE 0 行仍返回 ok:true；没有 request ID、执行状态查询或幂等重放契约。
- Penumbra HTTP 默认 30 秒，Embedding 自身可等待 30 秒，辅助模型单次 180 秒且可多次尝试。直接复用默认超时很容易得到不确定结果；仅增加超时也不能解决断线和执行恢复。需单独设置合理等待、提示结果不确定、只做 GET 对账，不自动重发生成。证据：[runtime-config.ts](/Users/remix/Desktop/Penumbra/src/lib/runtime-config.ts:3)、B2/B3/B4。

## 5. 编辑、删除的持久化与索引一致性

### 5.1 已有保证和真实缺口

| 一致性方面 | 已实现 | 未实现/限制及影响 |
| --- | --- | --- |
| 编辑正文与元数据 | 向量先在事务外生成；同一条 UPDATE 写 content/embedding 和请求中非空元数据，随后 commit | content 必传；即使只改重要度也重算向量。MemoryUpdate 没有正文非空、重要度范围、关键词 JSON 内容等严格校验；不能直接拿新增模型的约束当编辑保证 |
| 编辑向量 | 向量就在 memories.embedding，正文与新向量同一次 SQL 生效；没有发现独立向量库、FTS 镜像或另一个待刷新的记忆索引 | get_embedding 缺配置或网络异常通常返回 None，编辑仍成功并写 NULL；避免了旧向量配新正文，但丢失向量召回资格，没有状态标识/重试任务 |
| 召回可见性 | 普通/核心/闪现/话题相关/低频选择直接读 memories；下次查询可读到新内容或排除已删除行。created_at 索引由 SQLite 随行维护 | vector 非空路径无法再选中 NULL embedding；背景待继续/近期补充以及无需向量的 top-core 仍可能读到它，形成部分通道可见。完整长文只用前 400 字符生成向量是现有 get_embedding 行为 |
| 删除正文与向量 | 一条 DELETE + commit 硬删除整行，所以正文/关键词/向量/该行状态一起消失 | 没有软删除、撤销、版本历史或 tombstone；重复 DELETE 也返回 ok:true，未表明目标此前是否存在 |
| 普通/核心/背景存储 | 都是同一个 memories 表，通用编辑/删除可覆盖不同 importance/type 的行，不需三套删除逻辑 | diary_entries 是独立记忆来源，不会一起删；Game 来源元数据随行保留/删除，但 API 不作来源专属处理，管理页也不能识别全部来源 |
| 来源与关联 | 编辑不换 ID、不改来源范围/会话、创建时间及召回计数；删除不删除原始 messages | diary_sent_memories.memory_id 没有到 memories 的 FK；删除路由不清理它，残留悬空关联。已有聊天通知、日记中复制的文字、其他派生快照不会被反向改写 |
| 失败与事务 | SQL 语句失败时不会部分更新同一行；正常成功回执在 commit 后。模型空/短摘要不会先清空原记忆 | 无统一持久化失败业务回执；commit 成功但 HTTP 丢失仍结果不明。新增在 commit 后广播，广播异常可造成已写入但请求报错；不可把异常一律认定为未保存 |
| 目标存在性 | 专用 PUT /unresolved 检查 rowcount，缺目标 HTTP 404 | 普通 PUT/DELETE 和 re_summarize 的最终 UPDATE 不检查 rowcount；编辑甚至在检查目标之前就调用 Embedding；可能假成功 |
| 并发 | SQL 更新本身由 SQLite 串行提交；Pin 的目标状态 PUT 可重复设置同值 | 无 revision/条件写/CAS；最后完成的编辑覆盖之前编辑；重新总结读旧材料、等待模型后可覆盖新编辑。前端锁只能防本页重复点击，不能保护旧版、其他设备或后台调用 |
| 历史恢复与未来召回 | 已删除行不会被下一次直接 DB selector 查到；正常编辑保留实体身份 | 无全局遗忘保证：已开始的模型请求/选中记忆快照不会撤回，历史消息仍可进入上下文；原材料仍在，未来手动回退锚点/重新处理可产生新的同义记忆。普通删记忆本身不会回退锚点或自动重建它 |

证据：B1/B2/B3/B4/B5/B6/B7。不要把 init_db 内的 WAL/busy_timeout PRAGMA 当成所有运行时连接的统一并发保障；实际 get_db 只是新建连接。SQLite 写锁也不等同于应用层“根据哪个旧版本保存”的冲突检测。

### 5.2 数据同步边界

**本页：** F4 已采用“明确写回执 + HTTP 列表重读”。新增回第一页并保留筛选，Pin 保持当前页；同步失败保留旧数据、提供仅 GET 的恢复入口，请求序列和 Abort 防止旧结果覆盖新查询。新增不乐观插入回执对象；Pin 也不先改 canonical 行。这个协调方式可以扩展编辑/删除，但当前没有删除后页码越界回退，需单独补。

**重新进入：** MemoryView 卸载后 controller dispose；重新挂载用默认第一页/全部筛选重读，取得后端当前状态。不是持久化的页面缓存，也没有保留草稿/筛选/页码的承诺。

**其他设备：** 旧页仅消费 memory_added；Penumbra Memory 未订阅有效变更事件，也没有 focus/reconnect 自动重读。已有编辑、删除、重新总结均无变更广播。最小阶段可以明确采用手动刷新、重进与恢复焦点时 GET；若要求在线即时同步，需要另立兼容新增事件/失效通知契约，不得在本轮建议中擅自改变既有 WS type、payload 或 timing。

**AI：** 下一次真正从 DB 重新选择时生效，不必重建外部向量索引；但“不再被 selector 返回”不是“所有上下文立即忘记”。例如 Chat 的 selected memory context 是请求级不可变快照；Game 还有会话 sticky 记忆（某些策略会按现存 ID 过滤，但不能一概保证撤销所有快照）。本轮不建议修改这些运行时链路，只明确产品边界。

## 6. 最小分阶段迁移方案

### P1：编辑、删除和可恢复的列表刷新

**范围：** 在现有条目右上角增加易发现的“更多”入口，保留 Pin；菜单显示文字“编辑”“删除”。长文展开继续充当阅读详情，不为了两个按钮另造管理后台。编辑/删除作用于稳定 memory ID，移动端不依赖 hover 或长按发现操作。

- 编辑先覆盖旧版已提供的正文、关键词、重要度；type 可作为独立的小扩展，默认保留未知类型。不要回写无关来源/计数/unresolved，也不要用最多 32 个标签的展示投影覆盖完整关键词。后续若加入详情 Dialog，复用同一组操作和状态，不复制第二套流程。
- 复用共享 Dialog、Textarea、Input、Slider、AppSelect；新增专用 MemoryEditDialog 即可。加载草稿时固定目标及基线，失败保留输入，写入中禁用重复提交，未保存关闭可确认。
- 删除复用 AlertDialog，展示目标正文片段及“硬删除、无内置恢复”的实际后果。确认后请求一次；不会因为刷新失败再次 DELETE。
- 扩展 controller 的按 ID pending，让同一条记录的 Pin/编辑/删除互斥；保留其他条目的阅读与操作。成功后 GET 当前筛选/页，删除导致空尾页时请求最后有效页，最后一条删除后正常显示空态。
- 写回执与列表刷新分开反馈；超时/断线先显示结果不明并重读，禁止自动重放 mutation。PUT 成功仍需核对 ID/契约；DELETE 不能从 `{ok:true}` 虚构一个已删除实体回执。
- 增加普通手动刷新入口；focus/reconnect GET 可作为小后续，避免编辑草稿被后台刷新覆盖。暂不要求新 WS 事件。

**推荐同阶段的小范围后端加固（建议，不是本轮已实施）：**

1. routes/memories.py：更新前确认存在，最终更新检查影响行数；编辑校验正文、重要度和关键词格式，保持现有调用兼容。编辑若无法获得新向量，推荐不提交正文/元数据并返回可理解的失败；不能保留旧向量配新正文。具体失败策略需先定契约。
2. 删除同事务清理 diary_sent_memories 的精确 memory_id 关联；不删除原始 messages 或改写日记历史文字。这是现有表上的 SQL 修补，不需数据库迁移。
3. 并发保证分层：本页 pending 可纯前端实现；如要防多端丢失更新，可增加可选的基线条件写并返回 409，旧调用保持兼容。可基于现有字段比较实现，无需先加 revision 列；但**仅比较正文不能覆盖关键词/重要度/待继续冲突**。完整跨调用方保证需明确哪些写入口采用该契约。

纯前端即可获得旧版同等基本操作；**推荐的可靠 P1** 还需上述局部后端修补和合成契约测试。不能以“已接入”名义宣布并发、向量可用和关联清理都已解决。

### P2：明确语义后接入“重新总结”

推荐沿用旧版名称“重新总结”，首版仅对有来源范围的记录开放；这是前端开放范围，不是后端能力限制。确认说明“根据来源重新总结，并覆盖正文、关键词、重要度和待继续状态”。无来源记忆是否开放“根据现有正文重新总结”，作为明确的产品选择。

最小实现复用 `re_summarize`，增加专用 DTO/mapper、较长请求等待、单条 pending、业务 ok:false 映射和写后 GET。前端不编写摘要 Prompt、不调用模型、不触发 digest、re-embed 或召回来代替它。

可靠接入还应在原接口附近补：模型结果校验、Embedding 失败不覆盖、目标消失检测、生成期间发生编辑的冲突保护；是否拒绝无原文回退、是否返回 input_kind/material_missing 需要定契约。跨会话时间范围属于来源语义问题：应先核实记录类型和原生产规则，再决定是否收窄，不能一刀切按 source_conv 过滤。

仅拉长 HTTP 超时不会提供后台任务状态或幂等保证；第一阶段可接受明确告知的结果不确定 + GET 对账。若要求断线恢复并准确识别哪次生成已完成，再立小范围任务契约，不能用轮询“正文变了没有”推断本次操作成功。

### P3：按实际需要补充

优先原文只读面板、自定义日期、精确类型/来源/待继续筛选和导出新鲜度；统计、批量编辑/删除/重新总结、版本恢复单独评估。批量 CRUD 不是从旧版漏迁移的现成功能；不要因为旧版有 digest/export 就顺带实施批量后台、重建索引或回退锚点。

### 必须修改或新增的前端文件

以下是实施时的文件清单，不是本轮修改清单。

| 文件 | 最小用途 |
| --- | --- |
| [MemoryItem.tsx](/Users/remix/Desktop/Penumbra/src/components/memory/MemoryItem.tsx) | 每条更多操作入口、目标可见名称、pending；正文展开不变 |
| [MemoryView.tsx](/Users/remix/Desktop/Penumbra/src/components/memory/MemoryView.tsx) | 选中操作目标、共享弹窗、刷新与回调连接 |
| [useMemoryList.ts](/Users/remix/Desktop/Penumbra/src/components/memory/useMemoryList.ts) | 暴露 edit/delete，P2 再暴露 re-summarize；Toast 与 GET 恢复 |
| [memory-list-controller.ts](/Users/remix/Desktop/Penumbra/src/application/memory-list/memory-list-controller.ts) | 按 ID 操作互斥、写后重读、删除尾页修正、过期响应保护 |
| [memory-list-service.ts](/Users/remix/Desktop/Penumbra/src/application/memory-list/memory-list-service.ts)、[memory-list-types.ts](/Users/remix/Desktop/Penumbra/src/application/memory-list/memory-list-types.ts) | 新操作与冲突/不确定/已写未同步错误类型，避免沿用“待继续标记失败”的专属文案 |
| [memory-client.ts](/Users/remix/Desktop/Penumbra/src/domain/memory/memory-client.ts)、[memory-dto.ts](/Users/remix/Desktop/Penumbra/src/domain/memory/memory-dto.ts)、[memory-mappers.ts](/Users/remix/Desktop/Penumbra/src/domain/memory/memory-mappers.ts)、[memory-types.ts](/Users/remix/Desktop/Penumbra/src/domain/memory/memory-types.ts)、[index.ts](/Users/remix/Desktop/Penumbra/src/domain/memory/index.ts) | PUT/DELETE/POST re_summarize 的真实请求和回执校验；完整编辑元数据或保留策略 |
| 拟新增 `src/components/memory/MemoryActions.tsx`、`MemoryEditDialog.tsx`、`MemoryDeleteDialog.tsx` | 按业务大小可合并删除确认与菜单；P2 再加重新总结确认，不提前建通用 CRUD 框架 |
| [MemoryListStates.tsx](/Users/remix/Desktop/Penumbra/src/components/memory/MemoryListStates.tsx)、相应现有/新增测试 | 通用操作反馈及 GET 恢复；覆盖编辑失败保草稿、删除尾页、冲突、超时、ok:false 和旧请求竞争 |

可直接复用 [dialog.tsx](/Users/remix/Desktop/Penumbra/src/components/ui/dialog.tsx)、[alert-dialog.tsx](/Users/remix/Desktop/Penumbra/src/components/ui/alert-dialog.tsx)、[popover.tsx](/Users/remix/Desktop/Penumbra/src/components/ui/popover.tsx)、[toast.tsx](/Users/remix/Desktop/Penumbra/src/components/ui/toast.tsx)。当前 ui 目录没有独立 Dropdown/Confirm 组件，不应假设它们已存在；可参考 [ConversationActions.tsx](/Users/remix/Desktop/Penumbra/src/components/chat/ConversationActions.tsx:10) 的 Popover 菜单组合，不导入聊天业务组件。触控目标和键盘/焦点沿用 Penumbra 规范。

### 可能涉及的后端文件

| 文件 | 何时涉及 |
| --- | --- |
| [routes/memories.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/memories.py) | P1/P2 局部校验、存在性、失败原子性、精确关联清理、可选条件写、材料状态；主要后端修改面 |
| [memory.py](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py) | 仅当现有 Embedding 失败结果不足以表达契约时，考虑局部返回/辅助处理；优先在 route 消费现有结果，不改共享召回、评分、摘要 Prompt、自动摘要执行 |
| `tests/contract/test_memory_*`、`test_library_pagination.py`、`test_phase5c_auxiliary_runtime.py` | 固化新契约与旧调用兼容；新增编辑/删除/重新总结的失败和竞争用例 |
| [routes/files.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/files.py) | P3 若迁移导出，修现存文件新鲜度；P1/P2 不需要改 |

P1/P2 不要求修改 database.py/schema、Embedding 格式、Chat/Core、Diary/Quick Note、Prompt、命令、自动 digest、哨兵或 Memory V2 架构。日记关联清理可从删除接口对既有表精确处理，不需要借此重构日记模块。若另要求在线即时同步，再审计并扩展事件契约和 Penumbra realtime 消费，不混入基本按钮迁移。

## 7. 风险与需要人工决定的问题

这些是后续实施前的产品/契约决策，不阻塞本轮审计交付。

| 问题 | 建议 |
| --- | --- |
| 编辑只覆盖旧版三个字段，还是允许修改 type？ | P1 先正文/关键词/重要度，type 原值保留；放开 type 时保留未知类型，核心/背景不用伪造 type |
| 关键词超过列表投影上限怎么办？ | 先补完整编辑读取或原值保留契约，不以展示 tags 重写整列 |
| Embedding 不可用时是否允许保存？ | 推荐编辑/重新总结整次不覆盖；若允许缺向量保存，需显式状态及修复能力。这是现有行为调整，先固化兼容契约 |
| 删除是否意味着“彻底遗忘”？ | P1 定义为硬删除该实体及可清理的 ID 关联，明确无撤销；不承诺删除原始聊天、日记已复制内容或正在执行的模型上下文 |
| 多端冲突接受最后写入，还是提示冲突？ | 推荐新增可选条件写；UI 对冲突保草稿并要求重新读取，不能以本页 pending 代替服务端保证 |
| 重新总结是否覆盖人工重要度/待继续？ | 沿用旧语义则清楚确认；若要求保留，定义为新模式，不悄悄改旧接口 |
| 无原文记忆可否重新总结？ | 首版保持旧 UI 开放范围；正文回退单独明确命名/提示。严格原文模式需要服务端保证 |
| 时间范围跨会话是否符合预期？ | 当前 digest 原本按全库消息分组；先确认各来源规则，再设计有区分的材料选择。不能盲目新增 conv 过滤 |
| 跨设备刷新目标是什么？ | P1 手动/重进 GET；focus/reconnect 可后续补。即时同步另立兼容事件契约 |

额外发现：重要度筛选现有区间 low `<0.5` 与 mid `[0.45,0.55)` 有重叠，`[0.55,0.6)` 不在这两个或 high 档内；连续小数记录在筛选间可能难找。它不是本次按钮缺失根因，P3 再决定是否调整；本轮不改评分或筛选算法。导出文件缓存也可能包含已删/旧正文，下载 URL 的时间戳只影响浏览器缓存，不保证服务端重建。B1/B6。

## 8. 本轮验证结果

### 8.1 已执行

1. 静态逐层追踪：真实 DesktopAppView → MemoryView/MemoryItem/CreateDialog/Filters → hook/controller/service → typed client/mapper → memories route → SQL/Embedding/各召回 selector；另核对旧 memory.html/chat.html/diary.html、schema、日记关联与导出。没有仅凭路由名称判定能力。
2. Penumbra：5 个 Memory 相关测试文件 **85 条通过**，覆盖真实 API shape/编码、字段投影、分页筛选、04:00 日界、创建与 Pin、过期请求、已写未同步、GET 恢复和显示/交互结构。
3. 后端隔离：原有 create、unresolved 两组及 Memory 分页契约 **25 条通过**。从当前工作区复制对应源码/测试到 `/private/tmp/penumbra-memory-audit`，逐字节核对复制一致；依赖在独立临时 venv。没有导入真实 config/database/main 启动逻辑。
4. 专项合成检查 **17 条通过**：真实 routes/memories.py 配合临时 SQLite、伪 Embedding/模型/WS；从 memory.py 提取相关生产函数及常量，使用原 decay_engine，不执行运行时配置导入。验证三种代表性 type/importance 的编辑后读取、向量同时更新、来源/ID/计数保留、Embedding None 后通道差异、删除后直接召回消失但关联仍在、目标缺失假成功、编辑校验不足、跨会话来源、无原文回退、模型失败保留、SQL 失败保留、重新总结覆盖期间编辑、删除期间的假成功。

**合计：85 条前端 + 42 条后端/专项检查通过。** 测试通过包括对风险现状的断言，不代表风险已修复。

前端复现命令（在 Penumbra 根目录）：

```sh
npm test -- src/domain/memory/memory.test.ts src/application/memory-list/memory-list.test.ts src/application/memory-list/memory-list-recovery.test.ts src/components/memory/MemoryCreateDialog.test.tsx src/components/memory/MemoryPresentation.test.tsx
```

隔离后端最终复现命令（在 `/private/tmp/penumbra-memory-audit`）：

```sh
/private/tmp/penumbra-memory-audit-venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/private/tmp/penumbra-memory-audit-pytest tests/contract/test_memory_create_contract.py tests/contract/test_memory_unresolved_target_state.py tests/contract/test_library_pagination.py::test_memory_list_keeps_legacy_array_and_paginates_filtered_results tests/contract/test_memory_audit_probe.py
```

专项脚本保留于 [临时验证文件](/private/tmp/penumbra-memory-audit/tests/contract/test_memory_audit_probe.py)，不加入业务仓库；临时目录清理后需重新准备夹具。环境：Python 3.14，FastAPI 0.162.0、Pydantic 2.14.1、aiosqlite 0.22.1、httpx 0.28.1、pytest 9.2.0。现有 requirements 对这些核心包未全部锁版本；隔离结果不是线上环境完全一致的证明。有 1 条 Starlette/httpx 测试适配弃用警告，无断言失败。

首次隔离运行的缺失文件/配置桩错误，以及专项 SQL 异常断言方式均在临时夹具内修正后重跑；未因此修改生产源码。未执行 `test_library_pagination.py` 中无关 Quick Note 和完整 database init/旧页面组合检查，未将其计入 25 条通过；Phase 5-C 的模型绑定测试只读源码核对。

### 8.2 验证边界

未启动真实后端、浏览器或模型；未请求实际 API；未读取真实 memory DB、settings、凭据、用户会话或导出文件；未进行实际记忆重建、Embedding 或消化任务。没有全项目构建/全量回归，因为业务代码未改；上述前端结构测试不代替桌面/手机真机视觉、键盘及焦点验收。并发专项是可控 await 间隙插入写入的合成竞争验证，不是多 worker 压力测试；跨设备与部署状态未做实机联调。

交付核对：报告的本地文件链接和行号、Markdown 表格列数通过检查，`git diff --check` 通过；Penumbra 只有新增本文，AionHome tracked/staged diff 均为空。

## 9. 最终回答：不改造 Memory V2，能否补齐？

| 操作 | 能否复用当前后端 | 改动量与推荐范围 |
| --- | --- | --- |
| 单条编辑 | **能。** PUT 已有，同一行更新正文、元数据与向量 | **小规模前端迁移**：菜单、编辑 Dialog、typed client、controller 和测试；建议同时做**局部后端加固**（校验、存在性、Embedding 失败、可选冲突检测）。不需要 Memory V2/schema/评分改造 |
| 单条删除 | **能。** DELETE 已有，硬删除包含 embedding 的整行 | **小规模前端迁移**：菜单、确认、pending、写后重读与空尾页回退；建议后端同事务清理日记发送关联并明确目标缺失语义。没有现成撤销/恢复能力 |
| 单条重新生成 | **按旧版“重新总结”语义能复用；其他语义不能直接视为已有。** | 仅同等功能入口是**小到中规模**；推荐可靠接入为**中等规模**，增加材料/覆盖提示、专用超时与恢复、输出/向量失败保护、并发冲突与目标消失处理。若要求仅润色、生成副本或历史恢复，应另列新增需求，仍无需借机重构 Memory V2 |

因此可以在现有体系上分阶段完成三项功能，但不宜把它们包装成三个无条件安全的按钮。最小路线是 P1 编辑/删除及局部契约修补，P2 明确并接入重新总结，P3 再按需要补高级管理。
