# Memory 类型入口收敛与旧来源恢复审计

日期：2026-10-29。Penumbra HEAD `63dd0e8`，后端 HEAD `ecb9ab4`。

## 1. 交付结论与边界

Phase 1 已实现：对后端生成的原始 `{ai_name}总结` 类型隐藏查看原文、重新总结、删除并重新总结来源；保留编辑、Pin 和普通删除。判断不写死“知远”或某个当前名称，兼容历史名称。其他类型行为不变。

Phase 2 完成源码审计，**没有实施自动来源恢复**。现有旧记录缺少验证历史材料完整性和内容版本所需的证据。用户已明确确认“没有额外证据，保留安全拒绝”，因此继续使用既有 `source_untracked` 契约，不增加猜测式回填、接口或迁移。

开始时上一轮原文查看与状态修正已经暂存。本轮保留全部暂存内容，未改写 Git index；新增修改保留在工作区，供人工验收。后端没有修改，没有访问真实记忆/聊天数据库，没有执行真实迁移或模型调用，没有 commit、push、deploy。

## 2. 类型判断的源码依据

[routes/chat.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:5074) 的命令记忆生产路径从 worldbook 读取 `ai_name`，写入 `memory_type = f"{ai_name}总结"`；日程等命令生产路径也沿用这一规则。`add_memory` 将该值持久化到 memories.type，`source_conv` 可为当前会话，两个来源时间字段为空。

这不是独立的固定英文枚举。当前接口把持久化 `type` 原样返回，Penumbra 对未映射的类型原样显示。因此使用 **domain model 的 type 字段识别后端的 `{ai_name}总结` 格式**（`type.endsWith("总结")`），不读取 DOM 标签或卡片正文。`ai_name` 是可配置的任意名称，已经保存的 type 也可能带旧名称，所以不额外读取当前 worldbook 并只匹配今天的名字。`digest`、`event`、不符合该格式的未知类型和空类型保持原逻辑；`AI总结` 同样属于这类命令记忆。当前 type 没有独立的生产来源枚举，若外部调用人为写入同样格式的自定义 type，也按这一类型规则处理。

新增共享的 `allowsMemorySourceActions` 仅表达本轮产品入口规则，不代替后端能力判断：其他类型的组合操作仍需成功的来源预检，并接受组合接口最终校验。

- 元信息同行：不生成 ScrollText 按钮，同时收回该图标占用的预留宽度。
- 更多菜单：仅保留编辑、删除，不显示来源检查提示，也不发送无用预检。
- application controller：拒绝该类型的重新总结/组合操作入口；已知当前记录为该类型时，跳过来源查询并清理旧缓存、取消旧在途预检。编辑、Pin、普通 DELETE 继续使用原接口和 GET 对账。
- 其他类型：原文读取、四项菜单、来源 loading/失败/冲突原因、写后缓存刷新全部保留。

## 3. 旧来源实际保存了什么

| 数据位置 / 生产路径 | 已保存 | 缺口与判定 |
| --- | --- | --- |
| 旧批量/自动 digest | memories 的正文、类型、创建时间、source_start_ts/end_ts；source_conv 为 NULL | 没有实际选中消息清单、两端消息 ID、原始条数或内容指纹，无法恢复当时选中的集合与版本 |
| MEMORY_WRITE，包括知远总结 | type 为 AI 名称 + 总结，可有 source_conv；来源起止时间为空 | 会话标识不是该条记忆的材料清单，没有有限可验证的原始消息范围；保留安全拒绝 |
| 手动新增 | 正文和人工元数据，来源字段为空 | 本来没有聊天总结来源，不能自动生成关联 |
| 其他遗留记录，即使同时有 source_conv 和时间范围 | 能限定当前候选会话/时间 | 仍缺历史清单、条数、边界 ID、版本证据；当前恰好查到单一会话或十条消息也不足以证明来源未缺失、未变化 |
| Phase 1 后有 memory_digest_sources 的记录 | memory_id 对应 material_key 与 manifest_json；逐条 id、conv_id、role、created_at、完整正文 SHA-256；列表顺序固定 | 已经具备精确来源，不需要“恢复”；继续走现有校验和组合操作 |
| digest checkpoint | 单条交接中的 memory_id、组末时间/消息 ID | 用于锚点交接，缺少完整材料集合，不可当成来源清单 |
| MEMORY_WRITE 系统通知 | 记忆 ID、记忆正文、重要度等显示数据 | 不包含所总结材料的完整消息清单或历史版本，不能反推来源 |
| Game 等其他业务来源 | 可能有业务来源字段 | 不能将业务来源编号推断为聊天消息 ID；不在本轮恢复范围 |

依据包括 [database.py](/Users/remix/Desktop/AionsHome-main/aion-chat/database.py:56)、[memory.py](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:154)、[memory_requeue.py](/Users/remix/Desktop/AionsHome-main/aion-chat/memory_requeue.py:55) 以及原有 digest 生产逻辑和 Phase 1 报告。本轮只读这些源码，没有扫描真实记录。

### 为什么不能查询后直接补指纹

当前消息表保存的是当前正文。消息编辑接口直接 UPDATE content，删除接口直接删除消息；本轮检查的来源相关结构没有可还原总结时材料的历史版本记录。

因此：

1. 按会话与时间查得的候选可能已经缺失中间消息，但旧记忆没有原始数量/清单可供比对。
2. 消息正文可变化而 created_at 不变，不能用时间证明内容没变。
3. 现在计算 SHA-256，只能锁定“现在的正文”，不能验证它是否等于生成该旧记忆时的正文。
4. 时间边界没有消息 ID 时，同时间戳的消息集合也可能不同。旧 digest 本来按全库 `(created_at,id)` 分组，不能擅自把一组材料改成某个推测会话。

给当前候选补齐 ID、排序并写入指纹，会把未经验证的推断升级成后端信任的来源，可能导致旧记忆先被删除、再总结错误或缺失材料。本轮不实施这一方案。

## 4. 原文读取不等于可恢复来源

[GET /api/memories/{id}/source](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/memories.py:283) 只读取 memories 的起止时间，在整个 messages 表查询该时间范围内的 user/assistant、非 carryover 消息。

该接口不按 source_conv 过滤，不提供会话范围查询参数；返回 role/name/content/created_at，不返回消息 ID、会话 ID、历史指纹或完整性证明。所以既不能直接拿响应建立 manifest，也不能在前端猜测锚点。现有只读原文行为保持不变，它不授予组合删除能力。

即使另有按会话读取的通用消息 API，缩小“当前候选”的查询范围，也不能补回缺失的历史版本和材料完整性证据。本轮没有新增读取端点或改变原文接口。

## 5. 复核现有精确来源、事务与去重契约

[memory_requeue.py](/Users/remix/Desktop/AionsHome-main/aion-chat/memory_requeue.py:122) 仍要求目标存在且有可信的精确来源清单，并执行：

- manifest 与 material_key 一致；逐 ID 重读消息，校验会话、角色、时间、正文指纹和非 carryover 资格，验证 `(created_at,id)` 顺序。
- 无来源关联或清单无效：`source_untracked`；消息缺失：`source_missing`；正文或会话等变化：`source_changed`。
- 来源须已越过正常摘要进度；其他有效记忆表示相同材料时返回 `source_already_represented`。
- 组合操作在 `BEGIN IMMEDIATE` 内再次校验、插入任务、删除目标及其来源/日记关联并提交；失败整体回滚，不先删再报错，不删除原聊天消息。
- origin_memory_id 是幂等键，重复请求返回同一回执；pending 的 material_key 唯一索引阻止同一材料重复排队。
- digest 最终提交前再次验证材料与重复结果；任务、结果记忆、Embedding 与精确来源事务一致，失败保留可重试任务。正常锚点不回退。

普通 DELETE 仍只删除目标记忆及相关关联，不入队、不自动重新总结，也不操作摘要锚点。

有精确 manifest 的旧记录（例如 Phase 1 后明确重新总结并记录了本次材料的记录）已经能按既有契约处理。对于没有 manifest 的旧记录，不把“再运行一次旧 re_summarize”宣传为来源恢复：它仍可能按全局时间取材或回退当前正文，不能验证原历史来源，本轮未自动调用它。

## 6. 最小可行后续方案

在本轮已确认没有额外证据的前提下，保留明确拒绝就是安全结果，不增加无实际可恢复对象的后端接口或数据库字段。

如果以后取得与具体 memory_id 绑定的可信总结时材料清单/快照，才可评估单条显式恢复：必须能验证完整选择集合、真实消息 ID/会话/顺序及原始内容版本，再在现有短事务中复核当前消息、记录来源并复用 delete-and-requeue 的去重和删除流程。仅有一份当前会话导出或无绑定的备份仍不够；也不能直接接受客户端随意提交的 ID 列表作为可信证据。

未来新生成的摘要继续使用已经提交的精确来源记录机制。没有新增锚点回退、全量扫描、全局重建、Embedding 重建或真实数据迁移。

## 7. 本轮修改与接口变化

| 文件 | 变更 |
| --- | --- |
| `src/domain/memory/memory-action-policy.ts` | 新增基于持久化 type 的入口规则 |
| `src/domain/memory/index.ts` | 导出规则，供既有各层复用 |
| `src/components/memory/MemoryItem.tsx` | 隐藏指定类型的原文按钮并调整预留空间 |
| `src/components/memory/MemoryActions.tsx` | 隐藏指定类型两项总结动作及来源检查提示/请求 |
| `src/application/memory-management/memory-management-controller.ts` | 应用层入口防护、已知类型的来源缓存/在途请求清理 |
| `src/components/memory/MemoryManagement.test.tsx` | 类型字段判断、旧缓存、保留动作、其他类型回归 |
| `src/application/memory-management/memory-management.test.ts` | 指定类型不写总结接口、普通管理可用、缓存及过期响应保护 |
| `tests/browser/memory-library-smoke.cjs` | 特殊类型菜单/Pin/零来源请求验证；修正预检异步结果的等待条件 |
| 本文 | 审计证据、来源恢复阻塞、验证结果与替代方案 |

**API、后端、数据库、迁移均无变化。** 未改动无关聊天、Markdown、Toast 或其他模块；上一轮暂存区内容保持原样。

## 8. 验证结果

- 前端相关测试：全量中包含 8 个 Memory 测试文件、140 条，均通过；覆盖可配置名称、历史名称与默认 AI 名称。
- 前端全量 `npm test`：191 个文件、2599 条通过。
- `npm run build`：TypeScript 检查、生产构建通过；保留既有大 chunk 提示。
- 后端记忆相关合成回归：99 条通过，覆盖正常增量、旧来源拒绝、会话/内容/资格变化、事务回滚、重复入队、并发、失败/取消/重启恢复、Embedding/持久化失败，以及原有单条重新总结行为。
- 后端测试在新的隔离副本 `/private/tmp/memory-type-source-audit-nufek3fd` 中执行。已比对 memory.py、memory_requeue.py、routes/memories.py 和专项测试与当前后端一致；复制时排除了 data、日志、环境文件和数据库。模型/Embedding 均为测试桩，迁移仅作用于合成数据库。本轮未修改后端，因此未重跑整个后端全量套件。
- 浏览器合成回归 **320px、390px、1280px 均通过**，各 85 次 mock API 请求，运行时错误 0：指定类型只有编辑/删除菜单且 Pin 可用，不出现原文/总结入口，不发来源请求；同时回归其他类型的原文、来源错误/重试、编辑、普通/组合删除、单条/批量总结、任务刷新、分页/末页回退、筛选和长文。
- 最终动态名称修正日志：`/private/tmp/memory-name-full.log`、`memory-name-build.log`、`memory-name-browser.log`；后端相关验证日志仍为 `/private/tmp/memory-type-backend.log`（后端未修改）。

本轮未声称恢复任何真实旧记忆来源。缺乏可信清单的旧 digest、命令记忆、手动记忆以及只有会话/时间范围的遗留记录继续安全拒绝。等待人工验收，不提交、不推送、不部署。
